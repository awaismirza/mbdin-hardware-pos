/**
 * The SQL engine, independent of how the file was opened.
 *
 * The worker constructs one of these over an OPFS-backed handle; the
 * integration tests construct one over an in-memory handle in Node. Same code
 * path, same semantics, so a test that passes means something.
 */

import { isLastIdRef, type SqlParam, type TxStep, type WriteResult } from './api';
import { DEFAULT_SETTINGS, MIGRATIONS } from './migrations';

/** The slice of the sqlite-wasm oo1 Database we actually use. */
export interface SqliteHandle {
  exec(options: {
    sql: string;
    bind?: unknown[];
    rowMode?: 'object' | 'array';
    returnValue?: 'resultRows' | 'this';
    resultRows?: unknown[];
  }): unknown;
  selectValue(sql: string, bind?: unknown[]): unknown;
  changes(total?: boolean, sixtyFour?: boolean): number;
  close(): void;
}

export interface EngineDeps {
  db: SqliteHandle;
  /** sqlite3.capi.sqlite3_js_db_export, bound to the handle by the caller. */
  exportBytes: () => Uint8Array;
  /** Called after every successful write. The IndexedDB fallback persists here. */
  afterWrite?: () => Promise<void>;
}

export class Engine {
  private readonly db: SqliteHandle;
  private readonly doExport: () => Uint8Array;
  private readonly afterWrite: (() => Promise<void>) | undefined;
  /** Guards against a nested BEGIN from two overlapping callers. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(deps: EngineDeps) {
    this.db = deps.db;
    this.doExport = deps.exportBytes;
    this.afterWrite = deps.afterWrite;
  }

  /** Applies pragmas, runs pending migrations, back-fills settings defaults. */
  async open(): Promise<number> {
    this.db.exec({ sql: 'PRAGMA foreign_keys = ON' });
    // NORMAL is the right trade here: FULL costs a device fsync on every
    // insert and the tablet is slow; NORMAL still survives a process kill,
    // which is the failure this shop actually sees (a power cut).
    this.db.exec({ sql: 'PRAGMA synchronous = NORMAL' });
    this.db.exec({ sql: 'PRAGMA temp_store = MEMORY' });

    const version = this.runMigrations();
    this.ensureSettingsDefaults();
    await this.afterWrite?.();
    return version;
  }

  private currentVersion(): number {
    const hasMeta = this.db.selectValue(
      `SELECT COUNT(*) FROM sqlite_schema WHERE type='table' AND name='meta'`,
    );
    if (Number(hasMeta) === 0) return 0;
    const raw = this.db.selectValue(`SELECT value FROM meta WHERE key='schema_version'`);
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private runMigrations(): number {
    let version = this.currentVersion();
    const latest = MIGRATIONS[MIGRATIONS.length - 1]!.version;

    if (version > latest) {
      throw new Error(
        `This database was written by a newer version of Dukaan ` +
          `(schema ${version}, this app understands ${latest}). Update the app before opening it.`,
      );
    }

    for (const migration of MIGRATIONS) {
      if (migration.version <= version) continue;
      this.db.exec({ sql: 'BEGIN' });
      try {
        for (const statement of migration.statements) {
          this.db.exec({ sql: statement });
        }
        // meta only exists once migration 1 has run.
        this.db.exec({
          sql: `INSERT INTO meta(key, value) VALUES('schema_version', ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
          bind: [String(migration.version)],
        });
        this.db.exec({ sql: 'COMMIT' });
      } catch (error) {
        this.db.exec({ sql: 'ROLLBACK' });
        throw new Error(
          `Migration ${migration.version} (${migration.name}) failed: ${describe(error)}`,
        );
      }
      version = migration.version;
    }

    this.db.exec({
      sql: `INSERT INTO meta(key, value) VALUES('created_at', ?) ON CONFLICT(key) DO NOTHING`,
      bind: [new Date().toISOString()],
    });
    return version;
  }

  private ensureSettingsDefaults(): void {
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
      this.db.exec({
        sql: `INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO NOTHING`,
        bind: [key, value],
      });
    }
  }

  query<T>(sql: string, params: SqlParam[] = []): T[] {
    const rows: unknown[] = [];
    this.db.exec({
      sql,
      bind: params.map(bindable),
      rowMode: 'object',
      resultRows: rows,
      returnValue: 'resultRows',
    });
    return rows as T[];
  }

  async exec(sql: string, params: SqlParam[] = []): Promise<WriteResult> {
    return this.serialise(() => {
      this.db.exec({ sql, bind: params.map(bindable) });
      const result = this.readWriteResult();
      return result;
    });
  }

  /**
   * Every step, or none. Steps may reference the rowid inserted by an earlier
   * step with `lastIdOf(index)` — that is how one sale writes its items,
   * movements and ledger charge without leaving the transaction.
   */
  async transaction(steps: TxStep[]): Promise<WriteResult[]> {
    return this.serialise(() => {
      const results: WriteResult[] = [];
      this.db.exec({ sql: 'BEGIN' });
      try {
        for (const step of steps) {
          const bind = (step.params ?? []).map((param) =>
            isLastIdRef(param) ? requireLastId(results, param.__lastIdOfStep) : bindable(param),
          );
          this.db.exec({ sql: step.sql, bind });
          results.push(this.readWriteResult());
        }
        this.db.exec({ sql: 'COMMIT' });
      } catch (error) {
        try {
          this.db.exec({ sql: 'ROLLBACK' });
        } catch {
          // A failed BEGIN leaves nothing to roll back; the original error wins.
        }
        throw new Error(describe(error));
      }
      return results;
    });
  }

  exportBytes(): Uint8Array {
    return this.doExport();
  }

  async vacuum(): Promise<void> {
    await this.serialise(() => {
      this.db.exec({ sql: 'VACUUM' });
      return undefined;
    });
  }

  byteSize(): number {
    const pageCount = Number(this.db.selectValue('PRAGMA page_count'));
    const pageSize = Number(this.db.selectValue('PRAGMA page_size'));
    return pageCount * pageSize;
  }

  close(): void {
    this.db.close();
  }

  private readWriteResult(): WriteResult {
    return {
      changes: this.db.changes(),
      lastId: Number(this.db.selectValue('SELECT last_insert_rowid()')),
    };
  }

  /**
   * Serialises writes and persists afterwards. Two concurrent callers issuing
   * BEGIN against the same connection would collide, and the IndexedDB
   * fallback must not snapshot a half-applied transaction.
   */
  private serialise<T>(work: () => T): Promise<T> {
    const run = this.queue.then(async () => {
      const result = work();
      await this.afterWrite?.();
      return result;
    });
    // Keep the chain alive even after a rejection, or every later write fails.
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

function bindable(param: SqlParam): unknown {
  if (typeof param === 'boolean') return param ? 1 : 0;
  if (isLastIdRef(param)) {
    throw new Error('lastIdOf() is only valid inside transaction() steps');
  }
  return param;
}

function requireLastId(results: WriteResult[], stepIndex: number): number {
  const result = results[stepIndex];
  if (!result) {
    throw new Error(`lastIdOf(${stepIndex}) refers to a step that has not run yet`);
  }
  return result.lastId;
}

function describe(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

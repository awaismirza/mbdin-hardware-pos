/**
 * An in-memory database for tests, running the same Engine and the same
 * repositories the app runs.
 *
 * The point of testing here rather than against a mock is that the SQL is the
 * risky part: foreign keys, the sale transaction, the cascade on void. A fake
 * repository would prove nothing about any of them.
 */

import sqlite3InitModule from '@sqlite.org/sqlite-wasm';

import type { SqlParam } from './api';
import { setDbGateway, type DbGateway } from './client';
import { Engine, type SqliteHandle } from './engine';

export interface TestDb {
  engine: Engine;
  close(): void;
}

/** Opens a fresh database and points the repository layer at it. */
export async function openTestDb(): Promise<TestDb> {
  const sqlite3 = await sqlite3InitModule({ print: () => {}, printErr: () => {} });
  const handle = new sqlite3.oo1.DB(':memory:', 'c');
  const engine = new Engine({
    db: handle as unknown as SqliteHandle,
    exportBytes: () => sqlite3.capi.sqlite3_js_db_export(handle),
  });
  await engine.open();

  setDbGateway(gatewayFor(engine));

  return {
    engine,
    close: () => {
      setDbGateway(null);
      handle.close();
    },
  };
}

export function gatewayFor(engine: Engine): DbGateway {
  return {
    async query<T>(sql: string, params?: SqlParam[]) {
      return engine.query<T>(sql, params ?? []);
    },
    async queryOne<T>(sql: string, params?: SqlParam[]) {
      return engine.query<T>(sql, params ?? [])[0] ?? null;
    },
    exec: (sql, params) => engine.exec(sql, params ?? []),
    transaction: (steps) => engine.transaction(steps),
    async exportBytes() {
      return engine.exportBytes().slice();
    },
    async importBytes() {
      throw new Error('importBytes is not supported against the in-memory test database');
    },
    vacuum: () => engine.vacuum(),
    async byteSize() {
      return engine.byteSize();
    },
    async resetEverything() {
      throw new Error('resetEverything is not supported against the in-memory test database');
    },
  };
}

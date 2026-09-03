import { db } from '../client';
import { DEFAULT_SETTINGS } from '../migrations';

export type SettingsMap = Record<string, string>;

interface KeyValueRow {
  key: string;
  value: string;
}

export async function getAllSettings(): Promise<SettingsMap> {
  const rows = await db.query<KeyValueRow>('SELECT key, value FROM settings');
  const map: SettingsMap = { ...DEFAULT_SETTINGS };
  for (const row of rows) map[row.key] = row.value;
  return map;
}

export async function getSetting(key: string): Promise<string> {
  const row = await db.queryOne<KeyValueRow>('SELECT key, value FROM settings WHERE key = ?', [key]);
  return row?.value ?? DEFAULT_SETTINGS[key] ?? '';
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db.exec(
    `INSERT INTO settings(key, value) VALUES(?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
}

export async function setSettings(values: SettingsMap): Promise<void> {
  const entries = Object.entries(values);
  if (entries.length === 0) return;
  await db.transaction(
    entries.map(([key, value]) => ({
      sql: `INSERT INTO settings(key, value) VALUES(?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      params: [key, value],
    })),
  );
}

export async function getMeta(key: string): Promise<string | null> {
  const row = await db.queryOne<KeyValueRow>('SELECT key, value FROM meta WHERE key = ?', [key]);
  return row?.value ?? null;
}

/** A URL-safe slug of the shop name, for backup filenames. */
export function shopSlug(shopName: string): string {
  const slug = shopName
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'dukaan';
}

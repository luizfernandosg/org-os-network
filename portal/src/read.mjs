// Reads what the model needs: the roster (index/members.json) and the index's tables. Read-only; never writes.
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { INDEX_DIR, loadConfig, loadMembers } from '../../index/src/config.mjs';
import { getMeta, openDb } from '../../index/src/db.mjs';

/** The members as members.json lists them, validated by the index's own loader, with their caveats. */
export function readRoster(dir = INDEX_DIR) {
  const raw = JSON.parse(readFileSync(path.join(dir, 'members.json'), 'utf8')).members;
  const caveats = new Map(raw.map((m) => [m.name, m.caveat ?? null]));
  return loadMembers(dir).map((m) => ({ ...m, caveat: caveats.get(m.name) ?? null }));
}

/** The index's members, records and rebuild time, from an open database. */
export function readIndex(db) {
  const members = db.prepare('SELECT name, did, handle, pds FROM members ORDER BY name').all().map((r) => ({ ...r }));
  const records = db
    .prepare('SELECT uri, did, collection, rkey, record_json FROM records ORDER BY uri')
    .all()
    .map(({ record_json, ...r }) => ({ ...r, record: JSON.parse(record_json) }));
  return { members, records, rebuiltAt: getMeta(db, 'rebuilt_at') };
}

/** The index file at `dbPath` (default: the index's config), opened read-only and read whole. */
export function readIndexFile(dbPath = loadConfig().dbPath) {
  if (!existsSync(dbPath)) throw new Error(`no index at ${dbPath}; run npm run index:rebuild first`);
  const db = openDb(dbPath, { readOnly: true });
  try {
    return readIndex(db);
  } finally {
    db.close();
  }
}

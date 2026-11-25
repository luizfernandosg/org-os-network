// The index's SQLite store. Everything in it can be rebuilt from the network.
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS members (
  name TEXT PRIMARY KEY,
  did TEXT UNIQUE,
  handle TEXT,
  source TEXT,
  pds TEXT
);
CREATE TABLE IF NOT EXISTS records (
  uri TEXT PRIMARY KEY,
  did TEXT NOT NULL,
  collection TEXT NOT NULL,
  rkey TEXT NOT NULL,
  cid TEXT,
  record_json TEXT NOT NULL,
  indexed_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS records_did ON records (did);
CREATE INDEX IF NOT EXISTS records_collection ON records (collection);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT
);
`;

export function openDb(file = ':memory:', { readOnly = false } = {}) {
  if (file !== ':memory:' && !readOnly) mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file, readOnly ? { readOnly: true } : {});
  if (!readOnly) {
    if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
    db.exec(SCHEMA);
  }
  return db;
}

export function parseAtUri(uri) {
  const m = /^at:\/\/(did:[a-z]+:[a-zA-Z0-9._:%-]+)\/([a-zA-Z0-9.-]+)\/([a-zA-Z0-9._:~-]+)$/.exec(uri ?? '');
  if (!m) throw new Error(`not a record AT-URI: ${uri}`);
  return { did: m[1], collection: m[2], rkey: m[3] };
}

export function upsertRecord(db, { uri, did, collection, rkey, cid, value }, indexedAt) {
  db.prepare(
    `INSERT INTO records (uri, did, collection, rkey, cid, record_json, indexed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (uri) DO UPDATE SET cid = excluded.cid, record_json = excluded.record_json, indexed_at = excluded.indexed_at`,
  ).run(uri, did, collection, rkey, cid ?? null, JSON.stringify(value), indexedAt);
}

export function deleteRecord(db, uri) {
  return db.prepare('DELETE FROM records WHERE uri = ?').run(uri).changes;
}

export function getMeta(db, key) {
  return db.prepare('SELECT value FROM meta WHERE key = ?').get(key)?.value ?? null;
}

export function setMeta(db, key, value) {
  db.prepare('INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value').run(
    key,
    value === null ? null : String(value),
  );
}

export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const out = fn();
    db.exec('COMMIT');
    return out;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

/** Drop everything and write a fresh reading, in one transaction (readers never see it half-built). */
export function replaceAll(db, { members, records, indexedAt, meta = {} }) {
  transaction(db, () => {
    db.exec('DROP TABLE IF EXISTS records; DROP TABLE IF EXISTS members; DROP TABLE IF EXISTS meta;');
    db.exec(SCHEMA);
    const insM = db.prepare('INSERT INTO members (name, did, handle, source, pds) VALUES (?, ?, ?, ?, ?)');
    for (const m of members) insM.run(m.name, m.did ?? null, m.handle ?? null, m.source ?? null, m.pds ?? null);
    for (const r of records) upsertRecord(db, r, indexedAt);
    for (const [k, v] of Object.entries(meta)) setMeta(db, k, v);
  });
}

export function memberDids(db) {
  return new Set(db.prepare('SELECT did FROM members WHERE did IS NOT NULL').all().map((r) => r.did));
}

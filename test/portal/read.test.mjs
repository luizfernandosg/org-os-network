import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { openDb, replaceAll } from '../../index/src/db.mjs';
import { portalModel } from '../../portal/src/model.mjs';
import { readIndex, readIndexFile, readRoster } from '../../portal/src/read.mjs';
import { REBUILT_AT, ROSTER_DIR, members, recordsNoLinks } from './fixtures.mjs';

const fill = (db) =>
  replaceAll(db, {
    members,
    records: recordsNoLinks.map(({ record, ...r }) => ({ ...r, cid: null, value: record })),
    indexedAt: REBUILT_AT,
    meta: { rebuilt_at: REBUILT_AT },
  });

test('readRoster keeps members.json order and its caveats, and validates it with the index loader', () => {
  const roster = readRoster(ROSTER_DIR);
  assert.deepEqual(roster.map((m) => m.name), ['Valley Commons', 'Riverbend Seeds', 'Hilltop Toolshed', 'Quiet Grove', 'Coastal Group']);
  assert.equal(roster[1].caveat, 'A test account.');
  assert.equal(roster[0].caveat, null);
});

test('readIndex gives back what a rebuild wrote, and the model reads it as it reads the fixtures', () => {
  const db = openDb();
  fill(db);
  const got = readIndex(db);
  assert.equal(got.rebuiltAt, REBUILT_AT);
  assert.equal(got.records.length, recordsNoLinks.length);
  assert.deepEqual(got.records.find((r) => r.rkey === 'c1').record, recordsNoLinks[0].record);
  assert.equal(got.members.find((m) => m.name === 'Riverbend Seeds').pds, 'https://eu.host.certified.example');
  const model = portalModel({ roster: readRoster(ROSTER_DIR), ...got });
  assert.deepEqual(model.totals, { organisations: 5, accounts: 4, publishing: 2, records: 10 });
});

test('readIndexFile opens the file read-only and refuses a missing one', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'portal-read-'));
  try {
    assert.throws(() => readIndexFile(path.join(dir, 'none.sqlite')), /no index at .*index:rebuild/);
    const file = path.join(dir, 'index.sqlite');
    const db = openDb(file);
    fill(db);
    db.close();
    assert.equal(readIndexFile(file).records.length, recordsNoLinks.length);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

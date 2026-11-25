import assert from 'node:assert/strict';
import { test } from 'node:test';
import { backfill, rebuild } from '../../index/src/backfill.mjs';
import { getMeta, openDb } from '../../index/src/db.mjs';
import { makeFetch, network, rowsOf } from './helpers.mjs';

const opts = (extra = {}) => ({ members: network.members, patterns: network.patterns, fetchImpl: makeFetch(undefined, { pageSize: 2 }).fetchImpl, ...extra });

test('backfill reads only followed collections from members, and only their own records', async () => {
  const got = await backfill(opts());
  assert.deepEqual(got.errors, []);
  const uris = got.records.map((r) => r.uri);
  assert.deepEqual(uris, [
    'at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/example.orgosnetwork.need/n1',
    'at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/xyz.regencoordination.kb.resource/r1',
    'at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/xyz.regencoordination.kb.signal/s1',
    'at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/xyz.regencoordination.kb.signal/s2',
    'at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/xyz.regencoordination.kb.signal/s3',
    'at://did:web:b.example/app.certified.actor.organization/self',
    'at://did:web:b.example/org.hypercerts.context.attachment/t1',
  ]);
  assert.ok(!uris.some((u) => u.includes('app.bsky.feed.post')), 'unfollowed collection read');
  assert.ok(!uris.some((u) => u.includes('zzzz')), 'foreign DID stored');
  assert.deepEqual(got.members.map((m) => m.pds), ['https://pds-a.example', 'https://pds-b.example', null]);
});

test('an attachment is kept as its record JSON and no link out of it is fetched', async () => {
  const { fetchImpl, calls } = makeFetch();
  const got = await backfill(opts({ fetchImpl }));
  const att = got.records.find((r) => r.collection === 'org.hypercerts.context.attachment');
  assert.equal(att.did, 'did:web:b.example');
  assert.ok(!calls.some((c) => c.href.includes('elsewhere.example') || c.href.includes('zzzz')));
});

test('rebuild is deterministic: two runs give the same rows (modulo indexed_at)', async () => {
  const db = openDb();
  const r1 = await rebuild(db, opts({ now: () => new Date('2026-11-22T10:00:00Z') }));
  const first = rowsOf(db);
  const r2 = await rebuild(db, opts({ now: () => new Date('2026-11-22T11:00:00Z') }));
  const second = rowsOf(db);
  assert.equal(r1.written, true);
  assert.equal(r2.written, true);
  assert.deepEqual(second, first);
  assert.equal(first.records.length, 7);
  assert.deepEqual(r1.counts, {
    'app.certified.actor.organization': 1,
    'example.orgosnetwork.need': 1,
    'org.hypercerts.context.attachment': 1,
    'xyz.regencoordination.kb.resource': 1,
    'xyz.regencoordination.kb.signal': 3,
  });
  assert.equal(getMeta(db, 'rebuilt_at'), '2026-11-22T11:00:00.000Z');
  assert.equal(Number(getMeta(db, 'jetstream_cursor')), Date.parse('2026-11-22T11:00:00Z') * 1000 - 60_000_000);
});

test('rebuild drops rows that are no longer published', async () => {
  const db = openDb();
  await rebuild(db, opts());
  db.prepare("INSERT INTO records VALUES ('at://did:plc:aaaaaaaaaaaaaaaaaaaaaaaa/example.orgosnetwork.need/gone', 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', 'example.orgosnetwork.need', 'gone', null, '{}', 'x')").run();
  await rebuild(db, opts());
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM records WHERE rkey = 'gone'").get().n, 0);
});

test('rebuild writes nothing when a member fails, unless partial', async () => {
  const db = openDb();
  await rebuild(db, opts());
  const before = rowsOf(db);
  const broken = { ...network, didDocs: { ...network.didDocs } };
  delete broken.didDocs['https://b.example/.well-known/did.json'];
  const res = await rebuild(db, opts({ fetchImpl: makeFetch(broken).fetchImpl }));
  assert.equal(res.written, false);
  assert.equal(res.errors.length, 1);
  assert.deepEqual(rowsOf(db), before);
  const partial = await rebuild(db, opts({ fetchImpl: makeFetch(broken).fetchImpl, partial: true }));
  assert.equal(partial.written, true);
  assert.equal(rowsOf(db).records.length, 5);
});

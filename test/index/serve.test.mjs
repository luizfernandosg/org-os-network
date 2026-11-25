import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { rebuild } from '../../index/src/backfill.mjs';
import { openDb } from '../../index/src/db.mjs';
import { createIndexServer } from '../../index/src/serve.mjs';
import { makeFetch, network } from './helpers.mjs';

let server;
let base;

before(async () => {
  const db = openDb();
  await rebuild(db, { members: network.members, patterns: network.patterns, fetchImpl: makeFetch().fetchImpl, now: () => new Date('2026-11-22T10:00:00Z') });
  server = createIndexServer(db);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const get = async (path) => {
  const res = await fetch(base + path);
  return { status: res.status, type: res.headers.get('content-type'), body: res.headers.get('content-type')?.includes('json') ? await res.json() : await res.text() };
};

test('/members lists every member with its record count, including those without a DID', async () => {
  const { status, body } = await get('/members');
  assert.equal(status, 200);
  assert.deepEqual(body.members.map((m) => [m.name, m.records]), [['Commons A', 5], ['Group C', 0], ['Org B', 2]]);
  assert.equal(body.members.find((m) => m.name === 'Group C').did, null);
});

test('/stats gives totals per collection and per member', async () => {
  const { body } = await get('/stats');
  assert.equal(body.total, 7);
  assert.deepEqual(body.byCollection.find((c) => c.collection === 'xyz.regencoordination.kb.signal'), { collection: 'xyz.regencoordination.kb.signal', count: 3 });
  assert.equal(body.rebuiltAt, '2026-11-22T10:00:00.000Z');
  assert.ok(body.byMember.some((r) => r.name === 'Org B' && r.collection === 'org.hypercerts.context.attachment'));
});

test('/records filters by collection (exact or prefix), did and text', async () => {
  assert.equal((await get('/records?collection=xyz.regencoordination.kb.signal')).body.total, 3);
  assert.equal((await get('/records?collection=xyz.regencoordination.kb.*')).body.total, 4);
  assert.equal((await get('/records?did=did:web:b.example')).body.total, 2);
  const q = (await get('/records?q=bioregional')).body;
  assert.equal(q.total, 1);
  assert.equal(q.records[0].record.title, 'Bioregional finance');
  assert.equal((await get('/records?q=100%25')).body.total, 0, 'LIKE wildcards are escaped');
  const paged = (await get('/records?limit=2&offset=1')).body;
  assert.equal(paged.records.length, 2);
  assert.equal(paged.limit, 2);
});

test('the HTML page lists members, counts and search results, escaped', async () => {
  const { status, type, body } = await get('/?q=soil');
  assert.equal(status, 200);
  assert.match(type, /text\/html/);
  assert.match(body, /Commons A/);
  assert.match(body, /no account/);
  assert.match(body, /xyz\.regencoordination\.kb\.signal/);
  assert.match(body, /1 found/);
  assert.match(body, /Soil carbon pilots/);
  const xss = await get('/?q=%3Cscript%3E');
  assert.ok(!xss.body.includes('<script>'));
});

test('read-only: other methods are refused; unknown paths are 404', async () => {
  const res = await fetch(base + '/records', { method: 'POST', body: '{}' });
  assert.equal(res.status, 405);
  assert.equal((await get('/nope')).status, 404);
});

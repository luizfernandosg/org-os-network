import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyEvent, follow, jetstreamUrl } from '../../index/src/follow.mjs';
import { getMeta, openDb, setMeta } from '../../index/src/db.mjs';
import { network } from './helpers.mjs';

const A = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const STRANGER = 'did:plc:zzzzzzzzzzzzzzzzzzzzzzzz';
const ctx = { memberDids: new Set([A, 'did:web:b.example']), patterns: network.patterns, now: () => new Date('2026-11-22T12:00:00Z') };
const commit = (did, operation, collection, rkey, record, time_us) => ({
  did,
  time_us,
  kind: 'commit',
  commit: { rev: 'r', operation, collection, rkey, ...(record ? { record, cid: `cid-${time_us}` } : {}) },
});
const count = (db) => db.prepare('SELECT COUNT(*) AS n FROM records').get().n;

test('create, update and delete apply to the index and advance the cursor', () => {
  const db = openDb();
  const uri = `at://${A}/xyz.regencoordination.kb.signal/k1`;
  assert.equal(applyEvent(db, commit(A, 'create', 'xyz.regencoordination.kb.signal', 'k1', { title: 'v1' }, 100), ctx), 'created');
  let row = db.prepare('SELECT * FROM records WHERE uri = ?').get(uri);
  assert.equal(JSON.parse(row.record_json).title, 'v1');
  assert.equal(row.cid, 'cid-100');
  assert.equal(row.indexed_at, '2026-11-22T12:00:00.000Z');
  assert.equal(getMeta(db, 'jetstream_cursor'), '100');

  assert.equal(applyEvent(db, commit(A, 'update', 'xyz.regencoordination.kb.signal', 'k1', { title: 'v2' }, 200), ctx), 'updated');
  row = db.prepare('SELECT * FROM records WHERE uri = ?').get(uri);
  assert.equal(JSON.parse(row.record_json).title, 'v2');
  assert.equal(count(db), 1);

  assert.equal(applyEvent(db, commit(A, 'delete', 'xyz.regencoordination.kb.signal', 'k1', null, 300), ctx), 'deleted');
  assert.equal(count(db), 0);
  assert.equal(getMeta(db, 'jetstream_cursor'), '300');
});

test("a non-member DID's event is ignored (and nothing of it is stored)", () => {
  const db = openDb();
  assert.equal(applyEvent(db, commit(STRANGER, 'create', 'org.orgosnetwork.need', 'n', { title: 'x' }, 10), ctx), 'ignored');
  assert.equal(count(db), 0);
  assert.equal(applyEvent(db, { did: STRANGER, time_us: 11, kind: 'account', account: { active: false, status: 'deleted' } }, ctx), 'ignored');
  const dump = JSON.stringify(db.prepare('SELECT * FROM records').all()) + JSON.stringify(db.prepare('SELECT * FROM members').all());
  assert.ok(!dump.includes(STRANGER));
});

test('unfollowed collections, malformed and identity events are ignored', () => {
  const db = openDb();
  assert.equal(applyEvent(db, commit(A, 'create', 'app.bsky.feed.post', 'p', { text: 'hi' }, 1), ctx), 'ignored');
  assert.equal(applyEvent(db, commit(A, 'create', 'org.orgosnetwork.need', 'bad/rkey', { t: 1 }, 2), ctx), 'ignored');
  assert.equal(applyEvent(db, commit(A, 'create', 'org.orgosnetwork.need', 'n', null, 3), ctx), 'ignored');
  assert.equal(applyEvent(db, { did: A, time_us: 4, kind: 'identity', identity: { did: A } }, ctx), 'ignored');
  assert.equal(applyEvent(db, null, ctx), 'ignored');
  assert.equal(count(db), 0);
  assert.equal(getMeta(db, 'jetstream_cursor'), '4');
});

test("a member's account deletion removes its records", () => {
  const db = openDb();
  applyEvent(db, commit(A, 'create', 'org.orgosnetwork.need', 'n', { t: 1 }, 1), ctx);
  applyEvent(db, commit('did:web:b.example', 'create', 'org.orgosnetwork.need', 'n', { t: 1 }, 2), ctx);
  assert.equal(applyEvent(db, { did: A, time_us: 3, kind: 'account', account: { active: false, status: 'deleted' } }, ctx), 'removed-account');
  assert.equal(count(db), 1);
});

test('jetstreamUrl asks for members and followed collections only, and refuses "everything"', () => {
  const url = new URL(jetstreamUrl('wss://js.example/subscribe', { dids: [A], collections: ['xyz.regencoordination.kb.*', 'org.orgosnetwork.need'], cursor: 42 }));
  assert.deepEqual(url.searchParams.getAll('wantedDids'), [A]);
  assert.deepEqual(url.searchParams.getAll('wantedCollections'), ['xyz.regencoordination.kb.*', 'org.orgosnetwork.need']);
  assert.equal(url.searchParams.get('cursor'), '42');
  assert.throws(() => jetstreamUrl('wss://js.example/subscribe', { dids: [], collections: ['a.b.c'] }), /no member DIDs/);
  assert.throws(() => jetstreamUrl('wss://js.example/subscribe', { dids: [A], collections: [] }), /no collections/);
});

class FakeSocket extends EventTarget {
  static instances = [];
  constructor(url) {
    super();
    this.url = url;
    FakeSocket.instances.push(this);
  }
  emit(obj) {
    this.dispatchEvent(Object.assign(new Event('message'), { data: JSON.stringify(obj) }));
  }
  close() {
    this.dispatchEvent(new Event('close'));
  }
}

test('follow resumes from the stored cursor, applies messages, reconnects after a close', () => {
  FakeSocket.instances = [];
  const db = openDb();
  setMeta(db, 'jetstream_cursor', 50_000_000);
  const timers = [];
  const f = follow({
    db,
    base: 'wss://js.example/subscribe',
    memberDids: ctx.memberDids,
    patterns: ctx.patterns,
    WebSocketImpl: FakeSocket,
    setTimer: (fn, ms) => timers.push({ fn, ms }),
    clearTimer: () => {},
  });
  const first = FakeSocket.instances[0];
  assert.equal(new URL(first.url).searchParams.get('cursor'), String(50_000_000 - 5_000_000));
  first.emit(commit(A, 'create', 'org.orgosnetwork.need', 'n1', { title: 'x' }, 60_000_000));
  first.emit(commit(STRANGER, 'create', 'org.orgosnetwork.need', 'n2', { title: 'y' }, 60_000_001));
  assert.equal(count(db), 1);
  assert.equal(getMeta(db, 'jetstream_cursor'), '60000001');

  first.dispatchEvent(new Event('close'));
  assert.equal(timers.length, 1);
  assert.equal(timers[0].ms, 1000);
  timers[0].fn();
  const second = FakeSocket.instances[1];
  assert.equal(new URL(second.url).searchParams.get('cursor'), String(60_000_001 - 5_000_000));
  second.dispatchEvent(new Event('close'));
  assert.equal(timers[1].ms, 2000, 'backoff doubles');
  f.stop();
  assert.equal(FakeSocket.instances.length, 2);
});

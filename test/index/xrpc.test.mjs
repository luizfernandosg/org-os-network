import assert from 'node:assert/strict';
import { test } from 'node:test';
import { describeRepo, listAllRecords, XrpcError } from '../../index/src/xrpc.mjs';
import { makeFetch } from './helpers.mjs';

const A = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';

test('listAllRecords follows the cursor across pages', async () => {
  const { fetchImpl, calls } = makeFetch(undefined, { pageSize: 1 });
  const recs = await listAllRecords(fetchImpl, 'https://pds-a.example', A, 'xyz.regencoordination.kb.signal');
  assert.deepEqual(recs.map((r) => r.uri.split('/').pop()), ['s1', 's2', 's3']);
  const listCalls = calls.filter((c) => c.href.includes('listRecords'));
  assert.equal(listCalls.length, 3);
  assert.equal(new URL(listCalls[0].href).searchParams.get('cursor'), null);
  assert.equal(new URL(listCalls[1].href).searchParams.get('cursor'), '1');
  assert.equal(new URL(listCalls[2].href).searchParams.get('cursor'), '2');
  assert.ok(calls.every((c) => c.method === 'GET'));
});

test('listAllRecords stops when a cursor repeats', async () => {
  let n = 0;
  const fetchImpl = async () => {
    n++;
    return new Response(JSON.stringify({ records: [{ uri: `at://${A}/c.d.e/r${n}`, value: {} }], cursor: 'same' }));
  };
  const recs = await listAllRecords(fetchImpl, 'https://pds.example', A, 'c.d.e');
  assert.equal(recs.length, 2);
  assert.equal(n, 2);
});

test('listAllRecords with an empty collection makes one call', async () => {
  const { fetchImpl, calls } = makeFetch();
  assert.deepEqual(await listAllRecords(fetchImpl, 'https://pds-a.example', A, 'example.orgosnetwork.offer'), []);
  assert.equal(calls.length, 1);
});

test('XRPC errors carry the status and the error name', async () => {
  const { fetchImpl } = makeFetch();
  await assert.rejects(describeRepo(fetchImpl, 'https://pds-a.example', 'did:web:b.example'), (err) => {
    assert.ok(err instanceof XrpcError);
    assert.equal(err.status, 400);
    assert.match(err.message, /RepoNotFound/);
    return true;
  });
});

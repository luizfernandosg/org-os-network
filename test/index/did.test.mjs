import assert from 'node:assert/strict';
import { test } from 'node:test';
import { didDocUrl, pdsFromDidDoc, resolveDid } from '../../index/src/did.mjs';
import { makeFetch } from './helpers.mjs';

const plc = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';

test('didDocUrl: did:plc goes to the PLC directory, did:web to /.well-known or a path', () => {
  assert.equal(didDocUrl(plc), `https://plc.directory/${plc}`);
  assert.equal(didDocUrl(plc, 'https://plc.test/'), `https://plc.test/${plc}`);
  assert.equal(didDocUrl('did:web:b.example'), 'https://b.example/.well-known/did.json');
  assert.equal(didDocUrl('did:web:b.example:orgs:c'), 'https://b.example/orgs/c/did.json');
  assert.equal(didDocUrl('did:web:localhost%3A8080'), 'https://localhost:8080/.well-known/did.json');
  assert.throws(() => didDocUrl('did:key:z6Mk'), /unsupported/);
  assert.throws(() => didDocUrl('did:plc:TOOSHORT'), /unsupported/);
});

test('pdsFromDidDoc: finds #atproto_pds in short or full id form and trims the slash', () => {
  const doc = (id, sid, endpoint, type = 'AtprotoPersonalDataServer') => ({ id, service: [{ id: sid, type, serviceEndpoint: endpoint }] });
  assert.equal(pdsFromDidDoc(doc(plc, '#atproto_pds', 'https://pds.example'), plc), 'https://pds.example');
  assert.equal(pdsFromDidDoc(doc(plc, `${plc}#atproto_pds`, 'https://pds.example/'), plc), 'https://pds.example');
  assert.equal(
    pdsFromDidDoc({ id: plc, service: [{ id: '#certified_group', type: 'CertifiedGroupService', serviceEndpoint: 'https://g.example' }, { id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'https://certified.example' }] }, plc),
    'https://certified.example',
  );
});

test('pdsFromDidDoc: refuses a mismatched id, a missing PDS, a non-https endpoint', () => {
  assert.throws(() => pdsFromDidDoc({ id: 'did:plc:other', service: [] }, plc), /does not match/);
  assert.throws(() => pdsFromDidDoc({ id: plc, service: [] }, plc), /no atproto PDS/);
  assert.throws(() => pdsFromDidDoc({ id: plc, service: [{ id: '#atproto_pds', type: 'Other', serviceEndpoint: 'https://x' }] }, plc), /no atproto PDS/);
  assert.throws(() => pdsFromDidDoc({ id: plc, service: [{ id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: 'http://x.example' }] }, plc), /https/);
  assert.throws(() => pdsFromDidDoc(null, plc), /not an object/);
});

test('resolveDid: reads the document through the given fetch', async () => {
  const { fetchImpl, calls } = makeFetch();
  assert.equal((await resolveDid(plc, { fetchImpl })).pds, 'https://pds-a.example');
  assert.equal((await resolveDid('did:web:b.example', { fetchImpl })).pds, 'https://pds-b.example');
  assert.deepEqual(calls.map((c) => c.method), ['GET', 'GET']);
  await assert.rejects(resolveDid('did:plc:bbbbbbbbbbbbbbbbbbbbbbbb', { fetchImpl }), /HTTP 404/);
});

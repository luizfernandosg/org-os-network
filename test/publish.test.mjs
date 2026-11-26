// Tests for scripts/publish-lexicons.mjs against a fake PDS on 127.0.0.1. No real network: every
// fetch goes through a guard that refuses any other host, and DNS is an injected resolver.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  PUBLISHED, DRAFTS, SCHEMA_COLLECTION, ENV, main, parseArgs, selectNames, schemaRecords, txtName, apply, UsageError,
} from '../scripts/publish-lexicons.mjs';
import { build, LEXICONS_DIR } from '../scripts/build-lexicons.mjs';
import { AUTHORITY } from './helpers.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/publish-lexicons.mjs', import.meta.url));
const DID = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const HANDLE = 'orgosnetwork.test';
const PASSWORD = 'abcd-efgh-ijkl-mnop';
const run = promisify(execFile);

/** A minimal PDS: createSession, getRecord, putRecord, for one account. */
async function fakePds(t) {
  const repo = new Map();
  const calls = [];
  const server = createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const body = raw ? JSON.parse(raw) : undefined;
      calls.push({ method: req.method, path: url.pathname, body });
      const send = (status, json) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(json));
      };
      if (req.method === 'POST' && url.pathname === '/xrpc/com.atproto.server.createSession') {
        if ((body.identifier === HANDLE || body.identifier === DID) && body.password === PASSWORD) {
          return send(200, { did: DID, handle: HANDLE, accessJwt: 'access-1', refreshJwt: 'refresh-1' });
        }
        return send(401, { error: 'AuthenticationRequired', message: 'Invalid identifier or password' });
      }
      if (req.method === 'GET' && url.pathname === '/xrpc/com.atproto.repo.getRecord') {
        const key = `${url.searchParams.get('collection')}/${url.searchParams.get('rkey')}`;
        if (url.searchParams.get('repo') !== DID || !repo.has(key)) return send(400, { error: 'RecordNotFound', message: 'Could not locate record' });
        return send(200, { uri: `at://${DID}/${key}`, cid: 'bafy-test', value: repo.get(key) });
      }
      if (req.method === 'POST' && url.pathname === '/xrpc/com.atproto.repo.putRecord') {
        if (req.headers.authorization !== 'Bearer access-1') return send(401, { error: 'AuthenticationRequired' });
        if (body.repo !== DID) return send(400, { error: 'InvalidRequest' });
        repo.set(`${body.collection}/${body.rkey}`, body.record);
        return send(200, { uri: `at://${DID}/${body.collection}/${body.rkey}`, cid: 'bafy-test' });
      }
      send(404, { error: 'MethodNotImplemented' });
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise((r) => server.close(r)));
  const url = `http://127.0.0.1:${server.address().port}`;
  return { url, repo, calls, puts: () => calls.filter((c) => c.path.endsWith('putRecord')) };
}

/** fetch that refuses anything but 127.0.0.1. */
const guardedFetch = (input, init) => {
  const href = typeof input === 'string' ? input : input.url;
  if (new URL(href).hostname !== '127.0.0.1') throw new Error(`test tried to reach ${href}`);
  return globalThis.fetch(href, init);
};

const txtFor = (did) => async (name) => {
  assert.equal(name, txtName(AUTHORITY));
  return [['did=', did]]; // TXT values may arrive in chunks; the script joins them
};
const noTxt = async () => { const e = new Error('no record'); e.code = 'ENOTFOUND'; throw e; };

function deps(pds, extra = {}) {
  const out = [];
  return {
    out,
    text: () => out.join('\n'),
    d: {
      env: { [ENV.pds]: pds.url, [ENV.identifier]: HANDLE, [ENV.password]: PASSWORD },
      fetchImpl: guardedFetch,
      resolveTxt: txtFor(DID),
      resolvePds: async (did) => { assert.equal(did, DID); return pds.url; },
      log: (s) => out.push(s),
      error: (s) => out.push(s),
      ...extra,
    },
  };
}

const localRecord = (name) => ({ $type: SCHEMA_COLLECTION, ...JSON.parse(readFileSync(join(LEXICONS_DIR, `${AUTHORITY}.${name}.json`), 'utf8')) });

test('the allowlist is profile and link; need and offer are drafts', () => {
  assert.deepEqual([...PUBLISHED], ['profile', 'link']);
  assert.deepEqual([...DRAFTS], ['need', 'offer']);
  assert.ok(Object.isFrozen(PUBLISHED));
  assert.equal(txtName('org.orgosnetwork'), '_lexicon.orgosnetwork.org');
  assert.deepEqual(schemaRecords().map((r) => r.rkey), [`${AUTHORITY}.profile`, `${AUTHORITY}.link`]);
});

test('unknown arguments are rejected, including a combined string', () => {
  for (const argv of [['--bogus'], ['--apply --check'], ['--apply=1'], ['apply'], ['-a'], ['--apply', '--check'], ['--only'], ['--only', '--apply'], ['--password', 'x']]) {
    assert.throws(() => parseArgs(argv), UsageError, JSON.stringify(argv));
  }
  assert.deepEqual(parseArgs([]), { mode: 'dry', only: [] });
  assert.deepEqual(parseArgs(['--check', '--only', 'link']), { mode: 'check', only: ['link'] });
});

test('the CLI exits non-zero on an unknown argument and contacts nothing', async (t) => {
  const pds = await fakePds(t);
  const env = { PATH: process.env.PATH, [ENV.pds]: pds.url, [ENV.identifier]: HANDLE, [ENV.password]: PASSWORD };
  for (const argv of [['--apply --check'], ['--publish'], ['--apply', 'extra']]) {
    await assert.rejects(run(process.execPath, [SCRIPT, ...argv], { env }), (err) => {
      assert.equal(err.code, 2, JSON.stringify(argv));
      assert.match(err.stderr, /unknown argument/);
      return true;
    });
  }
  assert.equal(pds.calls.length, 0);
});

test('a dry run (the default) writes nothing and lists collection, rkey, hash and size', async (t) => {
  const pds = await fakePds(t);
  const { d, out, text } = deps(pds);
  assert.equal(await main([], d), 0);
  assert.equal(pds.calls.length, 0);
  const rows = out.filter((l) => l.includes(SCHEMA_COLLECTION));
  assert.equal(rows.length, 2);
  for (const n of PUBLISHED) assert.match(text(), new RegExp(`${SCHEMA_COLLECTION}  ${AUTHORITY}\\.${n}  sha256:[0-9a-f]{16}  \\d+ bytes`));
  assert.match(text(), /_lexicon\.orgosnetwork\.org {2}TXT {2}"did=/);
  assert.ok(!text().includes(PASSWORD));
});

test('the CLI dry run, with credentials in the environment, still contacts nothing', async (t) => {
  const pds = await fakePds(t);
  const env = { PATH: process.env.PATH, [ENV.pds]: pds.url, [ENV.identifier]: HANDLE, [ENV.password]: PASSWORD };
  const { stdout } = await run(process.execPath, [SCRIPT], { env });
  assert.match(stdout, /dry run: nothing is sent/);
  assert.ok(!stdout.includes(PASSWORD));
  assert.equal(pds.calls.length, 0);
});

test('--apply writes exactly profile and link, keyed by NSID, typed as schema records', async (t) => {
  const pds = await fakePds(t);
  const { d, text } = deps(pds);
  assert.equal(await main(['--apply'], d), 0);
  assert.deepEqual([...pds.repo.keys()].sort(), [`${SCHEMA_COLLECTION}/${AUTHORITY}.link`, `${SCHEMA_COLLECTION}/${AUTHORITY}.profile`]);
  for (const n of PUBLISHED) {
    const rec = pds.repo.get(`${SCHEMA_COLLECTION}/${AUTHORITY}.${n}`);
    assert.equal(rec.$type, SCHEMA_COLLECTION);
    assert.equal(rec.id, `${AUTHORITY}.${n}`);
    assert.equal(rec.lexicon, 1);
    assert.deepEqual(rec, localRecord(n));
  }
  assert.equal(pds.puts().length, 2);
  for (const c of pds.calls.filter((c) => c.path.endsWith('putRecord'))) assert.equal(c.body.repo, DID);
  assert.ok(!text().includes(PASSWORD), 'the app password is never logged');
  assert.ok(!text().includes('access-1'), 'the session token is never logged');

  // A second run finds everything current and writes nothing.
  const again = deps(pds);
  assert.equal(await main(['--apply'], again.d), 0);
  assert.equal(pds.puts().length, 2);
  assert.match(again.text(), /0 written, 2 unchanged/);
});

test('need and offer are refused, by name and on --apply, with nothing sent', async (t) => {
  const pds = await fakePds(t);
  for (const n of DRAFTS) {
    assert.throws(() => selectNames([n]), /draft, not published until co-designed with Weave/);
    assert.throws(() => schemaRecords({ names: [n] }), /not on the publish allowlist/);
    const { d, text } = deps(pds);
    assert.equal(await main(['--apply', '--only', n], d), 2);
    assert.match(text(), /is a draft/);
  }
  assert.throws(() => selectNames(['thing']), /not a published type/);
  assert.equal(pds.calls.length, 0);
});

test('--apply refuses without credentials, over remote plain http, or when DNS names another DID', async (t) => {
  const pds = await fakePds(t);
  const none = deps(pds, { env: {} });
  assert.equal(await main(['--apply'], none.d), 2);
  assert.match(none.text(), /ORGOSNETWORK_PDS, ORGOSNETWORK_IDENTIFIER, ORGOSNETWORK_APP_PASSWORD/);

  const http = deps(pds, { env: { [ENV.pds]: 'http://pds.example', [ENV.identifier]: HANDLE, [ENV.password]: PASSWORD } });
  assert.equal(await main(['--apply'], http.d), 2);
  assert.match(http.text(), /must be https/);
  assert.equal(pds.calls.length, 0);

  const other = deps(pds, { resolveTxt: txtFor('did:plc:bbbbbbbbbbbbbbbbbbbbbbbb') });
  assert.equal(await main(['--apply'], other.d), 1);
  assert.match(other.text(), /refusing to write/);
  assert.equal(pds.puts().length, 0);

  const wrong = deps(pds, { env: { [ENV.pds]: pds.url, [ENV.identifier]: HANDLE, [ENV.password]: 'wrong' } });
  assert.equal(await main(['--apply'], wrong.d), 1);
  assert.match(wrong.text(), /HTTP 401 AuthenticationRequired/);
  assert.ok(!wrong.text().includes('wrong'), 'the password sent is never echoed');
  assert.equal(pds.puts().length, 0);
});

test('--apply refuses a placeholder authority', async (t) => {
  const pds = await fakePds(t);
  const dir = mkdtempSync(join(tmpdir(), 'kn-publish-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  build({ authority: 'example.orgosnetwork', outDir: dir });
  const { d } = deps(pds);
  await assert.rejects(apply({ ...d, authority: 'example.orgosnetwork', lexiconsDir: dir }), /placeholder authority/);
  assert.equal(pds.calls.length, 0);
});

test('--check passes when the published records match the local files', async (t) => {
  const pds = await fakePds(t);
  assert.equal(await main(['--apply'], deps(pds).d), 0);
  const before = pds.calls.length;
  const { d, text } = deps(pds, { env: {} });
  assert.equal(await main(['--check'], d), 0, text());
  assert.match(text(), /_lexicon\.orgosnetwork\.org -> did:plc:a+/);
  const used = pds.calls.slice(before);
  assert.ok(used.length > 0 && used.every((c) => c.method === 'GET'), '--check only reads');
});

test('--check fails on drift, on a missing record, on a published draft, and without the TXT record', async (t) => {
  const pds = await fakePds(t);
  assert.equal(await main(['--apply'], deps(pds).d), 0);

  const key = `${SCHEMA_COLLECTION}/${AUTHORITY}.link`;
  pds.repo.set(key, { ...pds.repo.get(key), description: 'changed by hand' });
  let r = deps(pds);
  assert.equal(await main(['--check'], r.d), 1);
  assert.match(r.text(), new RegExp(`${AUTHORITY}\\.link: published record differs`));

  pds.repo.delete(key);
  r = deps(pds);
  assert.equal(await main(['--check'], r.d), 1);
  assert.match(r.text(), new RegExp(`${AUTHORITY}\\.link: not published`));

  pds.repo.set(key, localRecord('link'));
  pds.repo.set(`${SCHEMA_COLLECTION}/${AUTHORITY}.need`, { $type: SCHEMA_COLLECTION, lexicon: 1, id: `${AUTHORITY}.need`, defs: {} });
  r = deps(pds);
  assert.equal(await main(['--check'], r.d), 1);
  assert.match(r.text(), new RegExp(`${AUTHORITY}\\.need: a draft is published`));

  r = deps(pds, { resolveTxt: noTxt });
  assert.equal(await main(['--check'], r.d), 1);
  assert.match(r.text(), /no did= TXT record/);
});

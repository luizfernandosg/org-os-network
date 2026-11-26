#!/usr/bin/env node
// scripts/publish-lexicons.mjs: publish the network's lexicons so atproto resolvers can find them.
//
// atproto lexicon resolution (atproto.com/specs/lexicon, "Lexicon Publication and Resolution"):
// for the authority org.orgosnetwork, a DNS TXT record at _lexicon.orgosnetwork.org says
// "did=<DID>", and that DID's repository holds one record per lexicon in the collection
// com.atproto.lexicon.schema, with record key = the NSID and the record = the lexicon file plus
// "$type": "com.atproto.lexicon.schema". Resolution is exact-name only: no parent-domain lookup.
//
//   node scripts/publish-lexicons.mjs                dry run (default): print each record it would write
//   node scripts/publish-lexicons.mjs --apply        write them to the network's own account
//   node scripts/publish-lexicons.mjs --check        read-only: DNS + published records vs local files
//   ... --only <name>                                 limit to one published type (repeatable)
//
// --apply reads its credentials ONLY from the environment, never from arguments or files, and
// never prints them:
//   ORGOSNETWORK_PDS            the account's PDS, e.g. https://bsky.social
//   ORGOSNETWORK_IDENTIFIER     the account's handle or DID
//   ORGOSNETWORK_APP_PASSWORD   an app password for it
//
// Only the types in PUBLISHED below are ever written. Drafts are refused.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { promises as dnsPromises } from 'node:dns';
import { fileURLToPath } from 'node:url';
import { LEXICONS_DIR, readAuthority } from './build-lexicons.mjs';
import { resolveDid } from '../index/src/did.mjs';

/** The types published under the network's authority. Changing this list is a decision, not a fix. */
export const PUBLISHED = Object.freeze(['profile', 'link']);
/** Drafts: renamed with the authority, never published until co-designed with Weave. */
export const DRAFTS = Object.freeze(['need', 'offer']);

export const SCHEMA_COLLECTION = 'com.atproto.lexicon.schema';
export const ENV = Object.freeze({
  pds: 'ORGOSNETWORK_PDS',
  identifier: 'ORGOSNETWORK_IDENTIFIER',
  password: 'ORGOSNETWORK_APP_PASSWORD',
});

export class UsageError extends Error {}

/** Parse argv strictly: every token must be a known flag (or the value of --only). */
export function parseArgs(argv) {
  const opts = { mode: 'dry', only: [] };
  const modes = new Set();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') modes.add('apply');
    else if (a === '--check') modes.add('check');
    else if (a === '--only') {
      const v = argv[++i];
      if (v === undefined || v.startsWith('-')) throw new UsageError('--only needs a type name');
      opts.only.push(v);
    } else throw new UsageError(`unknown argument: ${JSON.stringify(a)}`);
  }
  if (modes.size > 1) throw new UsageError('--apply and --check are exclusive');
  if (modes.size === 1) opts.mode = [...modes][0];
  return opts;
}

/** The names to publish: the allowlist, or a subset of it. Drafts and unknown names are refused. */
export function selectNames(only = []) {
  if (only.length === 0) return [...PUBLISHED];
  for (const n of only) {
    if (DRAFTS.includes(n)) throw new UsageError(`${n} is a draft, not published until co-designed with Weave`);
    if (!PUBLISHED.includes(n)) throw new UsageError(`${n} is not a published type (published: ${PUBLISHED.join(', ')})`);
  }
  return PUBLISHED.filter((n) => only.includes(n));
}

/** org.orgosnetwork -> _lexicon.orgosnetwork.org */
export function txtName(authority) {
  return `_lexicon.${authority.split('.').reverse().join('.')}`;
}

/** Key-sorted JSON, so two records compare by content and not by key order. */
export function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** The schema records for `names`: [{ name, collection, rkey, record, sha256, bytes }]. Reads files only. */
export function schemaRecords({ names = PUBLISHED, authority = readAuthority(), lexiconsDir = LEXICONS_DIR } = {}) {
  return names.map((name) => {
    if (!PUBLISHED.includes(name)) throw new UsageError(`${name} is not on the publish allowlist`);
    const nsid = `${authority}.${name}`;
    const doc = JSON.parse(readFileSync(join(lexiconsDir, `${nsid}.json`), 'utf8'));
    if (doc.id !== nsid) throw new Error(`${nsid}.json has id ${doc.id}`);
    if (doc.lexicon !== 1) throw new Error(`${nsid}.json is not a Lexicon v1 document`);
    if (/^Draft\b/.test(doc.description ?? '')) throw new Error(`${nsid} describes itself as a draft; refusing`);
    const record = { $type: SCHEMA_COLLECTION, ...doc };
    const text = canonical(record);
    return {
      name,
      collection: SCHEMA_COLLECTION,
      rkey: nsid,
      record,
      sha256: createHash('sha256').update(text).digest('hex'),
      bytes: Buffer.byteLength(text),
    };
  });
}

const line = (r) => `${r.collection}  ${r.rkey}  sha256:${r.sha256.slice(0, 16)}  ${r.bytes} bytes`;

/** The DID named by the authority's _lexicon TXT record; null if there is none. */
export async function lexiconDid(authority, resolveTxt = dnsPromises.resolveTxt) {
  let rows;
  try {
    rows = await resolveTxt(txtName(authority));
  } catch (err) {
    if (err && (err.code === 'ENOTFOUND' || err.code === 'ENODATA')) return null;
    throw err;
  }
  const dids = rows.map((chunks) => chunks.join('')).filter((v) => v.startsWith('did=')).map((v) => v.slice(4));
  if (dids.length > 1) throw new Error(`${txtName(authority)} has ${dids.length} did= records; it must have one`);
  return dids[0] ?? null;
}

const defaultResolvePds = async (did) => (await resolveDid(did)).pds;

function checkPdsUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new UsageError(`${ENV.pds} is not a URL`);
  }
  const local = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(local && url.protocol === 'http:')) {
    throw new UsageError(`${ENV.pds} must be https (plain http only on localhost)`);
  }
  return url.origin + url.pathname.replace(/\/+$/, '');
}

async function xrpc(fetchImpl, base, nsid, { method = 'GET', params, body, token } = {}) {
  const url = new URL(`${base}/xrpc/${nsid}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  const headers = { accept: 'application/json' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetchImpl(url.href, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, ok: res.ok, json };
}

// Only the server's error code and message are ever shown, never a request.
const failure = (nsid, r) => new Error(`${nsid}: HTTP ${r.status}${r.json?.error ? ` ${r.json.error}` : ''}${r.json?.message ? `: ${r.json.message}` : ''}`);

async function getSchema(fetchImpl, pds, did, rkey) {
  const r = await xrpc(fetchImpl, pds, 'com.atproto.repo.getRecord', { params: { repo: did, collection: SCHEMA_COLLECTION, rkey } });
  if (r.ok) return r.json?.value ?? null;
  if (r.status === 400 && r.json?.error === 'RecordNotFound') return null;
  if (r.status === 404) return null;
  throw failure('com.atproto.repo.getRecord', r);
}

export async function dryRun({ names, authority = readAuthority(), lexiconsDir, log = console.log } = {}) {
  const records = schemaRecords({ names, authority, lexiconsDir });
  log(`dry run: nothing is sent. ${records.length} record(s) for ${authority}:`);
  for (const r of records) log(`  ${line(r)}`);
  log(`refused (drafts): ${DRAFTS.map((n) => `${authority}.${n}`).join(', ')}`);
  log(`DNS: ${txtName(authority)}  TXT  "did=<the network account's DID>"`);
  log('write them with --apply (credentials from the environment), then verify with --check');
  return { records, written: [] };
}

export async function apply({
  names,
  authority = readAuthority(),
  lexiconsDir,
  env = process.env,
  fetchImpl = globalThis.fetch,
  resolveTxt = dnsPromises.resolveTxt,
  log = console.log,
} = {}) {
  if (authority.startsWith('example.')) throw new UsageError(`${authority} is a placeholder authority; refusing to publish`);
  const missing = Object.values(ENV).filter((k) => !env[k]);
  if (missing.length) throw new UsageError(`--apply needs ${missing.join(', ')} in the environment`);
  const pds = checkPdsUrl(env[ENV.pds]);
  const records = schemaRecords({ names, authority, lexiconsDir });

  const session = await xrpc(fetchImpl, pds, 'com.atproto.server.createSession', {
    method: 'POST',
    body: { identifier: env[ENV.identifier], password: env[ENV.password] },
  });
  if (!session.ok || !session.json?.accessJwt || !session.json?.did) throw failure('com.atproto.server.createSession', session);
  const { did, accessJwt } = session.json;
  log(`signed in as ${did}`);

  const named = await lexiconDid(authority, resolveTxt);
  if (named && named !== did) throw new Error(`${txtName(authority)} names ${named}, not ${did}; refusing to write`);
  if (!named) log(`warning: ${txtName(authority)} has no did= record yet; resolvers will not find these until it does`);

  const written = [];
  for (const r of records) {
    const current = await getSchema(fetchImpl, pds, did, r.rkey);
    if (current && canonical(current) === canonical(r.record)) {
      log(`  unchanged  ${line(r)}`);
      continue;
    }
    const put = await xrpc(fetchImpl, pds, 'com.atproto.repo.putRecord', {
      method: 'POST',
      token: accessJwt,
      body: { repo: did, collection: r.collection, rkey: r.rkey, record: r.record },
    });
    if (!put.ok) throw failure('com.atproto.repo.putRecord', put);
    written.push(r.rkey);
    log(`  ${current ? 'updated' : 'created'}  ${line(r)}  ${put.json?.uri ?? ''}`);
  }
  log(`done: ${written.length} written, ${records.length - written.length} unchanged`);
  return { did, records, written };
}

export async function check({
  names,
  authority = readAuthority(),
  lexiconsDir,
  fetchImpl = globalThis.fetch,
  resolveTxt = dnsPromises.resolveTxt,
  resolvePds = defaultResolvePds,
  log = console.log,
} = {}) {
  const records = schemaRecords({ names, authority, lexiconsDir });
  const problems = [];
  const did = await lexiconDid(authority, resolveTxt);
  if (!did) {
    problems.push(`${txtName(authority)}: no did= TXT record`);
    log(`FAIL ${problems[0]}`);
    return { ok: false, did: null, problems };
  }
  log(`ok   ${txtName(authority)} -> ${did}`);
  const pds = await resolvePds(did);
  log(`ok   ${did} is hosted at ${pds}`);
  for (const r of records) {
    const published = await getSchema(fetchImpl, pds, did, r.rkey);
    if (!published) problems.push(`${r.rkey}: not published`);
    else if (canonical(published) !== canonical(r.record)) problems.push(`${r.rkey}: published record differs from lexicons/${r.rkey}.json`);
    else log(`ok   ${line(r)}`);
  }
  for (const n of DRAFTS) {
    const rkey = `${authority}.${n}`;
    if (await getSchema(fetchImpl, pds, did, rkey)) problems.push(`${rkey}: a draft is published`);
  }
  for (const p of problems) log(`FAIL ${p}`);
  return { ok: problems.length === 0, did, problems };
}

export async function main(argv, deps = {}) {
  const log = deps.log ?? console.log;
  const error = deps.error ?? console.error;
  try {
    const opts = parseArgs(argv);
    const names = selectNames(opts.only);
    if (opts.mode === 'apply') await apply({ ...deps, names, log });
    else if (opts.mode === 'check') {
      const { ok } = await check({ ...deps, names, log });
      return ok ? 0 : 1;
    } else await dryRun({ ...deps, names, log });
    return 0;
  } catch (err) {
    error(`publish-lexicons: ${err.message}`);
    return err instanceof UsageError ? 2 : 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  process.exitCode = await main(process.argv.slice(2));
}

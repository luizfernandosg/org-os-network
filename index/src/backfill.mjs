// Backfill and rebuild: read every followed collection from each member's own repository.
//   node index/src/backfill.mjs rebuild [--partial]
import { pathToFileURL } from 'node:url';
import { filterCollections, loadConfig, matchesCollection } from './config.mjs';
import { openDb, parseAtUri, replaceAll } from './db.mjs';
import { resolveDid } from './did.mjs';
import { describeRepo, listAllRecords } from './xrpc.mjs';

// How far before the rebuild started the live follower should resume, so nothing published
// during the backfill is missed. Replayed events are idempotent.
const CURSOR_REWIND_US = 60_000_000;

/** Read one member's followed records. Records whose URI is not in the member's repo are dropped. */
export async function collectMember(member, { fetchImpl = globalThis.fetch, patterns, plcBase, userAgent, log = () => {} }) {
  const { pds } = await resolveDid(member.did, { fetchImpl, plcBase, userAgent });
  const opts = { userAgent };
  const exact = patterns.filter((p) => !p.endsWith('.*'));
  let collections;
  try {
    collections = filterCollections(await describeRepo(fetchImpl, pds, member.did, opts), patterns);
  } catch (err) {
    if (exact.length === 0) throw err;
    log(`  describeRepo failed for ${member.name} (${err.message}); trying exact collections only`);
    collections = exact;
  }
  const records = [];
  for (const collection of collections) {
    const page = await listAllRecords(fetchImpl, pds, member.did, collection, opts);
    let kept = 0;
    for (const r of page) {
      let at;
      try {
        at = parseAtUri(r.uri);
      } catch {
        continue;
      }
      // Privacy floor: only the member's own records, only followed collections.
      if (at.did !== member.did || at.collection !== collection || !matchesCollection(at.collection, patterns)) continue;
      if (!r.value || typeof r.value !== 'object') continue;
      records.push({ uri: r.uri, did: at.did, collection: at.collection, rkey: at.rkey, cid: r.cid ?? null, value: r.value });
      kept++;
    }
    log(`  ${member.name}: ${collection} ${kept}`);
  }
  return { pds, records };
}

/** Read every member. Members without a DID are kept (listed, nothing read). */
export async function backfill({ members, patterns, fetchImpl = globalThis.fetch, plcBase, userAgent, log = () => {} }) {
  const outMembers = [];
  const records = [];
  const errors = [];
  for (const m of members) {
    if (!m.did) {
      outMembers.push({ ...m, pds: null });
      log(`${m.name}: no DID, skipped`);
      continue;
    }
    log(`${m.name} (${m.did})`);
    try {
      const got = await collectMember(m, { fetchImpl, patterns, plcBase, userAgent, log });
      outMembers.push({ ...m, pds: got.pds });
      records.push(...got.records);
    } catch (err) {
      outMembers.push({ ...m, pds: null });
      errors.push({ member: m.name, did: m.did, error: err.message });
      log(`  error: ${err.message}`);
    }
  }
  records.sort((a, b) => (a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0));
  return { members: outMembers, records, errors };
}

export function countsByCollection(records) {
  const counts = {};
  for (const r of records) counts[r.collection] = (counts[r.collection] ?? 0) + 1;
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

/**
 * Drop the index and backfill it from the network. If any member fails, nothing is written
 * unless `partial` is set, so a flaky read never leaves a smaller index behind.
 */
export async function rebuild(db, { members, patterns, fetchImpl, plcBase, userAgent, partial = false, now = () => new Date(), log }) {
  const started = now();
  const got = await backfill({ members, patterns, fetchImpl, plcBase, userAgent, log });
  const result = { records: got.records.length, counts: countsByCollection(got.records), errors: got.errors, written: false };
  if (got.errors.length && !partial) return result;
  const indexedAt = started.toISOString();
  replaceAll(db, {
    members: got.members,
    records: got.records,
    indexedAt,
    meta: {
      rebuilt_at: indexedAt,
      jetstream_cursor: started.getTime() * 1000 - CURSOR_REWIND_US,
      patterns: JSON.stringify(patterns),
    },
  });
  result.written = true;
  return result;
}

async function main(argv) {
  const cmd = argv[0] ?? 'rebuild';
  if (cmd !== 'rebuild') {
    console.error('usage: backfill.mjs rebuild [--partial]');
    process.exit(2);
  }
  const config = loadConfig();
  const db = openDb(config.dbPath);
  const result = await rebuild(db, {
    members: config.members,
    patterns: config.patterns,
    plcBase: config.plcDirectory,
    userAgent: config.userAgent,
    partial: argv.includes('--partial'),
    log: (s) => console.log(s),
  });
  db.close();
  console.log(JSON.stringify(result, null, 2));
  if (!result.written) {
    console.error('Not written: a member failed. Re-run, or pass --partial to write what was read.');
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

// Live follow: apply members' commits from Jetstream to the index, resuming from a stored cursor.
//   node index/src/follow.mjs
import { pathToFileURL } from 'node:url';
import { loadConfig, matchesCollection } from './config.mjs';
import { deleteRecord, getMeta, openDb, setMeta, transaction, upsertRecord } from './db.mjs';

const REWIND_ON_RECONNECT_US = 5_000_000;

export function jetstreamUrl(base, { dids, collections, cursor }) {
  // An empty wantedDids or wantedCollections means "everything" to Jetstream. Never ask for that.
  if (!dids?.length) throw new Error('refusing to follow: no member DIDs');
  if (!collections?.length) throw new Error('refusing to follow: no collections');
  if (collections.length > 100) throw new Error('Jetstream accepts at most 100 wantedCollections');
  const url = new URL(base);
  for (const c of collections) url.searchParams.append('wantedCollections', c);
  for (const d of dids) url.searchParams.append('wantedDids', d);
  if (cursor) url.searchParams.set('cursor', String(cursor));
  return url.href;
}

/**
 * Apply one Jetstream event. Returns what happened: created | updated | deleted | removed-account | ignored.
 * The cursor advances for every event that carries one, applied or not.
 */
export function applyEvent(db, event, { memberDids, patterns, now = () => new Date() }) {
  if (!event || typeof event !== 'object') return 'ignored';
  return transaction(db, () => {
    const status = applyInner(db, event, memberDids, patterns, now);
    if (Number.isSafeInteger(event.time_us)) setMeta(db, 'jetstream_cursor', event.time_us);
    return status;
  });
}

function applyInner(db, event, memberDids, patterns, now) {
  const did = event.did;
  if (typeof did !== 'string' || !memberDids.has(did)) return 'ignored';
  if (event.kind === 'account') {
    if (event.account?.active === false && event.account?.status === 'deleted') {
      db.prepare('DELETE FROM records WHERE did = ?').run(did);
      return 'removed-account';
    }
    return 'ignored';
  }
  if (event.kind !== 'commit' || !event.commit) return 'ignored';
  const { operation, collection, rkey, record, cid } = event.commit;
  if (!matchesCollection(collection, patterns)) return 'ignored';
  if (typeof rkey !== 'string' || !/^[a-zA-Z0-9._:~-]{1,512}$/.test(rkey)) return 'ignored';
  const uri = `at://${did}/${collection}/${rkey}`;
  if (operation === 'delete') {
    deleteRecord(db, uri);
    return 'deleted';
  }
  if (operation === 'create' || operation === 'update') {
    if (!record || typeof record !== 'object') return 'ignored';
    upsertRecord(db, { uri, did, collection, rkey, cid, value: record }, now().toISOString());
    return operation === 'create' ? 'created' : 'updated';
  }
  return 'ignored';
}

/**
 * Connect to Jetstream and keep applying events; reconnect with exponential backoff.
 * Returns { stop } (and closes cleanly on stop).
 */
export function follow({
  db,
  base,
  memberDids,
  patterns,
  WebSocketImpl = globalThis.WebSocket,
  log = () => {},
  minDelay = 1000,
  maxDelay = 60_000,
  setTimer = setTimeout,
  clearTimer = clearTimeout,
}) {
  const dids = [...memberDids].sort();
  let ws = null;
  let stopped = false;
  let timer = null;
  let delay = minDelay;

  const connect = () => {
    if (stopped) return;
    const stored = Number(getMeta(db, 'jetstream_cursor')) || null;
    const cursor = stored ? stored - REWIND_ON_RECONNECT_US : null;
    let url;
    try {
      url = jetstreamUrl(base, { dids, collections: patterns, cursor });
    } catch (err) {
      log(`follow: ${err.message}`);
      stopped = true;
      return;
    }
    log(`follow: connecting${cursor ? ` from cursor ${cursor}` : ''}`);
    try {
      ws = new WebSocketImpl(url);
    } catch (err) {
      log(`follow: ${err.message}`);
      return retry();
    }
    ws.addEventListener('open', () => log('follow: connected'));
    ws.addEventListener('message', (ev) => {
      delay = minDelay;
      let event;
      try {
        event = JSON.parse(typeof ev.data === 'string' ? ev.data : Buffer.from(ev.data).toString('utf8'));
      } catch {
        return;
      }
      try {
        const status = applyEvent(db, event, { memberDids, patterns });
        if (status !== 'ignored') log(`follow: ${status} ${event.commit?.collection ?? ''} ${event.commit?.rkey ?? event.did}`);
      } catch (err) {
        log(`follow: could not apply event: ${err.message}`);
      }
    });
    ws.addEventListener('error', (ev) => log(`follow: socket error ${ev?.message ?? ''}`.trim()));
    ws.addEventListener('close', () => {
      ws = null;
      if (!stopped) retry();
    });
  };

  const retry = () => {
    if (stopped) return;
    log(`follow: reconnecting in ${Math.round(delay / 1000)}s`);
    timer = setTimer(connect, delay);
    delay = Math.min(delay * 2, maxDelay);
  };

  connect();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimer(timer);
      if (ws) ws.close();
    },
    get stopped() {
      return stopped;
    },
  };
}

async function main() {
  const config = loadConfig();
  const memberDids = new Set(config.members.filter((m) => m.did).map((m) => m.did));
  const db = openDb(config.dbPath);
  const f = follow({ db, base: config.jetstream, memberDids, patterns: config.patterns, log: (s) => console.log(s) });
  const shutdown = () => {
    f.stop();
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

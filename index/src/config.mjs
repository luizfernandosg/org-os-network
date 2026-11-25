// Loads the index's config and members, and matches collections against the followed NSIDs.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const INDEX_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const NSID = /^[a-zA-Z][a-zA-Z0-9-]*(\.[a-zA-Z0-9-]+)+$/;

/** Flatten `collections` groups into one list of patterns ("a.b.c" or "a.b.*"). */
export function patternsOf(collections) {
  const list = Array.isArray(collections) ? collections : Object.values(collections ?? {}).flat();
  for (const p of list) {
    const bare = p.endsWith('.*') ? p.slice(0, -2) : p;
    if (!NSID.test(bare)) throw new Error(`not an NSID or NSID prefix: ${p}`);
  }
  return [...new Set(list)];
}

export function matchesCollection(nsid, patterns) {
  if (typeof nsid !== 'string') return false;
  return patterns.some((p) => (p.endsWith('.*') ? nsid.startsWith(p.slice(0, -1)) : nsid === p));
}

export function filterCollections(nsids, patterns) {
  return [...new Set(nsids)].filter((n) => matchesCollection(n, patterns)).sort();
}

export function loadMembers(dir = INDEX_DIR) {
  const { members } = JSON.parse(readFileSync(path.join(dir, 'members.json'), 'utf8'));
  const seen = new Set();
  for (const m of members) {
    if (!m.name) throw new Error('member without a name');
    if (m.did !== null && !/^did:(plc|web):[a-zA-Z0-9._:%-]+$/.test(m.did ?? '')) {
      throw new Error(`member ${m.name}: did must be did:plc, did:web or null`);
    }
    if (m.did && seen.has(m.did)) throw new Error(`duplicate member DID ${m.did}`);
    if (m.did) seen.add(m.did);
  }
  return members.map((m) => ({ name: m.name, did: m.did ?? null, handle: m.handle ?? null, source: m.source ?? null }));
}

export function loadConfig(dir = INDEX_DIR) {
  const raw = JSON.parse(readFileSync(path.join(dir, 'config.json'), 'utf8'));
  return {
    ...raw,
    patterns: patternsOf(raw.collections),
    dbPath: path.resolve(dir, raw.db ?? 'data/index.sqlite'),
    members: loadMembers(dir),
  };
}

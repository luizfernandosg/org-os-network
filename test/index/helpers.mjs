// Test helpers: an in-memory "network" served through a mocked fetch. No real network.
import { readFileSync } from 'node:fs';

export const network = JSON.parse(readFileSync(new URL('./fixtures/network.json', import.meta.url), 'utf8'));

const jsonResponse = (status, body) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

/** A fetch that serves DID documents and GET-only XRPC from `net`. Records `calls`. */
export function makeFetch(net = network, { pageSize } = {}) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const href = typeof input === 'string' ? input : input.url;
    calls.push({ href, method: init.method ?? 'GET' });
    if ((init.method ?? 'GET') !== 'GET') return jsonResponse(405, { error: 'MethodNotAllowed' });
    if (net.didDocs[href]) return jsonResponse(200, net.didDocs[href]);
    const url = new URL(href);
    const repo = Object.values(net.repos).find((r) => new URL(r.pds).origin === url.origin);
    if (!repo) return jsonResponse(404, { error: 'NotFound' });
    const did = url.searchParams.get('repo');
    const own = net.repos[did];
    if (!own || own !== repo) return jsonResponse(400, { error: 'RepoNotFound' });
    if (url.pathname === '/xrpc/com.atproto.repo.describeRepo') {
      const collections = [...new Set(repo.records.map((r) => r.uri.split('/')[3]))];
      return jsonResponse(200, { did, handle: 'x', collections });
    }
    if (url.pathname === '/xrpc/com.atproto.repo.listRecords') {
      const collection = url.searchParams.get('collection');
      const limit = pageSize ?? Number(url.searchParams.get('limit') ?? 50);
      const start = Number(url.searchParams.get('cursor') ?? 0);
      const all = repo.records.filter((r) => r.uri.split('/')[3] === collection);
      const page = all.slice(start, start + limit);
      const next = start + limit < all.length ? String(start + limit) : undefined;
      return jsonResponse(200, { records: page, ...(next ? { cursor: next } : {}) });
    }
    return jsonResponse(404, { error: 'MethodNotImplemented' });
  };
  return { fetchImpl, calls };
}

export function rowsOf(db) {
  return {
    records: db.prepare('SELECT uri, did, collection, rkey, cid, record_json FROM records ORDER BY uri').all().map((r) => ({ ...r })),
    members: db.prepare('SELECT * FROM members ORDER BY name').all().map((r) => ({ ...r })),
  };
}

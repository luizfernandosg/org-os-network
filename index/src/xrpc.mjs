// GET-only XRPC reads against a member's PDS. The index never writes to a repository.

export class XrpcError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

export async function xrpcGet(fetchImpl, base, nsid, params = {}, { userAgent } = {}) {
  const url = new URL(`/xrpc/${nsid}`, base);
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  const res = await fetchImpl(url.href, {
    method: 'GET',
    headers: { accept: 'application/json', ...(userAgent ? { 'user-agent': userAgent } : {}) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error ? ` ${body.error}${body.message ? `: ${body.message}` : ''}` : '';
    } catch {}
    throw new XrpcError(`${nsid} HTTP ${res.status}${detail}`, res.status);
  }
  return res.json();
}

export async function describeRepo(fetchImpl, pds, did, opts) {
  const body = await xrpcGet(fetchImpl, pds, 'com.atproto.repo.describeRepo', { repo: did }, opts);
  return Array.isArray(body.collections) ? body.collections : [];
}

/** Every record in one collection, following `cursor` until it runs out (or stops advancing). */
export async function listAllRecords(fetchImpl, pds, did, collection, { limit = 100, maxPages = 1000, ...opts } = {}) {
  const out = [];
  let cursor;
  const seen = new Set();
  for (let page = 0; page < maxPages; page++) {
    const body = await xrpcGet(fetchImpl, pds, 'com.atproto.repo.listRecords', { repo: did, collection, limit, cursor }, opts);
    const records = Array.isArray(body.records) ? body.records : [];
    out.push(...records);
    if (!body.cursor || records.length === 0 || seen.has(body.cursor)) return out;
    seen.add(body.cursor);
    cursor = body.cursor;
  }
  throw new Error(`listRecords ${collection} for ${did}: more than ${maxPages} pages`);
}

// DID resolution: did:plc via the PLC directory, did:web via /.well-known/did.json.
// Only the PDS endpoint is taken from the document.

export function didDocUrl(did, plcBase = 'https://plc.directory') {
  if (/^did:plc:[a-z2-7]{24}$/.test(did)) return `${plcBase.replace(/\/$/, '')}/${did}`;
  const web = /^did:web:([a-zA-Z0-9.%-]+)((?::[a-zA-Z0-9._%-]+)*)$/.exec(did);
  if (web) {
    const host = decodeURIComponent(web[1]);
    const segs = web[2] ? web[2].slice(1).split(':').map(decodeURIComponent) : [];
    return segs.length ? `https://${host}/${segs.join('/')}/did.json` : `https://${host}/.well-known/did.json`;
  }
  throw new Error(`unsupported DID: ${did}`);
}

/** The atproto PDS endpoint from a DID document, without a trailing slash. */
export function pdsFromDidDoc(doc, did) {
  if (!doc || typeof doc !== 'object') throw new Error('DID document is not an object');
  if (did && doc.id !== did) throw new Error(`DID document id ${doc.id} does not match ${did}`);
  const services = Array.isArray(doc.service) ? doc.service : [];
  const svc = services.find(
    (s) => (s.id === '#atproto_pds' || s.id === `${doc.id}#atproto_pds`) && s.type === 'AtprotoPersonalDataServer',
  );
  if (!svc || typeof svc.serviceEndpoint !== 'string') throw new Error(`no atproto PDS in DID document of ${doc.id}`);
  let url;
  try {
    url = new URL(svc.serviceEndpoint);
  } catch {
    throw new Error(`PDS endpoint is not a URL: ${svc.serviceEndpoint}`);
  }
  if (url.protocol !== 'https:') throw new Error(`PDS endpoint must be https: ${svc.serviceEndpoint}`);
  return url.origin + url.pathname.replace(/\/+$/, '');
}

export async function resolveDid(did, { fetchImpl = globalThis.fetch, plcBase, userAgent } = {}) {
  const res = await fetchImpl(didDocUrl(did, plcBase), {
    headers: { accept: 'application/did+json, application/json', ...(userAgent ? { 'user-agent': userAgent } : {}) },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`DID resolution failed for ${did}: HTTP ${res.status}`);
  const doc = await res.json();
  return { doc, pds: pdsFromDidDoc(doc, did) };
}

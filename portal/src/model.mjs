// The portal's model: what the page says, computed from a reading of the index. Pure: no I/O, no clock.
//
//   portalModel({ roster, members, records, rebuiltAt }, { latest, topics }) → model
//
// roster:  the members as index/members.json lists them ({ name, did, handle, caveat }), in its order.
// members: the index's members table ({ name, did, handle, pds }): what the last rebuild read.
// records: the index's records ({ uri, did, collection, rkey, record }), record being the parsed JSON.
// rebuiltAt: the index's rebuilt_at (an ISO date), or null.

export const NETWORK = 'org.orgosnetwork';
export const LINK = `${NETWORK}.link`;
export const PROFILE = `${NETWORK}.profile`;
export const NEED = `${NETWORK}.need`;
export const OFFER = `${NETWORK}.offer`;
export const CERTIFIED_ORG = 'app.certified.actor.organization';

/** The short word a collection's records go by ("claim", "entry"), from the last NSID segment. */
const KIND_WORDS = {
  'xyz.regencoordination.kb.claimEvidence': 'claim',
  'xyz.regencoordination.kb.conceptLineage': 'lineage',
  'xyz.regencoordination.kb.encyclopediaEntry': 'entry',
  [CERTIFIED_ORG]: 'Certified profile',
  'org.hypercerts.context.attachment': 'attachment',
};

export function kindOf(collection) {
  if (KIND_WORDS[collection]) return KIND_WORDS[collection];
  const last = String(collection).split('.').pop() ?? '';
  return last.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
}

export function plural(word, n) {
  if (n === 1) return word;
  if (/[^aeiou]y$/.test(word)) return word.slice(0, -1) + 'ies';
  if (/(s|x|ch|sh)$/.test(word)) return word + 'es';
  return word + 's';
}

const nonEmpty = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

/** A record's own title, when it has one; null otherwise (never made up from other fields). */
export function recordTitle(record) {
  for (const k of ['title', 'name', 'displayName']) {
    const v = nonEmpty(record?.[k]);
    if (v) return v;
  }
  return null;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T[\d:.]+(Z|[+-]\d{2}:\d{2}))?$/;

/** The date a record gives itself: createdAt, else last_reviewed (the commons' records carry no createdAt). */
export function dateOf(record) {
  for (const k of ['createdAt', 'last_reviewed']) {
    const v = nonEmpty(record?.[k]);
    if (v && ISO_DATE.test(v) && !Number.isNaN(Date.parse(v))) return v;
  }
  return null;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "26 Nov 2026", in UTC; null for no date. */
export function formatDay(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** "21:21 UTC"; null when the date carries no time. */
export function formatTime(iso) {
  if (!iso || !/T/.test(iso)) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
}

export const formatCount = (n) => n.toLocaleString('en-US');

export function slug(name) {
  return String(name)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A domain id ("carbon-markets") as words ("carbon markets"). */
export const domainWords = (d) => String(d).replace(/[-_]+/g, ' ').trim();

/** The first paragraph of a text, cut at a word near `max` characters. */
export function firstParagraph(text, max = 420) {
  const p = String(text ?? '').trim().split(/\n\s*\n/)[0].replace(/\s+/g, ' ').trim();
  if (p.length <= max) return p;
  const cut = p.slice(0, max);
  return cut.slice(0, cut.lastIndexOf(' ') > 0 ? cut.lastIndexOf(' ') : max).replace(/[\s,;:—-]+$/, '') + '…';
}

/** The host names of a record's http(s) URLs, without "www.", deduplicated, at most `max`. */
export function hostsOf(urls, max = 3) {
  const out = [];
  for (const u of urls ?? []) {
    const href = typeof u === 'string' ? u : u?.url;
    try {
      const url = new URL(href);
      if (url.protocol !== 'https:' && url.protocol !== 'http:') continue;
      const host = url.hostname.replace(/^www\./, '');
      if (host && !out.includes(host)) out.push(host);
    } catch {
      // not a URL: left out
    }
    if (out.length >= max) break;
  }
  return out;
}

/** The registrable-looking tail of a PDS host ("certified.one", "bsky.network"), for words, not for links. */
export function pdsWord(pds) {
  try {
    const labels = new URL(pds).hostname.split('.');
    return labels.slice(-2).join('.');
  } catch {
    return null;
  }
}

const byDateThenUri = (a, b) => {
  if (a.date !== b.date) {
    if (a.date === null) return 1;
    if (b.date === null) return -1;
    return a.date < b.date ? 1 : -1;
  }
  return a.uri < b.uri ? -1 : a.uri > b.uri ? 1 : 0;
};

const countBy = (items, key) => {
  const m = new Map();
  for (const it of items) {
    const k = key(it);
    if (k === null || k === undefined) continue;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
};

/** What a member says about itself: its network profile first, else its Certified organisation record. */
function selfDescription(records) {
  const profile = records.find((r) => r.collection === PROFILE && r.rkey === 'self') ?? records.find((r) => r.collection === PROFILE);
  const cert = records.find((r) => r.collection === CERTIFIED_ORG);
  const p = profile?.record ?? {};
  const c = cert?.record ?? {};
  const certText = nonEmpty(c.longDescription?.value) ?? nonEmpty(c.longDescription) ?? nonEmpty(c.description?.value) ?? nonEmpty(c.description);
  const text = nonEmpty(p.description) ?? certText;
  const from = nonEmpty(p.description) ? PROFILE : certText ? CERTIFIED_ORG : null;
  const hosts = hostsOf([...(nonEmpty(p.homepage) ? [p.homepage] : []), ...(Array.isArray(c.urls) ? c.urls : [])]);
  const types = Array.isArray(c.organizationType) ? c.organizationType.filter(nonEmpty) : [];
  return { description: text ? firstParagraph(text) : null, descriptionFrom: from, hosts, types };
}

/**
 * The network map: one node per member of the roster; one edge per pair that a link record joins, mutual when both
 * sides published it. Links to DIDs outside the roster are counted, never drawn or named (index privacy floor).
 */
export function networkMap(roster, recordsByDid) {
  const didToId = new Map(roster.filter((m) => m.did).map((m) => [m.did, slug(m.name)]));
  const pairs = new Map();
  const links = { total: 0, drawn: 0, outside: 0, unreadable: 0 };
  for (const m of roster) {
    if (!m.did) continue;
    for (const r of recordsByDid.get(m.did) ?? []) {
      if (r.collection !== LINK) continue;
      links.total++;
      const subject = nonEmpty(r.record?.subject);
      const relation = r.record?.relation;
      if (!subject || subject === m.did || !['memberOf', 'hasMember', 'peerOf'].includes(relation)) {
        links.unreadable++;
        continue;
      }
      if (!didToId.has(subject)) {
        links.outside++;
        continue;
      }
      links.drawn++;
      let key, edge;
      if (relation === 'peerOf') {
        const [a, b] = [m.did, subject].sort();
        key = `peer ${a} ${b}`;
        edge = { from: didToId.get(a), to: didToId.get(b), relation: 'peer' };
      } else {
        const [parent, child] = relation === 'hasMember' ? [m.did, subject] : [subject, m.did];
        key = `member ${parent} ${child}`;
        edge = { from: didToId.get(parent), to: didToId.get(child), relation: 'member' };
      }
      const seen = pairs.get(key) ?? { ...edge, sides: new Set() };
      seen.sides.add(m.did);
      pairs.set(key, seen);
    }
  }
  const edges = [...pairs.values()]
    .map(({ sides, ...e }) => ({ ...e, mutual: sides.size === 2 }))
    .sort((a, b) => `${a.relation} ${a.from} ${a.to}`.localeCompare(`${b.relation} ${b.from} ${b.to}`));
  return { edges, links, empty: edges.length === 0 };
}

export function portalModel({ roster, members = [], records = [], rebuiltAt = null }, { latest = 5, topics = 8 } = {}) {
  if (!Array.isArray(roster) || roster.length === 0) throw new Error('portalModel: the roster (index/members.json) is empty');
  const read = new Map(members.filter((m) => m.did).map((m) => [m.did, m]));
  const rosterDids = new Set(roster.filter((m) => m.did).map((m) => m.did));
  const own = records.filter((r) => rosterDids.has(r.did));
  const byDid = new Map();
  for (const r of own) byDid.set(r.did, [...(byDid.get(r.did) ?? []), r]);

  const orgs = roster.map((m) => {
    const id = slug(m.name);
    const mine = m.did ? byDid.get(m.did) ?? [] : [];
    const row = m.did ? read.get(m.did) : null;
    const state = !m.did ? 'no-account' : !row || !row.pds ? 'not-read' : mine.length ? 'publishing' : 'quiet';
    const counts = [...countBy(mine, (r) => r.collection)]
      .map(([collection, count]) => ({ collection, kind: kindOf(collection), count }))
      .sort((a, b) => b.count - a.count || a.collection.localeCompare(b.collection));
    const latestRecords = mine
      .map((r) => ({
        uri: r.uri,
        collection: r.collection,
        kind: kindOf(r.collection),
        title: recordTitle(r.record),
        topic: nonEmpty(r.record?.domain) ? domainWords(r.record.domain) : null,
        date: dateOf(r.record),
      }))
      .sort(byDateThenUri)
      .slice(0, latest)
      .map((r) => ({ ...r, day: r.date ? formatDay(r.date) : null }));
    return {
      id,
      name: m.name,
      did: m.did ?? null,
      handle: m.handle ?? row?.handle ?? null,
      pds: row?.pds ?? null,
      host: row?.pds ? pdsWord(row.pds) : null,
      caveat: nonEmpty(m.caveat),
      state,
      records: mine.length,
      counts,
      latest: latestRecords,
      ...selfDescription(mine),
    };
  });

  const map = networkMap(roster, byDid);
  const nodes = orgs.map((o) => ({
    id: o.id,
    name: o.name,
    state: o.state,
    facts:
      o.state === 'publishing'
        ? `${formatCount(o.records)} ${plural('record', o.records)}`
        : o.state === 'quiet'
          ? 'account · nothing followed yet'
          : o.state === 'not-read'
            ? 'not read yet'
            : 'no account yet',
    parent: map.edges.some((e) => e.relation === 'member' && e.from === o.id),
  }));

  const asks = own
    .filter((r) => r.collection === NEED || r.collection === OFFER)
    .map((r) => ({
      uri: r.uri,
      kind: r.collection === NEED ? 'need' : 'offer',
      title: recordTitle(r.record),
      who: orgs.find((o) => o.did === r.did)?.name ?? null,
      status: nonEmpty(r.record?.status),
      date: dateOf(r.record),
    }))
    .filter((a) => a.title)
    .sort(byDateThenUri)
    .map((a) => ({ ...a, day: formatDay(a.date) }));

  const collections = [...countBy(own, (r) => r.collection)]
    .map(([collection, count]) => ({ collection, kind: kindOf(collection), count }))
    .sort((a, b) => b.count - a.count || a.collection.localeCompare(b.collection));
  const topicList = [...countBy(own, (r) => nonEmpty(r.record?.domain))]
    .map(([domain, count]) => ({ domain, words: domainWords(domain), count }))
    .sort((a, b) => b.count - a.count || a.domain.localeCompare(b.domain))
    .slice(0, topics);

  return {
    rebuiltAt,
    readDay: formatDay(rebuiltAt),
    readTime: formatTime(rebuiltAt),
    totals: {
      organisations: orgs.length,
      accounts: orgs.filter((o) => o.did).length,
      publishing: orgs.filter((o) => o.state === 'publishing').length,
      records: own.length,
    },
    orgs,
    map: { nodes, edges: map.edges, links: map.links, empty: map.empty },
    collections,
    topics: topicList,
    asks,
  };
}

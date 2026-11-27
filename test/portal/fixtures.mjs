// Fixtures for the portal's tests (not a test file; see package.json "test"). Made-up organisations and records.
import { readFileSync } from 'node:fs';

export const ROSTER_DIR = new URL('./fixtures/', import.meta.url).pathname;
export const roster = JSON.parse(readFileSync(new URL('./fixtures/members.json', import.meta.url), 'utf8')).members.map((m) => ({
  name: m.name,
  did: m.did,
  handle: m.handle,
  caveat: m.caveat ?? null,
}));

const VALLEY = 'did:plc:examplevalleycommons';
const RIVER = 'did:plc:exampleriverbendseeds';
const HILL = 'did:web:hilltop.example';
const GROVE = 'did:plc:examplequietgrove';
export const OUTSIDER = 'did:plc:exampleoutsiderorg';
export const DIDS = { VALLEY, RIVER, HILL, GROVE };

/** What the index's members table holds after a rebuild: Hilltop's read failed (--partial), so it has no PDS. */
export const members = [
  { name: 'Valley Commons', did: VALLEY, handle: 'valley.example', pds: 'https://pds.valley.example' },
  { name: 'Riverbend Seeds', did: RIVER, handle: 'riverbend.example', pds: 'https://eu.host.certified.example' },
  { name: 'Hilltop Toolshed', did: HILL, handle: null, pds: null },
  { name: 'Quiet Grove', did: GROVE, handle: 'grove.example', pds: 'https://pds.grove.example' },
  { name: 'Coastal Group', did: null, handle: null, pds: null },
];

const rec = (did, collection, rkey, record) => ({ uri: `at://${did}/${collection}/${rkey}`, did, collection, rkey, record });
const kb = (n) => `xyz.regencoordination.kb.${n}`;

/** Records with no link among them: the state of the real network today. */
export const recordsNoLinks = [
  rec(VALLEY, kb('claimEvidence'), 'c1', { title: 'Soil carbon claim', domain: 'carbon-markets', last_reviewed: '2026-09-20' }),
  rec(VALLEY, kb('claimEvidence'), 'c2', { title: 'Second claim', domain: 'carbon-markets', last_reviewed: '2026-10-15' }),
  rec(VALLEY, kb('signal'), 's1', { title: 'A signal', domain: 'local-nodes', last_reviewed: '2026-10-15' }),
  rec(VALLEY, kb('signal'), 's2', { title: '  ', domain: 'local-nodes', last_reviewed: '2026-09-19' }),
  rec(VALLEY, kb('encyclopediaEntry'), 'e1', { title: 'Bioregional finance', domain: 'regenerative-economics', last_reviewed: 'not a date' }),
  rec(VALLEY, kb('resource'), 'r1', { title: 'A resource', domain: 'carbon-markets', createdAt: '2026-11-01T09:00:00.000Z', last_reviewed: '2026-01-01' }),
  rec(VALLEY, 'org.orgosnetwork.profile', 'self', {
    name: 'Valley Commons',
    description: 'A commons of the valley.\n\nSecond paragraph, not shown.',
    homepage: 'https://www.valley.example/',
    createdAt: '2026-11-20T10:00:00.000Z',
  }),
  rec(VALLEY, 'app.certified.actor.organization', 'self', {
    longDescription: { value: 'Certified words, overridden by the profile.' },
    urls: [{ url: 'https://valley.example/about' }],
    createdAt: '2026-05-01T10:00:00.000Z',
  }),
  rec(RIVER, 'app.certified.actor.organization', 'self', {
    longDescription: { $type: 'org.hypercerts.defs#descriptionString', value: 'Riverbend keeps seeds.\n\nMore.' },
    organizationType: ['nonprofit'],
    urls: [{ url: 'https://riverbend.example' }, { url: 'javascript:alert(1)' }, { url: 'https://www.riverbend.example/x' }, 'not a url'],
    createdAt: '2026-05-31T10:39:58.832Z',
  }),
  rec(RIVER, 'org.orgosnetwork.need', '3mneed', { title: 'Advice on cold storage', text: 'x', status: 'open', createdAt: '2026-11-22T10:10:00.000Z' }),
  // a record from a DID outside the roster: the index never stores one, and the model ignores it if it did
  rec(OUTSIDER, kb('signal'), 'o1', { title: 'Not a member', domain: 'outside', last_reviewed: '2026-12-01' }),
];

/** Link records: a mutual membership, a one-sided peering, a link out of the network, and an unreadable one. */
export const links = [
  rec(RIVER, 'org.orgosnetwork.link', 'l1', { subject: VALLEY, relation: 'memberOf', createdAt: '2026-11-22T10:05:00.000Z' }),
  rec(VALLEY, 'org.orgosnetwork.link', 'l2', { subject: RIVER, relation: 'hasMember', createdAt: '2026-11-22T11:00:00.000Z' }),
  rec(GROVE, 'org.orgosnetwork.link', 'l3', { subject: RIVER, relation: 'peerOf', createdAt: '2026-11-22T12:00:00.000Z' }),
  rec(VALLEY, 'org.orgosnetwork.link', 'l4', { subject: OUTSIDER, relation: 'peerOf', createdAt: '2026-11-22T12:00:00.000Z' }),
  rec(VALLEY, 'org.orgosnetwork.link', 'l5', { subject: RIVER, relation: 'friendOf', createdAt: '2026-11-22T12:00:00.000Z' }),
];

export const REBUILT_AT = '2026-11-26T21:21:47.213Z';

export const index = (records = recordsNoLinks) => ({ roster, members, records, rebuiltAt: REBUILT_AT });

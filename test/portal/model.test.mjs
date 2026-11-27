import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  dateOf,
  firstParagraph,
  formatDay,
  formatTime,
  hostsOf,
  kindOf,
  plural,
  portalModel,
  recordTitle,
  slug,
} from '../../portal/src/model.mjs';
import { DIDS, OUTSIDER, REBUILT_AT, index, links, recordsNoLinks } from './fixtures.mjs';

const byId = (model, id) => model.orgs.find((o) => o.id === id);

test('every member of the roster is an organisation, in the roster order, with its DID, handle and account state', () => {
  const m = portalModel(index());
  assert.deepEqual(
    m.orgs.map((o) => [o.id, o.did, o.handle, o.state]),
    [
      ['valley-commons', DIDS.VALLEY, 'valley.example', 'publishing'],
      ['riverbend-seeds', DIDS.RIVER, 'riverbend.example', 'publishing'],
      ['hilltop-toolshed', DIDS.HILL, null, 'not-read'],
      ['quiet-grove', DIDS.GROVE, 'grove.example', 'quiet'],
      ['coastal-group', null, null, 'no-account'],
    ],
  );
  assert.equal(byId(m, 'riverbend-seeds').host, 'certified.example');
  assert.equal(byId(m, 'riverbend-seeds').caveat, 'A test account.');
  assert.deepEqual(m.totals, { organisations: 5, accounts: 4, publishing: 2, records: 10 });
  assert.equal(m.readDay, '26 Nov 2026');
  assert.equal(m.readTime, '21:21 UTC');
});

test('a member the last rebuild did not list is "not read", even with a DID', () => {
  const m = portalModel({ ...index(), members: [] });
  assert.deepEqual(m.orgs.map((o) => o.state), ['not-read', 'not-read', 'not-read', 'not-read', 'no-account']);
});

test('records from DIDs outside the roster are ignored everywhere', () => {
  const m = portalModel(index());
  const json = JSON.stringify(m);
  assert.ok(!json.includes(OUTSIDER));
  assert.ok(!json.includes('Not a member'));
  assert.ok(!m.topics.some((t) => t.domain === 'outside'));
});

test('counts per collection, per member and for the whole network, largest first', () => {
  const m = portalModel(index());
  assert.deepEqual(
    byId(m, 'valley-commons').counts.map((c) => [c.collection, c.kind, c.count]),
    [
      ['xyz.regencoordination.kb.claimEvidence', 'claim', 2],
      ['xyz.regencoordination.kb.signal', 'signal', 2],
      ['app.certified.actor.organization', 'Certified profile', 1],
      ['org.orgosnetwork.profile', 'profile', 1],
      ['xyz.regencoordination.kb.encyclopediaEntry', 'entry', 1],
      ['xyz.regencoordination.kb.resource', 'resource', 1],
    ],
  );
  assert.deepEqual(byId(m, 'quiet-grove').counts, []);
  assert.equal(m.collections.reduce((n, c) => n + c.count, 0), 10);
  assert.deepEqual(m.collections[0], { collection: 'app.certified.actor.organization', kind: 'Certified profile', count: 2 });
});

test('the latest records per member: by the date the record gives itself, ties by URI, titles only where they exist', () => {
  const m = portalModel(index(), { latest: 5 });
  const v = byId(m, 'valley-commons').latest;
  assert.deepEqual(
    v.map((r) => [r.uri.split('/').slice(3).join('/'), r.title, r.date, r.day]),
    [
      ['org.orgosnetwork.profile/self', 'Valley Commons', '2026-11-20T10:00:00.000Z', '20 Nov 2026'],
      ['xyz.regencoordination.kb.resource/r1', 'A resource', '2026-11-01T09:00:00.000Z', '1 Nov 2026'],
      ['xyz.regencoordination.kb.claimEvidence/c2', 'Second claim', '2026-10-15', '15 Oct 2026'],
      ['xyz.regencoordination.kb.signal/s1', 'A signal', '2026-10-15', '15 Oct 2026'],
      ['xyz.regencoordination.kb.claimEvidence/c1', 'Soil carbon claim', '2026-09-20', '20 Sep 2026'],
    ],
  );
  assert.equal(v[2].topic, 'carbon markets');
  const all = portalModel(index(), { latest: 50 });
  const tail = byId(all, 'valley-commons').latest.slice(-3);
  assert.deepEqual(tail.map((r) => [r.uri.split('/').pop(), r.title, r.date]), [
    ['s2', null, '2026-09-19'],
    ['self', null, '2026-05-01T10:00:00.000Z'],
    ['e1', 'Bioregional finance', null],
  ]);
  assert.deepEqual(byId(m, 'riverbend-seeds').latest.map((r) => r.kind), ['need', 'Certified profile']);
  assert.deepEqual(byId(m, 'coastal-group').latest, []);
});

test('what a member says about itself: its network profile first, else its Certified record, first paragraph only', () => {
  const m = portalModel(index());
  const v = byId(m, 'valley-commons');
  assert.equal(v.description, 'A commons of the valley.');
  assert.equal(v.descriptionFrom, 'org.orgosnetwork.profile');
  assert.deepEqual(v.hosts, ['valley.example']);
  const r = byId(m, 'riverbend-seeds');
  assert.equal(r.description, 'Riverbend keeps seeds.');
  assert.equal(r.descriptionFrom, 'app.certified.actor.organization');
  assert.deepEqual(r.types, ['nonprofit']);
  assert.deepEqual(r.hosts, ['riverbend.example'], 'no javascript: URLs, no duplicates, www. dropped');
  assert.equal(byId(m, 'quiet-grove').description, null);
  assert.equal(byId(m, 'coastal-group').description, null);
});

test('topics are the records’ domains, counted, largest first', () => {
  const m = portalModel(index(), { topics: 2 });
  assert.deepEqual(m.topics, [
    { domain: 'carbon-markets', words: 'carbon markets', count: 3 },
    { domain: 'local-nodes', words: 'local nodes', count: 2 },
  ]);
});

test('needs and offers come only from published need and offer records', () => {
  const m = portalModel(index());
  assert.deepEqual(m.asks.map((a) => [a.kind, a.title, a.who, a.status, a.day]), [['need', 'Advice on cold storage', 'Riverbend Seeds', 'open', '22 Nov 2026']]);
  assert.deepEqual(portalModel(index(recordsNoLinks.filter((r) => !r.collection.endsWith('.need')))).asks, []);
});

test('with no link records the map has every member as a node and no edge, and says it is empty', () => {
  const m = portalModel(index());
  assert.equal(m.map.empty, true);
  assert.deepEqual(m.map.edges, []);
  assert.deepEqual(m.map.links, { total: 0, drawn: 0, outside: 0, unreadable: 0 });
  assert.deepEqual(
    m.map.nodes.map((n) => [n.id, n.state, n.facts, n.parent]),
    [
      ['valley-commons', 'publishing', '8 records', false],
      ['riverbend-seeds', 'publishing', '2 records', false],
      ['hilltop-toolshed', 'not-read', 'not read yet', false],
      ['quiet-grove', 'quiet', 'account · nothing followed yet', false],
      ['coastal-group', 'no-account', 'no account yet', false],
    ],
  );
});

test('link records become edges: mutual when both sides published, claimed when one did; links out are counted, never drawn', () => {
  const m = portalModel(index([...recordsNoLinks, ...links]));
  assert.equal(m.map.empty, false);
  assert.deepEqual(m.map.edges, [
    { from: 'valley-commons', to: 'riverbend-seeds', relation: 'member', mutual: true },
    { from: 'quiet-grove', to: 'riverbend-seeds', relation: 'peer', mutual: false },
  ]);
  assert.deepEqual(m.map.links, { total: 5, drawn: 3, outside: 1, unreadable: 1 });
  assert.equal(m.map.nodes.find((n) => n.id === 'valley-commons').parent, true);
  assert.equal(m.map.nodes.find((n) => n.id === 'riverbend-seeds').parent, false);
  assert.ok(!JSON.stringify(m.map).includes(OUTSIDER), 'the outside DID is not in the map');
});

test('a one-sided memberOf is a claimed membership edge', () => {
  const m = portalModel(index([...recordsNoLinks, links[0]]));
  assert.deepEqual(m.map.edges, [{ from: 'valley-commons', to: 'riverbend-seeds', relation: 'member', mutual: false }]);
});

test('an empty roster is refused', () => {
  assert.throws(() => portalModel({ roster: [] }), /roster/);
});

test('helpers', () => {
  assert.equal(kindOf('xyz.regencoordination.kb.encyclopediaEntry'), 'entry');
  assert.equal(kindOf('org.orgosnetwork.need'), 'need');
  assert.equal(kindOf('org.example.someThing'), 'some thing');
  assert.equal(plural('entry', 2), 'entries');
  assert.equal(plural('entry', 1), 'entry');
  assert.equal(plural('day', 2), 'days');
  assert.equal(recordTitle({ title: ' A ' }), 'A');
  assert.equal(recordTitle({ claim: 'not a title' }), null);
  assert.equal(dateOf({ createdAt: 'yesterday', last_reviewed: '2026-09-20' }), '2026-09-20');
  assert.equal(dateOf({}), null);
  assert.equal(formatDay(REBUILT_AT), '26 Nov 2026');
  assert.equal(formatDay(null), null);
  assert.equal(formatTime('2026-09-20'), null);
  assert.equal(slug('Regen Coordination (Knowledge Commons WG)'), 'regen-coordination-knowledge-commons-wg');
  assert.equal(slug('São Paulo Nó'), 'sao-paulo-no');
  assert.equal(firstParagraph('one two three four', 9), 'one two…');
  assert.deepEqual(hostsOf(['https://a.example', 'ftp://b.example', 'https://c.example', 'https://d.example'], 2), ['a.example', 'c.example']);
});

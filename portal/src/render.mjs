// Draws the portal model with org-os's own portal components, as static HTML (renderToStaticMarkup), the way
// explorations/portal-mockup/render.tsx draws the mock-up. Run through build.mjs, which starts it with org-os's tsx:
//   node portal/src/build.mjs --admin <org-os packages/admin> [--db <index.sqlite>] [--out <dir>] [--roster <dir>]
// React and the components both come from --admin, so the page uses one React, the components' own.
// Writes <out>/index.html, <out>/model.json and <out>/assets/ (hub.css, the fonts and their licences).
import { cpSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PORTAL_DIR, parseArgs } from './args.mjs';
import { layoutMap } from './layout.mjs';
import { formatCount, plural, portalModel } from './model.mjs';
import { readIndexFile, readRoster } from './read.mjs';

/** The house stylesheet and fonts, as copied for the mock-up from the Hub's build. */
export const ASSETS_DIR = path.resolve(PORTAL_DIR, '../explorations/portal-mockup/assets');

const upper = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** "a, b and c" */
const listWords = (xs) => (xs.length < 2 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export async function loadKit(admin) {
  const req = createRequire(path.join(admin, 'package.json'));
  const React = req('react');
  const { renderToStaticMarkup } = req('react-dom/server');
  const load = (p) => import(pathToFileURL(path.join(admin, p)).href);
  const [{ PortalTop }, { Hero }, { PortalSection }, { HouseNode }] = await Promise.all([
    load('app/src/portal/PortalTop.tsx'),
    load('app/src/portal/Hero.tsx'),
    load('app/src/portal/PortalSection.tsx'),
    load('app/src/map/HouseNode.tsx'),
  ]);
  return { React, renderToStaticMarkup, PortalTop, Hero, PortalSection, HouseNode };
}

/** What is still hand-written: the needs and offers shown while none is published, and the joining section. */
const EXAMPLE_ASKS = [
  { who: 'ReFi Barcelona', kind: 'need', title: 'Facilitators for a bioregional funding round in the Penedès, spring 2027', reply: 'reply on refibcn.cat' },
  { who: 'ReFi DAO', kind: 'offer', title: 'Round design and Gitcoin operations, from four local-node rounds', reply: 'ask on refidao.com' },
  { who: 'Regen Coordination', kind: 'need', title: 'A host for the Knowledge Commons WG’s spring in-person', reply: 'ask in its forum' },
];

export function renderPage(kit, model) {
  const { React, renderToStaticMarkup, PortalTop, Hero, PortalSection, HouseNode } = kit;
  const h = React.createElement;
  const F = React.Fragment;
  const Ex = () => h('span', { className: 'nx-ex' }, 'example');
  const { orgs, map, totals } = model;
  const layout = layoutMap(map);
  const byId = new Map(orgs.map((o) => [o.id, o]));
  const readAt = model.readDay ? `${model.readDay}${model.readTime ? ` at ${model.readTime}` : ''}` : null;

  // ---- the map plate
  const nodeData = (n) => ({
    item: { id: n.id, kind: n.parent ? 'gardens-community' : 'meeting', name: n.name },
    facts: n.facts,
    href: `#org-${n.id}`,
    states: n.state === 'no-account' || n.state === 'not-read' ? ['dim'] : [],
  });
  const claimed = map.edges.some((e) => !e.mutual);
  const outside = map.links.outside
    ? ` ${formatCount(map.links.outside)} ${plural('link', map.links.outside)} to organisations outside the network ${map.links.outside === 1 ? 'is' : 'are'} not drawn.`
    : '';
  const note = map.empty
    ? `No organisation has published a link (org.orgosnetwork.link) yet, so no lines are drawn. Who is a member of whom shows here once one side publishes it.${outside}`
    : `${formatCount(map.edges.length)} ${plural('line', map.edges.length)}, each from link records the organisations published.${outside}`;
  const Plate = () =>
    h('section', { className: 'portal-plate', 'aria-labelledby': 'plate-h' },
      h('div', { className: 'portal-plate-h' },
        h('h2', { className: 'portal-plate-t', id: 'plate-h' }, 'How the network is arranged'),
        h('p', { className: 'portal-eyebrow' }, `Read from each organisation’s own account${model.readDay ? ` · ${model.readDay}` : ''}`)),
      h('div', { className: 'hmap hmap-portal nx-wide' },
        h('div', { className: 'hmap-canvas nx-canvas', role: 'group', 'aria-label': 'The network, drawn', style: { blockSize: layout.height } },
          h('svg', { className: 'nx-edges', viewBox: `0 0 ${layout.width} ${layout.height}`, style: { blockSize: layout.height }, 'aria-hidden': 'true' },
            layout.lines.map((l) => h('path', { key: `${l.relation} ${l.from} ${l.to}`, className: ['hedge', l.relation === 'peer' ? 'nx-peer' : null, l.mutual ? null : 'nx-claimed'].filter(Boolean).join(' '), d: l.d }))),
          layout.nodes.map((n) => h('div', { key: n.id, className: 'nx-at', style: { left: n.x, top: n.y, width: layout.nodeWidth } }, h(HouseNode, { data: nodeData(n), variant: 'portal' })))),
        h('p', { className: 'nx-key' },
          map.empty ? null : h(F, null, h('span', null), ' member of ', h('span', { className: 'nx-k-dash' }), ' peers '),
          claimed ? h(F, null, h('span', { className: 'nx-k-claimed' }), ' one side only ') : null,
          h('span', { className: 'nx-k-dim' }), ' no account yet')),
      h('ul', { className: 'portal-map-still nx-narrow', 'aria-label': 'The network, as a list' },
        map.nodes.map((n) => h('li', { key: n.id }, h(HouseNode, { data: nodeData(n), variant: 'portal' })))),
      h('p', { className: 'nx-note' }, note));

  // ---- 01 organisations: everything here is read from the index and members.json
  const accountWord = (o) =>
    o.state === 'no-account' ? 'no atproto account yet' : o.state === 'not-read' ? 'account not read yet' : `on atproto${o.host ? ` · ${o.host}` : ''}`;
  const pills = (o) =>
    map.edges
      .filter((e) => e.from === o.id || e.to === o.id)
      .map((e) => {
        const other = byId.get(e.from === o.id ? e.to : e.from)?.name;
        const words = e.relation === 'peer' ? `peers with ${other}` : e.to === o.id ? `member of ${other}` : `${other} is a member`;
        return h('span', { key: `${e.relation} ${e.from} ${e.to}`, className: e.mutual ? 'portal-pill is-done' : 'portal-pill' }, e.mutual ? words : `${words} (one side)`);
      });
  const Org = (o) => {
    const eyebrow = upper([...o.types, accountWord(o)].join(' · '));
    const text = o.description
      ? h('p', { className: 'portal-card-p' }, o.description)
      : h('p', { className: 'portal-card-p nx-quiet' }, o.state === 'no-account'
        ? `No atproto account yet. When ${o.name} has one, what it says about itself shows here.`
        : `No profile published yet. When ${o.name} publishes one, its own description shows here.`);
    const counts = o.counts.length
      ? h('p', { className: 'portal-card-p' }, `Publishes ${listWords(o.counts.map((c) => `${formatCount(c.count)} ${plural(c.kind, c.count)}`))}.`)
      : null;
    const foot = [...o.hosts, ...(o.handle ? [o.handle] : [])];
    const ps = pills(o);
    return h('article', { key: o.id, id: `org-${o.id}`, className: 'portal-card' },
      h('p', { className: 'portal-eyebrow' }, eyebrow),
      h('h3', { className: 'portal-card-t' }, o.name),
      text,
      counts,
      o.caveat ? h('p', { className: 'portal-card-p nx-quiet' }, o.caveat) : null,
      foot.length || ps.length
        ? h('p', { className: 'portal-age' }, foot.join(' · '), foot.length && ps.length ? ' · ' : null, ...ps.flatMap((p, i) => (i ? [' ', p] : [p])))
        : null,
      o.did ? h('p', { className: 'portal-age nx-did' }, o.did) : null);
  };

  // ---- 02 needs and offers: real when published; else the hand-written rows, each marked
  const realAsks = model.asks.map((a) =>
    h('li', { key: a.uri, className: 'portal-row' },
      h('span', { className: 'portal-row-id' }, a.kind),
      h('span', { className: 'portal-row-m' },
        h('span', { className: 'portal-row-t' }, a.title),
        h('span', { className: 'portal-row-s' }, [a.who, a.status, a.day].filter(Boolean).join(' · '))),
      h('span', { className: a.kind === 'offer' ? 'portal-pill is-done' : 'portal-pill' }, upper(a.kind))));
  const exampleAsks = EXAMPLE_ASKS.map((a) =>
    h('li', { key: a.title, className: 'portal-row' },
      h('span', { className: 'portal-row-id' }, a.kind),
      h('span', { className: 'portal-row-m' },
        h('span', { className: 'portal-row-t' }, a.title),
        h('span', { className: 'portal-row-s' }, `${a.who} · ${a.reply} · `, h(Ex))),
      h('span', { className: a.kind === 'offer' ? 'portal-pill is-done' : 'portal-pill' }, upper(a.kind))));

  // ---- 03 what they know: topics and the latest records, read from the index
  const knowLead = totals.records
    ? `${formatCount(totals.records)} ${plural('record', totals.records)}, read from the accounts of ${totals.publishing} ${plural('member', totals.publishing)} in the vocabularies the network follows. Each stays in its publisher’s own repository.`
    : 'Nothing published yet in the vocabularies the network follows.';
  const latestRows = orgs.flatMap((o) =>
    o.latest.map((r) =>
      h('li', { key: r.uri, className: 'portal-row' },
        h('span', { className: 'portal-row-id' }, r.kind),
        h('span', { className: 'portal-row-m' },
          h('span', { className: 'portal-row-t' }, r.title ?? h('span', { className: 'nx-quiet' }, `untitled ${r.kind}`)),
          h('span', { className: 'portal-row-s' }, [r.topic, o.name, r.day].filter(Boolean).join(' · '))))));

  const Page = () =>
    h('div', { className: 'portal-page' },
      h('a', { className: 'skip', href: '#portal-main' }, 'Skip to the portal'),
      h('p', { className: 'portal-notice' },
        `Built locally from the network’s index${readAt ? `, read ${readAt}` : ''}. The organisations, the map and what they know are read from it; what is marked `,
        h('span', { className: 'nx-ex' }, 'example'), ' is still hand-written.'),
      h('div', { className: 'portal' },
        h(PortalTop, {
          org: { name: 'The org-os network' },
          nav: [{ id: 'orgs', name: 'Organisations' }, { id: 'asks', name: 'Needs and offers' }, { id: 'know', name: 'What they know' }, { id: 'join', name: 'Joining' }],
          members: null,
        }),
        h('main', { id: 'portal-main' },
          h(Hero, {
            org: {
              name: 'The org-os network', kind: 'A network of organisations', since: '2026',
              tagline: 'Regenerative organisations, each in its own place, knowing together.', phrase: 'knowing together.',
              description: 'Local nodes, cooperatives and working groups who publish what they do, need and know from their own accounts. This page reads what they chose to make public; the network holds nothing of its own.',
            },
            facts: [
              { figure: formatCount(totals.organisations), label: plural('organisation', totals.organisations) },
              { figure: formatCount(totals.accounts), label: 'on atproto' },
              { figure: formatCount(totals.records), label: plural('shared record', totals.records) },
            ],
          }),
          h(Plate),
          h(PortalSection, { id: 'orgs', no: '01', name: 'Organisations', lead: 'Who is in the network, in their own words, and where to find them.' },
            h('div', { className: 'portal-cards nx-cards' }, orgs.map(Org))),
          h(PortalSection, { id: 'asks', no: '02', name: 'Needs and offers', lead: 'What the organisations are looking for, and what they can give. Answers go to them directly.' },
            realAsks.length
              ? h('ul', { className: 'portal-ledger' }, realAsks)
              : h(F, null,
                h('p', { className: 'portal-card-p nx-quiet nx-gap' }, 'No organisation publishes needs or offers yet: the two record types stay drafts until they are designed with Weave. The rows below show what one would look like.'),
                h('ul', { className: 'portal-ledger' }, exampleAsks))),
          h(PortalSection, { id: 'know', no: '03', name: 'What they know', lead: knowLead },
            model.topics.length
              ? h('ul', { className: 'portal-facts nx-topics' },
                model.topics.map((t) => h('li', { key: t.domain, className: 'portal-fact' }, h('span', { className: 'portal-fact-f' }, formatCount(t.count)), ' ', h('span', { className: 'portal-fact-l' }, upper(t.words)))))
              : null,
            latestRows.length ? h('ul', { className: 'portal-ledger' }, latestRows) : null,
            model.collections.length
              ? h('p', { className: 'portal-age nx-gap-top' }, 'By kind: ', listWords(model.collections.map((c) => `${formatCount(c.count)} ${plural(c.kind, c.count)} (${c.collection})`)), '. The latest of each member, by the date each record gives itself.')
              : null),
          h(PortalSection, { id: 'join', no: '04', name: 'Joining', lead: 'An organisation joins one of the networks, and each network decides for itself. Once both sides say so, it appears here.' },
            h('div', { className: 'portal-cards' },
              h('article', { className: 'portal-card' },
                h('p', { className: 'portal-eyebrow' }, 'ReFi DAO'),
                h('h3', { className: 'portal-card-t' }, 'Local nodes and allied groups'),
                h('p', { className: 'portal-card-p' }, 'The council decides each request. ', h(Ex)),
                h('p', { className: 'portal-age' }, 'Ask from your org-os Hub (Join a network) or on its repository. ', h(Ex))),
              h('article', { className: 'portal-card' },
                h('p', { className: 'portal-eyebrow' }, 'Regen Coordination'),
                h('h3', { className: 'portal-card-t' }, 'Regenerative communities'),
                h('p', { className: 'portal-card-p nx-quiet' }, 'Not taking requests through the network yet. ', h(Ex)),
                h('p', { className: 'portal-age' }, 'Through its own channels, for now. ', h(Ex)))))),
        h('footer', { className: 'portal-foot' },
          h('p', { className: 'portal-foot-p' }, 'Also on ', h('a', { href: '#' }, 'Certified'), ' · ', h('a', { href: '#' }, 'the network’s feed'), ' (in any atproto app, coming) ', h(Ex)),
          h('p', { className: 'portal-foot-p' }, `Every record lives in its publisher’s own repository; the index behind this page can be rebuilt by anyone${readAt ? ` (this reading: ${readAt}, ${formatCount(totals.records)} ${plural('record', totals.records)})` : ''}.`),
          h('p', { className: 'portal-foot-p' }, 'The org-os network · org-os'))));

  return `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The org-os network</title>
<link rel="stylesheet" href="./assets/hub.css">
<style>${CSS}</style>
</head>
<body>
${renderToStaticMarkup(h(Page))}
</body>
</html>
`;
}

const CSS = `
.nx-ex { font: var(--fw-medium) var(--fs-micro)/1 var(--mono); color: var(--attn); letter-spacing: var(--ls-eyebrow); text-transform: uppercase; }
.nx-quiet { color: var(--faint); }
.nx-canvas { min-block-size: 0; inline-size: 934px; max-inline-size: 100%; margin-inline: auto; }
.nx-edges { position: absolute; inset: 0; inline-size: 934px; }
.nx-peer { stroke-dasharray: 4 4; }
.nx-claimed { opacity: 0.45; }
.nx-at { position: absolute; }
.nx-key { padding: 0 24px 8px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 0; font: var(--fs-micro) var(--mono); color: var(--faint); }
.nx-key > span { display: inline-block; inline-size: 22px; block-size: 0; border-block-start: 1.5px solid var(--edge); }
.nx-key > span.nx-k-dash { border-block-start-style: dashed; }
.nx-key > span.nx-k-claimed { opacity: 0.45; }
.nx-key > span.nx-k-dim { inline-size: 14px; block-size: 10px; border: 1px solid var(--rule); border-radius: 3px; }
.nx-note { padding: 0 24px 16px; margin: 0; font: var(--fs-micro)/1.5 var(--mono); color: var(--faint); text-wrap: pretty; }
.nx-narrow { display: none; }
.nx-did { font-family: var(--mono); overflow-wrap: anywhere; }
.nx-gap { margin-block-end: var(--sp-8); }
.nx-gap-top { margin-block-start: var(--sp-8); overflow-wrap: anywhere; }
.nx-topics { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-block-end: var(--sp-10); }
.nx-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (max-width: 1000px) { .nx-wide { display: none; } .nx-narrow { display: grid; } .nx-note { padding-block-start: 0; } }
@media (max-width: 900px) { .nx-topics, .nx-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .nx-cards { grid-template-columns: 1fr; } }
`;

export function copyAssets(out) {
  const dest = path.join(out, 'assets');
  mkdirSync(dest, { recursive: true });
  for (const f of readdirSync(ASSETS_DIR)) {
    if (f === 'hub.css' || f.endsWith('.woff2') || f === 'LICENSES') cpSync(path.join(ASSETS_DIR, f), path.join(dest, f), { recursive: true });
  }
}

async function main(argv) {
  const args = parseArgs(argv, process.env);
  const index = readIndexFile(args.db ?? undefined);
  const model = portalModel({ roster: readRoster(args.roster ?? undefined), ...index });
  const kit = await loadKit(args.admin);
  const html = renderPage(kit, model);
  mkdirSync(args.out, { recursive: true });
  writeFileSync(path.join(args.out, 'index.html'), html);
  writeFileSync(path.join(args.out, 'model.json'), JSON.stringify(model, null, 2) + '\n');
  copyAssets(args.out);
  console.log(`portal: ${path.join(args.out, 'index.html')} (${model.totals.records} records, ${model.orgs.length} organisations, ${model.map.edges.length} lines on the map)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

// Scratch: draws the network portal mock-up from the Hub portal's own components, as static HTML.
// It ran from a scratch folder inside org-os's packages/admin (the imports below point into its
// app/src), with `npx tsx render.tsx <out.html>`. It does not run from this repository;
// index.html is its output.
import React from 'react'
import { writeFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { PortalTop } from '../../app/src/portal/PortalTop.tsx'
import { Hero } from '../../app/src/portal/Hero.tsx'
import { PortalSection } from '../../app/src/portal/PortalSection.tsx'
import { HouseNode, type MapNodeData } from '../../app/src/map/HouseNode.tsx'

const out = process.argv[2]!

const Ex = () => <span className="nx-ex">example</span>

// ---- the map plate: networks on top, organisations under them (hand-placed; the house map lays out a DAO, not a network)
type N = { id: string; name: string; kind: string; facts: string; x: number; y: number; href: string; linked?: boolean; dim?: boolean }
const W = 188, H = 56
const nodes: N[] = [
  { id: 'refi-dao', name: 'ReFi DAO', kind: 'gardens-community', facts: 'network · 1,607 records', x: 150, y: 28, href: '#orgs' },
  { id: 'rc', name: 'Regen Coordination', kind: 'gardens-community', facts: 'network · not on atproto yet', x: 560, y: 28, href: '#orgs', dim: true },
  { id: 'refi-bcn', name: 'ReFi Barcelona', kind: 'meeting', facts: 'Barcelona · Certified', x: 40, y: 196, href: '#orgs' },
  { id: 'local', name: 'Local nodes', kind: 'meeting', facts: 'not on atproto yet', x: 262, y: 196, href: '#orgs', dim: true },
  { id: 'kc-wg', name: 'Knowledge Commons WG', kind: 'meeting', facts: 'working group', x: 484, y: 196, href: '#orgs', dim: true },
  { id: 'br', name: 'Brasil Regenerativo', kind: 'meeting', facts: 'Brazil · not on atproto yet', x: 706, y: 196, href: '#orgs', dim: true },
]
const edges: { from: string; to: string; peer?: boolean }[] = [
  { from: 'refi-dao', to: 'refi-bcn' }, { from: 'refi-dao', to: 'local' }, { from: 'rc', to: 'kc-wg' }, { from: 'rc', to: 'br', peer: true },
  { from: 'refi-dao', to: 'rc', peer: true },
]
const at = (id: string) => nodes.find(n => n.id === id)!
function edgePath(e: (typeof edges)[number]) {
  const a = at(e.from), b = at(e.to)
  if (a.y === b.y) { // side by side
    const y = a.y + H / 2, x1 = a.x + W, x2 = b.x
    return `M${x1},${y} L${x2},${y}`
  }
  const x1 = a.x + W / 2, y1 = a.y + H, x2 = b.x + W / 2, y2 = b.y, m = (y1 + y2) / 2
  return `M${x1},${y1} C${x1},${m} ${x2},${m} ${x2},${y2}`
}
const data = (n: N): MapNodeData => ({
  item: { id: n.id, kind: n.kind, name: n.name }, facts: n.facts, href: n.href,
  states: [...(n.linked ? ['linked' as const] : []), ...(n.dim ? ['dim' as const] : [])],
})

function Plate() {
  return (
    <section className="portal-plate" aria-labelledby="plate-h">
      <div className="portal-plate-h">
        <h2 className="portal-plate-t" id="plate-h">How the network is arranged</h2>
        <p className="portal-eyebrow">Read from each organisation’s own account · 23 Nov</p>
      </div>
      <div className="hmap hmap-portal nx-wide">
        <div className="hmap-canvas nx-canvas" role="group" aria-label="The network, drawn">
          <svg className="nx-edges" viewBox="0 0 934 280" aria-hidden="true">
            {edges.map(e => <path key={e.from + e.to} className={e.peer ? 'hedge nx-peer' : 'hedge'} d={edgePath(e)} />)}
          </svg>
          <span className="nx-edge-l" style={{ left: 375, top: 46 }}>peers</span>
          {nodes.map(n => (
            <div key={n.id} className="nx-at" style={{ left: n.x, top: n.y, width: W }}><HouseNode data={data(n)} variant="portal" /></div>
          ))}
        </div>
        <p className="nx-key"><span className="nx-k-solid" /> member of <span className="nx-k-dash" /> peers <span className="nx-k-dim" /> not publishing yet · only ReFi DAO and ReFi Barcelona have accounts; the lines are <Ex /></p>
      </div>
      <ul className="portal-map-still nx-narrow" aria-label="The network, as a list">
        {nodes.map(n => <li key={n.id}><HouseNode data={data(n)} variant="portal" /></li>)}
      </ul>
    </section>
  )
}

// ---- sections
type Org = { eyebrow: ReactNode; name: string; text: ReactNode; foot: ReactNode }
const orgs: Org[] = [
  {
    eyebrow: 'Cooperative · Barcelona', name: 'ReFi Barcelona',
    text: 'A small cooperative team working at the intersection of regenerative finance, knowledge commons and bioregional practice. Based at Bloc4, Barcelona’s cooperative hub.',
    foot: <>refibcn.cat · bioregioning.earth · <span className="portal-pill is-done">member of ReFi DAO</span> <Ex /></>,
  },
  {
    eyebrow: <>Network society · since 2022 <Ex /></>, name: 'ReFi DAO',
    text: <>Coordinates global and local regenerative finance through shared governance, local autonomy and public goods. <Ex /> Keeps a knowledge commons of 1,607 reviewed records.</>,
    foot: <>refidao.com · <span className="portal-pill">network</span></>,
  },
  {
    eyebrow: <>Alliance · since 2024 <Ex /></>, name: 'Regen Coordination',
    text: 'An alliance of Web3-enabled regenerative communities, co-founded by ReFi DAO and Greenpill Network. Its Knowledge Commons working group keeps the vocabulary the commons are written in.',
    foot: <>Not on atproto yet: these words are from its public site, until it publishes its own.</>,
  },
  {
    eyebrow: 'Network · Brazil', name: 'Brasil Regenerativo',
    text: <span className="nx-quiet">Nothing published yet. When Brasil Regenerativo has an account, its own description shows here.</span>,
    foot: <>Joining with Regen Coordination’s groups. <Ex /></>,
  },
]

const asks: { who: string; kind: 'Need' | 'Offer'; title: string; reply: string }[] = [
  { who: 'ReFi Barcelona', kind: 'Need', title: 'Facilitators for a bioregional funding round in the Penedès, spring 2027', reply: 'reply on refibcn.cat' },
  { who: 'ReFi DAO', kind: 'Offer', title: 'Round design and Gitcoin operations, from four local-node rounds', reply: 'ask on refidao.com' },
  { who: 'Regen Coordination', kind: 'Need', title: 'A host for the Knowledge Commons WG’s spring in-person', reply: 'ask in its forum' },
]

const records: { kind: string; title: string; topic: string }[] = [
  { kind: 'entry', title: 'Local ReFi ecosystem catalysts (the pre-node stage of local ecosystem formation)', topic: 'local nodes · written from the Global South' },
  { kind: 'claim', title: 'Bioregional Financing Facilities — three objectives and four facility templates (ReFi Podcast S4E1)', topic: 'regenerative economics' },
  { kind: 'claim', title: 'Verra banned tokenization of carbon credits after the 2021 crypto-carbon boom collapsed into a “carbon winter”', topic: 'carbon markets' },
  { kind: 'lineage', title: 'Regeneration (ReFi DAO working synthesis, 2023)', topic: 'regenerative economics' },
  { kind: 'resource', title: 'Traditional Dream Factory (TDF)', topic: 'regenerative agriculture' },
]
const topics: [string, number][] = [
  ['Carbon markets', 302], ['Regenerative economics', 224], ['Funding public goods', 220], ['Biodiversity and nature', 145],
  ['Education', 112], ['Local nodes', 110], ['Web3 infrastructure', 109], ['Governance and coordination', 102],
]

function Page() {
  return (
    <div className="portal-page">
      <a className="skip" href="#portal-main">Skip to the portal</a>
      <p className="portal-notice">Mock-up of the network portal, built from the Hub portal’s own components. The commons records and ReFi Barcelona’s words are real (read from the index); what is marked <span className="nx-ex">example</span>, and every need and offer, is invented.</p>
      <div className="portal">
        <PortalTop
          org={{ name: 'The org-os network' } as never}
          nav={[{ id: 'orgs', name: 'Organisations' }, { id: 'asks', name: 'Needs and offers' }, { id: 'know', name: 'What they know' }, { id: 'join', name: 'Joining' }]}
          members={null}
        />
        <main id="portal-main">
          <Hero
            org={{
              name: 'The org-os network', kind: 'A network of organisations', since: '2026',
              tagline: 'Regenerative organisations, each in its own place, knowing together.', phrase: 'knowing together.',
              description: 'Local nodes, cooperatives and working groups who publish what they do, need and know from their own accounts. This page reads what they chose to make public; the network holds nothing of its own.',
            } as never}
            facts={[{ figure: '4', label: 'organisations' }, { figure: '2', label: 'networks' }, { figure: '1,607', label: 'shared records' }]}
          />
          <Plate />
          <PortalSection id="orgs" no="01" name="Organisations" lead="Who is in the network, in their own words, and where to find them.">
            <div className="portal-cards nx-cards">
              {orgs.map(o => (
                <article key={o.name} className="portal-card">
                  <p className="portal-eyebrow">{o.eyebrow}</p>
                  <h3 className="portal-card-t">{o.name}</h3>
                  <p className="portal-card-p">{o.text}</p>
                  <p className="portal-age">{o.foot}</p>
                </article>
              ))}
            </div>
          </PortalSection>
          <PortalSection id="asks" no="02" name="Needs and offers" lead="What the organisations are looking for, and what they can give. Answers go to them directly.">
            <ul className="portal-ledger">
              {asks.map(a => (
                <li key={a.title} className="portal-row">
                  <span className="portal-row-id">{a.kind.toLowerCase()}</span>
                  <span className="portal-row-m">
                    <span className="portal-row-t">{a.title}</span>
                    <span className="portal-row-s">{a.who} · {a.reply} · <Ex /></span>
                  </span>
                  <span className={a.kind === 'Offer' ? 'portal-pill is-done' : 'portal-pill'}>{a.kind}</span>
                </li>
              ))}
            </ul>
          </PortalSection>
          <PortalSection id="know" no="03" name="What they know" lead="1,607 reviewed and sourced records, kept by ReFi DAO’s commons in a vocabulary any group can read and cite.">
            <ul className="portal-facts nx-topics">
              {topics.map(([t, n]) => <li key={t} className="portal-fact"><span className="portal-fact-f">{n}</span> <span className="portal-fact-l">{t}</span></li>)}
            </ul>
            <ul className="portal-ledger">
              {records.map(r => (
                <li key={r.title} className="portal-row">
                  <span className="portal-row-id">{r.kind}</span>
                  <span className="portal-row-m">
                    <span className="portal-row-t">{r.title}</span>
                    <span className="portal-row-s">{r.topic} · ReFi DAO commons</span>
                  </span>
                </li>
              ))}
            </ul>
          </PortalSection>
          <PortalSection id="join" no="04" name="Joining" lead="An organisation joins one of the networks, and each network decides for itself. Once both sides say so, it appears here.">
            <div className="portal-cards">
              <article className="portal-card">
                <p className="portal-eyebrow">ReFi DAO</p>
                <h3 className="portal-card-t">Local nodes and allied groups</h3>
                <p className="portal-card-p">The council decides each request. <Ex /></p>
                <p className="portal-age">Ask from your org-os Hub (Join a network) or on its repository. <Ex /></p>
              </article>
              <article className="portal-card">
                <p className="portal-eyebrow">Regen Coordination</p>
                <h3 className="portal-card-t">Regenerative communities</h3>
                <p className="portal-card-p nx-quiet">Not taking requests through the network yet. <Ex /></p>
                <p className="portal-age">Through its own channels, for now. <Ex /></p>
              </article>
            </div>
          </PortalSection>
        </main>
        <footer className="portal-foot">
          <p className="portal-foot-p">Also on <a href="#">Certified</a> · <a href="#">the network’s feed</a> (in any atproto app, coming)</p>
          <p className="portal-foot-p">Every record lives in its publisher’s own repository; the index behind this page can be rebuilt by anyone.</p>
          <p className="portal-foot-p">The org-os network · org-os</p>
        </footer>
      </div>
    </div>
  )
}

const css = `
.nx-ex { font: var(--fw-medium) var(--fs-micro)/1 var(--mono); color: var(--attn); letter-spacing: var(--ls-eyebrow); text-transform: uppercase; }
.nx-quiet { color: var(--faint); }
.nx-canvas { min-block-size: 0; block-size: 280px; inline-size: 934px; max-inline-size: 100%; margin-inline: auto; }
.nx-edges { position: absolute; inset: 0; inline-size: 934px; block-size: 280px; }
.nx-peer { stroke-dasharray: 4 4; }
.nx-at { position: absolute; }
.nx-edge-l { position: absolute; font: var(--fs-micro) var(--mono); color: var(--faint); background: var(--raised); padding: 0 4px; }
.nx-key { padding: 0 24px 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin: 0; font: var(--fs-micro) var(--mono); color: var(--faint); }
.nx-key > span:not(.nx-ex) { display: inline-block; inline-size: 22px; block-size: 0; border-block-start: 1.5px solid var(--edge); }
.nx-key > span.nx-k-dash { border-block-start-style: dashed; }
.nx-key > span.nx-k-dim { inline-size: 14px; block-size: 10px; border: 1px solid var(--rule); border-radius: 3px; }
.nx-narrow { display: none; }
.nx-topics { grid-template-columns: repeat(4, minmax(0, 1fr)); margin-block-end: var(--sp-10); }
.nx-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); }
@media (max-width: 1000px) { .nx-wide { display: none; } .nx-narrow { display: grid; } }
@media (max-width: 900px) { .nx-topics, .nx-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 560px) { .nx-cards { grid-template-columns: 1fr; } }
`

const html = `<!doctype html>
<html lang="en" dir="ltr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The network portal</title>
<link rel="stylesheet" href="./assets/hub.css">
<style>${css}</style>
</head>
<body>
${renderToStaticMarkup(<Page />)}
</body>
</html>
`
writeFileSync(out, html)
console.log('wrote', out)

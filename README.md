# org-os network

The network over which organisations' org-os instances publish to each other, each from its own
atproto repository: what they know, their members and roles, what they need and offer, and, through
Certified, what they did and funded. Every org-os instance is a **window** onto it.

This repository holds the design of the network: its shared vocabulary (`lexicons/`), a small
read-only **index** (`index/`), and the explorations that may grow into it (`explorations/`). The
code that publishes and federates lives in org-os (`org-os-kms`, the network track); changes go
back to org-os as proposals.

Status: early, local. The lexicon authority is a **placeholder** until the network's domain is
chosen; nothing here is published.

## What is built, and where

| What | Where | State |
|---|---|---|
| Federation on atproto: asking to join a network, membership links published by each side, link state read from both repositories | [org-os](https://github.com/regen-coordination/org-os-template), [v0.7.4](https://github.com/regen-coordination/org-os-template/tree/v0.7.4) | Released |
| `org-os-kms` 0.2.0: a read-only Hypercerts/Certified connector and the needs/offers pack | org-os [v0.7.4](https://github.com/regen-coordination/org-os-template/tree/v0.7.4) | Released |
| Sign in with a Bluesky or Certified account; a network's node accounts | org-os [v0.7.5](https://github.com/regen-coordination/org-os-template/tree/v0.7.5) | Released |
| The shared vocabulary: profile, link, need, offer | `lexicons/` here | Drafted, under the placeholder authority |
| The read-only index | `index/` here | Prototype, runs locally |
| Mock-ups of a member's window and the visitor's portal | `explorations/` here | Static pages, partly invented data |
| The network's domain (the lexicon authority) | | Not chosen |
| A hosted index | | Does not exist |
| Live records of the network's own types | | None published |

org-os's current release is [v0.7.6](https://github.com/regen-coordination/org-os-template/releases/tag/v0.7.6)
(the docs read against 0.7, and a fix in `org-os-kms publish`); it changes nothing in the rows above.

## Words

- **org-os network**: many organisations publishing to each other from their own repositories.
  A knowledge commons is one kind of member; the network holds nothing of its own.
- **Window**: what an org-os instance is to the network for its operator and members.
- **Membrane**: the boundary an organisation draws around who can see and take part in what
  (public, network peers, members, council, private). Only what lies outside every membrane is
  published on the open network.
- **Index**: a rebuildable reading of what members have published. It holds nothing a member has
  not published itself.

## Layout

| Path | What |
|---|---|
| `lexicons/` | The network's shared types: what crosses federations (window profile, links, needs, offers) |
| `index/` | The read-only index prototype |
| `explorations/` | Two static HTML mock-ups: a member's window (`window-mockup/`) and the visitor's portal (`portal-mockup/`) |
| `docs/` | `DESIGN.md`: the decisions (Q1, Q2, ...), the phases, what is not being done and what is open |
| `scripts/` | The lexicon build |
| `test/` | Tests for the lexicons, the examples, the build and the index |

## Run it

You need Node 22.13 or later and npm. The index uses `node:sqlite`, which Node 22.5 to 22.12 only
offer behind the `--experimental-sqlite` flag. These commands were run from a fresh clone on Node 24;
older versions were not tried.

```bash
git clone https://github.com/luizfernandosg/org-os-network.git
cd org-os-network
npm ci                    # installs @atproto/lexicon, the one dependency (dev only)
npm test                  # every test; offline
npm run check:lexicons    # exit 1 if the built lexicons are out of date with lexicons/templates/
npm run build:lexicons    # rebuilds them from lexicons/authority.json; a clean clone has no diff after it
```

The tests run the index against a fixture (`test/index/fixtures/network.json`) with a mocked fetch,
so they need no network. There is no command to run the index against the fixture by hand.

The index's own commands read the real network. They were not run for this README:

```bash
npm run index:rebuild     # network: reads each member's DID document and repository, writes index/data/index.sqlite
npm run index:serve       # serves that file at http://127.0.0.1:4690/ (run index:rebuild first)
npm run index:follow      # network: keeps the file current from Bluesky's Jetstream
```

The mock-ups are plain files: open `explorations/window-mockup/index.html` or
`explorations/portal-mockup/index.html` in a browser. The window mock-up loads its fonts from Google
Fonts; the portal's fonts are in `portal-mockup/assets/`. `portal-mockup/render.tsx` is kept as a record
of how the portal page was made; it does not run from this repository.

## Rules

- Lexicons of others (Certified, Hypercerts, Leaflet) are never forked; changes go upstream.
- Nothing from inside a membrane is published. No individuals' data is republished.
- No accounts or hosting for groups; the index is the one service, and it can be rebuilt from the network.

## Licence

MIT. See [LICENSE](LICENSE).

The fonts in `explorations/portal-mockup/assets/` are not MIT: they are under the SIL Open Font
License 1.1 ([LICENSES](explorations/portal-mockup/assets/LICENSES/)). The vendored atproto lexicon
keeps its own licence ([lexicons/vendor](lexicons/vendor/README.md)).

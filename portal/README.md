# The portal

Phase 4's "one page to browse it" ([phases](../docs/DESIGN.md#phases)): the network portal, drawn from
the [index](../index/README.md) with the org-os Hub portal's own components. It is the design of
[the mock-up](../explorations/portal-mockup/render.tsx), with its hand-written data replaced by
what the index read wherever the index has it.

It is local. `portal:build` writes a static page into `portal/out/` (gitignored) and stops: it
serves nothing, publishes nothing and touches no network. The network hosts nothing of its own
([not doing](../docs/DESIGN.md#not-doing)); where a page like this is served, if anywhere, is left
open with the index's host (Q6).

## What it reads

| From | What |
|---|---|
| `index/members.json` | The members, in order: names, DIDs, handles, caveats. One map node and one card each. |
| `index/data/index.sqlite` | What the last `npm run index:rebuild` read: each member's PDS and its followed records. |
| org-os `packages/admin` | `PortalTop`, `Hero`, `PortalSection` (`app/src/portal/`) and `HouseNode` (`app/src/map/`), and the React they use. Read, never written. |
| `explorations/portal-mockup/assets/` | The house stylesheet (`hub.css`) and the fonts with their licences, copied into `out/assets/`. |

## Run it

```sh
npm run index:rebuild                         # read-only GETs to plc.directory and the members' PDSes
ORG_OS_ADMIN=<org-os>/packages/admin npm run portal:build
# or: npm run portal:build -- --admin <org-os>/packages/admin [--db <index.sqlite>] [--out <dir>] [--roster <dir>]
```

`packages/admin` needs its `node_modules` installed: the render runs with its `tsx` (and its
`tsconfig.json`) so the components load as they do in org-os. Unknown arguments are refused. The
output folder must be outside org-os and is not the repository itself. Open `out/index.html` from a
local server (fonts don't load over `file://`). `out/model.json` is the model the page was drawn
from.

## Read and hand-written

Read from the index (no `example` marker):

- the organisations: name, DID, handle, account state (no account / not read / account with nothing
  followed / publishing), where the account lives, counts per collection, and what each says about
  itself: its `org.orgosnetwork.profile`, else its Certified `app.certified.actor.organization`
  (first paragraph only), with the host names of its own URLs;
- the map: one node per member; one line per pair joined by `org.orgosnetwork.link` records, solid
  when both sides published it, faint when one side has. Links to organisations outside the network
  are counted, never drawn or named. With no link record the map draws no line and says so;
- what they know: the records' topics (their `domain`) and the latest records of each member, by the
  date each record gives itself (`createdAt`, else `last_reviewed`; ties by URI), titled only where
  the record has a title;
- needs and offers, when any `org.orgosnetwork.need` or `.offer` is published;
- the hero's figures and the date of the reading.

Still hand-written, and marked `example`: the needs and offers shown while none is published, the
Joining section, and the foot's "also on" links. The hero's words are the network's own, as in the
mock-up.

## Files

| File | What |
|---|---|
| `src/model.mjs` | `portalModel`: the index reading in, the page's model out. Pure. |
| `src/layout.mjs` | Where the map's nodes sit and how its lines run. Pure. |
| `src/read.mjs` | Reads `members.json` and the index file, read-only. |
| `src/args.mjs` | The build's arguments. |
| `src/build.mjs` | `npm run portal:build`: checks the arguments, runs the render with org-os's `tsx`. |
| `src/render.mjs` | Draws the model with the portal components (`renderToStaticMarkup`) and writes `out/`. |

Tests are in `test/portal/`. The render tests draw the fixtures with the real components and run
only when `ORG_OS_ADMIN` is set (`ORG_OS_ADMIN=<path> npm test`); otherwise they are skipped.

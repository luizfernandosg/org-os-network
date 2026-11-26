# The index

A rebuildable reading of what the network's members have published on atproto. It reads only the
types the network follows, only from members, and only by GET. It holds no accounts, writes to no
repository, and runs locally (on `127.0.0.1`) for now. Where it is hosted is left for phase 4 ([phases](../docs/DESIGN.md#phases)).

## Rebuildable

Nothing in `data/index.sqlite` exists only here. `npm run index:rebuild` drops the database and
reads it back from each member's own repository:

1. resolve the member's DID (`plc.directory` for `did:plc`, `/.well-known/did.json` for `did:web`)
   and take the PDS endpoint from the document;
2. `com.atproto.repo.describeRepo` for the repository's collections, kept if they match a followed
   NSID or NSID prefix;
3. `com.atproto.repo.listRecords` for each, page by page.

The new reading replaces the old one in one transaction, and only if every member was read (pass
`--partial` to write what was read anyway). Two rebuilds give the same rows, apart from
`indexed_at`. Delete the file at any time; the next rebuild brings it back.

`npm run index:follow` keeps it current from Jetstream between rebuilds. It asks only for member
DIDs and followed collections (an empty list means "everything" to Jetstream, so it refuses to
start without both), applies creates, updates and deletes, and stores its cursor. A rebuild resets
the cursor to a minute before the rebuild began, so nothing published meanwhile is lost.

`npm run index:serve` serves it at `http://127.0.0.1:4690/`: `/members`, `/records?collection=&did=&q=&limit=&offset=`
(collection may be a prefix such as `xyz.regencoordination.kb.*`), `/stats`, and one HTML page with
members, counts per collection and a search box.

## Scope

| File | What |
|---|---|
| `members.json` | The members ([decision Q12](../docs/DESIGN.md#decisions)): name, DID or null, where the DID was found |
| `config.json` | Followed collections, PLC directory, Jetstream endpoint, database path, port |
| `src/backfill.mjs` | Backfill and rebuild |
| `src/follow.mjs` | Live follow over Jetstream |
| `src/serve.mjs` | The read surface |

Followed collections: the network's own types (`org.orgosnetwork.profile`, `.link`, and the drafts
`.need` and `.offer`), the federation's `xyz.regencoordination.kb.*`, and
Certified's `app.certified.actor.organization` and `org.hypercerts.context.attachment`.

Privacy floor:

- Only records whose AT-URI is in a member's own repository are stored. Events from any other DID
  are dropped before they touch the database.
- Other DIDs that appear inside a record stay inside its JSON; they are never extracted, indexed or
  followed.
- Attachments are stored as published; no link out of them is fetched.
- The index does not compute link state (mutual / claimed) yet.

## Smoke run, 2026-11-23

`npm run index:rebuild` against the real members, read-only, 00:27 UTC. 1,608 records, no errors.

| Member | Collection | Records |
|---|---|---|
| ReFi DAO | `xyz.regencoordination.kb.claimEvidence` | 341 |
| ReFi DAO | `xyz.regencoordination.kb.conceptLineage` | 53 |
| ReFi DAO | `xyz.regencoordination.kb.encyclopediaEntry` | 218 |
| ReFi DAO | `xyz.regencoordination.kb.resource` | 628 |
| ReFi DAO | `xyz.regencoordination.kb.signal` | 367 |
| ReFi BCN | `app.certified.actor.organization` | 1 |
| Regen Coordination (Knowledge Commons WG) | (no account) | 0 |
| Brasil Regenerativo | (no account) | 0 |

No member publishes the network's own types or `org.hypercerts.context.attachment` records yet.
ReFi BCN's repository also holds `org.hypercerts.claim.activity` and others; they are not followed.

## Open

- Jetstream mirrors Bluesky's relay. Whether that relay crawls `certified.one` (ReFi BCN's PDS) was
  not checked; if it doesn't, ReFi BCN's changes arrive only at the next rebuild.
- ReFi DAO's DID is the commons' dev identity, which its own notes mark as disposable. When it is
  replaced, change `members.json` and rebuild.
- Node 22.5–22.12 need `--experimental-sqlite` for `node:sqlite`; 22.13 and later don't.

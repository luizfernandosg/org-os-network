# The network's vocabulary

These are the types that cross federations. Each organisation publishes them from its own atproto
repository, next to its content. The content itself (knowledge objects, pages, sources) stays under
each federation's own lexicon authority (for example `xyz.regencoordination.kb.*` or
`org.brasilregenerativo.*`). The network does not define content types.

Status: **authority chosen, nothing published.** The authority is `org.orgosnetwork`, for the
network's domain `orgosnetwork.org` (not registered yet). It replaced the placeholder
`example.orgosnetwork`. Only **profile** and **link** will be published under it; **need** and
**offer** stay drafts, not published until they are co-designed with Weave. How publishing works:
[docs/PUBLISHING.md](../docs/PUBLISHING.md).

| NSID | Record key | What it is |
|---|---|---|
| `org.orgosnetwork.profile` | `literal:self` | An organisation's window profile |
| `org.orgosnetwork.link` | `tid` | One side's statement of a relation with another organisation |
| `org.orgosnetwork.need` | `tid` | *Draft, not published.* A public need |
| `org.orgosnetwork.offer` | `tid` | *Draft, not published.* A public offer |

## The types

**profile**: how an organisation appears as a publisher on the network. It has `name` and
`createdAt` (both required), plus optional `description`, `homepage`, `instance` (where its org-os
instance lives), `networks` (each one `{hub: did, name}`), `authorities` (the lexicon authorities its
content is published under, so a reader knows which collections to look for) and `membranes` (the
names of the membranes it declares: `public`, `peers`, `members`, `council`, `private`, or its own).
It **extends** Certified's `app.certified.actor.organization` through `certifiedProfile`, a
`com.atproto.repo.strongRef`. It never repeats Certified's fields (logo, location and so on). If a
fact belongs on the Certified profile, it goes there.

**link**: one organisation's public statement about another: `subject` (the other one's DID),
`relation` (`memberOf`, `hasMember` or `peerOf`), an optional `network` name, and `createdAt`.
`memberOf` means "I am a member of the subject". `hasMember` means "the subject is a member of me".

**need / offer**: what an organisation needs from the network or offers it: `title`, `text` and
`createdAt` (required), plus optional `category`, `status`, and `when` (need) or `terms` (offer).
The categories follow the org-os needs/offers pack (`org-os-needs-offers`, from the network survey).
Both types are **drafts**, kept small on purpose.

## How links are read

A reader (the index, or any window) works out each relation from the two repositories:

| A publishes | B publishes | Reading |
|---|---|---|
| `link {subject: B, relation: memberOf}` | `link {subject: A, relation: hasMember}` | **mutual**: A is a member of B |
| `link {subject: B, relation: peerOf}` | `link {subject: A, relation: peerOf}` | **mutual**: peers |
| one of the above | nothing that answers it | **claimed**: one side only |
| (record deleted) | | **left**: the relation ended from that side |

Reciprocals: `memberOf` ↔ `hasMember`, `peerOf` ↔ `peerOf`. The `network` name is a label only.
Two records answer each other by `subject` and `relation`, not by name. Many records may exist for
the same pair. A reader treats a pair as mutual if any record on each side answers one on the other.
A hub's `profile.networks` entry is a claim like any other and does not count as a link.

## What is deliberately NOT a record

- **Requests and invites.** Asking to join, invite tokens and pending approvals stay private. They
  travel on org-os's file and GitHub transports, or through a hub's sign-in. A link record is
  written only once a side has decided.
- **Anything inside a membrane.** Only what lies outside every membrane is published. The profile
  names membranes and says nothing about what is in them or who is in them.
- **Private and matching-only needs and offers.** The pack's `visibility` levels `private` and
  `matching-only` never become records. That is why these lexicons have no `visibility` field:
  every record on the network is public by definition. The pack's matching-only fields
  (`contact_route`, `intro_wanted`) are not here either.
- **People's data.** No email, wallet or personal field exists in any type. The tests check this.

Lexicon validation accepts fields a lexicon doesn't declare. So the floor that stops private fields
leaving an instance is in the publisher (`org-os-kms`, which builds records from the lexicon's
property list), not in these lexicons.

## Changing the authority

The authority appears in one place, `authority.json`. Templates in `templates/` write it as
`{{AUTHORITY}}`, and only in their `id`.

```bash
# edit lexicons/authority.json, then
npm run build:lexicons    # rewrites lexicons/<authority>.<name>.json, removes the old ones, updates the examples' $type
npm run check:lexicons    # exit 1 if the committed files are out of date
```

Tests check that the build is deterministic and that swapping the authority changes every `id` and
nothing else.

## Files

- `authority.json`: the authority (one line).
- `templates/*.json`: the lexicons, with the token. Edit these, never the built files.
- `<authority>.<name>.json`: built output, committed.
- `examples/valid/`, `examples/invalid/`: example records for fictional organisations. The first
  part of each file name is the type. Each invalid example fails for one stated reason
  (`test/examples.test.mjs`).
- `vendor/com.atproto.repo.strongRef.json`: an unchanged copy of the atproto lexicon, used so
  validation runs offline. It is not forked and is never edited here. Certified's and Hypercerts'
  lexicons are not needed to validate these.

## Open items

1. **The domain.** `orgosnetwork.org` is chosen ([Q7](../docs/DESIGN.md#decisions)) but not registered
   yet. Until it is, and until profile and link are published from the network's own account
   ([docs/PUBLISHING.md](../docs/PUBLISHING.md)), no resolver can find these types.
2. **needs and offers, with Weave.** Weave signs in with Certified. The fields are co-designed
   with it rather than coined twice, so these drafts are a starting point, not a proposal. Compared
   with the pack's placeholder lexicon (`example.commons.*`), `createdAt` is added and the free-text
   `subject` is dropped until there's a reason for it. `status` has `knownValues`.
3. **profile upstream?** Some of `profile` may belong in Certified's organisation profile itself
   (for example `homepage`, or the `networks` claim). If Certified would take it, propose it there
   and narrow this type to what is specific to the network (instance, authorities, membranes).
4. **Hub identity in links.** `network` is a free-text name. If a hub can run more than one
   network, a later version may need a stable network id (a hub DID plus a name, or a record of its
   own).

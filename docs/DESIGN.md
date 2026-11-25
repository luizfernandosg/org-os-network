# Design

The decisions behind the org-os network, as they stand. Each has a number (Q1, Q2, ...) so the
other files can cite it. Numbers missing from this list were decided but say nothing an outsider
needs here.

## Decisions

**Q1. What it is.** A set of lexicons and conventions, with org-os as the first client, plus a light
index. It is not a hosted platform. Identity stays with Certified and with each group's own account
host.

**Q2. How it splits from org-os.** This project owns the design: the lexicons, the federation
protocol and the membrane rules. Code keeps landing in org-os packages. What cannot live in org-os
(the index, portal apps) lives here. Changes go back to org-os as proposals.

**Q3. Membranes.** Version 1 publishes only what lies outside every membrane. Membranes are named
from the start (public, network peers, members, council, private), on top of the visibility levels
org-os already has. What is inside a membrane stays in the instance: in its files, in git, or behind
the Hub's sign-in.

**Q6. The index.** At first it is run by the project's maintainer on a small host. It is handed to a steward
group once one exists. It reads only the network's types, only from organisations that have joined.
It is read-only, it can be rebuilt from the network at any time, and it holds no accounts.

**Q7. The vocabulary.** One shared vocabulary, under the network's own domain, for the types that
cross federations: extensions to an organisation's profile, membership, needs and offers. Each
federation keeps its own authority for its own content. Needs and offers are designed together with
Weave rather than coined twice. Until the domain is chosen, the authority is the placeholder
`example.orgosnetwork`.

**Q8. Federation on atproto.** A public membership link is a record that each side publishes in its
own repository. It is mutual when both sides have published it. Invite tokens and requests that are
not public stay on org-os's file and GitHub transports.

**Q12. The first members.** ReFi DAO, ReFi Barcelona, Regen Coordination (through its Knowledge
Commons working group) and Brasil Regenerativo. Every other organisation is read through Certified
until it asks to join.

**Q18. Who speaks for an organisation.** The account its org-os instance names.

**Q20 to Q24. The network portal.**

- It is for organisations deciding whether to join, and for funders.
- Organisations, what they do, and their needs and offers come first.
- Knowledge appears as summaries that link to the publisher's own site.
- A section shows only when something public exists for it.
- It is its own small app, reading the index.

## Phases

1. **Certified.** org-os's knowledge tooling (`org-os-kms`) reads and publishes alongside Certified
   and Hypercerts.
2. **The vocabulary** under the network's domain.
3. **Federation on atproto.**
4. **The index**, and one page to browse it.
5. **Proposals back to org-os.**

Today: phase 3's code and phase 1's connector are released in org-os 0.7.4 and 0.7.5. Phases 2 and 4
are the drafts in this repository (`lexicons/`, `index/`).

## Not doing

- No fork of other projects' lexicons. Changes go upstream.
- No hosted accounts or PDS for groups, and no labeler.
- Nothing from inside a membrane on the open network.
- No republishing of individuals' data.

## Left open

- The network's domain, which replaces the placeholder authority (Q7).
- Where the index is hosted (Q6).

# Publishing the network's types

atproto finds a lexicon from its NSID. For `org.orgosnetwork.profile` the authority is
`org.orgosnetwork`, so a resolver looks up the DNS TXT record `_lexicon.orgosnetwork.org`. That
record names a DID. The resolver then reads that DID's repository, collection
`com.atproto.lexicon.schema`, record key `org.orgosnetwork.profile`. The record is the lexicon file
plus `"$type": "com.atproto.lexicon.schema"`. Resolvers look up that one DNS name only, never a parent
domain. Source: [atproto.com/specs/lexicon](https://atproto.com/specs/lexicon), "Lexicon Publication
and Resolution".

Only **profile** and **link** are published. **need** and **offer** are drafts. They are not
published until they are co-designed with Weave, and the script refuses them. The list is
`PUBLISHED` at the top of `scripts/publish-lexicons.mjs`.

Status: the domain is chosen and not registered. Nothing is published.

## Steps, in order

1. **Register `orgosnetwork.org`.**

2. **Create the network's own atproto account**, with the handle `orgosnetwork.org`. This account
   holds the schemas and nothing else. It is the network's account, not a member's or a person's.
   Verifying the handle needs its own DNS record (`_atproto.orgosnetwork.org`), which the account
   host shows when you set the handle. Note the account's DID (`did:plc:...`) and create an
   **app password** for it.

3. **Add the TXT record** to the domain's DNS:

   ```
   _lexicon.orgosnetwork.org.  TXT  "did=<the account's DID>"
   ```

   Only one `did=` value. The `did=` prefix is part of the value.

4. **Dry run.** It sends nothing. It prints each record it would write (collection, record key,
   a sha256 of the JSON and its size) and the TXT line.

   ```bash
   npm run publish:lexicons
   ```

5. **Apply.** The credentials come from the environment only, never from arguments or files, and
   are never printed.

   ```bash
   export ORGOSNETWORK_PDS=https://<the account's host>
   export ORGOSNETWORK_IDENTIFIER=orgosnetwork.org
   export ORGOSNETWORK_APP_PASSWORD=<the app password>
   npm run publish:lexicons -- --apply
   unset ORGOSNETWORK_APP_PASSWORD
   ```

   The script signs in, refuses to write if the TXT record names a different DID, and skips records
   that are already current. If the TXT record isn't visible yet, it writes anyway and warns.

6. **Check.** This step is read-only. It resolves the TXT record, finds the DID's host (through
   plc.directory, or `did:web`), fetches each published schema and compares it with the local
   file. It also fails if a draft is found published.

   ```bash
   npm run publish:lexicons -- --check
   ```

## Changing a published type

A published lexicon may only change in compatible ways: new optional fields, new `knownValues`. A
breaking change needs a new name. Edit `lexicons/templates/`, run `npm run build:lexicons`, then
repeat steps 4 to 6.

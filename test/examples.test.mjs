import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ValidationError } from '@atproto/lexicon';
import { AUTHORITY, NAMES, lexiconSet, examples } from './helpers.mjs';

const set = lexiconSet();
const valid = examples('valid');
const invalid = examples('invalid');

// Why each invalid example must fail, so none passes the test by failing for some other reason.
const WHY = {
  'link.missing-relation.json': /must have the property "relation"/,
  'link.subject-not-did.json': /Record\/subject must be a valid did/,
  'need.missing-created-at.json': /must have the property "createdAt"/,
  'offer.created-at-not-datetime.json': /Record\/createdAt must be an valid atproto datetime/,
  'profile.certified-ref-incomplete.json': /Record\/certifiedProfile must have the property "cid"/,
  'profile.homepage-not-uri.json': /Record\/homepage must be a uri/,
  'profile.membranes-not-array.json': /Record\/membranes must be an array/,
  'profile.missing-name.json': /must have the property "name"/,
  'profile.network-hub-not-did.json': /Record\/networks\/0\/hub must be a valid did/,
};

test('every type has at least one valid example, and there are invalid ones', () => {
  for (const n of NAMES) assert.ok(valid.some((e) => e.name === n), `no valid ${n} example`);
  assert.ok(invalid.length >= 3);
});

for (const { file, name, record } of valid) {
  test(`valid/${file} passes`, () => {
    assert.equal(record.$type, `${AUTHORITY}.${name}`);
    set.assertValidRecord(`${AUTHORITY}.${name}`, record);
  });
}

for (const { file, name, record } of invalid) {
  test(`invalid/${file} fails`, () => {
    assert.equal(record.$type, `${AUTHORITY}.${name}`, 'an invalid example must fail on its content, not its $type');
    assert.ok(WHY[file], `say in WHY why ${file} must fail`);
    assert.throws(() => set.assertValidRecord(`${AUTHORITY}.${name}`, record), (err) => err instanceof ValidationError && WHY[file].test(err.message));
  });
}

test('the reciprocal link examples make one mutual membership', () => {
  const member = valid.find((e) => e.file === 'link.member-of.json').record;
  const hub = valid.find((e) => e.file === 'link.has-member.json').record;
  assert.equal(member.relation, 'memberOf');
  assert.equal(hub.relation, 'hasMember');
  assert.equal(member.network, hub.network);
});

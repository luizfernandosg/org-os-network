import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isValidLexiconDoc } from '@atproto/lexicon';
import { build } from '../scripts/build-lexicons.mjs';
import { AUTHORITY, NAMES, networkLexicons, lexiconSet, propertyNames, valuesOf } from './helpers.mjs';

const lexicons = networkLexicons();
const byName = Object.fromEntries(lexicons.map(({ doc }) => [doc.id.slice(AUTHORITY.length + 1), doc]));

test('the committed lexicons are exactly the four contract NSIDs', () => {
  assert.deepEqual(lexicons.map(({ doc }) => doc.id).sort(), NAMES.map((n) => `${AUTHORITY}.${n}`));
  for (const { file, doc } of lexicons) assert.equal(file, `${doc.id}.json`);
});

test('the committed lexicons are what the build produces from authority.json', () => {
  const result = build({ check: true });
  assert.deepEqual(result.changed, [], 'out of date: run npm run build:lexicons');
  assert.deepEqual(result.removed, []);
});

for (const { file, doc } of lexicons) {
  test(`${file} is a valid Lexicon v1 record doc`, () => {
    assert.equal(doc.lexicon, 1);
    assert.ok(isValidLexiconDoc(doc), 'isValidLexiconDoc');
    assert.equal(doc.defs.main.type, 'record');
    assert.equal(doc.defs.main.record.type, 'object');
    assert.ok(doc.defs.main.record.required.includes('createdAt'));
    assert.equal(doc.defs.main.record.properties.createdAt.format, 'datetime');
  });

  test(`${file} declares no visibility, private, wallet or email field`, () => {
    const names = [...propertyNames(doc)].map((n) => n.toLowerCase());
    for (const banned of ['visibility', 'private', 'wallet', 'email']) {
      assert.ok(!names.some((n) => n.includes(banned)), `field matching "${banned}" in ${file}`);
    }
  });

  test(`${file} uses knownValues, never a closed enum`, () => {
    assert.deepEqual(valuesOf(doc, 'enum'), []);
  });

  test(`${file} references only its own defs and com.atproto.repo.strongRef`, () => {
    for (const ref of valuesOf(doc, 'ref')) {
      assert.ok(ref.startsWith('#') || ref === 'com.atproto.repo.strongRef', `unexpected ref ${ref}`);
    }
  });
}

test('all lexicons load together into one Lexicons set', () => {
  const set = lexiconSet();
  for (const n of NAMES) assert.ok(set.getDef(`${AUTHORITY}.${n}`), n);
});

test('profile: key literal:self, the contract fields, name and createdAt required', () => {
  const main = byName.profile.defs.main;
  assert.equal(main.key, 'literal:self');
  assert.deepEqual(Object.keys(main.record.properties).sort(),
    ['authorities', 'certifiedProfile', 'createdAt', 'description', 'homepage', 'instance', 'membranes', 'name', 'networks']);
  assert.deepEqual(main.record.required.sort(), ['createdAt', 'name']);
  assert.equal(main.record.properties.homepage.format, 'uri');
  assert.equal(main.record.properties.instance.format, 'uri');
  assert.equal(main.record.properties.certifiedProfile.ref, 'com.atproto.repo.strongRef');
  assert.deepEqual(Object.keys(byName.profile.defs.network.properties).sort(), ['hub', 'name']);
  assert.equal(byName.profile.defs.network.properties.hub.format, 'did');
  assert.deepEqual(main.record.properties.membranes.items.knownValues, ['public', 'peers', 'members', 'council', 'private']);
});

test('profile extends Certified and never repeats its fields', () => {
  const names = propertyNames(byName.profile);
  for (const f of ['logo', 'avatar', 'banner', 'location', 'displayName']) assert.ok(!names.has(f), f);
});

test('link: key tid, subject is a DID, relation knows memberOf/hasMember/peerOf', () => {
  const main = byName.link.defs.main;
  assert.equal(main.key, 'tid');
  assert.deepEqual(Object.keys(main.record.properties).sort(), ['createdAt', 'network', 'relation', 'subject']);
  assert.deepEqual(main.record.required.sort(), ['createdAt', 'relation', 'subject']);
  assert.equal(main.record.properties.subject.format, 'did');
  assert.deepEqual(main.record.properties.relation.knownValues, ['memberOf', 'hasMember', 'peerOf']);
});

for (const n of ['need', 'offer']) {
  test(`${n}: key tid, marked draft, says why it has no visibility field`, () => {
    const doc = byName[n];
    assert.equal(doc.defs.main.key, 'tid');
    assert.match(doc.description, /^Draft\./);
    assert.match(doc.description, /no visibility field/);
    assert.match(doc.description, /private and matching-only/);
    assert.deepEqual(doc.defs.main.record.required.sort(), ['createdAt', 'text', 'title']);
  });
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build, renderLexicons, assertAuthority, EXAMPLES_DIR, TOKEN } from '../scripts/build-lexicons.mjs';
import { AUTHORITY, NAMES, lexiconSet } from './helpers.mjs';

const tmp = (t) => { const d = mkdtempSync(join(tmpdir(), 'kn-vocab-')); t.after(() => rmSync(d, { recursive: true, force: true })); return d; };
const dirFiles = (dir) => readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
const OTHER = 'net.knowledgecommons.vocab';

test('the build is deterministic: same authority, same bytes', (t) => {
  const a = tmp(t), b = tmp(t);
  build({ authority: AUTHORITY, outDir: a });
  build({ authority: AUTHORITY, outDir: b });
  assert.deepEqual(dirFiles(a), dirFiles(b));
  for (const f of dirFiles(a)) assert.equal(readFileSync(join(a, f), 'utf8'), readFileSync(join(b, f), 'utf8'), f);
  assert.deepEqual([...renderLexicons(AUTHORITY)], [...renderLexicons(AUTHORITY)]);
});

test('swapping the authority changes every id and nothing else', () => {
  const before = renderLexicons(AUTHORITY);
  const after = renderLexicons(OTHER);
  assert.deepEqual([...after.keys()], NAMES.map((n) => `${OTHER}.${n}.json`));
  for (const n of NAMES) {
    const x = JSON.parse(before.get(`${AUTHORITY}.${n}.json`));
    const y = JSON.parse(after.get(`${OTHER}.${n}.json`));
    assert.equal(x.id, `${AUTHORITY}.${n}`);
    assert.equal(y.id, `${OTHER}.${n}`);
    assert.deepEqual({ ...y, id: x.id }, x, `${n} differs beyond its id`);
    // Byte-level too: the only changed line is the id line.
    const xl = before.get(`${AUTHORITY}.${n}.json`).split('\n');
    const yl = after.get(`${OTHER}.${n}.json`).split('\n');
    assert.equal(xl.length, yl.length);
    assert.deepEqual(xl.map((l, i) => (l === yl[i] ? null : i)).filter((i) => i !== null), [2], n);
  }
});

test('lexicons built under another authority still load and validate', () => {
  const docs = [...renderLexicons(OTHER).values()].map((s) => JSON.parse(s));
  const set = lexiconSet(docs);
  set.assertValidRecord(`${OTHER}.link`, { $type: `${OTHER}.link`, subject: 'did:plc:example1', relation: 'peerOf', createdAt: '2026-11-22T10:00:00.000Z' });
});

test('a rebuild under a new authority removes the old outputs', (t) => {
  const d = tmp(t);
  writeFileSync(join(d, 'authority.json'), JSON.stringify({ authority: AUTHORITY }));
  build({ authority: AUTHORITY, outDir: d });
  const r = build({ authority: OTHER, outDir: d });
  assert.equal(r.removed.length, NAMES.length);
  assert.deepEqual(dirFiles(d), ['authority.json', ...NAMES.map((n) => `${OTHER}.${n}.json`)]);
});

test('check mode writes nothing and reports what is stale', (t) => {
  const d = tmp(t);
  const r = build({ authority: AUTHORITY, outDir: d, check: true });
  assert.equal(r.changed.length, NAMES.length);
  assert.deepEqual(readdirSync(d), []);
});

test('the build moves the examples\' $type to the new authority', (t) => {
  const d = tmp(t), ex = join(tmp(t), 'examples');
  cpSync(EXAMPLES_DIR, ex, { recursive: true });
  const r = build({ authority: OTHER, outDir: d, examplesDir: ex });
  assert.ok(r.examples.length > 0);
  for (const sub of ['valid', 'invalid']) {
    for (const f of dirFiles(join(ex, sub))) {
      const rec = JSON.parse(readFileSync(join(ex, sub, f), 'utf8'));
      assert.equal(rec.$type, `${OTHER}.${f.split('.')[0]}`, f);
    }
  }
});

test('bad authorities are refused', () => {
  for (const bad of ['', 'single', 'Example.Org', 'example..org', 'example.org.', '-x.org', 42, undefined]) {
    assert.throws(() => assertAuthority(bad), /not a lexicon authority/, String(bad));
  }
  assert.equal(assertAuthority('example.orgosnetwork'), 'example.orgosnetwork');
});

test('a template that uses the token outside its id is refused', (t) => {
  const d = tmp(t);
  mkdirSync(join(d, 't'));
  writeFileSync(join(d, 't', 'thing.json'), JSON.stringify({ lexicon: 1, id: `${TOKEN}.thing`, description: `see ${TOKEN}`, defs: {} }));
  assert.throws(() => renderLexicons(AUTHORITY, join(d, 't')), /token must appear once/);
});

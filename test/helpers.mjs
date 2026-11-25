// test/helpers.mjs: load the committed lexicons and examples (not a test file; see package.json "test").
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Lexicons } from '@atproto/lexicon';
import { LEXICONS_DIR, EXAMPLES_DIR, readAuthority } from '../scripts/build-lexicons.mjs';

export const AUTHORITY = readAuthority();
export const NAMES = ['link', 'need', 'offer', 'profile'];
export const VENDOR_DIR = join(LEXICONS_DIR, 'vendor');

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const jsonFiles = (dir) => readdirSync(dir).filter((f) => f.endsWith('.json')).sort();

/** The network's own lexicons, as committed: [{ file, doc }]. */
export function networkLexicons(dir = LEXICONS_DIR) {
  return jsonFiles(dir).filter((f) => f !== 'authority.json').map((file) => ({ file, doc: readJson(join(dir, file)) }));
}

export function vendorLexicons() {
  return jsonFiles(VENDOR_DIR).map((f) => readJson(join(VENDOR_DIR, f)));
}

/** A Lexicons set with the network's docs plus the vendored ones they reference. */
export function lexiconSet(docs = networkLexicons().map((l) => l.doc)) {
  return new Lexicons([...docs, ...vendorLexicons()]);
}

/** Examples under valid/ or invalid/: [{ file, name, record }]; the type is the file name's first part. */
export function examples(kind) {
  const dir = join(EXAMPLES_DIR, kind);
  return jsonFiles(dir).map((file) => ({ file, name: file.split('.')[0], record: readJson(join(dir, file)) }));
}

/** Every property name declared anywhere in a lexicon doc, at any depth. */
export function propertyNames(node, out = new Set()) {
  if (Array.isArray(node)) node.forEach((n) => propertyNames(n, out));
  else if (node && typeof node === 'object') {
    if (node.properties && typeof node.properties === 'object') Object.keys(node.properties).forEach((k) => out.add(k));
    Object.values(node).forEach((v) => propertyNames(v, out));
  }
  return out;
}

/** Every value of a given key anywhere in a doc (e.g. all `ref`s, all `enum`s). */
export function valuesOf(node, key, out = []) {
  if (Array.isArray(node)) node.forEach((n) => valuesOf(n, key, out));
  else if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === key) out.push(v);
      valuesOf(v, key, out);
    }
  }
  return out;
}

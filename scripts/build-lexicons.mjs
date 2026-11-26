#!/usr/bin/env node
// scripts/build-lexicons.mjs: lexicons/templates/*.json -> lexicons/<authority>.<name>.json.
//
// Every template names its authority with the token {{AUTHORITY}}, and the one place that says
// what it is is lexicons/authority.json (org.orgosnetwork, for orgosnetwork.org). Swapping the
// domain = edit that file, run `npm run build:lexicons`. The token may appear only in a template's
// `id`; the build refuses anything else, so a swap changes every id and nothing more.
//
//   node scripts/build-lexicons.mjs                 write lexicons/*.json, sync the examples' $type
//   node scripts/build-lexicons.mjs --check         write nothing; exit 1 if anything is out of date
//   node scripts/build-lexicons.mjs --authority a.b --out DIR   build elsewhere (tests)
import { readFileSync, writeFileSync, readdirSync, existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOKEN = '{{AUTHORITY}}';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
export const LEXICONS_DIR = join(ROOT, 'lexicons');
export const TEMPLATES_DIR = join(LEXICONS_DIR, 'templates');
export const EXAMPLES_DIR = join(LEXICONS_DIR, 'examples');
export const AUTHORITY_FILE = join(LEXICONS_DIR, 'authority.json');

// A reversed domain: two or more lowercase labels. Lexicon parsing checks the full NSID again.
const AUTHORITY_RE = /^[a-z]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function readAuthority(file = AUTHORITY_FILE) {
  const { authority } = JSON.parse(readFileSync(file, 'utf8'));
  return assertAuthority(authority);
}

export function assertAuthority(authority) {
  if (typeof authority !== 'string' || !AUTHORITY_RE.test(authority) || authority.length > 253) {
    throw new Error(`not a lexicon authority (reversed domain, lowercase): ${JSON.stringify(authority)}`);
  }
  return authority;
}

export function templateNames(templatesDir = TEMPLATES_DIR) {
  return readdirSync(templatesDir).filter((f) => f.endsWith('.json')).map((f) => basename(f, '.json')).sort();
}

const serialize = (value) => JSON.stringify(value, null, 2) + '\n';

/** Render every template for `authority` -> Map(fileName -> text). Pure: reads templates, writes nothing. */
export function renderLexicons(authority, templatesDir = TEMPLATES_DIR) {
  assertAuthority(authority);
  const out = new Map();
  for (const name of templateNames(templatesDir)) {
    const raw = readFileSync(join(templatesDir, `${name}.json`), 'utf8');
    const template = JSON.parse(raw);
    const uses = raw.split(TOKEN).length - 1;
    if (uses !== 1 || template.id !== `${TOKEN}.${name}`) {
      throw new Error(`templates/${name}.json: the token must appear once, as "id": "${TOKEN}.${name}" (found ${uses})`);
    }
    const doc = { ...template, id: `${authority}.${name}` };
    out.set(`${doc.id}.json`, serialize(doc));
  }
  return out;
}

/** Files in outDir that a previous build wrote (a lexicon doc at the top level) but this one does not. */
function staleOutputs(outDir, keep) {
  if (!existsSync(outDir)) return [];
  return readdirSync(outDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json') && e.name !== 'authority.json' && !keep.has(e.name))
    .filter((e) => {
      try { return JSON.parse(readFileSync(join(outDir, e.name), 'utf8')).lexicon === 1; } catch { return false; }
    })
    .map((e) => e.name);
}

/** Example records whose $type names one of our types under another authority -> [{ file, text }]. */
function exampleUpdates(authority, names, examplesDir = EXAMPLES_DIR) {
  if (!existsSync(examplesDir)) return [];
  const updates = [];
  for (const sub of readdirSync(examplesDir, { withFileTypes: true }).filter((e) => e.isDirectory())) {
    const dir = join(examplesDir, sub.name);
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      const file = join(dir, f);
      const record = JSON.parse(readFileSync(file, 'utf8'));
      if (typeof record.$type !== 'string') continue;
      const name = record.$type.slice(record.$type.lastIndexOf('.') + 1);
      const want = `${authority}.${name}`;
      if (names.includes(name) && record.$type !== want) updates.push({ file, text: serialize({ ...record, $type: want }) });
    }
  }
  return updates;
}

/** Build into outDir. Returns what changed; with check:true, changes nothing on disk. */
export function build({ authority = readAuthority(), outDir = LEXICONS_DIR, templatesDir = TEMPLATES_DIR, examplesDir = null, check = false } = {}) {
  const rendered = renderLexicons(authority, templatesDir);
  const changed = [];
  for (const [file, text] of rendered) {
    const path = join(outDir, file);
    if (!existsSync(path) || readFileSync(path, 'utf8') !== text) changed.push(path);
  }
  const removed = staleOutputs(outDir, new Set(rendered.keys())).map((f) => join(outDir, f));
  const examples = examplesDir ? exampleUpdates(authority, templateNames(templatesDir), examplesDir) : [];
  if (!check) {
    mkdirSync(outDir, { recursive: true });
    for (const [file, text] of rendered) writeFileSync(join(outDir, file), text);
    for (const path of removed) unlinkSync(path);
    for (const { file, text } of examples) writeFileSync(file, text);
  }
  return { authority, files: [...rendered.keys()], changed, removed, examples: examples.map((e) => e.file) };
}

function main(argv) {
  const arg = (flag) => { const i = argv.indexOf(flag); return i === -1 ? undefined : argv[i + 1]; };
  const check = argv.includes('--check');
  const out = arg('--out');
  const authority = arg('--authority') ?? readAuthority();
  // Examples follow the committed lexicons only; a build elsewhere leaves them alone.
  const result = build({ authority, outDir: out ?? LEXICONS_DIR, examplesDir: out ? null : EXAMPLES_DIR, check });
  const stale = [...result.changed, ...result.removed, ...result.examples];
  if (check) {
    if (stale.length) {
      console.error(`lexicons are out of date for ${authority}; run npm run build:lexicons\n  ${stale.join('\n  ')}`);
      process.exit(1);
    }
    console.log(`lexicons up to date for ${authority} (${result.files.length})`);
    return;
  }
  console.log(`built ${result.files.length} lexicons for ${authority}: ${result.files.join(', ')}`);
  for (const p of result.removed) console.log(`removed stale ${p}`);
  for (const p of result.examples) console.log(`updated $type in ${p}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));

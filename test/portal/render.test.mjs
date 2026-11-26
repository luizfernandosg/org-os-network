// Draws the fixtures with org-os's real portal components. Needs org-os's packages/admin: runs only when
// ORG_OS_ADMIN points at it (ORG_OS_ADMIN=<path> npm test), and is skipped otherwise.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { openDb, replaceAll } from '../../index/src/db.mjs';
import { OUTSIDER, REBUILT_AT, ROSTER_DIR, links, members, recordsNoLinks } from './fixtures.mjs';

const ADMIN = process.env.ORG_OS_ADMIN;
const skip = ADMIN ? false : 'set ORG_OS_ADMIN to org-os packages/admin to draw the page';
const BUILD = new URL('../../portal/src/build.mjs', import.meta.url).pathname;
let dir;

function build(records, name) {
  const db = path.join(dir, `${name}.sqlite`);
  const h = openDb(db);
  replaceAll(h, { members, records: records.map(({ record, ...r }) => ({ ...r, cid: null, value: record })), indexedAt: REBUILT_AT, meta: { rebuilt_at: REBUILT_AT } });
  h.close();
  const out = path.join(dir, name);
  const run = spawnSync(process.execPath, [BUILD, '--admin', ADMIN, '--db', db, '--out', out, '--roster', ROSTER_DIR], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  return { out, html: readFileSync(path.join(out, 'index.html'), 'utf8') };
}

before(() => {
  if (!skip) dir = mkdtempSync(path.join(tmpdir(), 'portal-render-'));
});
after(() => dir && rmSync(dir, { recursive: true, force: true }));

/** The text of the element with the given id, roughly: from the id to the element's close. */
const section = (html, id) => html.slice(html.indexOf(`id="${id}"`), html.indexOf('</section>', html.indexOf(`id="${id}"`)));
const card = (html, id) => html.slice(html.indexOf(`id="org-${id}"`), html.indexOf('</article>', html.indexOf(`id="org-${id}"`)));

test('the page draws the index with no example marker on read data, and says the map has no links', { skip }, () => {
  const { out, html } = build(recordsNoLinks, 'nolinks');
  for (const f of ['assets/hub.css', 'assets/fraunces-latin-normal-CFFu7zhK.woff2', 'assets/LICENSES/OFL-Geist.txt', 'model.json']) assert.ok(existsSync(path.join(out, f)), f);
  assert.match(html, /class="portal-top"/);
  assert.match(html, /class="hnode/);
  assert.match(html, /No organisation has published a link \(org\.orgosnetwork\.link\) yet, so no lines are drawn/);
  assert.doesNotMatch(html, /<path class="hedge/, 'no line on the map');
  for (const id of ['valley-commons', 'riverbend-seeds', 'hilltop-toolshed', 'quiet-grove', 'coastal-group']) {
    assert.doesNotMatch(card(html, id), /nx-ex/, `${id}'s card has no example marker`);
  }
  assert.match(card(html, 'valley-commons'), /A commons of the valley\./);
  assert.match(card(html, 'riverbend-seeds'), /Nonprofit · on atproto · certified\.example/);
  assert.match(card(html, 'coastal-group'), /No atproto account yet\./);
  assert.doesNotMatch(section(html, 'plate-h'), /nx-ex/, 'the map is read, not hand-written');
  assert.doesNotMatch(section(html, 'know'), /nx-ex/, 'what they know is read');
  assert.match(section(html, 'know'), /Soil carbon claim/);
  assert.match(section(html, 'asks'), /Advice on cold storage/);
  assert.doesNotMatch(section(html, 'asks'), /nx-ex/, 'a published need replaces the examples');
  assert.match(section(html, 'join'), /nx-ex/, 'joining is still hand-written and marked');
  assert.ok(!html.includes(OUTSIDER) && !html.includes('Not a member'));
});

test('with no need or offer published, the hand-written rows stay, each marked', { skip }, () => {
  const { html } = build(recordsNoLinks.filter((r) => !r.collection.endsWith('.need')), 'noasks');
  const asks = section(html, 'asks');
  assert.match(asks, /No organisation publishes needs or offers yet/);
  assert.equal(asks.match(/class="nx-ex"/g).length, 3);
});

test('link records draw lines, mutual solid and one-sided faint, and never the outside organisation', { skip }, () => {
  const { html } = build([...recordsNoLinks, ...links], 'links');
  assert.equal(html.match(/<path class="hedge/g).length, 2);
  assert.match(html, /class="hedge nx-peer nx-claimed"/);
  assert.match(html, /class="hedge" d=/);
  assert.match(html, /1 link to organisations outside the network is not drawn/);
  assert.match(card(html, 'riverbend-seeds'), /member of Valley Commons/);
  assert.ok(!html.includes(OUTSIDER));
});

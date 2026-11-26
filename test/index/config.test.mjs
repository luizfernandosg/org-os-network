import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterCollections, loadConfig, matchesCollection, patternsOf } from '../../index/src/config.mjs';

test('NSID prefixes match by prefix only, exact NSIDs exactly', () => {
  const p = patternsOf({ a: ['xyz.regencoordination.kb.*'], b: ['app.certified.actor.organization'] });
  assert.ok(matchesCollection('xyz.regencoordination.kb.signal', p));
  assert.ok(!matchesCollection('xyz.regencoordination.kbx.signal', p));
  assert.ok(!matchesCollection('xyz.regencoordination.kb', p));
  assert.ok(matchesCollection('app.certified.actor.organization', p));
  assert.ok(!matchesCollection('app.certified.actor.profile', p));
  assert.deepEqual(filterCollections(['app.bsky.graph.follow', 'xyz.regencoordination.kb.b', 'xyz.regencoordination.kb.a'], p), ['xyz.regencoordination.kb.a', 'xyz.regencoordination.kb.b']);
  assert.throws(() => patternsOf(['not an nsid']), /not an NSID/);
});

test('the shipped config and members load', () => {
  const c = loadConfig();
  assert.ok(c.patterns.includes('xyz.regencoordination.kb.*'));
  assert.ok(c.patterns.includes('org.orgosnetwork.need'));
  assert.equal(c.members.length, 4);
  assert.equal(c.serve.host, '127.0.0.1');
});

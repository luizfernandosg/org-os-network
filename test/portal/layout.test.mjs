import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CANVAS_W, NODE_H, NODE_W, PAD_Y, edgePath, layoutMap } from '../../portal/src/layout.mjs';

const n = (id, parent = false) => ({ id, name: id, parent });

test('with no edges every node sits on one row, inside the canvas, and no line is drawn', () => {
  const l = layoutMap({ nodes: ['a', 'b', 'c', 'd'].map((id) => n(id)), edges: [] });
  assert.deepEqual(l.nodes.map((x) => x.row), [0, 0, 0, 0]);
  assert.deepEqual(l.lines, []);
  assert.equal(l.height, PAD_Y * 2 + NODE_H);
  for (const x of l.nodes) assert.ok(x.x >= 0 && x.x + NODE_W <= CANVAS_W, `${x.id} inside`);
  const xs = l.nodes.map((x) => x.x);
  assert.deepEqual(xs, [...xs].sort((a, b) => a - b));
});

test('organisations others are members of go on the top row; rows hold four at most', () => {
  const nodes = [n('net', true), ...['a', 'b', 'c', 'd', 'e'].map((id) => n(id))];
  const l = layoutMap({ nodes, edges: [{ from: 'net', to: 'a', relation: 'member', mutual: true }] });
  assert.deepEqual(l.nodes.map((x) => [x.id, x.row]), [['net', 0], ['a', 1], ['b', 1], ['c', 1], ['d', 1], ['e', 2]]);
  assert.equal(l.lines.length, 1);
  assert.match(l.lines[0].d, /^M\d+,\d+ C/);
  assert.ok(l.height > PAD_Y * 2 + 2 * NODE_H);
});

test('edges to nodes not on the map are dropped', () => {
  const l = layoutMap({ nodes: [n('a')], edges: [{ from: 'a', to: 'gone', relation: 'peer', mutual: false }] });
  assert.deepEqual(l.lines, []);
});

test('a line between neighbours on a row is straight; between others it arcs over the row', () => {
  const at = (x, col) => ({ x, y: PAD_Y, row: 0, col });
  assert.equal(edgePath(at(0, 0), at(300, 1)), `M${NODE_W},${PAD_Y + NODE_H / 2} L300,${PAD_Y + NODE_H / 2}`);
  assert.match(edgePath(at(600, 2), at(0, 0)), new RegExp(`^M${NODE_W / 2},${PAD_Y} C`));
});

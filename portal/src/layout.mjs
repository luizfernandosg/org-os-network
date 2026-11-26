// Where the map's nodes sit and how its lines run. Pure. The house map lays out a DAO, not a network, so the portal
// places its own: organisations that others are members of on the top row, everyone else under them, each row
// centred, at most PER_ROW to a row. With no edges every node is on one row and no line is drawn.

export const CANVAS_W = 934;
export const NODE_W = 188;
export const NODE_H = 56;
export const PAD_Y = 28;
export const ROW_GAP = 112;
export const PER_ROW = 4;

function rowsOf(nodes) {
  const top = nodes.filter((n) => n.parent);
  const rest = nodes.filter((n) => !n.parent);
  const tiers = top.length && rest.length ? [top, rest] : [nodes];
  const rows = [];
  for (const tier of tiers) for (let i = 0; i < tier.length; i += PER_ROW) rows.push(tier.slice(i, i + PER_ROW));
  return rows;
}

export function layoutMap({ nodes, edges }) {
  const rows = rowsOf(nodes);
  const placed = [];
  rows.forEach((row, r) => {
    const gap = (CANVAS_W - row.length * NODE_W) / (row.length + 1);
    row.forEach((n, i) => {
      placed.push({ ...n, x: Math.round(gap + i * (NODE_W + gap)), y: PAD_Y + r * (NODE_H + ROW_GAP), row: r, col: i });
    });
  });
  const at = new Map(placed.map((n) => [n.id, n]));
  const lines = edges
    .filter((e) => at.has(e.from) && at.has(e.to))
    .map((e) => ({ ...e, d: edgePath(at.get(e.from), at.get(e.to)) }));
  const height = rows.length ? PAD_Y * 2 + rows.length * NODE_H + (rows.length - 1) * ROW_GAP : 0;
  return { width: CANVAS_W, height, nodeWidth: NODE_W, nodes: placed, lines };
}

/** A line between two placed nodes: straight between neighbours on a row, an arc over the row between others, and a
 *  curve from the bottom of the upper node to the top of the lower one across rows. */
export function edgePath(a, b) {
  if (a.row === b.row) {
    const [l, r] = a.x <= b.x ? [a, b] : [b, a];
    if (Math.abs(a.col - b.col) === 1) {
      const y = l.y + NODE_H / 2;
      return `M${l.x + NODE_W},${y} L${r.x},${y}`;
    }
    const x1 = l.x + NODE_W / 2, x2 = r.x + NODE_W / 2, y = l.y, top = Math.max(4, y - 22);
    return `M${x1},${y} C${x1},${top} ${x2},${top} ${x2},${y}`;
  }
  const [u, d] = a.y < b.y ? [a, b] : [b, a];
  const x1 = u.x + NODE_W / 2, y1 = u.y + NODE_H, x2 = d.x + NODE_W / 2, y2 = d.y, m = (y1 + y2) / 2;
  return `M${x1},${y1} C${x1},${m} ${x2},${m} ${x2},${y2}`;
}

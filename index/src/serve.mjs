// Read surface: JSON endpoints and one plain HTML page, on 127.0.0.1 only.
//   node index/src/serve.mjs
import { existsSync } from 'node:fs';
import http from 'node:http';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';
import { getMeta, openDb } from './db.mjs';

const HOST = '127.0.0.1';

const esc = (s) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function listMembers(db) {
  return db
    .prepare(
      `SELECT m.name, m.did, m.handle, m.source, m.pds, COUNT(r.uri) AS records
       FROM members m LEFT JOIN records r ON r.did = m.did
       GROUP BY m.name ORDER BY m.name`,
    )
    .all()
    .map((r) => ({ ...r }));
}

export function stats(db) {
  const total = db.prepare('SELECT COUNT(*) AS n FROM records').get().n;
  const byCollection = db
    .prepare('SELECT collection, COUNT(*) AS count FROM records GROUP BY collection ORDER BY collection')
    .all()
    .map((r) => ({ ...r }));
  const byMember = db
    .prepare(
      `SELECT m.name, r.collection, COUNT(*) AS count FROM records r JOIN members m ON m.did = r.did
       GROUP BY m.name, r.collection ORDER BY m.name, r.collection`,
    )
    .all()
    .map((r) => ({ ...r }));
  return { total, byCollection, byMember, rebuiltAt: getMeta(db, 'rebuilt_at'), cursor: getMeta(db, 'jetstream_cursor') };
}

export function searchRecords(db, { collection, did, q, limit = 50, offset = 0 } = {}) {
  const where = [];
  const args = [];
  if (collection) {
    if (collection.endsWith('.*')) {
      where.push("collection LIKE ? ESCAPE '\\'");
      args.push(likeEscape(collection.slice(0, -1)) + '%');
    } else {
      where.push('collection = ?');
      args.push(collection);
    }
  }
  if (did) {
    where.push('did = ?');
    args.push(did);
  }
  if (q) {
    where.push("record_json LIKE ? ESCAPE '\\'");
    args.push('%' + likeEscape(q) + '%');
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const lim = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 500);
  const off = Math.max(Number.parseInt(offset, 10) || 0, 0);
  const total = db.prepare(`SELECT COUNT(*) AS n FROM records ${clause}`).get(...args).n;
  const rows = db
    .prepare(`SELECT uri, did, collection, rkey, cid, record_json, indexed_at FROM records ${clause} ORDER BY uri LIMIT ? OFFSET ?`)
    .all(...args, lim, off)
    .map(({ record_json, ...r }) => ({ ...r, record: JSON.parse(record_json) }));
  return { total, limit: lim, offset: off, records: rows };
}

function likeEscape(s) {
  return s.replace(/[\\%_]/g, (c) => '\\' + c);
}

function titleOf(record) {
  for (const k of ['title', 'displayName', 'name', 'claim', 'summary']) {
    if (typeof record?.[k] === 'string' && record[k].trim()) return record[k];
  }
  if (typeof record?.text === 'string') return record.text.slice(0, 140);
  return '';
}

export function renderPage(db, params) {
  const members = listMembers(db);
  const st = stats(db);
  const names = new Map(members.filter((m) => m.did).map((m) => [m.did, m.name]));
  const searching = Boolean(params.q || params.collection || params.did);
  const found = searching ? searchRecords(db, { ...params, limit: 100 }) : null;
  const options = st.byCollection
    .map((c) => `<option value="${esc(c.collection)}"${params.collection === c.collection ? ' selected' : ''}>${esc(c.collection)}</option>`)
    .join('');
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Network index</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 60rem; margin: 2rem auto; padding: 0 1rem; color: #222; background: #fff; }
  table { border-collapse: collapse; width: 100%; margin: 0.5rem 0 1.5rem; }
  th, td { text-align: left; padding: 0.25rem 0.5rem; border-bottom: 1px solid #ddd; vertical-align: top; }
  td.n { text-align: right; font-variant-numeric: tabular-nums; }
  code, pre { font: 13px/1.4 ui-monospace, monospace; }
  pre { white-space: pre-wrap; word-break: break-word; background: #f6f6f6; padding: 0.5rem; }
  form { display: flex; gap: 0.5rem; flex-wrap: wrap; }
  input[type=search] { flex: 1; min-width: 12rem; }
  .muted { color: #666; }
  @media (prefers-color-scheme: dark) { body { color: #ddd; background: #161616; } pre { background: #222; } th, td { border-color: #333; } .muted { color: #999; } }
</style>
</head>
<body>
<h1>Network index</h1>
<p class="muted">A rebuildable reading of what members have published on atproto. Read-only; local.
${st.rebuiltAt ? `Rebuilt ${esc(st.rebuiltAt)}.` : 'Not built yet.'} ${st.total} records.</p>

<h2>Members</h2>
<table>
<tr><th>Member</th><th>DID</th><th class="n">Records</th></tr>
${members.map((m) => `<tr><td>${esc(m.name)}${m.handle ? `<br><span class="muted">${esc(m.handle)}</span>` : ''}</td><td>${m.did ? `<code>${esc(m.did)}</code>` : '<span class="muted">no account</span>'}</td><td class="n">${m.records}</td></tr>`).join('\n')}
</table>

<h2>Collections</h2>
<table>
<tr><th>Collection</th><th class="n">Records</th></tr>
${st.byCollection.map((c) => `<tr><td><a href="/?collection=${encodeURIComponent(c.collection)}"><code>${esc(c.collection)}</code></a></td><td class="n">${c.count}</td></tr>`).join('\n')}
</table>

<h2>Search</h2>
<form method="get" action="/">
  <input type="search" name="q" value="${esc(params.q ?? '')}" placeholder="Words in a record" aria-label="Search records">
  <select name="collection" aria-label="Collection"><option value="">All collections</option>${options}</select>
  <button type="submit">Search</button>
</form>
${
  found
    ? `<p>${found.total} found${found.total > found.records.length ? `, first ${found.records.length} shown` : ''}.</p>
<table>
<tr><th>Record</th><th>Member</th></tr>
${found.records
  .map(
    (r) => `<tr><td><code>${esc(r.collection)}</code> ${esc(titleOf(r.record))}
<details><summary class="muted">${esc(r.uri)}</summary><pre>${esc(JSON.stringify(r.record, null, 2))}</pre></details></td><td>${esc(names.get(r.did) ?? r.did)}</td></tr>`,
  )
  .join('\n')}
</table>`
    : ''
}
</body>
</html>
`;
}

export function createIndexServer(db) {
  return http.createServer((req, res) => {
    const url = new URL(req.url, `http://${HOST}`);
    const send = (status, type, body) => {
      res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
      res.end(body);
    };
    const json = (status, body) => send(status, 'application/json; charset=utf-8', JSON.stringify(body, null, 2));
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(405, { error: 'read-only' });
    const p = Object.fromEntries(url.searchParams);
    try {
      switch (url.pathname) {
        case '/':
          return send(200, 'text/html; charset=utf-8', renderPage(db, p));
        case '/members':
          return json(200, { members: listMembers(db) });
        case '/records':
          return json(200, searchRecords(db, p));
        case '/stats':
          return json(200, stats(db));
        default:
          return json(404, { error: 'not found' });
      }
    } catch (err) {
      return json(500, { error: err.message });
    }
  });
}

async function main() {
  const config = loadConfig();
  if (config.serve?.host && config.serve.host !== HOST) throw new Error(`the index binds to ${HOST} only`);
  if (!existsSync(config.dbPath)) throw new Error(`no index at ${config.dbPath}; run npm run index:rebuild first`);
  const db = openDb(config.dbPath, { readOnly: true });
  const port = Number(process.env.PORT) || config.serve?.port || 4690;
  const server = createIndexServer(db);
  server.listen(port, HOST, () => console.log(`index: http://${HOST}:${port}/`));
  const shutdown = () => server.close(() => (db.close(), process.exit(0)));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

// The portal build's arguments. Each flag takes one value, given as the next argument; anything else is refused.
//   --admin <path>  org-os's packages/admin (its portal components); else $ORG_OS_ADMIN
//   --db <path>     the index file; else the index's config (index/data/index.sqlite)
//   --out <dir>     where the page is written; else portal/out
//   --roster <dir>  a folder holding members.json; else index/ (the tests point it at a fixture)
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PORTAL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FLAGS = { '--admin': 'admin', '--db': 'db', '--out': 'out', '--roster': 'roster' };

export const USAGE = 'usage: npm run portal:build -- [--admin <org-os packages/admin>] [--db <index.sqlite>] [--out <dir>] [--roster <dir with members.json>]';

export function parseArgs(argv, env = {}) {
  const got = {};
  for (let i = 0; i < argv.length; i++) {
    const key = Object.hasOwn(FLAGS, argv[i]) ? FLAGS[argv[i]] : null;
    if (!key) throw new Error(`unknown argument: ${argv[i]}`);
    if (key in got) throw new Error(`${argv[i]} given twice`);
    const value = argv[i + 1];
    if (value === undefined || value === '' || value.startsWith('--')) throw new Error(`${argv[i]} needs a value`);
    got[key] = value;
    i++;
  }
  const admin = got.admin ?? env.ORG_OS_ADMIN;
  if (!admin) throw new Error('say where org-os packages/admin is: --admin <path> or ORG_OS_ADMIN=<path>');
  return {
    admin: path.resolve(admin),
    db: got.db ? path.resolve(got.db) : null,
    roster: got.roster ? path.resolve(got.roster) : null,
    out: path.resolve(got.out ?? path.join(PORTAL_DIR, 'out')),
  };
}

/** The flags again, for handing to the render process. */
export function toArgv({ admin, db, out, roster }) {
  return ['--admin', admin, ...(db ? ['--db', db] : []), '--out', out, ...(roster ? ['--roster', roster] : [])];
}

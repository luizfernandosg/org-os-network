// npm run portal:build: checks the arguments, then runs the render with org-os's own tsx, so the portal components
// (TypeScript and JSX, in org-os's packages/admin) load as they do there. Writes only into --out.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PORTAL_DIR, USAGE, parseArgs, toArgv } from './args.mjs';

const REPO_DIR = path.resolve(PORTAL_DIR, '..');
const COMPONENTS = ['app/src/portal/PortalTop.tsx', 'app/src/portal/Hero.tsx', 'app/src/portal/PortalSection.tsx', 'app/src/map/HouseNode.tsx'];

const inside = (child, parent) => {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
};

/** What is wrong with the arguments as given, or null. */
export function checkArgs({ admin, out }) {
  for (const f of [...COMPONENTS, 'tsconfig.json', 'node_modules/.bin/tsx', 'node_modules/react/package.json', 'node_modules/react-dom/package.json']) {
    if (!existsSync(path.join(admin, f))) return `${admin} is not org-os's packages/admin with its node_modules installed (no ${f})`;
  }
  if (inside(out, admin)) return 'the output folder must be outside org-os';
  if (out === REPO_DIR || inside(REPO_DIR, out)) return 'the output folder must be a folder of its own, not the repository';
  return null;
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv, process.env);
  } catch (err) {
    console.error(`${err.message}\n${USAGE}`);
    process.exit(2);
  }
  const problem = checkArgs(args);
  if (problem) {
    console.error(problem);
    process.exit(2);
  }
  const render = path.join(path.dirname(fileURLToPath(import.meta.url)), 'render.mjs');
  const run = spawnSync(path.join(args.admin, 'node_modules/.bin/tsx'), [render, ...toArgv(args)], {
    stdio: 'inherit',
    env: { ...process.env, TSX_TSCONFIG_PATH: path.join(args.admin, 'tsconfig.json') },
  });
  if (run.error) throw run.error;
  process.exit(run.status ?? 1);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main(process.argv.slice(2));

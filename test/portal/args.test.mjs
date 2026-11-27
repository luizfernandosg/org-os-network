import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { PORTAL_DIR, parseArgs, toArgv } from '../../portal/src/args.mjs';
import { checkArgs } from '../../portal/src/build.mjs';

test('the admin path comes from --admin, else ORG_OS_ADMIN, else it is refused', () => {
  assert.equal(parseArgs(['--admin', '/a'], { ORG_OS_ADMIN: '/b' }).admin, '/a');
  assert.equal(parseArgs([], { ORG_OS_ADMIN: '/b' }).admin, '/b');
  assert.throws(() => parseArgs([], {}), /ORG_OS_ADMIN/);
  const a = parseArgs([], { ORG_OS_ADMIN: '/b' });
  assert.equal(a.out, path.join(PORTAL_DIR, 'out'));
  assert.equal(a.db, null);
  assert.equal(a.roster, null);
});

test('unknown, repeated and value-less arguments are refused', () => {
  const env = { ORG_OS_ADMIN: '/b' };
  assert.throws(() => parseArgs(['--publish'], env), /unknown argument: --publish/);
  assert.throws(() => parseArgs(['--out=/x'], env), /unknown argument/);
  assert.throws(() => parseArgs(['toString'], env), /unknown argument/);
  assert.throws(() => parseArgs(['--out /x'], env), /unknown argument/, 'one word with a space in it is not two');
  assert.throws(() => parseArgs(['--out'], env), /needs a value/);
  assert.throws(() => parseArgs(['--out', '--db', 'x'], env), /needs a value/);
  assert.throws(() => parseArgs(['--out', '/x', '--out', '/y'], env), /twice/);
});

test('toArgv hands the same arguments on', () => {
  const a = parseArgs(['--db', '/i.sqlite', '--out', '/o', '--roster', '/r'], { ORG_OS_ADMIN: '/b' });
  assert.deepEqual(parseArgs(toArgv(a), {}), a);
});

test('checkArgs wants a real packages/admin and an output folder outside it and outside the repository', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'portal-args-'));
  try {
    const admin = path.join(dir, 'admin');
    assert.match(checkArgs({ admin, out: path.join(dir, 'out') }), /not org-os's packages\/admin/);
    for (const f of ['app/src/portal/PortalTop.tsx', 'app/src/portal/Hero.tsx', 'app/src/portal/PortalSection.tsx', 'app/src/map/HouseNode.tsx', 'tsconfig.json', 'node_modules/.bin/tsx', 'node_modules/react/package.json', 'node_modules/react-dom/package.json']) {
      mkdirSync(path.dirname(path.join(admin, f)), { recursive: true });
      writeFileSync(path.join(admin, f), '');
    }
    assert.equal(checkArgs({ admin, out: path.join(dir, 'out') }), null);
    assert.match(checkArgs({ admin, out: path.join(admin, 'out') }), /outside org-os/);
    assert.match(checkArgs({ admin, out: path.resolve(PORTAL_DIR, '..') }), /not the repository/);
    assert.match(checkArgs({ admin, out: path.dirname(path.resolve(PORTAL_DIR, '..')) }), /not the repository/);
    assert.equal(checkArgs({ admin, out: path.join(PORTAL_DIR, 'out') }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

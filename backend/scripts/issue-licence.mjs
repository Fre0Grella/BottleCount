#!/usr/bin/env node
/**
 * Mints a licence code and inserts it into D1.
 *
 * This is the whole fulfilment pipeline until a checkout provider is wired up
 * (docs/adr/0001-cloudflare-tiers.md): someone pays however they pay, you run
 * this, you send them the code. When a provider is chosen, its webhook inserts
 * the same row and this script stays useful for comps, refunds and testing.
 *
 *   node scripts/issue-licence.mjs --env local            # local dev database
 *   node scripts/issue-licence.mjs --env production --note "ko-fi #128"
 *   node scripts/issue-licence.mjs --print                # code + SQL, no write
 */
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';

// No I, O, 0 or 1: these are read off a screen and typed by hand, and those
// four are where that goes wrong.
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function group() {
  const bytes = randomBytes(4);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

function generateCode() {
  return `BC-${group()}-${group()}-${group()}`;
}

function arg(name, fallback = null) {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : (process.argv[i + 1] ?? fallback);
}

const env = arg('env', 'local');
const note = arg('note', '');
const printOnly = process.argv.includes('--print');
const local = env === 'local';

const code = generateCode();
const sql =
  'INSERT INTO licence_keys (code, tier, issued_at, note) VALUES ' +
  `('${code}', 'pro', '${new Date().toISOString()}', ` +
  `${note ? `'${note.replace(/'/g, "''")}'` : 'NULL'});`;

if (printOnly) {
  console.log(code);
  console.log(sql);
  process.exit(0);
}

const database = env === 'preview' ? 'db-preview' : 'db';
const result = spawnSync(
  'npx',
  [
    'wrangler',
    'd1',
    'execute',
    database,
    '--env',
    env,
    local ? '--local' : '--remote',
    '--command',
    sql,
  ],
  { stdio: 'inherit' },
);

if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`\nLicence code: ${code}`);

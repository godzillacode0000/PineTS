#!/usr/bin/env node
/**
 * bare-ident.mjs — where does an identifier survive UNTRANSFORMED in the generated JS?
 *
 *   cd ~/Projects/PineTS && npx tsx tools/repro/bare-ident.mjs <file.pine> <Ident> [Ident2 ...]
 *
 * Prints every generated line where the identifier appears without a `$.`-scoped chain in front of
 * it, plus the surrounding context. This is the inspection step for the `X is not defined` class.
 */
import { readFileSync } from 'node:fs';
import { transpile } from '../../src/transpiler/index.ts';

const [file, ...names] = process.argv.slice(2);
if (!file || !names.length) {
  console.error('usage: npx tsx tools/repro/bare-ident.mjs <file.pine> <Ident> [Ident2 ...]');
  process.exit(2);
}
const src = readFileSync(file, 'utf8');

let js = '';
try {
  js = transpile(src, { debug: false }).toString();
} catch (err) {
  console.log('TRANSPILE FAILED: ' + String((err && err.message) || err).split('\n')[0]);
  process.exit(1);
}
const lines = js.split('\n');

for (const name of names) {
  const re = new RegExp('(^|[^.\\w$])' + name + '\\b');
  const hits = [];
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) hits.push(i + 1);
  console.log('=== ' + name + ': ' + hits.length + ' bare line(s) ===');
  for (const n of hits.slice(0, 3)) {
    for (let i = Math.max(0, n - 3); i < Math.min(lines.length, n + 2); i++) {
      console.log(String(i + 1).padStart(5) + ' | ' + lines[i].slice(0, 200));
    }
    console.log('  ---');
  }
}

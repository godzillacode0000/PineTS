#!/usr/bin/env node
/**
 * mss-repro.mjs — does a non-computed member read on a `var` UDT instance stay BARE inside a switch
 * arm (inside a method)? Transpiles the repro and shows every line that mentions the identifier in a
 * suspicious way, plus the generated lines around it.
 *
 *   cd ~/Projects/PineTS && npx tsx tools/repro/mss-repro.mjs [path-to.pine]
 */
import { readFileSync } from 'node:fs';
import { transpile } from '../../src/transpiler/index.ts';

const file = process.argv[2] || 'tools/repro/src/mss-class.pine';
const src = readFileSync(file, 'utf8');

let js = '';
try {
  js = transpile(src, { debug: false }).toString();
} catch (err) {
  console.log('TRANSPILE FAILED: ' + String(err && err.message || err).split('\n')[0]);
  process.exit(1);
}

const lines = js.split('\n');
const bare = [];
for (let i = 0; i < lines.length; i++) {
  const line = lines[i];
  // `MSS.dir` NOT preceded by a `$.get(`/`$.var`/`.`-chain — i.e. the raw identifier as the base.
  if (/(^|[^.\w$])MSS\.dir/.test(line)) bare.push({ n: i + 1, line: line.trim().slice(0, 160) });
}

console.log('generated lines:', lines.length);
console.log('bare `MSS.dir` occurrences:', bare.length);
for (const b of bare) console.log('  line ' + b.n + ': ' + b.line);

if (bare.length) {
  const n = bare[0].n;
  console.log('\n--- context around the first bare one ---');
  for (let i = Math.max(0, n - 6); i < Math.min(lines.length, n + 4); i++) {
    console.log(String(i + 1).padStart(5) + ' | ' + lines[i].slice(0, 190));
  }
} else {
  console.log('\nscoped correctly — every MSS.dir went through a $.get()/$.var chain');
  const hit = lines.findIndex((l) => l.includes('MSS.dir'));
  if (hit >= 0) {
    console.log('--- first MSS.dir line ---');
    for (let i = Math.max(0, hit - 3); i < Math.min(lines.length, hit + 3); i++) {
      console.log(String(i + 1).padStart(5) + ' | ' + lines[i].slice(0, 190));
    }
  }
}

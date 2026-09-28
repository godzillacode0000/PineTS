#!/usr/bin/env node
/**
 * find-emission.mjs — use the ENGINE'S OWN SOURCE to see which generated line throws.
 *
 * The published bundle exports no `transpile`, so the generated code was invisible from outside: all I
 * had was a message. The repo's source does export it, and with `{ debug: true }` it annotates the
 * output with `// [Line N]` markers pointing back at the Pine line — which turns "reading 'size'" into
 * "this line of that script, emitted this way".
 *
 * Run with the repo's own tsx so the TypeScript sources import directly (no build step).
 */
import { transpile } from '../src/transpiler/index.ts';
import fs from 'node:fs';

const slug = process.argv[2] || 'money-flow-profile';
const src = fs.readFileSync(`/home/godzillaton/.hermes/cache/scratch/compat/src/${slug}.pine`, 'utf8');

console.log(`# ${slug}: ${src.length} chars, ${src.split('\n').length} lines\n`);
const fn = transpile(src, { debug: true });
const code = fn.toString().split('\n');
console.log(`generated: ${code.length} lines\n`);

// Report every line that mentions the suspicious shapes, with the Pine line it came from.
const patterns = [
  { name: '.size', re: /\.size(?!\s*[:=])/ },
  { name: 'get_v', re: /get_v\b/ },
  { name: 'bare get(', re: /(?<![.$\w])get\(/ },
  { name: '.box(', re: /\.box\s*\(/ },
  { name: '.label(', re: /\.label\s*\(/ },
];
for (const { name, re } of patterns) {
  const hits = [];
  for (let i = 0; i < code.length; i += 1) if (re.test(code[i])) hits.push(i);
  if (!hits.length) { console.log(`-- ${name}: not in the generated code`); continue; }
  console.log(`-- ${name}: ${hits.length} line(s)`);
  for (const i of hits.slice(0, 3)) {
    console.log(`   [${i}] ${code[i].trim().slice(0, 170)}`);
    for (let j = i; j >= Math.max(0, i - 4); j -= 1) {
      const m = code[j].match(/\[Line (\d+)\]/);
      if (m) { console.log(`        ← Pine line ${m[1]}: ${src.split('\n')[Number(m[1]) - 1]?.trim().slice(0, 120)}`); break; }
    }
  }
  console.log('');
}

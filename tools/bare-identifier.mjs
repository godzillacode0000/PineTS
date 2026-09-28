#!/usr/bin/env node
/**
 * `rpLN is not defined` while every generated line seems to say `$.let.glb1_rpLN` — so SOME emitted
 * line left the identifier bare. Find it: print every occurrence of the name that is not preceded by a
 * dot or word character, with the Pine line it came from.
 */
import { transpile } from '../src/transpiler/index.ts';
import fs from 'node:fs';

const slug = process.argv[2] || 'money-flow-profile';
const NAME = process.argv[3] || 'rpLN';
const src = fs.readFileSync(`/home/godzillaton/.hermes/cache/scratch/compat/src/${slug}.pine`, 'utf8');
const code = transpile(src, { debug: true }).toString().split('\n');

const bare = new RegExp(`(?<![.\\w$])${NAME}\\b`);
let found = 0;
for (let i = 0; i < code.length; i += 1) {
  if (!bare.test(code[i])) continue;
  found += 1;
  let pine = '';
  for (let j = i; j >= Math.max(0, i - 3); j -= 1) {
    const m = code[j].match(/\[Line (\d+)\]/);
    if (m) { pine = (src.split('\n')[Number(m[1]) - 1] || '').trim(); break; }
  }
  console.log(`[${i}] ${code[i].trim().slice(0, 190)}`);
  if (pine) console.log(`      ← Pine: ${pine.slice(0, 130)}`);
}
console.log(found ? `\n${found} bare occurrence(s)` : `\nno bare ${NAME} in the generated code`);

// Where is it declared, and does the declaration carry a type annotation the analyzer can read?
const decl = src.split('\n').filter((l) => l.includes(NAME) && l.includes('=') && !l.includes(':='));
console.log('\ndeclaration line(s) in the Pine:');
for (const l of decl) console.log('  ' + l.trim().slice(0, 140));

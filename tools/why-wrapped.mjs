#!/usr/bin/env node
/**
 * Why did `dRP` become `$.get($.var.glb1_dRP, 0)`? Print the generated code around the failing line and
 * every place the variable is declared, assigned or passed — the wrapping has to come from one of them.
 */
import { transpile } from '../src/transpiler/index.ts';
import fs from 'node:fs';

const slug = process.argv[2] || 'money-flow-profile';
const P = slug.includes("/") ? slug : `/home/godzillaton/.hermes/cache/scratch/compat/src/${slug}.pine`;
const src = fs.readFileSync(P, "utf8");
const code = transpile(src, { debug: true }).toString().split('\n');

const NAME = process.argv[3] || 'glb1_dRP';
console.log(`generated: ${code.length} lines · looking for ${NAME}\n`);

const hits = [];
for (let i = 0; i < code.length; i += 1) {
  if (code[i].includes(NAME)) hits.push(i);
}
console.log(`${hits.length} line(s) mention ${NAME}:`);
for (const i of hits.slice(0, 14)) {
  const line = code[i].trim();
  let pine = '';
  for (let j = i; j >= Math.max(0, i - 4); j -= 1) {
    const m = code[j].match(/\[Line (\d+)\]/);
    if (m) {
      const t = src.split('\n')[Number(m[1]) - 1];
      pine = t ? t.trim().slice(0, 100) : '';
      break;
    }
  }
  console.log(`[${i}] ${line.slice(0, 165)}`);
  if (pine) console.log(`      ← ${pine}`);
}

console.log('\n--- the failing expression in context ---');
const idx = code.findIndex((l) => l.includes(`${NAME}`) && l.includes('.size'));
for (let i = Math.max(0, idx - 2); i < Math.min(code.length, idx + 6); i += 1) {
  console.log(`[${i}] ${code[i].trim().slice(0, 170)}`);
}

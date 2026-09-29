import fs from 'node:fs';
import { transpile } from '../src/transpiler/index.ts';
const slug = process.argv[2];
const from = Number(process.argv[3] || 840), to = Number(process.argv[4] || 852);
const src = fs.readFileSync(`/home/godzillaton/.hermes/cache/scratch/compat/src/${slug}.pine`, 'utf8');
const body = transpile(src, { debug: false }).toString().split('\n');
for (let i = from; i <= to; i++) console.log(`${i}: ${body[i - 1]}`);
const line = body[845 - 1];
console.log('\ncol 59 context:', JSON.stringify(line.slice(40, 80)));

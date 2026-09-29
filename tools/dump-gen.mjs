import fs from 'node:fs';
import { transpile } from '../src/transpiler/index.ts';
const slug = process.argv[2];
const src = fs.readFileSync(`/home/godzillaton/.hermes/cache/scratch/compat/src/${slug}.pine`, 'utf8');
const fn = transpile(src, { debug: false });
const body = fn.toString().split('\n');
const target = Number(process.argv[3] || 621);
for (let i = target - 3; i <= target + 3; i++) console.log(`${i}: ${body[i - 1]}`);

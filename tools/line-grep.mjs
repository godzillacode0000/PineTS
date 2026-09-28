import { transpile } from '../src/transpiler/index.ts';
import fs from 'node:fs';
const [slug, needle] = process.argv.slice(2);
const src = fs.readFileSync(`/home/godzillaton/.hermes/cache/scratch/compat/src/${slug}.pine`, 'utf8');
const code = transpile(src, { debug: false }).toString().split('\n');
code.forEach((l, i) => { if (l.includes(needle)) console.log(`[${i + 1}] ${l.trim().slice(0, 170)}`); });

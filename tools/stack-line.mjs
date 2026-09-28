#!/usr/bin/env node
/**
 * The stack said `_r (<anonymous>:621:27)`, and a debug transpile adds comment lines, so the line I
 * printed earlier (687) was NOT the failing one. Transpile WITHOUT debug and print the real :621 area
 * — the evaluated function's numbering is the one the stack uses.
 */
import { transpile } from '../src/transpiler/index.ts';
import fs from 'node:fs';

const slug = process.argv[2];
const around = Number(process.argv[3] || 621);
const src = fs.readFileSync(`/home/godzillaton/.hermes/cache/scratch/compat/src/${slug}.pine`, 'utf8');

const fn = transpile(src);            // no debug: same numbering as the evaluated code
const code = fn.toString().split('\n');
console.log(`${slug}: ${code.length} generated lines (no debug)\n`);
for (let i = Math.max(0, around - 10); i < Math.min(code.length, around + 10); i += 1) {
  const mark = i + 1 === around ? '>>' : '  ';
  console.log(`${mark} ${i + 1}: ${code[i].trim().slice(0, 175)}`);
}

// And name the culprit: every line in the window that reads `.size` or `.last`/`.shift` off something
// that could be undefined.
console.log('\n-- member calls on a possibly-empty value near here --');
for (let i = Math.max(0, around - 30); i < Math.min(code.length, around + 30); i += 1) {
  if (/\.(size|last|first|shift|pop|get|indexof)\b/.test(code[i])) {
    console.log(`   ${i + 1}: ${code[i].trim().slice(0, 150)}`);
  }
}

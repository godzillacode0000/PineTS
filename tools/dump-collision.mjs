import { readFileSync } from 'node:fs';
import { transpile } from '../src/transpiler/index';

const src = readFileSync(process.argv[2], 'utf8');
const js = transpile(src, { debug: false }).toString();
// print only the interesting lines: the switch arm + the tuple split
js.split('\n').forEach((line, i) => {
  if (/switch|p\b|temp|=>|case/.test(line) && line.trim()) console.log(String(i + 1).padStart(4), line.slice(0, 170));
});

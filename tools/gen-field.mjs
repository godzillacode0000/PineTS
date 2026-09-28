import { transpile } from '../src/transpiler/index.ts';
const src = ['//@version=6','indicator("fh")','type bar','    int i','    float c','var bar b = bar.new(bar_index, close)','n = input.int(5, minval = 1)','plot(b.c[n])'].join('\n');
const code = transpile(src, { debug: false }).toString().split('\n');
code.forEach((l, i) => { if (/\$\.get\(|\bb\.c\b|glb1_n/.test(l)) console.log(`[${i + 1}] ${l.trim().slice(0, 150)}`); });

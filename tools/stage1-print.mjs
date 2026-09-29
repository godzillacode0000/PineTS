import * as stage1 from '../src/transpiler/pineToJS/pineToJS.index.ts';
const src = ['//@version=6','indicator("shadow")','type fib','    float p','var fib fib = fib.new(1.0)','plot(fib.p)'].join('\n');
const fn = stage1.pineToJS || stage1.default || stage1.transpilePineScript;
if (typeof fn !== 'function') { console.log('exports:', Object.keys(stage1).join(',')); process.exit(0); }
const out = fn(src);
const code = typeof out === 'string' ? out : (out && (out.code || out.js || out.output)) || String(out);
console.log(code.split('\n').slice(0, 12).join('\n'));

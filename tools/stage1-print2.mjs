import { pineToJS } from '../src/transpiler/pineToJS/pineToJS.index.ts';
const src = [
 '//@version=6','indicator("udt-shadow-annotation")','type fib','    float p',
 'var fib fib = fib.new(3.0)','maker() =>','    fib inner = fib.new(4.0)','    inner',
 'h = maker()','plot(h.p, "p")'].join('\n');
const out = pineToJS(src);
const code = typeof out === 'string' ? out : (out && (out.code || out.js || out.output)) || JSON.stringify(out).slice(0, 600);
console.log(String(code).split('\n').slice(0, 12).join('\n'));

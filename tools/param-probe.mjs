#!/usr/bin/env node
/**
 * Does the `$.param` accumulation machinery actually GROW per bar?
 *
 * `plot(ta.sma(close,3)[1])` goes through the CallExpression-history branch, which accumulates the
 * call result into `context.params['<id>']` and reads it N bars back with $.get. If the array only
 * ever held ONE slot, a 1-bar lookback would return NaN forever — so the values say whether the
 * machinery has history at all, and `ctx.params` shows the slot count.
 */
import { PineTS, Provider } from '../src/index.ts';

const src = [
    '//@version=6',
    'indicator("param-probe", overlay=true)',
    'p = ta.sma(close, 3)[1]',
    'plot(p, "delayed")',
].join('\n');

const engine = new PineTS(Provider.Mock, 'BTCUSDC', '60', null,
    Date.parse('2024-01-01'), Date.parse('2024-01-03'));
const out = await engine.run(src);
console.log('plot keys:', Object.keys(out.plots || {}));
const node = out.plots && (out.plots['delayed'] || out.plots.p || Object.values(out.plots)[0]);
const vals = (node && node.data ? node.data : []).slice(0, 8).map((r) => (r && typeof r === 'object' ? r.value : r));
console.log('first 8 values:', JSON.stringify(vals));

const ctx = engine.context;
const params = (ctx && ctx.params) || {};
console.log('params keys:', Object.keys(params));
for (const k of Object.keys(params)) {
    const arr = params[k];
    console.log(`  ${k}: len=${arr.length} last=${JSON.stringify(arr[arr.length - 1])}`);
}

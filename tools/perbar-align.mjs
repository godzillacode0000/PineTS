#!/usr/bin/env node
/**
 * Align the stored slots against what each lookback actually returned, for a PER-BAR UDT instance.
 *
 * `close[1]` is the control (the ordinary series path, known good). Each `b.c[N]` should equal
 * `close[N]` if field history works. The slot dump lets one see the duplicate the per-bar shift
 * writes, which is the shape a lookback has to account for.
 */
import { PineTS, Provider } from '../src/index.ts';

const src = [
    '//@version=6',
    'indicator("align")',
    'type bar',
    '    int i',
    '    float c',
    'bar b = bar.new(bar_index, close)',
    'plot(b.c[0], "f0")',
    'plot(b.c[1], "f1")',
    'plot(b.c[2], "f2")',
    'plot(close[1], "c1")',
    'plot(close[2], "c2")',
].join('\n');

const engine = new PineTS(Provider.Mock, 'BTCUSDC', '60', null,
    Date.parse('2024-01-01'), Date.parse('2024-01-03'));
const ctx = await engine.run(src);

const series = (k) => (ctx.plots[k]?.data || []).slice(-5).map((r) => {
    const v = r && typeof r === 'object' ? r.value : r;
    return v == null || Number.isNaN(v) ? 'na' : Number(v).toFixed(2);
});
for (const k of ['f0', 'f1', 'f2', 'c1', 'c2']) console.log(`${k.padEnd(3)} ${JSON.stringify(series(k))}`);

const data = ctx.let?.glb1_b?.data || [];
console.log('slot count:', data.length, '· last 6 slots .c:', JSON.stringify(data.slice(-6).map((o) => Number(o.c).toFixed(2))));

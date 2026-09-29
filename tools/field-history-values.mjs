#!/usr/bin/env node
/**
 * VALUES check for the UDT-field-history fix — the part a suite cannot see.
 *
 * `var bar b` keeps ONE object; the field is mutated every bar. Pine's `b.c[1]` is the value of the
 * field one bar ago. Before the fix, `$.get($.var.glb1_b, 1).c` returned the SAME object, so `.c`
 * was TODAY's close — a silent wrong number. Expectation below is written from the source, not from
 * the engine: `prev` must equal the previous bar's close, which `close[1]` (the control) computes
 * independently on the ordinary series path.
 */
import { PineTS, Provider } from '../src/index.ts';

const MUTATING = [
    '//@version=6',
    'indicator("field-history-values", overlay=true)',
    'type bar',
    '    int i',
    '    float c',
    'var bar b = bar.new(0, 0.0)',
    'b.c := close',
    'b.i := bar_index',
    'plot(b.c, "now")',
    'plot(b.c[1], "prev")',
    'plot(b.c[3], "prev3")',
    'plot(close[1], "ctrl1")',
    'plot(close[3], "ctrl3")',
].join('\n');

const PER_BAR = [
    '//@version=6',
    'indicator("field-history-perbar", overlay=true)',
    'type bar',
    '    int i',
    '    float c',
    'bar b = bar.new(bar_index, close)',
    'plot(b.c, "now")',
    'plot(b.c[1], "prev")',
    'plot(close[1], "ctrl1")',
].join('\n');

async function run(name, src, keys) {
    const engine = new PineTS(Provider.Mock, 'BTCUSDC', '60', null,
        Date.parse('2024-01-01'), Date.parse('2024-01-04'));
    const out = await engine.run(src);
    console.log('='.repeat(66));
    console.log(name);
    const series = (k) => {
        const node = out.plots[k];
        if (!node) return null;
        const d = node.data || [];
        return d.slice(4, 12).map((r) => {
            const v = r && typeof r === 'object' ? r.value : r;
            return v == null || Number.isNaN(v) ? 'na' : Number(v).toFixed(2);
        });
    };
    for (const k of keys) console.log(`  ${k.padEnd(7)} ${JSON.stringify(series(k))}`);
    // The verdict: prev must track ctrl1 (previous bar's close), not `now`.
    const prev = series('prev'), ctrl1 = series('ctrl1'), now = series('now');
    if (prev && ctrl1 && now) {
        const okCtrl = JSON.stringify(prev) === JSON.stringify(ctrl1);
        const okNotNow = JSON.stringify(prev) !== JSON.stringify(now);
        console.log(`  VERDICT prev==ctrl1: ${okCtrl} · prev!=now: ${okNotNow}`);
    }
}

await run('var instance, field mutated every bar', MUTATING, ['now', 'prev', 'prev3', 'ctrl1', 'ctrl3']);


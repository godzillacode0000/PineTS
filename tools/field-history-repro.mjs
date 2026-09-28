#!/usr/bin/env node
/**
 * Minimal repro: a history reference on a UDT FIELD whose index is a variable.
 *
 * money-flow-profile line 220 is `chart.point.from_index(b.i[rpLN], …)` — `b` is a UDT instance, `i` a
 * field, `rpLN` an input.int reassigned with `:=`. The engine emits
 *
 *     $.get($.let.glb1_b, rpLN).i          // field moved OUTSIDE the history read, index left bare
 *
 * instead of `$.get($.let.glb1_b.i, rpLN)`, so the run dies with `rpLN is not defined`.
 */
import { PineTS, Provider } from '../src/index.ts';

const CASES = {
    'field history, literal index': [
        '//@version=6',
        'indicator("field-history-lit")',
        'type bar',
        '    int i',
        '    float c',
        'var bar b = bar.new(bar_index, close)',
        'plot(b.c[1])',
    ].join('\n'),
    'field history, variable index': [
        '//@version=6',
        'indicator("field-history-var")',
        'type bar',
        '    int i',
        '    float c',
        'var bar b = bar.new(bar_index, close)',
        'n = input.int(5, minval = 1)',
        'plot(b.c[n])',
    ].join('\n'),
    'field history, reassigned index': [
        '//@version=6',
        'indicator("field-history-reassigned")',
        'type bar',
        '    int i',
        '    float c',
        'var bar b = bar.new(bar_index, close)',
        'n = input.int(200, minval = 10)',
        'n := last_bar_index > n ? n - 1 : last_bar_index',
        'plot(b.c[n])',
    ].join('\n'),
    'plain series, variable index (control)': [
        '//@version=6',
        'indicator("plain-history-var")',
        'n = input.int(5, minval = 1)',
        'plot(close[n])',
    ].join('\n'),
};

for (const [name, src] of Object.entries(CASES)) {
    const engine = new PineTS(Provider.Mock, 'BTCUSDC', '60', null,
        new Date('2024-01-01').getTime(), new Date('2024-01-05').getTime());
    try {
        const out = await engine.run(src);
        const series = Object.keys(out?.result ?? {}).length;
        console.log(`ok      ${name} (${series} series)`);
    } catch (e) {
        console.log(`THROW   ${name}`);
        console.log(`          ${String(e.message).split('\n')[0].slice(0, 110)}`);
    }
}

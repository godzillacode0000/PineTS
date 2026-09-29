#!/usr/bin/env node
/**
 * Print the generated JS for a few field-history shapes, so the fix is aimed at real output.
 *
 *   b.c        — a plain field read
 *   b.c[1]     — a field history read, literal index (works today)
 *   b.c[n]     — a field history read, variable index (dies: bare `n`)
 *   close[n]   — plain series history, variable index (control: works)
 */
import { transpile } from '../src/transpiler/index.ts';

const CASES = {
    'per-bar instance, field history': [
        '//@version=6',
        'indicator("f4")',
        'type bar',
        '    int i',
        '    float c',
        'bar b = bar.new(bar_index, close)',
        'plot(b.c[1])',
    ].join('\n'),
    'plain field read': [
        '//@version=6',
        'indicator("f0")',
        'type bar',
        '    int i',
        '    float c',
        'var bar b = bar.new(bar_index, close)',
        'plot(b.c)',
    ].join('\n'),
    'field history, literal index': [
        '//@version=6',
        'indicator("f1")',
        'type bar',
        '    int i',
        '    float c',
        'var bar b = bar.new(bar_index, close)',
        'plot(b.c[1])',
    ].join('\n'),
    'field history, variable index': [
        '//@version=6',
        'indicator("f2")',
        'type bar',
        '    int i',
        '    float c',
        'var bar b = bar.new(bar_index, close)',
        'n = input.int(5, minval = 1)',
        'plot(b.c[n])',
    ].join('\n'),
    'plain series, variable index': [
        '//@version=6',
        'indicator("f3")',
        'n = input.int(5, minval = 1)',
        'plot(close[n])',
    ].join('\n'),
};

for (const [name, src] of Object.entries(CASES)) {
    console.log('='.repeat(70));
    console.log(name);
    console.log('='.repeat(70));
    try {
        const fn = transpile(src, { debug: false });
        const body = fn.toString();
        for (const line of body.split('\n')) {
            if (/plot|get|param|init/.test(line)) console.log('   ' + line.trim());
        }
    } catch (e) {
        console.log('   THROW ' + String(e.message).split('\n')[0].slice(0, 140));
    }
}

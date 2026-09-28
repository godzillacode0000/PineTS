#!/usr/bin/env node
/**
 * Minimal repro: a variable whose name matches its User Defined Type.
 *
 * fibonacci-trailing-stop has `type fib` (line 41) and `var fib fib = fib.new(…)` (line 60) and dies
 * with `Identifier 'fib' has already been declared (38:4)` — the generated code declares the type and
 * the variable under the same name. Nothing here is exotic Pine: naming an instance after its type is
 * ordinary.
 */
import { PineTS, Provider } from '../src/index.ts';

const CASES = {
    'var named like its type': [
        '//@version=6',
        'indicator("udt-shadow")',
        'type fib',
        '    float p',
        'var fib fib = fib.new(1.0)',
        'plot(fib.p)',
    ].join('\n'),
    'type only (control)': [
        '//@version=6',
        'indicator("udt-only")',
        'type fib',
        '    float p',
        'var fib inst = fib.new(1.0)',
        'plot(inst.p)',
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
        console.log(`          ${String(e.message).split('\n')[0].slice(0, 120)}`);
    }
}

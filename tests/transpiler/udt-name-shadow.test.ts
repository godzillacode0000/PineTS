// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A UDT whose name a VARIABLE also uses — `type fib` + `var fib fib = fib.new(…)`.
 *
 * Valid Pine, invalid JS: Stage 1 emitted `const fib = Type({…})` and `var fib = fib.new(…)`, two
 * declarations of one identifier, and the run died at parse time with
 * `SyntaxError: Identifier 'fib' has already been declared` (measured on `fibonacci-trailing-stop`,
 * `open-interest-chart`, `support-resistance-classification-vr`).
 *
 * The fix moves the TYPE aside (`fib_$T<n>`), followed only by type references: the TypeDefinition
 * name, annotation strings, and `X.new(…)` call sites. Everything else keeps the variable's name —
 * `fib.p` is a FIELD read on the instance, and renaming that would read the type object instead
 * (measured: a draft that followed every `fib.` made `plot(fib.p)` print the type instead of the
 * field).
 */
import { describe, it, expect } from 'vitest';
import { PineTS } from '../../src/PineTS.class';
import { Provider } from '@pinets/marketData/Provider.class';

function engine() {
    return new PineTS(Provider.Mock, 'BTCUSDC', '60', null,
        new Date('2024-01-01').getTime(), new Date('2024-01-05').getTime());
}

const lastValue = (plots: any, key: string) => {
    const data = (plots[key] && plots[key].data) || [];
    const row = data[data.length - 1];
    return row && typeof row === 'object' ? row.value : row;
};

describe('a UDT name that collides with a variable name', () => {
    it('declares and runs (the crash case)', async () => {
        const { plots } = await engine().run(`
//@version=6
indicator("udt-shadow")
type fib
    float p
var fib fib = fib.new(1.0)
plot(fib.p, "p")
`);
        expect(lastValue(plots, 'p')).toBeCloseTo(1.0, 8);
    });

    it('a non-var instance of a self-named type runs too', async () => {
        const { plots } = await engine().run(`
//@version=6
indicator("udt-shadow-nonvar")
type fib
    float p
fib fib = fib.new(2.0)
plot(fib.p, "p")
`);
        expect(lastValue(plots, 'p')).toBeCloseTo(2.0, 8);
    });

    it('the VARIABLE keeps its name: a field write/read is not the type object', async () => {
        // A draft that followed every `fib.` renamed the field read as well and plotted the TYPE
        // object; the values below are the source's own expectation (`fib.p := close`).
        const { plots } = await engine().run(`
//@version=6
indicator("udt-shadow-values")
type fib
    float p
var fib fib = fib.new(0.0)
fib.p := close
plot(fib.p, "v")
plot(close, "c")
`);
        expect(lastValue(plots, 'v')).toBeCloseTo(lastValue(plots, 'c'), 8);
    });

    it('the TYPE is still usable as an annotation elsewhere', async () => {
        const { plots } = await engine().run(`
//@version=6
indicator("udt-shadow-annotation")
type fib
    float p
var fib fib = fib.new(3.0)
maker() =>
    fib inner = fib.new(4.0)
    inner
h = maker()
plot(h.p, "p")
`);
        expect(lastValue(plots, 'p')).toBeCloseTo(4.0, 8);
    });
});

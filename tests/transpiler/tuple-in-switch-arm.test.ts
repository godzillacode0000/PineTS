// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A tuple destructuring inside a `switch` arm lost its scope and its store, measured on
 * volume-bubbles-liquidity-heatmap (1 Oct). The arm is:
 *
 * ```pine
 *     TOP =>
 *         [x, y] = coordinates(anchorBar, anchorPrice, angle, radiusBar, radiusPrice)
 *         [chart.point.new(na,x,y), label.style_label_down]
 * ```
 *
 * Stage 1 emits that correctly (`case 'TOP': { let [x, y] = coords(...); return [...]; }`). The damage
 * is in Stage 2: the AnalysisPass splits the destructuring into `let temp_N = …; let x = …; let y = …`
 * and wraps them in its own block, and the statements of a switch arm are reached by a WALKER (the
 * implicit return's, or the declaration-init's when the switch is the value of a destructuring) rather
 * than by the normal statement pipeline. Those walkers visited identifiers and calls but never a
 * VariableDeclaration, so the split declarations kept their plain JS `let` form — inside a block —
 * while their READERS resolved through the context store:
 *
 * ```js
 *     let temp_1 = $.call(coordinates, "_fn0", …);   // written to a JS local in an inner block …
 *     let x = $.get($.let.temp_1, 0);                // … read from a store nothing ever wrote
 *     …
 *     return [chart.point.new($.get(na.__value, 0), x, y), label.style_label_down];   // x is out of scope
 * ```
 *
 * Both walkers now route a declaration to the standard lowering, so the arm's names live in the
 * context store with their scope prefix and the block is harmless.
 *
 * The reference is the Pine source: with `coords(p, q) => [p*2, q*3]` the arm's value is
 * `anchor*2 + price*3`.
 */
import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/transpiler/index';
import { PineTS } from '../../src/PineTS.class';
import { Provider } from '@pinets/marketData/Provider.class';

// The switch is the function's last statement → its implicit return (the IIFE walker).
const IMPLICIT_RETURN_SRC = `//@version=6
indicator("tuple-destructure-in-switch-arm")

coords(int p, float q) =>
    [p * 2, q * 3]

g(string which, int anchor, float price) =>
    switch which
        "TOP" =>
            [a, b] = coords(anchor, price)
            a + b
        =>
            0.0

plot(g("TOP", bar_index, close), "v")
plot(close, "close")
`;

// The switch is the VALUE of a destructuring → the declaration-init walker.
const DESTRUCTURED_SWITCH_SRC = `//@version=6
indicator("destructured-switch-in-function")

coords(int p, float q) =>
    [p * 2, q * 3]

pick(string which, int anchor, float price) =>
    [p, q] = switch which
        "TOP" =>
            [a, b] = coords(anchor, price)
            [a, b]
        =>
            [0.0, 0.0]
    p + q

plot(pick("TOP", bar_index, close), "w")
plot(close, "close")
`;

const values = (res: any, key: string) => (res?.plots?.[key]?.data ?? []).map((d: any) => d.value);

async function run(src: string) {
    const engine = new PineTS(
        Provider.Mock, 'BTCUSDC', '1h', null,
        new Date('2024-01-01').getTime(), new Date('2024-01-10').getTime()
    );
    return engine.run(src);
}

describe('a tuple destructuring inside a switch arm', () => {
    it('keeps the arm\'s names off a dangling store (implicit return)', () => {
        const js = transpile(IMPLICIT_RETURN_SRC, { debug: false }).toString();
        // The defect signature: a reader pointed at a store the split never wrote.
        expect(js).not.toMatch(/\$\.get\(\$\.let\.temp_\d+, \d\)/);
        // 0.11.0 no longer splits THIS shape into `$$.let.fnN_*` stores: the arm keeps a native
        // `let [a, b] =` fed by the tuple helper through the param hoist (`$.toTuple`), and its sum
        // reads those locals (`$.get(a, 0) + $.get(b, 0)`). That is upstream's own fix for this
        // class (its changelog: "tuple … inside a `switch` arm … scoped to the arm"); the runtime
        // half below still proves the arm computes the source's value. Patch 8's shapes — where a
        // user's own local collides with a SPLIT name — are guarded by
        // `tuple-element-name-collision.test.ts`, which upstream still fails.
        expect(js).toMatch(/\$\.toTuple\(coords\(anchor, price\), 2\)/);
        expect(js).toMatch(/\$\.get\(a, 0\) \+ \$\.get\(b, 0\)/);
    });

    it('runs, and the arm returns anchor*2 + price*3', async () => {
        const res: any = await run(IMPLICIT_RETURN_SRC);
        const v = values(res, 'v');
        const close = values(res, 'close');
        // Pre-fix the run threw `ReferenceError: a is not defined`.
        expect(v.length).toBeGreaterThan(0);
        const last = v[v.length - 1];
        const bars = close.length;
        expect(last).toBeCloseTo((bars - 1) * 2 + close[close.length - 1] * 3, 6);
    });

    it('lowers the split declarations when the switch is a destructuring value', () => {
        const js = transpile(DESTRUCTURED_SWITCH_SRC, { debug: false }).toString();
        expect(js).not.toMatch(/\$\.get\(\$\.let\.temp_\d+, \d\)/);
        expect(js).toMatch(/\$\$\.let\.fn\d+_temp_\d+ = \$\.init\(/);
    });

    it('runs, and the destructured value reaches the caller', async () => {
        const res: any = await run(DESTRUCTURED_SWITCH_SRC);
        const w = values(res, 'w');
        const close = values(res, 'close');
        expect(w.length).toBeGreaterThan(0);
        const bars = close.length;
        expect(w[w.length - 1]).toBeCloseTo((bars - 1) * 2 + close[close.length - 1] * 3, 6);
    });
});

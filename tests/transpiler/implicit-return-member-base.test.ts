/**
 * Two shapes of the same defect, both measured on the public Library (1 Oct 2026):
 *
 * 1. A method's IMPLICIT RETURN owns a `switch`, and its arm tests are comparisons full of member
 *    chains (market-structure-targets-model: `close > aZZ.y.get(iH) and aZZ.d.get(iH) == 1 and
 *    MSS.dir < 1`). The walker that transformed that return only transformed each MemberExpression
 *    NODE and never recursed into its object — unlike every other member visitor in
 *    StatementTransformer — so a non-computed field read on a user variable kept a BARE base
 *    identifier (`ReferenceError: MSS is not defined`), while the call chains beside it were scoped
 *    because transformCallExpression handles those on its own.
 *
 * 2. A RETURNED TUPLE carrying member reads (`return [[lastBar.buy, lastBar.sell]]`) hit a branch
 *    that called transformMemberExpression and returned the element untouched — no walker at all —
 *    so the base identifier stayed bare while the same variable one line above came out scoped.
 *
 * Both walkers now share one visitor set that scopes a chain's base (skipping context-bound
 * namespace objects). That is what took market-structure-targets-model and probability-grid from
 * `X is not defined` to running.
 */
import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/transpiler/index';
import { PineTS } from '../../src/PineTS.class';
import { Provider } from '@pinets/marketData/Provider.class';

const SWITCH_ARM_SRC = `//@version=6
indicator("implicit-return-member-base", overlay = true)

type ZZ
    array<float> y
    array<int>   d

type mss
    int dir

var mss MSS = mss.new(0)
var aZZ = ZZ.new(array.from(1.0, 2.0, 3.0), array.from(1, 1, 1))

method draw(int left, color col) =>
    iH = aZZ.d.get(2) == 1 ? 2 : 1
    switch
        close > aZZ.y.get(iH) and aZZ.d.get(iH) == 1 and MSS.dir < 1 =>
            MSS.dir := 1
            label.new(bar_index, high, "MSS")
        close < 0 =>
            label.new(bar_index, low, "no")
draw(1, color.red)
`;

const TUPLE_SRC = `//@version=6
indicator("returned-tuple-member-base")

type bucket
    float buy
    float sell

bucket mk() =>
    bucket lastBar = bucket.new(0.0, 0.0)
    lastBar.buy  += volume
    lastBar.sell += volume
    [lastBar.buy, lastBar.sell]

[b, s] = mk()
plot(b, "buy")
plot(s, "sell")
`;

describe('a member read inside a method implicit-return switch arm', () => {
    it('scopes the base identifier of a non-computed field read', () => {
        const js = transpile(SWITCH_ARM_SRC, { debug: false }).toString();
        // The defect signature: the raw identifier as the base of the field read.
        expect(/(^|[^.\w$])MSS\.dir/.test(js)).toBe(false);
        // And the base is the scoped persistent reference, the same one the assignment path emits.
        expect(js).toMatch(/initVar\(\$\.var\.glb1_MSS/);
    });

    it('runs the arm at runtime — the label the arm draws exists', async () => {
        const engine = new PineTS(
            Provider.Mock, 'BTCUSDC', '1h', null,
            new Date('2024-01-01').getTime(), new Date('2024-06-01').getTime()
        );
        const res: any = await engine.run(SWITCH_ARM_SRC);
        const labels = res?.plots?.__labels__?.data;
        const last = labels && labels.length ? labels[labels.length - 1] : null;
        const items = last && Array.isArray(last.value) ? last.value : [];
        // The bullish arm needs close above the 2-bar pivot high with the flags set; over six months
        // of hourly bars it fires at least once. With a bare base the run throws before any label.
        expect(items.length).toBeGreaterThan(0);
    });
});

describe('a member read inside a returned tuple', () => {
    it('scopes the base identifier of a tuple member chain', () => {
        const js = transpile(TUPLE_SRC, { debug: false }).toString();
        expect(/(^|[^.\w$])lastBar\.(buy|sell)/.test(js)).toBe(false);
        // A function-local typed declaration is scoped as a function-local `let`, not a global var.
        expect(js).toMatch(/\$\$\.let\.fn1_lastBar/);
    });

    it('runs the tuple-returning function over the bars', async () => {
        const engine = new PineTS(
            Provider.Mock, 'BTCUSDC', '1h', null,
            new Date('2024-01-01').getTime(), new Date('2024-02-01').getTime()
        );
        const res: any = await engine.run(TUPLE_SRC);
        const series = res?.plots?.buy?.data;
        const last = series && series.length ? series[series.length - 1].value : null;
        // A bare base identifier would have thrown; a scoped one accumulates real volume.
        expect(typeof last).toBe('number');
        expect(last).toBeGreaterThan(0);
    });
});

/**
 * Two operands that no walker ever descended into, both measured on the public Library (1 Oct):
 *
 * 1. `high[nId[1]]` — the INDEX of a history read is itself a member read. The array-access branch
 *    of the argument lowerer handled an Identifier index and a binary/unary/logical/conditional one,
 *    and fell through to "use the node untouched" for everything else — so nothing scoped the base of
 *    `nId[1]`: ict-concepts died with `ReferenceError: bsNOTbodyUP is not defined` on its
 *    `lwst = math.min(lPh[bsNOTbodyUP[1]], low[bsNOTbodyUP[1]])`.
 *
 * 2. `array.first(timeCycles).firstBarIndex` — a member chain whose OBJECT is a call. Its arguments
 *    live inside the call, and the walker visitor in the operand path replaces the base descent (it
 *    transforms the call and never recurses), so the argument stayed bare:
 *    `ReferenceError: timeCycles is not defined` (ichimoku-theories,
 *    `lowest := ta.lowest(bar_index - array.first(timeCycles).firstBarIndex) - atr200`).
 *
 * The reference in both cases is the Pine source itself: with `nId = 1`, `high[nId[1]]` IS `high[1]`;
 * and the `.firstBarIndex` read must be the field of the pushed object.
 */
import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/transpiler/index';
import { PineTS } from '../../src/PineTS.class';
import { Provider } from '@pinets/marketData/Provider.class';

const INDEX_SRC = `//@version=6
indicator("index-expression-member")
nId = 1
lw = math.min(high[nId[1]], low[nId[1]])
ctrl = math.min(high[1], low[1])
plot(lw, "lw")
plot(ctrl, "ctrl")
`;

const CALL_OBJECT_SRC = `//@version=6
indicator("member-object-call-args")

type cycle
    int firstBarIndex

var array<cycle> cycles = array.new<cycle>()
if bar_index == 5
    cycles.push(cycle.new(5))

expr = math.max(bar_index - array.first(cycles).firstBarIndex, 0)
ctrl = math.max(bar_index - 5, 0)
plot(expr, "expr")
plot(ctrl, "ctrl")
`;

const values = (res: any, key: string) => (res?.plots?.[key]?.data ?? []).map((d: any) => d.value);

describe('an index that is itself a member read', () => {
    it('scopes the base identifier of the index', () => {
        const js = transpile(INDEX_SRC, { debug: false }).toString();
        expect(/(^|[^.\w$])nId\[/.test(js)).toBe(false);
        expect(js).toMatch(/math\.param\(high, \$\.get\([^)]*glb1_nId/);
    });

    it('reads the same series as the plain history read it stands for', async () => {
        const engine = new PineTS(
            Provider.Mock, 'BTCUSDC', '1h', null,
            new Date('2024-01-01').getTime(), new Date('2024-01-10').getTime()
        );
        const res: any = await engine.run(INDEX_SRC);
        const lw = values(res, 'lw');
        const ctrl = values(res, 'ctrl');
        // Pre-fix the run threw `nId is not defined` before producing any series.
        expect(lw.length).toBeGreaterThan(0);
        // Bar 0 has no history to index with (`nId[1]` is na there) and the param machinery answers
        // with the current value instead of na; from bar 1 on the read IS `high[1]`/`low[1]`, so the
        // non-na runs must match value for value.
        const nonNa = (a: any[]) => a.filter((v) => !Number.isNaN(v));
        const L = nonNa(lw);
        const C = nonNa(ctrl);
        expect(L.length).toBeGreaterThan(1);
        expect(L.slice(1)).toEqual(C);
    });
});

describe('a member chain whose object is a call', () => {
    it('scopes the identifier inside the call arguments', () => {
        const js = transpile(CALL_OBJECT_SRC, { debug: false }).toString();
        // No bare `cycles` outside string literals (the emitter writes a `__pineTypedVar:` marker).
        expect(/(^|[^.\w$])cycles/.test(js.replace(/"[^"]*"/g, '""'))).toBe(false);
        // The argument arrives at the call as a scoped param hoisted for it.
        expect(js).toMatch(/array\.param\(\$\.var\.glb1_cycles/);
    });

    it('runs, and the field read reaches the pushed object', async () => {
        const engine = new PineTS(
            Provider.Mock, 'BTCUSDC', '1h', null,
            new Date('2024-01-01').getTime(), new Date('2024-01-10').getTime()
        );
        const res: any = await engine.run(CALL_OBJECT_SRC);
        const expr = values(res, 'expr');
        // Pre-fix the run threw `cycles is not defined`.
        expect(expr.length).toBeGreaterThan(0);
        // The array is empty for the first five bars (nothing to read → na), then `bar_index - 5`,
        // clamped at 0 — exactly what the source says.
        expect(expr.slice(0, 5).every((v: any) => Number.isNaN(v))).toBe(true);
        const tail = expr.slice(5);
        expect(tail).toEqual(Array.from({ length: tail.length }, (_v, i) => i));
    });
});

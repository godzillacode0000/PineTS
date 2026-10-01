// SPDX-License-Identifier: AGPL-3.0-only

/**
 * A comparison operand that is a member chain ENDING in a UDT field.
 *
 * `if pivot == get_v.get(1).y` used to emit the right operand RAW —
 * `$.pine.math.__eq($.get($.let.glb1_pivot, 0), get_v.get(1).y)` — because `transformExpression`'s
 * MemberExpression visitor descended only into Identifier objects, so the base of a chain whose object
 * is itself a member call (`get_v.get(1)`) was never visited. The run died with
 * `ReferenceError: get_v is not defined`, which is one of the largest failure classes in the Library
 * (14 scripts: `get_v` ×3, `highs`, `get`, `MSS`, `lastBar`, `pivH`, `timeCycles`, …).
 *
 * The same chain in an assignment RHS or a call argument was scoped correctly — those go through other
 * paths — so this file pins the comparison shape specifically, and pins BOTH outcomes (true and false)
 * so a future "fix" that only stops the crash but rewrites the comparison is caught.
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

const TYPES = `
type SWING
    float x
    float y
type vector
    array<SWING> v
`;

describe('a comparison with a UDT-field member chain', () => {
    it('runs, and the comparison is actually evaluated (false branch)', async () => {
        const { plots } = await engine().run(`
//@version=6
indicator("cmp-chain-false")
${TYPES}
get_v = array.from(SWING.new(1.0, 2.0), SWING.new(3.0, 4.0))
pivot = get_v.get(0).y
flag = 0.0
if pivot == get_v.get(1).y
    flag := 1.0
plot(pivot, "pivot")
plot(flag, "flag")
`);
        expect(lastValue(plots, 'pivot')).toBeCloseTo(2.0, 8);
        expect(lastValue(plots, 'flag')).toBeCloseTo(0.0, 8);
    });

    it('runs, and the comparison is actually evaluated (true branch)', async () => {
        const { plots } = await engine().run(`
//@version=6
indicator("cmp-chain-true")
${TYPES}
get_v = array.from(SWING.new(1.0, 2.0), SWING.new(3.0, 4.0))
pivot = get_v.get(0).y
flag = 0.0
if pivot == get_v.get(0).y
    flag := 1.0
plot(flag, "flag")
`);
        expect(lastValue(plots, 'flag')).toBeCloseTo(1.0, 8);
    });

    it('the same shape inside a `method` with the chain as a call argument still works', async () => {
        // The Library shape (`pure-price-action-ict-tools`): the comparison decides whether the
        // element is pushed back into the receiver's field array.
        const { plots } = await engine().run(`
//@version=6
indicator("cmp-chain-method")
${TYPES}
method f(array<vector> id, mode, depth) =>
    for i = 0 to depth - 1
        get_v = id.get(i).v
        if get_v.size() == 2
            pivot = get_v.get(0).y
            if pivot == get_v.get(1).y
                id.get(i).v.unshift(get_v.get(1))
    na
f(array.from(vector.new(array.from(SWING.new(1.0, 4.0), SWING.new(3.0, 4.0)))), 'bull', 1)
plot(close, "tick")
`);
        // The verdict here is only "the run did not throw" — the plotted series is the control.
        expect(lastValue(plots, 'tick')).toBeGreaterThan(0);
    });
});

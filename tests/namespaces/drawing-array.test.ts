// SPDX-License-Identifier: AGPL-3.0-only

/**
 * `<drawing>.all` is a Pine array.
 *
 * Pine documents `polyline.all` (and `line.all`, `label.all`, `box.all`, `linefill.all`) as
 * `array<T>`, and the Library scripts use it as one — `array.size(a)`, `a.get(i)`, `a.size()`.
 * Two defects lived here, both measured on `money-flow-profile` (which died on the operator's chart
 * with `Cannot read properties of undefined (reading 'size')`):
 *
 *  1. the value was a plain `T[]`, so the `array.*` wrappers (which read `id.array`) threw on it;
 *  2. `$.init` treated the array as time-series DATA and stored its last element — `undefined` on an
 *     empty chart, so even a tolerant reader would have received nothing.
 *
 * `DrawingArray` is both an Array (every native consumer unchanged) and a Pine array (the methods the
 * scripts call directly, plus `.array` = itself for the wrappers).
 */
import { describe, it, expect } from 'vitest';
import { PineTS } from '../../src/PineTS.class';
import { Provider } from '@pinets/marketData/Provider.class';

function engine() {
    return new PineTS(Provider.Mock, 'BTCUSDC', '60', null,
        new Date('2024-01-01').getTime(), new Date('2024-01-03').getTime());
}

const lastValue = (plots: any, key: string) => {
    const data = (plots[key] && plots[key].data) || [];
    const row = data[data.length - 1];
    return row && typeof row === 'object' ? row.value : row;
};

describe('<drawing>.all as a Pine array', () => {
    it('an EMPTY .all answers size 0 instead of throwing', async () => {
        const { plots } = await engine().run(`
//@version=6
indicator("all-empty")
a = polyline.all
plot(array.size(a), "n")
plot(line.all.size(), "ln")
`);
        expect(lastValue(plots, 'n')).toBe(0);
        expect(lastValue(plots, 'ln')).toBe(0);
    });

    it('counts what was drawn, and a.get(i) reaches the objects', async () => {
        const { plots } = await engine().run(`
//@version=6
indicator("all-drawn", max_polylines_count=20, max_lines_count=20)
if barstate.islast
    polyline.new(array.from(chart.point.from_index(0, close), chart.point.from_index(1, close)), true)
    polyline.new(array.from(chart.point.from_index(2, close), chart.point.from_index(3, close)), true)
    line.new(0, close, 1, close)
a = polyline.all
plot(array.size(a), "n")
plot(a.size(), "n2")
plot(array.size(line.all), "ln")
`);
        expect(lastValue(plots, 'n')).toBe(2);
        expect(lastValue(plots, 'n2')).toBe(2);
        expect(lastValue(plots, 'ln')).toBe(1);
    });

    it('the Library idiom: count, walk with get(i), delete each', async () => {
        // money-flow-profile's own loop shape (lines 179-182 of the source).
        const { plots } = await engine().run(`
//@version=6
indicator("all-walk", max_polylines_count=20)
if barstate.islast
    polyline.new(array.from(chart.point.from_index(0, close), chart.point.from_index(1, close)), true)
    polyline.new(array.from(chart.point.from_index(2, close), chart.point.from_index(3, close)), true)
a = polyline.all
if array.size(a) > 0
    for i = 0 to array.size(a) - 1
        polyline.delete(a.get(i))
plot(array.size(polyline.all), "left")
`);
        // Every polyline was deleted, so the list is empty again — and the loop did not throw.
        expect(lastValue(plots, 'left')).toBe(0);
    });
});

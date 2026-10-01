// SPDX-License-Identifier: AGPL-3.0-only
/**
 * `<drawing>.all` must be a Pine array, not a bare JS array.
 *
 * TradingView documents `polyline.all` (and `line.all`, `label.all`, `box.all`) as `array<T>`, and
 * `array.size(polyline.all)` is the documented way to count what is on the chart. Today these getters
 * return a plain `T[]`, so:
 *
 *   array.size(polyline.all)   →  "r.size is not a function"
 *   polyline.all.size()        →  "polyline.all.size is not a function"
 *
 * Reproduced from LuxAlgo Library indicators: `money-flow-profile` and `delta-flow-profile` both die
 * with `Cannot read properties of undefined (reading 'size')` at their first `array.size(<drawing>.all)`
 * call. `for x in polyline.all` DOES work, which is what kept the mismatch invisible.
 */
import { describe, it, expect } from 'vitest';
import { PineTS } from '../../src/PineTS.class';
import { Provider } from '@pinets/marketData/Provider.class';

const START = new Date('2024-01-01').getTime();
const END = new Date('2024-03-01').getTime();

/** Pine indentation is significant and must be exactly one level per block, so keep it out of
 *  TypeScript's own indentation by assembling lines explicitly. */
function pine(...lines: string[]): string {
    return ['//@version=6', 'indicator("all")', ...lines].join('\n');
}

async function run(source: string) {
    return new PineTS(Provider.Mock, 'BTCUSDC', '60', null, START, END).run(source);
}

describe('<drawing>.all is a Pine array', () => {
    it('array.size(polyline.all) counts the polylines on the chart', async () => {
        const { plots } = await run(pine(
            'if barstate.islast',
            '    pl = polyline.new(array.from(chart.point.from_index(0, close)), true)',
            '    plot(array.size(polyline.all), "n")',
        ));
        const n = plots['n'].data[plots['n'].data.length - 1].value;
        expect(n).toBe(1);
    });

    it('polyline.all.size() works too', async () => {
        const { plots } = await run(pine(
            'if barstate.islast',
            '    pl = polyline.new(array.from(chart.point.from_index(0, close)), true)',
            '    plot(polyline.all.size(), "n")',
        ));
        const n = plots['n'].data[plots['n'].data.length - 1].value;
        expect(n).toBe(1);
    });

    it('line.all / label.all / box.all are Pine arrays as well', async () => {
        const { plots } = await run(pine(
            'if barstate.islast',
            '    ln = line.new(bar_index - 1, low, bar_index, high)',
            '    lb = label.new(bar_index, high, "x")',
            '    bx = box.new(bar_index - 1, high, bar_index, low)',
            '    plot(array.size(line.all) + array.size(label.all) + array.size(box.all), "n")',
        ));
        const n = plots['n'].data[plots['n'].data.length - 1].value;
        expect(n).toBe(3);
    });

    it('iteration still works, and a deleted drawing leaves the array', async () => {
        const { plots } = await run(pine(
            'if barstate.islast',
            '    a = polyline.new(array.from(chart.point.from_index(0, close), chart.point.from_index(1, close)), true)',
            '    b = polyline.new(array.from(chart.point.from_index(2, close), chart.point.from_index(3, close)), true)',
            '    int seen = 0',
            '    for pl in polyline.all',
            '        seen += 1',
            '    polyline.delete(a)',
            '    plot(seen * 100 + array.size(polyline.all), "n")',
        ));
        const n = plots['n'].data[plots['n'].data.length - 1].value;
        expect(n).toBe(201);          // 2 seen while iterating, 1 left after the delete
    });
});

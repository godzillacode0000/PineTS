#!/usr/bin/env node
/**
 * Hypothesis for the `X is not defined` class (rpLN, highs, get, get_v across ~7 indicators):
 * a variable used as a HISTORY INDEX is left bare when the analyzer marked it context-bound.
 *
 * Evidence: money-flow-profile emits `$.get($.let.glb1_b, rpLN).i` — bare `rpLN` — from Pine
 * `b.i[rpLN]`, where rpLN comes from `input.int(...)`. Meanwhile `transformArrayIndex` only rewrites
 * an index when `!scopeManager.isContextBound(name)`, so a context-bound index is skipped entirely.
 *
 * If `close[n]` with `n = input.int(20)` throws `n is not defined`, that is the whole class in one line.
 */
import { PineTS } from '../src/PineTS.class.ts';
import { Provider } from '../src/marketData/Provider.class.ts';

const START = new Date('2024-01-01').getTime();
const END = new Date('2024-03-01').getTime();

function pine(...lines) {
  return ['//@version=6', 'indicator("idx")', ...lines].join('\n');
}

const CASES = {
  'A: input.int value used as a history index': pine(
    'n = input.int(20, "len")',
    'plot(close[n])',
  ),
  'B: plain variable used as a history index': pine(
    'n = 20',
    'plot(close[n])',
  ),
  'C: input.int value used as an index inside a loop': pine(
    'n = input.int(20, "len")',
    'total = 0.0',
    'for i = 0 to 2',
    '    total := total + close[n + i]',
    'plot(total)',
  ),
  'D: input.int value used as an index on a member (UDT/object)': pine(
    'n = input.int(20, "len")',
    'pt = chart.point.from_index(bar_index, close)',
    'plot(pt.index > 0 ? 1 : 0)',
  ),
  'E: control — the input value used plainly, not as an index': pine(
    'n = input.int(20, "len")',
    'plot(ta.sma(close, n))',
  ),
};

for (const [name, src] of Object.entries(CASES)) {
  try {
    await new PineTS(Provider.Mock, 'BTCUSDC', '60', null, START, END).run(src);
    console.log(`ok      ${name}`);
  } catch (err) {
    console.log(`THROW   ${name}\n          ${String((err && err.message) || err).slice(0, 120)}`);
  }
}

#!/usr/bin/env node
/**
 * Session-probe reproduction (offline, repo source).
 *
 * Four claims to settle, all measured on the live chart 28 Sep but never reproduced offline:
 *   A. `time(period, "0000-2400", tz)` throws "Invalid session specification" (TradingView accepts it)
 *   B. NY 0800-1700 inline at top level -> ~183 matching bars
 *   C. the same string passed as a user-function argument -> 18
 *   D. a 24-hour session counted one per bar -> 800 matches over 500 bars
 */
import { PineTS, Provider } from '../src/index.ts';

const START = new Date('2024-01-01').getTime();
const END = new Date('2024-02-01').getTime();

async function probe(name, lines) {
  const src = lines.join('\n');
  const engine = new PineTS(Provider.Mock, 'BTCUSDC', '60', null, START, END);
  try {
    const out = await engine.run(src);
    const plots = (out && out.plots) || {};
    const node = plots['cnt'] || plots['bars'];
    const rows = node && Array.isArray(node.data) ? node.data : [];
    const last = rows.length ? rows[rows.length - 1] : null;
    const v = last && typeof last === 'object' ? last.value : last;
    console.log(`--- ${name}`);
    console.log(`    rows=${rows.length}  last=${JSON.stringify(v)}`);
  } catch (e) {
    console.log(`--- ${name}`);
    console.log(`    THREW: ${String(e.message).split('\n')[0].slice(0, 150)}`);
  }
}

const totalBars = [
  '//@version=6',
  'indicator("bars")',
  'plot(bar_index + 1, "bars")',
];

const inlineNY = [
  '//@version=6',
  'indicator("inline")',
  'var int cnt = 0',
  'if not na(time(timeframe.period, "0800-1700", "America/New_York"))',
  '    cnt := cnt + 1',
  'plot(cnt, "cnt")',
];

const fnNY = [
  '//@version=6',
  'indicator("fn")',
  'inSession(sess) =>',
  '    not na(time(timeframe.period, sess, "America/New_York"))',
  'var int cnt = 0',
  'if inSession("0800-1700")',
  '    cnt := cnt + 1',
  'plot(cnt, "cnt")',
];

const wholeDay = [
  '//@version=6',
  'indicator("allday")',
  'var int cnt = 0',
  'if not na(time(timeframe.period, "0000-2400", "America/New_York"))',
  '    cnt := cnt + 1',
  'plot(cnt, "cnt")',
];

const day24 = [
  '//@version=6',
  'indicator("24h")',
  'var int cnt = 0',
  'if not na(time(timeframe.period, "0000-0000", "America/New_York"))',
  '    cnt := cnt + 1',
  'plot(cnt, "cnt")',
];

await probe('total bars', totalBars);
await probe('A  inline NY 0800-1700', inlineNY);
await probe('B  function NY 0800-1700', fnNY);
await probe('C  whole-day 0000-2400', wholeDay);
await probe('D  24h 0000-0000', day24);

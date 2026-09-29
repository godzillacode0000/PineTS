#!/usr/bin/env node
/**
 * Session-probe 2 — faithful shapes. The first pass showed inline == function (both 279) and only the
 * whole-day throw reproduced. Before calling the other two "not reproduced", run the EXACT shape the
 * AMD POC script uses: TIMEZONE as a global const, the helper as `inSession(sess) => not na(time(…))`,
 * an OR-chain gate, and 30-minute bars ~500 like the live chart.
 */
import { PineTS, Provider } from '../src/index.ts';

const START = new Date('2024-01-01').getTime();
const END = new Date('2024-01-11').getTime();

async function probe(name, lines, tf = '60') {
  const src = lines.join('\n');
  const engine = new PineTS(Provider.Mock, 'BTCUSDC', tf, null, START, END);
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

await probe('T  total bars (60m)', [
  '//@version=6',
  'indicator("bars")',
  'plot(bar_index + 1, "bars")',
]);

await probe('A  inline NY (60m)', [
  '//@version=6',
  'indicator("inline")',
  'var int cnt = 0',
  'if not na(time(timeframe.period, "0800-1700", "America/New_York"))',
  '    cnt := cnt + 1',
  'plot(cnt, "cnt")',
]);

await probe('B  helper NY + global TZ (60m) — AMD POC shape', [
  '//@version=6',
  'indicator("fn")',
  'string TIMEZONE = "America/New_York"',
  'inSession(sess) =>',
  '    not na(time(timeframe.period, sess, TIMEZONE))',
  'var int cnt = 0',
  'if inSession("0800-1700")',
  '    cnt := cnt + 1',
  'plot(cnt, "cnt")',
]);

await probe('C  OR-chain gate, only NY on (60m)', [
  '//@version=6',
  'indicator("amd")',
  'string TIMEZONE = "America/New_York"',
  'inSession(sess) =>',
  '    not na(time(timeframe.period, sess, TIMEZONE))',
  'useSydney = input.bool(false, "sydney")',
  'useTokyo = input.bool(false, "tokyo")',
  'useLondon = input.bool(false, "london")',
  'useNY = input.bool(true, "ny")',
  'isInAnySession = (useSydney and inSession("1700-0200")) or (useTokyo and inSession("1900-0400")) or (useLondon and inSession("0300-1200")) or (useNY and inSession("0800-1700"))',
  'var int cnt = 0',
  'if isInAnySession',
  '    cnt := cnt + 1',
  'plot(cnt, "cnt")',
]);

await probe('D  24h "0000-0000" count (60m)', [
  '//@version=6',
  'indicator("24h")',
  'var int cnt = 0',
  'if not na(time(timeframe.period, "0000-0000", "America/New_York"))',
  '    cnt := cnt + 1',
  'plot(cnt, "cnt")',
]);

await probe('E  24x7 count (60m)', [
  '//@version=6',
  'indicator("24x7")',
  'var int cnt = 0',
  'if not na(time(timeframe.period, "24x7", "America/New_York"))',
  '    cnt := cnt + 1',
  'plot(cnt, "cnt")',
]);

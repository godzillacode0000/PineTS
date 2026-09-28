#!/usr/bin/env node
/**
 * Does the REPO (HEAD of LuxAlgo/PineTS) still fail on the indicators that fail on 0.10.0?
 *
 * The generated line I inspected came from the repo's own transpiler, while the chart runs the
 * published 0.10.0 bundle — two different codebases. If HEAD passes, the finding for upstream is not
 * "please fix" but "we were on an old version", and the fix for the chart is an upgrade.
 */
import { PineTS } from '../src/index.ts';
import fs from 'node:fs';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
console.log(`repo version: ${pkg.version}\n`);

function bars(n) {
  const out = [];
  const start = Date.parse('2026-01-01T00:00:00Z');
  let p = 84000;
  for (let i = 0; i < n; i += 1) {
    p += Math.sin(i / 7) * 40 + (i % 3) * 5;
    out.push({ openTime: start + i * 1800000, closeTime: start + (i + 1) * 1800000,
      open: p - 10, high: p + 25, low: p - 30, close: p, volume: 12 + (i % 9) });
  }
  return out;
}

const arr = bars(500);
arr.getSymbolInfo = () => Promise.resolve({
  ticker: 'BTCUSDT', tickerid: 'BINANCE:BTCUSDT', prefix: 'BINANCE', root: 'BTC',
  description: 'BTC / USDT', type: 'crypto', basecurrency: 'BTC', currency: 'USDT',
  timezone: 'UTC', mintick: 0.01, pricescale: 100, session: '24x7', volumetype: 'base' });

const SLUGS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['money-flow-profile', 'delta-flow-profile', 'delta-zigzag', 'breakouts-with-tests-retests',
     'breakout-detector-previous-mtf-high-low-levels', 'correlation-clusters'];

for (const slug of SLUGS) {
  const src = fs.readFileSync(`/home/godzillaton/.hermes/cache/scratch/compat/src/${slug}.pine`, 'utf8');
  const t0 = Date.now();
  try {
    const engine = new PineTS(arr, 'BTCUSDT', '30', 500);
    await engine.run(src);
    console.log(`ok      ${slug} (${Date.now() - t0} ms)`);
  } catch (err) {
    console.log(`THROW   ${slug}\n          ${String((err && err.message) || err).slice(0, 120)}`);
  }
}

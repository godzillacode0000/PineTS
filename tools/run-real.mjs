#!/usr/bin/env node
/**
 * Run one Library source against REAL Binance bars (the same feed the chart shows), so a failure the
 * mock frame never reaches can be reproduced and iterated on offline.
 *
 *   npx tsx tools/run-real.mjs <slug> [symbol] [interval]
 */
import fs from 'node:fs';
import { PineTS } from '../src/PineTS.class.ts';
import { Provider } from '../src/marketData/Provider.class.ts';

const slug = process.argv[2];
const symbol = process.argv[3] || 'BTCUSDT';
const interval = process.argv[4] || '60';
const src = fs.readFileSync(`/home/godzillaton/.hermes/cache/scratch/compat/src/${slug}.pine`, 'utf8');

// ~500 bars back from now — the chart's own window shape.
const to = Date.now();
const from = to - 500 * Number(interval) * 60 * 1000;

const engine = new PineTS(Provider.Binance, symbol, interval, null, from, to);
try {
    const out = await engine.run(src);
    const keys = Object.keys(out.plots || {});
    console.log(`OK   ${slug} — plots: ${keys.filter((k) => !k.startsWith('__')).length}, containers: ${keys.filter((k) => k.startsWith('__')).join(',') || 'none'}`);
} catch (e) {
    console.log(`FAIL ${slug} — ${String(e.message).split('\n')[0].slice(0, 200)}`);
    if (process.env.STACK) console.log(e.stack.split('\n').slice(1, 8).join('\n'));
}

#!/usr/bin/env node
/**
 * Run a list of Library sources through the engine and report one verdict per script.
 *
 *   npx tsx tools/library-sweep.mjs <slugs.txt> [srcdir] [out.jsonl]
 *
 * The verdict is the RUN, not a static classification: `ok` (no throw) or the first line of the
 * error. 500 bars of mock data at 60m, BTCUSDT — the same frame the "which indicators do not run"
 * list was measured on, so the two line up.
 */
import fs from 'node:fs';
import path from 'node:path';
import { PineTS } from '../src/PineTS.class.ts';
import { Provider } from '../src/marketData/Provider.class.ts';

const slugsFile = process.argv[2];
const srcDir = process.argv[3] || '/home/godzillaton/.hermes/cache/scratch/compat/src';
const outFile = process.argv[4] || '/home/godzillaton/.hermes/cache/scratch/library-sweep-after.jsonl';

const slugs = fs.readFileSync(slugsFile, 'utf8').split('\n').map((s) => s.trim()).filter(Boolean);
const rows = [];
let ok = 0;
let skip = 0;

for (const slug of slugs) {
    const file = path.join(srcDir, `${slug}.pine`);
    if (!fs.existsSync(file)) {
        rows.push({ slug, verdict: 'no_source' });
        skip += 1;
        continue;
    }
    const src = fs.readFileSync(file, 'utf8');
    const engine = new PineTS(Provider.Mock, 'BTCUSDT', '60', null,
        Date.parse('2024-01-01'), Date.parse('2024-01-22'));
    try {
        await engine.run(src);
        rows.push({ slug, verdict: 'ok' });
        ok += 1;
    } catch (e) {
        rows.push({ slug, verdict: 'fail', error: String(e.message).split('\n')[0].slice(0, 160) });
    }
}

fs.writeFileSync(outFile, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`swept ${slugs.length}: ok=${ok} fail=${rows.length - ok - skip} no_source=${skip}`);
console.log(`written ${outFile}`);
for (const r of rows.filter((r) => r.verdict !== 'ok')) console.log(`  ${r.verdict}  ${r.slug}${r.error ? ' — ' + r.error : ''}`);

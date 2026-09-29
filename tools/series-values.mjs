import fs from 'node:fs';
import { PineTS, Provider } from '../src/index.ts';
const src = fs.readFileSync('/home/godzillaton/.hermes/cache/scratch/compat/src/bid-ask-imbalance.pine','utf8');
const engine = new PineTS(Provider.Mock, 'BTCUSDC', '60', null, new Date('2024-01-01').getTime(), new Date('2024-03-01').getTime());
const out = await engine.run(src);
for (const [k, n] of Object.entries(out.plots || {})) {
    if (k.startsWith('__')) continue;
    const arr = n && Array.isArray(n.data) ? n.data : [];
    const vals = arr.map(r => (typeof r === 'number' ? r : (r && r.value))).filter(v => typeof v === 'number' && isFinite(v));
    if (!vals.length) { console.log(`  ${k}: (takde nilai)`); continue; }
    console.log(`  ${k}: min=${Math.min(...vals).toFixed(4)} max=${Math.max(...vals).toFixed(4)} n=${vals.length}`);
}

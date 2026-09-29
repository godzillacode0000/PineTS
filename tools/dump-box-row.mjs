import fs from 'node:fs';
import { PineTS, Provider } from '../src/index.ts';
const slug = process.argv[2] || 'abcd';
const src = fs.readFileSync(`/home/godzillaton/.hermes/cache/scratch/compat/src/${slug}.pine`, 'utf8');
const engine = new PineTS(Provider.Mock, 'BTCUSDC', '60', null,
    new Date('2024-01-01').getTime(), new Date('2024-03-01').getTime());
const out = await engine.run(src);
const c = out.plots['__boxes__'];
console.log('container keys:', Object.keys(c).join(', '));
console.log('data rows:', c.data.length);
const row = c.data[0];
console.log('row keys:', Object.keys(row).join(', '));
for (const k of Object.keys(row)) {
    const v = row[k];
    const t = Array.isArray(v) ? `array(${v.length})` : typeof v;
    let sample = '';
    if (Array.isArray(v) && v.length) sample = ' first=' + JSON.stringify(v[0]).slice(0, 220);
    else if (v && typeof v === 'object') sample = ' ' + JSON.stringify(v).slice(0, 160);
    else sample = ' = ' + String(v).slice(0, 80);
    console.log(`  ${k}: ${t}${sample}`);
}

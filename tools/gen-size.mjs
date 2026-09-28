import { transpile } from '../src/transpiler/index.ts';
const src = ['//@version=6','indicator("all")','if barstate.islast','    pl = polyline.new(array.from(chart.point.from_index(0, close)), true)','    plot(array.size(polyline.all), "n")'].join('\n');
const code = transpile(src, { debug: true }).toString().split('\n');
code.forEach((l, i) => { if (/size|polyline\.all/.test(l)) console.log(`[${i}] ${l.trim().slice(0, 160)}`); });

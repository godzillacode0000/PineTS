import { PineTS } from '../src/PineTS.class.ts';
import { Provider } from '../src/marketData/Provider.class.ts';

const code = `//@version=6
indicator("poly", overlay=true, max_polylines_count=100)
if barstate.islast
    array<chart.point> pts = array.new<chart.point>(0)
    array.push(pts, chart.point.from_index(10, 100))
    array.push(pts, chart.point.from_index(20, 110))
    array.push(pts, chart.point.from_index(20, 90))
    polyline.new(pts, curved=false, closed=true, xloc=xloc.bar_index, line_color=color.blue, fill_color=color.new(color.blue, 70), line_width=2, force_overlay=true)
`;
const pineTS = new PineTS(Provider.Mock, 'BTCUSDC', '60', null, Date.parse('2024-01-01'), Date.parse('2024-01-20'));
const out = await pineTS.run(code);
const node = out.plots['__polylines__'];
console.log('keys', Object.keys(out.plots));
console.log('data0', JSON.stringify(node?.data?.[0], null, 2)?.slice(0, 1200));

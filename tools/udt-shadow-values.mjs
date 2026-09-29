import { PineTS } from '../src/PineTS.class.ts';
import { Provider } from '../src/marketData/Provider.class.ts';
const src = ['//@version=6','indicator("shadow-values")','type fib','    float p','var fib fib = fib.new(0.0)','fib.p := close','plot(fib.p, "v")','plot(close, "c")'].join('\n');
const engine = new PineTS(Provider.Mock, 'BTCUSDC', '60', null, Date.parse('2024-01-01'), Date.parse('2024-01-03'));
const ctx = await engine.run(src);
const series = (k) => (ctx.plots[k]?.data || []).slice(-4).map((r) => (r && typeof r === 'object' ? Number(r.value).toFixed(2) : r));
console.log('v', JSON.stringify(series('v')), ' c', JSON.stringify(series('c')));

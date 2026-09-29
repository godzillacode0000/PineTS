import { PineTS } from '../src/PineTS.class.ts';
import { Provider } from '../src/marketData/Provider.class.ts';
const CASES = {
  'colliding name (fib)': ['//@version=6','indicator("a1")','type fib','    float p','maker() =>','    fib inner = fib.new(4.0)','    inner','h = maker()','plot(h.p, "p")'],
  'no collision (thing)': ['//@version=6','indicator("a2")','type thing','    float p','maker() =>','    thing inner = thing.new(4.0)','    inner','h = maker()','plot(h.p, "p")'],
};
for (const [name, lines] of Object.entries(CASES)) {
  const engine = new PineTS(Provider.Mock, 'BTCUSDC', '60', null, Date.parse('2024-01-01'), Date.parse('2024-01-03'));
  try {
    const ctx = await engine.run(lines.join('\n'));
    const d = (ctx.plots['p']?.data || []).slice(-1)[0];
    console.log(`${name}: p=${d && typeof d === 'object' ? d.value : d}`);
  } catch (e) { console.log(`${name}: THROW ${String(e.message).split('\n')[0].slice(0,100)}`); }
}

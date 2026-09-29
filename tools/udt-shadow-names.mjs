import { PineTS } from '../src/PineTS.class.ts';
import { Provider } from '../src/marketData/Provider.class.ts';
const CASES = {
  'type name == instance name': ['//@version=6','indicator("shadow")','type fib','    float p','var fib fib = fib.new(1.0)','plot(fib.p)'],
  'type name == instance name, no var': ['//@version=6','indicator("shadow2")','type fib','    float p','fib fib = fib.new(1.0)','plot(fib.p)'],
  'type new (reserved) — control': ['//@version=6','indicator("shadow3")','type new','    float p','var new v = new.new(1.0)','plot(v.p)'],
};
for (const [name, lines] of Object.entries(CASES)) {
  const engine = new PineTS(Provider.Mock, 'BTCUSDC', '60', null, Date.parse('2024-01-01'), Date.parse('2024-01-03'));
  try { await engine.run(lines.join('\n')); console.log('ok      ' + name); }
  catch (e) { console.log('THROW   ' + name + ' — ' + String(e.message).split('\n')[0].slice(0, 110)); }
}

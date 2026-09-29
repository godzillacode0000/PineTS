import { PineTS } from '../src/PineTS.class.ts';
import { Provider } from '../src/marketData/Provider.class.ts';
const HEAD = ['//@version=6','indicator("ufcs-lit2")','type Tbreak','    bool act','    int idx',
 'method box(string s, Tbreak obj) =>','    label.new(bar_index, close, s)','b = Tbreak.new(true, 1)'];
const VARIANTS = {
  'top level': ["'none'.box(b)"],
  'inside if': ['if close > open', "    'none'.box(b)"],
  'inside switch arm': ['x = switch', '    close > open => 1', '    => 2', "if x > 0", "    'none'.box(b)"],
  'switch arm with call': ['switch close > open', "    => 'none'.box(b)", "    => 'x'.box(b)"],
};
for (const [name, body] of Object.entries(VARIANTS)) {
  const engine = new PineTS(Provider.Mock, 'BTCUSDC', '60', null, Date.parse('2024-01-01'), Date.parse('2024-01-03'));
  try { await engine.run(HEAD.concat(body).join('\n')); console.log(`ok      ${name}`); }
  catch (e) { console.log(`THROW   ${name} — ${String(e.message).split('\n')[0].slice(0, 100)}`); }
}

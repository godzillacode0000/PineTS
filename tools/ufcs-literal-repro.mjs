import { PineTS } from '../src/PineTS.class.ts';
import { Provider } from '../src/marketData/Provider.class.ts';
const SRC = [
 '//@version=6','indicator("ufcs-lit")',
 'type Tbreak','    bool act','    int idx',
 'method box(string s, Tbreak obj) =>','    label.new(bar_index, close, s)',
 'method tag(Tbreak obj, string s) =>','    label.new(bar_index, close, s)',
 'b = Tbreak.new(true, 1)',
 "'none'.box(b)",          // literal receiver → box('none', b)
 'b.tag("via-udt")',       // UDT receiver (the working path — must keep working)
].join('\n');
const engine = new PineTS(Provider.Mock, 'BTCUSDC', '60', null, Date.parse('2024-01-01'), Date.parse('2024-01-03'));
try { await engine.run(SRC); console.log('ok — runs'); }
catch (e) { console.log('THROW — ' + String(e.message).split('\n')[0].slice(0, 120)); }

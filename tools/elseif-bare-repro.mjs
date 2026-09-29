import { transpile } from '../src/transpiler/index.ts';
const CASES = {
  'else-if in method': `
//@version=6
indicator("elif")
type mss
    int dir
var mss MSS = mss.new(1)
method f(int x) =>
    if x > 0
        1
    else if MSS.dir == 1
        2
    else
        3
f(0)
`,
  'else-if at top level': `
//@version=6
indicator("elif2")
type mss
    int dir
var mss MSS = mss.new(1)
if close > open
    1
else if MSS.dir == 1
    2
`,
  'plain if in method (control)': `
//@version=6
indicator("elif3")
type mss
    int dir
var mss MSS = mss.new(1)
method f(int x) =>
    if MSS.dir == 1
        2
f(0)
`,
};
for (const [name, src] of Object.entries(CASES)) {
  const body = transpile(src, { debug: false }).toString().split('\n');
  const bare = body.filter((l) => /(^|[^.\w$])MSS\.dir/.test(l));
  console.log(`${name}: ${bare.length ? 'BARE → ' + bare.map((l) => l.trim().slice(0, 100)).join(' || ') : 'scoped'}`);
}

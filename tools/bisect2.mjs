import { transpile } from '../src/transpiler/index.ts';
const HEAD = `
//@version=6
indicator("b2")
type SWING
    float x
    float y
type vector
    array<SWING> v
`;
const V = {
  'global if': `
get_v = array.from(SWING.new(1.0, 2.0))
pivot = get_v.get(0).y
if pivot == get_v.get(1).y
    plot(pivot)
`,
  'plain function if': `
f(array<SWING> a) =>
    get_v = a
    pivot = get_v.get(0).y
    if pivot == get_v.get(1).y
        plot(pivot)
    na
f(array.from(SWING.new(1.0, 2.0)))
`,
  'method if (no for)': `
method f(array<vector> id) =>
    get_v = id.get(0).v
    pivot = get_v.get(0).y
    if pivot == get_v.get(1).y
        plot(pivot)
    na
f(array.from(vector.new(array.from(SWING.new(1.0, 2.0)))))
`,
  'method if inside for': `
method f(array<vector> id, depth) =>
    for i = 0 to depth - 1
        get_v = id.get(i).v
        pivot = get_v.get(0).y
        if pivot == get_v.get(1).y
            plot(pivot)
    na
f(array.from(vector.new(array.from(SWING.new(1.0, 2.0)))), 2)
`,
};
for (const [name, body] of Object.entries(V)) {
    const out = transpile(HEAD + body, { debug: false }).toString().split('\n');
    const bare = out.filter((l) => /(^|[^.\w])get_v\b/.test(l.replace(/\$\$?\.(let|var|const)\.\w*_?get_v/g, 'SCOPED')));
    console.log(`${name}: ${bare.length ? 'BARE → ' + bare.map((l) => l.trim().slice(0, 100)).join(' || ') : 'scoped'}`);
}

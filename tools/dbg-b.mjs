import { transpile } from '../src/transpiler/index.ts';
const src = `
//@version=6
indicator("b")
type SWING
    float x
    float y
type vector
    array<SWING> v
method f(array<vector> id, mode, depth) =>
    for i = 0 to depth - 1
        get_v = id.get(i).v
        if get_v.size() == 3
            pivot = get_v.get(0).y
            if pivot == get_v.get(1).y
                plot(pivot)
    na
f(array.from(vector.new(array.from(SWING.new(1.0, 2.0)))), 'bull', 2)
`;
const out = transpile(src, { debug: false }).toString().split('\n');
for (const [i, l] of out.entries()) if (/get_v|__eq/.test(l)) console.log(`${i + 1}: ${l.trim().slice(0, 120)}`);

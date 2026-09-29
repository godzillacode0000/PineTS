#!/usr/bin/env node
/**
 * Reduce `get_v is not defined`: find the smallest Pine shape where a variable used as the OBJECT of
 * a member chain inside a comparison comes out as a bare identifier instead of its scoped reference.
 *
 * Print the generated lines that mention the probe variable so the broken form is visible directly.
 */
import { transpile } from '../src/transpiler/index.ts';

const CASES = {
    'method + for + if-comparison': `
//@version=6
indicator("r1")
method f(array<float> a) =>
    out = 0
    for i = 0 to a.size() - 1
        get_v = a.get(i)
        if get_v.size() == 1
            pivot = get_v.get(0)
            if pivot == get_v.get(0)
                out := 1
    out
plot(f(array.from(close)))
`,
    'method + for + if-comparison (float array)': `
//@version=6
indicator("r2")
method f(array<float> a) =>
    for i = 0 to a.size() - 1
        get_v = a.get(i)
        if get_v == 0
            x = get_v
            plot(x)
    na
f(array.from(close))
`,
    'function + if-comparison on a local': `
//@version=6
indicator("r3")
g(array<float> a) =>
    get_v = a.get(0)
    if get_v == 1
        b = get_v
        plot(b)
    na
g(array.from(close))
`,
    'global + if-comparison on a local': `
//@version=6
indicator("r4")
get_v = close
if get_v == 1
    b = get_v
    plot(b)
`,
    'method + comparison against a member chain': `
//@version=6
indicator("r5")
method f(array<float> a) =>
    for i = 0 to a.size() - 1
        get_v = a.get(i)
        if 1 == get_v
            plot(get_v)
    na
f(array.from(close))
`,
    'method + for + if + switch + comparison': `
//@version=6
indicator("r6")
method f(array<float> a, mode) =>
    for i = 0 to a.size() - 1
        get_v = a
        if get_v.size() == 1
            pivot = switch mode
                'a' => 1.0
                'b' => 2.0
            if pivot == get_v.get(0)
                plot(pivot)
    na
f(array.from(close), 'a')
`,
    'plain function + for + if + switch + comparison': `
//@version=6
indicator("r7")
f(array<float> a, mode) =>
    for i = 0 to a.size() - 1
        get_v = a
        if get_v.size() == 1
            pivot = switch mode
                'a' => 1.0
                'b' => 2.0
            if pivot == get_v.get(0)
                plot(pivot)
    na
f(array.from(close), 'a')
`,
    'r9: method + for + if + switch + UDT field comparison': `
//@version=6
indicator("r9")
type SWING
    float x
    float y
type vector
    array<SWING> v
method f(array<vector> id, mode, depth) =>
    for i = 0 to depth - 1
        get_v = id.get(i).v
        if get_v.size() == 3
            pivot = switch mode
                'bull' => math.max(get_v.get(0).y, get_v.get(1).y, get_v.get(2).y)
                'bear' => math.min(get_v.get(0).y, get_v.get(1).y, get_v.get(2).y)
            if pivot == get_v.get(1).y
                if i < depth - 1
                    id.get(i+1).v.unshift(get_v.get(1))
                    if id.get(i+1).v.size() > 3
                        id.get(i+1).v.pop()
    na
f(array.from(vector.new(array.from(SWING.new(1.0, 2.0)))), 'bull', 2)
`,
};

for (const [name, src] of Object.entries(CASES)) {
    console.log('='.repeat(72));
    console.log(name);
    try {
        const body = transpile(src, { debug: false }).toString().split('\n');
        let found = 0;
        for (const [idx, line] of body.entries()) {
            if (!/get_v/.test(line)) continue;
            // a BARE get_v: not preceded by a dot (so not `$$.let.for5_get_v`)
            const bare = /(^|[^.\w])get_v\b/.test(line.replace(/\$\$?\.(let|var|const)\.\w*_?get_v/g, 'SCOPED'));
            console.log(`  ${bare ? 'BARE  ' : 'scoped'} L${idx + 1}: ${line.trim().slice(0, 130)}`);
            found++;
        }
        if (!found) console.log('  (no get_v in the generated code — the case did not survive)');
    } catch (e) {
        console.log('  THROW ' + String(e.message).split('\n')[0].slice(0, 120));
    }
}

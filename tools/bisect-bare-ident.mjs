#!/usr/bin/env node
/**
 * Bisect the bare-identifier bug (r9 in tools/reduce-bare-ident.mjs reproduced it):
 * `if pivot == get_v.get(1).y` emitted `get_v` bare while every neighbouring use is scoped.
 *
 * Variants remove one suspect at a time, so the trigger is named rather than guessed.
 */
import { transpile } from '../src/transpiler/index.ts';

const HEAD = `
//@version=6
indicator("b")
type SWING
    float x
    float y
type vector
    array<SWING> v
`;

const variants = {
    'A: full r9 (switch + max/min + .y comparison)': `
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
    na
f(array.from(vector.new(array.from(SWING.new(1.0, 2.0)))), 'bull', 2)
`,
    'B: no switch — pivot = get_v.get(0).y': `
method f(array<vector> id, mode, depth) =>
    for i = 0 to depth - 1
        get_v = id.get(i).v
        if get_v.size() == 3
            pivot = get_v.get(0).y
            if pivot == get_v.get(1).y
                if i < depth - 1
                    id.get(i+1).v.unshift(get_v.get(1))
    na
f(array.from(vector.new(array.from(SWING.new(1.0, 2.0)))), 'bull', 2)
`,
    'C: switch, but no field access in the comparison': `
method f(array<vector> id, mode, depth) =>
    for i = 0 to depth - 1
        get_v = id.get(i).v
        if get_v.size() == 3
            pivot = switch mode
                'bull' => math.max(get_v.get(0).y, get_v.get(1).y)
                'bear' => math.min(get_v.get(0).y, get_v.get(1).y)
            if pivot == get_v.get(1)
                if i < depth - 1
                    id.get(i+1).v.unshift(get_v.get(1))
    na
f(array.from(vector.new(array.from(SWING.new(1.0, 2.0)))), 'bull', 2)
`,
    'D: switch with plain arms, field comparison': `
method f(array<vector> id, mode, depth) =>
    for i = 0 to depth - 1
        get_v = id.get(i).v
        if get_v.size() == 3
            pivot = switch mode
                'bull' => 1.0
                'bear' => 2.0
            if pivot == get_v.get(1).y
                if i < depth - 1
                    id.get(i+1).v.unshift(get_v.get(1))
    na
f(array.from(vector.new(array.from(SWING.new(1.0, 2.0)))), 'bull', 2)
`,
};

for (const [name, body] of Object.entries(variants)) {
    try {
        const out = transpile(HEAD + body, { debug: false }).toString().split('\n');
        const bare = out.filter((l) => /(^|[^.\w])get_v\b/.test(l.replace(/\$\$?\.(let|var|const)\.\w*_?get_v/g, 'SCOPED')));
        console.log(`${name}\n   → ${bare.length ? 'BARE: ' + bare.map((l) => l.trim().slice(0, 110)).join(' | ') : 'all scoped'}`);
    } catch (e) {
        console.log(`${name}\n   → THROW ${String(e.message).split('\n')[0].slice(0, 110)}`);
    }
}

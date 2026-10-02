// SPDX-License-Identifier: AGPL-3.0-only

/**
 * `isArrayPatternElement` is a set of NAMES across the whole program — the audit flagged it (26): a
 * plain local that happens to share a name with a tuple element anywhere is still routed to the
 * standard lowering by the walkers (patches 6 and 7). The review of patch 8 showed the outcome was
 * not inert at all — it was a LIVE defect, which is why patch 8 exists:
 *
 *   - a plain local whose init is a history read → `close[1]` in a declaration IS a computed member
 *     expression, so the shape heuristic at the lowering accepted it: `p = close[1]` inside a switch
 *     arm came out as `$.get($.let.close, 0)[1]` (a tuple read of the wrong store) and threw
 *     `TypeError: Cannot read properties of undefined (reading '1')` at runtime. Measured on
 *     `073fbaa`; fixed by `ba5aa4c`, which marks the split's own declarators and matches that marker
 *     instead of a name set.
 *
 * What these tests assert is deliberately reference-agnostic. `w` (the arm's value) and `u` (a
 * function body's own local) are the same number under either reading of `=` inside a local block.
 *
 * OPEN QUESTION — not asserted here, on purpose. The engine resolves a name to ONE store, so patch
 * 8's routing rule writes the arm's `p = 10` into the store the outer readers use: run this script
 * offline and the global `p` reads 10 afterwards. If Pine v6 SHADOWS instead (a `=` in a local block
 * declares a new local; outer `p` keeps 1), the engine is not even consistent about it: the normal
 * pipeline gives `if`/`else`/`for` blocks their own store (`if1_p`, `for1_p`), so only this walker path
 * writes through. My earlier expectation of 10 came from reasoning, not from a TradingView run. Per the
 * repo's own Golden Rule, expected values need an independent
 * reference: run `tools/repro/src/name-collision.pine`'s `plot(p)` on TradingView before asserting
 * either number. Until then the outer `p` is recorded, not required.
 *
 * Which of these tests guard what: the history-read pair (the emitted-shape check and the `w` runtime
 * check) fails on `073fbaa`; the literal-source pair passes there too — the literal case was the
 * control that proved the name set's routing was inert for a plain init. Two of four is the honest
 * count, and the round-3 check said so.
 */
import { describe, it, expect } from 'vitest';
import { transpile } from '../../src/transpiler/index';
import { PineTS } from '../../src/PineTS.class';
import { Provider } from '@pinets/marketData/Provider.class';

const LITERAL_SRC = `//@version=6
indicator("name collision: a tuple element name reused as a plain local")

split() =>
    x = 1
    y = 2
    [x, y]

[p, q] = split()

w = switch
    p > 0 =>
        p = 10
        p + 1
    => 0

f() =>
    p = 7
    p * 2

u = f()

plot(w, "w")
plot(u, "u")
plot(p, "p")
`;

const HISTORY_SRC = `//@version=6
indicator("name collision: a history read as the arm local's init")

split() =>
    x = 1
    y = 2
    [x, y]

[p, q] = split()

w = switch
    p > 0 =>
        p = close[1]
        p + 1
    => 0

plot(w, "w")
plot(p, "p")
plot(close, "close")
`;

const values = (res: any, key: string) => (res?.plots?.[key]?.data ?? []).map((d: any) => d.value);

async function run(src: string) {
    const engine = new PineTS(
        Provider.Mock, 'BTCUSDC', '1h', null,
        new Date('2024-01-01').getTime(), new Date('2024-01-10').getTime()
    );
    return engine.run(src);
}

describe('a plain local sharing a name with a tuple element', () => {
    it('never lowers the arm local as an array-pattern element (emitted code)', () => {
        const js = transpile(LITERAL_SRC, { debug: false }).toString();
        // The defect this guards against: an existing-name declaration treated as a tuple element,
        // whose reads then take the `$.get(<store>, 0)[i]` shape. Legitimate tuple reads point at the
        // split's own temp (`$.let.glb1_temp_1`), so those are excluded — a read of anything else in
        // that shape is the wrong-store read this class produced.
        expect(js).not.toMatch(/\$\.get\((?!\$\.[a-z]+\.[A-Za-z0-9_]*temp_)[^)]*\)\[\d\]/);
        // The function body's own `p = 7` stays a plain function-local declaration — same name, a
        // different store, which is exactly what the name-based set had to get right.
        expect(js).toMatch(/\$\$\.let\.fn\d+_p = \$\.init\(\$\$\.let\.fn\d+_p, 7\)/);
    });

    it('runs: the arm is 11 and the function local stays 14', async () => {
        const res: any = await run(LITERAL_SRC);
        const w = values(res, 'w');
        const u = values(res, 'u');
        expect(w.length).toBeGreaterThan(0);
        // Reference-agnostic: `p` is 10 (or the arm's own local is) either way, so `p + 1` is 11.
        expect(w[w.length - 1]).toBeCloseTo(11, 6);
        expect(u[u.length - 1]).toBeCloseTo(14, 6);
    });

    it('a history read as the init is not mistaken for the split shape (emitted code)', () => {
        const js = transpile(HISTORY_SRC, { debug: false }).toString();
        // `close[1]` stays a history read of the built-in …
        expect(js).toMatch(/\.let\.\w+_p = \$\.init\(\$\.let\.\w+_p, \$\.get\(close, 1\)\)/);
        // … and never becomes the tuple-element shape — pre-fix this was
        // `$.get($.let.close, 0)[1]`, which read the close SERIES' bar-0 value as a tuple and threw
        // `TypeError: Cannot read properties of undefined (reading '1')` at runtime.
        expect(js).not.toMatch(/\.let\.\w+_p = \$\.init\(\$\.let\.\w+_p, \$\.get\([^)]*close[^)]*\)\[1\]\)/);
    });

    it('runs: w is one above the previous close', async () => {
        const res: any = await run(HISTORY_SRC);
        const w = values(res, 'w');
        const close = values(res, 'close');
        expect(w.length).toBeGreaterThan(1);
        const n = w.length;
        // Reference-agnostic: whether the arm's `p` is the outer variable or a fresh local, its value
        // is `close[1]` and the arm returns `p + 1`. (The outer `p`'s own value is the open question
        // in the header — not asserted.)
        expect(w[n - 1]).toBeCloseTo(close[n - 2] + 1, 6);
    });
});

#!/usr/bin/env node
/**
 * Decisive test for the "containers declared but the engine stored NO rows" report.
 *
 * Patch the drawing helpers' prototypes BEFORE the engine is built, then run one of the scripts the
 * sweep filed as "0 series" and compare: how many times the script actually called a drawing constructor
 * vs how many rows the engine kept. Calls > 0 with rows = 0 means the engine drops what the script built
 * (a bug); calls = 0 means the script's own conditions never fired (legitimate).
 */
import fs from 'node:fs';
import { PineTS, Provider } from '../src/index.ts';
import { BoxHelper } from '../src/namespaces/box/BoxHelper.ts';

const slug = process.argv[2] || '1-2-3-reversal';
const src = fs.readFileSync(`/home/godzillaton/.hermes/cache/scratch/compat/src/${slug}.pine`, 'utf8');

const calls = {};
const patched = [];
for (const [name, mod, cls] of [
    ['box', '../src/namespaces/box/BoxHelper.ts', BoxHelper],
]) {
    const proto = cls.prototype;
    if (typeof proto.new === 'function') {
        const original = proto.new;
        calls[name] = 0;
        proto.new = function (...args) {
            calls[name] += 1;
            return original.apply(this, args);
        };
        patched.push(name);
    }
}
console.log('patched constructors:', patched.join(', ') || '(none)');

const engine = new PineTS(Provider.Mock, 'BTCUSDC', '60', null,
    new Date('2024-01-01').getTime(), new Date('2024-03-01').getTime());

const out = await engine.run(src);
console.log('constructor calls:', JSON.stringify(calls));

console.log('out keys:', Object.keys(out || {}).slice(0, 10).join(', '));
const ctx = out?.plots ? out : (out?.result ?? out);
if (ctx && typeof ctx === 'object' && !Array.isArray(ctx)) {
    const keys = Object.keys(ctx);
    console.log(`context keys: ${keys.length}; sample: ${keys.slice(0, 8).join(', ')}`);
    const plots = ctx.plots ?? null;
    if (plots) {
        const containers = Object.keys(plots).filter((k) => k.startsWith('__'));
        console.log(`containers (${containers.length}):`);
        for (const c of containers.slice(0, 10)) {
            const v = plots[c];
            const rows = Array.isArray(v) ? v.length : (v?.array?.length ?? (typeof v === 'object' && v ? Object.keys(v).length : '?'));
            console.log(`   ${c} → ${rows} row(s)`);
        }
    }
}

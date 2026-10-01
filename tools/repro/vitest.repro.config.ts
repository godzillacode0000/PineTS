/**
 * Run the repro material without adding it to the shipped test suite.
 *
 * The repo's vitest config only collects `tests/**\/*.test.ts`, so a test that documents a KNOWN-FAILING
 * bug cannot live there without turning the suite red on purpose. This extends the base config (keeping
 * the `@pinets/*` aliases working) but OVERRIDES the include — mergeConfig concatenates arrays, so a
 * merged include would quietly run the whole shipped suite too.
 *
 * `root` is pinned to the repo root on purpose: run with `--config tools/repro/vitest.repro.config.ts`,
 * vitest would otherwise take the config's directory as root, and `vite-tsconfig-paths` then finds no
 * tsconfig to resolve `@pinets/*` from — which is how the file went unrunnable (2 Oct).
 */
import { fileURLToPath } from 'node:url';
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.config';

const srcDir = fileURLToPath(new URL('../../src/', import.meta.url));
const merged = mergeConfig(
    baseConfig as any,
    defineConfig({
        root: fileURLToPath(new URL('../..', import.meta.url)),
        // The base config resolves `@pinets/*` through vite-tsconfig-paths, which looks for a tsconfig
        // from the run's root — under a foreign `--config` that lookup finds nothing, so the repro
        // file could not import the Provider at all (2 Oct). A direct alias is the same mapping the
        // tsconfig declares, minus the discovery.
        resolve: { alias: [{ find: /^@pinets\//, replacement: srcDir }] },
    }),
) as any;
merged.test = { ...(merged.test || {}), include: ['tools/repro/**/*.test.ts'] };

export default defineConfig(merged);

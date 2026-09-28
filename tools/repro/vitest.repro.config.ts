/**
 * Run the repro material without adding it to the shipped test suite.
 *
 * The repo's vitest config only collects `tests/**\/*.test.ts`, so a test that documents a KNOWN-FAILING
 * bug cannot live there without turning the suite red on purpose. Extending the base config keeps the
 * `@pinets/*` aliases working while pointing at tools/repro/.
 */
import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from '../../vitest.config';

export default mergeConfig(
    baseConfig as any,
    defineConfig({ test: { include: ['tools/repro/**/*.test.ts'] } }),
);

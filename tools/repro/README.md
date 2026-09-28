# Repro material for two PineTS bugs

See FINDINGS.md. These tools are development probes, not part of the shipped engine: the PINE sources
they read live outside this repo (they are the LuxAlgo Library indicators, pulled per request), so the
probes are documented here rather than wired into the test suite.

- `drawing-all-arrays.test.ts` — RED today (4 failed): `<drawing>.all` is not a Pine array.
  Run it explicitly: `./node_modules/.bin/vitest run tools/repro/drawing-all-arrays.test.ts`
- `../why-wrapped.mjs`, `../bare-identifier.mjs`, `../stack-line.mjs`, `../repo-vs-bundle.mjs`,
  `../index-repro.mjs` — source-level probes used to reach the generated line for each symptom.

# Repro material for two PineTS bugs

See FINDINGS.md. These tools are development probes, not part of the shipped engine: the PINE sources
they read live outside this repo (they are the LuxAlgo Library indicators, pulled per request), so the
probes are documented here rather than wired into the test suite.

- `drawing-all-arrays.test.ts` — GREEN since patch 2 (`DrawingArray`): the 4 cases from the original
  findings now pass. Run it explicitly with its own config (the repo suite's include never matched
  `tools/repro/`, and under a foreign `--config` the `@pinets/*` aliases need the pinned root + direct
  alias the config now carries, 2 Oct):
  `./node_modules/.bin/vitest run --config tools/repro/vitest.repro.config.ts`
- `../why-wrapped.mjs`, `../bare-identifier.mjs`, `../stack-line.mjs`, `../repo-vs-bundle.mjs`,
  `../index-repro.mjs` — source-level probes used to reach the generated line for each symptom.

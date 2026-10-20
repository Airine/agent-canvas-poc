# Export cleanup verification — 2026-10-20

## Scope and recovery points

- `119cbf3` had already removed the remaining 25 unreachable files; their saved contents are in `a1858ae`.
- This task first created `e122d9b`, preserving all current tracked and non-ignored work before further edits. No push was performed.
- Fresh Knip output contained 36 unused exports, including the previous 30. Final decisions: 22 made private, 8 unused implementations removed, 6 unused re-exports removed. The per-symbol ledger is `unused-export-review.json`.
- `model-recovery.d.mts` is retained. A TypeScript resolution test proves the actual runtime worker import resolves to this declaration; only this exact declaration is added to the existing sidecar exclusions.
- No dependency versions or lockfiles changed in this cleanup.

## Verification isolation

Another task changed queue UI and documentation during execution. Final validation uses an independent checkout of `e122d9b` plus only this cleanup's patch, with its own Vite server on port 5193. Shared installed dependencies are reused, but source files and build outputs are separate.

The cleanup commit takes documentation from this validated snapshot. Concurrent queue UI, test, and documentation changes remain in the original working directory and are not included. Working-directory documentation can therefore differ from the committed snapshot.

## Checks

- Application unit tests: 187 passed using `npm test -- --test-concurrency=1`. An earlier parallel run in the isolated copy hit a runtime startup timeout; the serial run passed without changing the test or runtime timeout.
- API build: `npm run build:api` passed.
- Frontend build: `npm run build` passed; the existing large-chunk warning remains.
- Application lint, including architecture verification: passed.
- Documentation tests: 12 passed, including the new declaration-resolution regression test.
- Documentation typecheck and production build: passed.
- Site verification: 27 routes returned 200; unknown document returned 404; Chinese search returned 60 results.
- Served `architecture.html` is byte-identical to the validated generated artifact.

## Browser regression investigation

The first shared-workspace browser run had reconnect and multi-tab timeouts while other edits were occurring. In the isolated copy, the reconnect case passed; the multi-tab card-view case still timed out. That same multi-tab failure was reproduced against the unmodified `e122d9b` baseline.

The test helpers now bring the intended page to the foreground before operating its card-view menu. All original assertions remain; no production interaction logic, test timeout, or skip rule changed. The failing case then passed three consecutive runs.

Final complete browser run: **83 passed, 1 skipped** in 5.7 minutes, using `CANVAS_TEST_URL=http://127.0.0.1:5193 npx playwright test`. The existing opt-in real-Pi test was skipped; this task did not start a real model session or claim real-runtime verification.

## Static health

Knip's supported `files,exports` command exited 0 with empty findings. The mandated command including `cycles` still reports unsupported issue type; cycle analysis remains the existing oxc/Tarjan implementation.

The validated snapshot has 230 JS/TS files, 0 unused files, 0 suspects, 0 unused exports, 0 cycles, and 0 unresolved imports/parser errors. The unchanged score formula computes 100. This is a static-analysis score, not a guarantee of defect-free behavior or a substitute for real-runtime testing.

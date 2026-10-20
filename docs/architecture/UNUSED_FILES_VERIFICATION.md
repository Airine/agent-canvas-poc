# Unused-file review verification — 2026-10-19

This follow-up reviewed all 59 candidates left by the preceding health-fix task.

## Changes

- Removed 34 clean, unreachable UI files: 3,850 source lines.
- Preserved 18 modified/untracked candidates byte-for-byte at their original paths.
- Preserved their closure of 7 clean dependencies so unfinished components still compile.
- Preserved the other application code, dependency manifests, lockfile and Knip configuration.
- Added an explicit responsibility index, per-file evidence ledger and review-status checks.
- Did not add fake consumers, new ignore rules, archive candidates outside scanning, stage changes, or commit.

The historical evidence ledger is `unused-file-review.json`; the readable decision
table is `wiki/unused-files.md`. The analyzer flags changed/restored/deleted retained
files or new usage instead of treating historical decisions as permanent exemptions.

## Checks

- Application tests: 100 passed.
- Full Playwright suite (`npx playwright test`): 36 passed, 1 opt-in real Pi test skipped.
- Application frontend and API production builds passed.
- ESLint plus architecture verification passed.
- Documentation tests: 11 passed, including 3 review-reconciliation regressions.
- Documentation typecheck and production build passed.
- SHA-256 comparison against this turn's initial app inventory: 225 pre-existing files
  unchanged, 34 intended deletions, 0 unexpected changes. Newly added UI README is separate.

Health: 197 JS/TS source files; 25 unused file candidates (18 protected changes +
7 dependencies), 30 unused exports, 0 cycle components, 0 unresolved/parse breaks.
Unused exports were not part of this 59-file cleanup and are not silently waived.

The large Vite bundle and Browserslist warnings remain. The goal was to reduce
unused source maintenance, not to claim runtime bundle savings. No real Pi or
herdr session was started, stopped or reset. Only our port-4310 documentation
preview was restarted to publish the regenerated report.

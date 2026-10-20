# Verification — 2026-10-19 health fixes and repository organization

Scope: current working tree, including pre-existing uncommitted e / Pi work.
No real Pi session or herdr workspace was started, stopped, reset, or approved.
Only our documentation preview on port 4310 was restarted after rebuilding.

## Passed

- `npm --prefix app test`: 100 tests, 0 failures (92 prior tests plus 8 regressions).
- `npm --prefix app run lint`: ESLint and architecture verification.
- `npm --prefix app run build`: TypeScript and Vite production build.
- `npm --prefix app run build:api`: API TypeScript build.
- `cd app && npx playwright test --ignore-snapshots`: 36 passed, 1 opt-in real Pi test skipped. This suite has no snapshot assertions; all behavior assertions ran.
- Targeted browser run: 10 layout, connection and composer tests passed; the layout case was rerun after allowing its screenshot to settle.
- `npm --prefix docs-site test`: 8 passed, including unstaged file-move coverage.
- `npm --prefix docs-site run typecheck`: MDX and TypeScript passed.
- `npm --prefix docs-site run build`: Next.js production build, 22 document pages.
- `node docs-site/scripts/check-site.mjs`: 24 routes returned 200, missing document 404, Chinese search returned review results.
- `node docs/architecture/verify.mjs`: sources, coverage, links, digest and map geometry passed.
- Six archived Python scripts parsed with `ast.parse`, without executing their side effects.
- `git diff --check`: no whitespace errors.

## Health comparison

| Metric | Before | After |
| --- | ---: | ---: |
| Static cycle components (including types) | 1 | 0 |
| Unresolved relative imports / parse errors | 0 | 0 |
| Knip unused file candidates | 62 | 59 |
| Knip unused exports | 30 | 30 |

The three fewer unused-file candidates are one removed unused placeholder and
two corrected classifications (dynamic worker and declaration sidecar), not
three deleted implementations. Uncommitted UI scaffold changes are preserved.
Knip 5 rejects `cycles`; the analyzer records that failure and computes SCCs
from the oxc graph rather than treating the failure as zero cycles.

## Browser evidence and boundaries

`evidence/layout-after.png` shows the settled viewport after a protocol fixture
moves the node to distant coordinates and automatic layout fits it again.
This is UI evidence, not proof of a real model response.

The original eight review findings are resolved with regression coverage;
details are in `wiki/review.md`. Approval path preflight is not a replacement
for execution-time filesystem isolation against concurrent replacement.

Existing Vite large-bundle / Browserslist and Next MDX/CSS optimization warnings
remain. This work does not claim to have reduced bundle size or refactored all
large modules. Historical research and experimental scripts were relocated,
not rewritten as current capability claims. No user changes were staged or committed.

# Worktree review and consolidation

Baseline: `origin/main` at `40d97dabd2903a68e0a219c616f1d82d07acc0e6`.
Scope: all three registered worktrees of this repository, including their
uncommitted changes. This is a change-focused review, not a claim that every
historical source line or every runtime integration has been revalidated.

## Worktree disposition

| Worktree | Starting point | Disposition |
| --- | --- | --- |
| `Documents/agent-canvas-poc` | `main` at `bc3fe79`, dirty | Preserved as `archive/legacy-worktree-2026-10-22` (`518144a`). Do not merge this stale implementation over the current native UI. |
| `Documents/agent-canvas-e` | `feat/agent-canvas-e` at `f8249ea`, dirty | Queue review changes committed as `498ea96`, then merged into native integration. |
| Codex `f900/agent-canvas-e` | `feat/native-agent-ui` at `da78cdf`, dirty | Native controls, provider support and transport repairs committed as `476b556`, followed by queue integration. |

The original custom UI remains separately preserved at
`archive/self-built-chat-ui-2026-10-21` (`40d97da`). The stale main layout,
Herdr discovery, timestamp normalization and research-document moves were
already represented in the newer tree. Reapplying them would regress native
focus handling, e-card sizing and layout fitting.

Before any commits, binary diffs and untracked-file archives were saved in a
private local backup. Local `.pi/` planning materials and `.DS_Store` are not
published. Dependencies, runtime data, local environment files, credentials and
upstream vendor assets are not included in these commits. A credential-pattern
scan of tracked and candidate source files found no matching secret literals;
this is not a guarantee against every possible secret format.

## Standards

Two P2 findings, both fixed and independently re-reviewed:

1. Codex event polling stopped permanently after a transient disconnect, while
   the host continued accepting actions. The host now blocks submissions while
   disconnected, retries only event reads with bounded backoff and preserves
   the last cursor. An expired lease requires a refresh. Connection checks also
   run after permission dialogs and file reads, immediately before each POST.
2. Failed HTTP requests left the official UI's RPC promises unresolved. Matching
   RPC/fetch errors now settle those requests. Network and 5xx failures describe
   the outcome as unknown; outbound actions are never automatically replayed.

No remaining merge blocker was found in the reviewed ownership, attachment,
credential-isolation and permission paths. This is a bounded review, not a
security certification.

## Spec

Two P2 findings/merge risks, both addressed:

1. Queue review was available only inside the retired custom chat UI. The Pi
   card's existing host-level session-status popover now exposes queue review,
   separate resume and audit receipts. The original transcript/composer remain
   in their iframe. Pi's own `queuePrompt` adapter is still unsupported.
2. Merging the stale main files wholesale would replace native-compatible
   focus/layout behavior. Their exact state is archived instead of merged.

Architecture prose retains both native and queue semantics; generated reports,
source hashes and visualization are regenerated from the integrated sources.
Historical custom-UI acceptance documents are explicitly marked as historical.

## Verification

- Integrated app unit tests, serial execution: **212/212**.
- Python Codex bridge/storage/provider/attachment tests: **35/35**.
- Codex host transport/permission regression tests: **6/6**.
- Queue review browser fixtures through the native card's host popover:
  **3/3**. Covered consent, audit, no automatic resend, stale versions,
  server failures, old APIs and active-run guards. Narrow-screen screenshots
  were inspected; the confirmation dialog fits without horizontal overflow.
- Docs script tests: **13/13**.
- API build, frontend build, lint, docs typecheck and architecture verification
  passed. Existing large-bundle and Browserslist warnings remain.
- Architecture analysis: 247 JS/TS files, no cycle components or unresolved
  static import breaks; 14 unused-file suspects remain for separate review.
- `git diff --check` passed.

An initial parallel run of the pre-integration native tests hit the existing
500 ms startup-fixture timeout (202/203); its immediate rerun passed 203/203.
The final integrated suite passed serially without changing production timeout
policy or weakening assertions. Architecture analysis used the cached Knip
package in offline mode after registry lookup stalled.

The entire historical custom-chat browser suite was not migrated or rerun.
The new browser checks use fixtures, not a real Pi model or SX account. Existing
native acceptance evidence remains in `app/native/evidence/`; it includes
upstream failures rather than treating them as passes. SX native-UI acceptance
is still unverified, and the latest backend recall recheck hit upstream 502 /
`turn_rate_limit_exceeded`. No new live model requests or permission expansion
were performed during consolidation.

Summary: Standards 2 findings fixed; Spec 2 findings/risks addressed. No remaining
merge blocker identified within this review scope.

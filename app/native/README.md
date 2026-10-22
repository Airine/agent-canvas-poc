# Native agent cards

Canvas now mounts the original PI Desktop transcript/composer and the official
Codex extension Webview in separate same-origin iframes. The former custom chat
implementation remains available in `archive/self-built-chat-ui-2026-10-21`
(commit `40d97da`); it is not the default card renderer on this branch.

## Ownership

- **Pi:** `native/pi.tsx` projects the existing e `SessionView` into PI Desktop's
  store. Only Canvas's existing e/Pi process executes tools. The adapter polls
  `native-state`, sends existing session controls, and binds approvals to the
  exact digest shown by the UI. A stale digest is rejected again in the worker.
  There is no separate PI Desktop agent runtime and no synthetic assistant text.
- **Codex:** `api/codex-native.ts` starts one isolated app-server host per card.
  Each card has its own durable CODEX_HOME, thread ownership, host metadata and
  process. The UI transport is proxied through Canvas; child ports are not used
  as iframe origins. Opening another view of the same card replaces its renderer
  lease so clients cannot interleave host RPC. Different cards have separate
  stores and tokens. The card owns a collection of local Codex threads; it is not
  currently constrained to one thread.
- **Focus:** native cards keep both focus slots mounted and use state-preserving
  DOM `moveBefore` in supported browsers. This preserves the iframe and draft
  while entering/leaving focus, unlike `appendChild`. Older browsers fall back
  to reloading the embedded document. Host focus guards prevent a background
  card's programmatic autofocus from diverting typing in a neighbouring card.
- **Recovery:** e retains Pi JSONL files and snapshots; restore resumes the same
  native ID. Codex keeps native threads and lists them in the original Local
  chats UI. API restart never automatically submits drafts or resumes tools.
  Click Restore/恢复 and choose the Codex thread from its original list.

## Build assets separately

No upstream source, official extension assets, executables, credentials or
runtime history are shipped in this repository.

PI Desktop sources are pinned to v0.20.1,
`cb88131b34680afd45d931a37d4bd0a7893f29ed`. Acquire the upstream checkout and
matching installed desktop app separately. From the repository root:

```sh
node tools/experiments/pi-native-ui/prepare-deps.mjs "$PI_SOURCE" "$PI_DEPS"
npm install --ignore-scripts --no-audit --no-fund --prefix "$PI_DEPS"
node tools/experiments/pi-native-ui/build.mjs \
  "$PI_SOURCE" "$PI_DEPS" "$PI_OUTPUT" \
  /Applications/PI-Desktop.app/Contents/Resources/app.asar --live
```

The build refuses a changed upstream checkout and a mismatching app version.
It imports the original components/store, reuses original compiled CSS and
copies upstream LICENSE into the local output. PI Desktop is LGPL-3.0; this
local experiment is not a redistribution plan. Review license obligations before
shipping bundled assets. The Codex frontend has separate vendor terms.

Configure `app/.env.e` (ignored by Git):

```dotenv
ADE_ROOT=/absolute/path/to/ADE
PI_NATIVE_UI_DIR=/absolute/path/to/pi-output
CODEX_NATIVE_BIN=/absolute/path/to/official-extension/bin/macos-aarch64/codex
CODEX_NATIVE_WEBVIEW=/absolute/path/to/official-extension/webview
# Optional existing login reference. Contents never enter the renderer.
CODEX_NATIVE_AUTH_FILE=/absolute/path/to/existing/auth.json
CANVAS_DATA_DIR=/absolute/path/to/durable/canvas-data
CANVAS_PROJECT_ROOT=/absolute/path/to/workspace
API_PORT=3327
CANVAS_UI_PORT=5207
```

Use the extension's matching executable, not an arbitrary global codex binary.
The verified extension is `26.51007.21434`, bundled CLI
`0.162.0-alpha.17.2`. Keep necessary proxy/certificate environment variables.
Use a durable asset directory; `/tmp` is suitable only for disposable builds.
Then run `npm --prefix app run dev:e`, or build UI/API and use `start:e`.
Create an e workspace and use **添加 Pi 会话 / 添加 Codex**.

### Singularity-X Codex cards

**添加 Codex · SX** creates a separate card after a third-party data notice.
It keeps the official Webview, but routes this card's model traffic to
`https://api.singularity-x.ai:9443/v1` using Responses SSE. Existing ChatGPT
cards and login references are unchanged. Provider selection is fixed per card;
do not repurpose an existing ChatGPT home.

The Python host reads the macOS Keychain generic-password item with account
`singularity-x` and service `agent-canvas-singularity-x-api-key` at each launch.
No key is accepted by REST, put in the graph/config/renderer, or written to `.env`.
Only the app-server child receives the credential environment variable; it is
explicitly excluded from agent shell environments. Missing credentials or failed
model discovery fail closed, without falling back to ChatGPT.

The original model picker displays the intersection of Codex's model metadata
and the provider's live `/models` IDs. The initial model is `gpt-5.6-sol`.
Catalog membership is not a guarantee of all model capabilities. Model discovery
runs at host startup; stop/restore refreshes it. Local history, tools, permissions
and approvals still belong to app-server, not the remote provider. Requests and
tool context are sent to Singularity-X; do not use a private project without
accepting that destination. Upstream 502/transport failures remain possible.

2026-10-22 real backend acceptance is recorded in
`evidence/singularity-x-backend.json`: sandboxed command round trip, a real
execution approval declined without running the command, and same-thread
history/marker recovery after restarting app-server. The repeatable probe is
`tools/experiments/codex-native-ui/verify_provider.py`; it creates a fresh private
workspace and never approves escalation. This is host/backend evidence, not UI
acceptance. Native Webview visual verification is still pending because the
user's browser tab was on a blocked connection-error document.
An additional run restored history successfully but the follow-up response was
rejected upstream with HTTP 502 carrying `turn_rate_limit_exceeded` / `Codex is
at capacity`. See `evidence/singularity-x-recheck.json`; a generic 502 must not be
reported as a proven local network problem. No application-level resend loop
was added.

## Native controls and remaining gaps

Both products still render their original components. Changes are in host
adapters, not a fork of the vendor composer or transcript.

| Capability | PI Desktop components -> e/Pi | Official Codex Webview -> app-server |
| --- | --- | --- |
| Model / reasoning | Original picker, real e catalog, revision-checked configuration and runtime readback | Original picker and power slider; default collaboration settings mapped to actual turn model/effort |
| File attachments | Original Add files/paste/drop routes to browser-selected bytes; existing e content validation | Original Files picker uploads to private per-card storage; original localImage input and text-file references |
| Image history | e snapshot image blocks, read-only data URL preview | Native thread image history and owned upload reads |
| Permissions | Ask=manual; Accept edits=bounded deterministic edits; Auto=full, explicit host confirmation | Safe startup=read-only/on-request; explicitly selecting Ask for approval (native `auto`)=workspace-write/on-request with network disabled; Full Access=unsandboxed/never; expansion requires host confirmation |
| Recovery | Same Pi session; model/reasoning from saved configuration; grants reset | Same native thread; native list/history; grants never restored from disk |
| Not connected | Plan/goal, desktop filesystem navigation, edit/regenerate, desktop todos/terminal/plugins, provider credentials/global settings, original desktop queue | Plan/goal, cloud chats, Git/plugins, archive/delete, global desktop settings/services |

Pi model options are taken from e, never static demo entries. Configuration is
not shown as applied until runtime readback. Permission expansion has a separate
host confirmation: **Accept edits is not AI-assisted mode**. It permits only
existing conservative new-file/bounded-edit rules; shell, hidden/sensitive
paths, symlinks and unsafe changes still require manual approval. Pi Auto is
not a sandbox. Changes reset on stop/restart.

Codex accepts the current official composer's nullable fields and nested
`collaborationMode.settings` model/effort. Only default collaboration mode is
connected. Workspace-write roots are fixed to the card workspace (not supplied
by the renderer), network is disabled, and escalations remain user-reviewed.
Full Access is a genuinely broader mode, not a relabelled read-only mode. Its
confirmation is per running host/thread; persisted UI preferences do not grant
permission. Host restart resets permission selection to read-only. The official
build labels both read-only and workspace-write as Ask for approval; the host
confirmation spells out the actual difference before expansion.

Attachments: at most four per selection, PNG/JPEG/WebP up to 2 MiB each, UTF-8
text total 100 KiB. Pi revalidates the whole message against e limits. No PDF,
audio, video or folder support. Pi stores selected draft bytes in card-scoped
IndexedDB and sends actual bytes (not local path strings) to e. Codex stores
uploads in its private home, uses owned paths for native previews, and allows
the agent to read the selected text file. Arbitrary renderer filesystem reads
are denied. Failed/restarted Codex submissions may retain text but require
reattaching files; do not assume draft attachment persistence from history.

## Deliberate limits

- Chat, streaming, model/reasoning, selected files, permission controls,
  one-time approval/denial and local recovery are integrated, not all features
  of either desktop product.
- Pi desktop filesystem navigation, edit/regenerate,
  desktop todos and session-wide permission grants are not connected. Unsupported
  actions fail explicitly; they do not fabricate results. Existing e queue,
  collaboration and configuration backends remain, but the original composer
  does not expose the old custom UI's full feature set.
- Codex defaults to read-only/on-request/user-reviewed. Explicit **Allow once**
  authorizes the pending execution; session-wide approval grants are rejected.
  Broader composer modes require the host confirmation described above. Cloud chats,
  plugins, Git host services and archive/delete are not implemented.
- Pi's title/context/lifecycle controls remain Canvas controls. Codex currently
  has process-level status in the outer card, with turn/tool status in its native
  UI. Codex cards do not yet participate in e collaboration, configuration or
  the Pi archived-session list. Archiving a workspace stops both runtimes.
- This is a local, version-pinned integration, not a public server. Production
  remote access, vendor upgrades and all-card concurrent load are unverified.
- Main app/API TypeScript builds and native esbuild bundling are checked
  separately. The entire upstream PI Desktop monorepo is not typechecked here.

## Verification

### Controls acceptance (2026-10-21)

- Pi original model picker switched 6.1 Sol -> 6 Luna -> 6.1 Sol; actual
  configuration readback confirmed the selection and medium -> low reasoning.
- Both original file pickers sent `evidence/fixtures/note.txt` and `colors.png`.
  Actual model replies identified blue/yellow, RIVER-4827 and 17. The first Pi
  6 Luna attempt received the bytes but did not identify them; 6.1 Sol passed.
- Pi Accept edits created only `pi-native-permission-test.txt`. A shell request
  remained pending, was denied in the original card, and produced no command
  output. The existing conservative rule also rejected its null timeout; unit
  tests separately verify that even valid shell requests stay manual in edits.
- Codex 6 Sol/medium was observed in app-server `turn/start`, not just UI state.
  After host confirmation, workspace-write executed the fixed test write/read
  with exit 0 and no escalation, with network disabled and only the isolated
  workspace in writable roots. The file contents were verified on disk.
- Pi Auto was selected and read back, but its live request hit `fetch failed`;
  it was aborted and switched back to manual. Do not count it as a successful
  automatic execution. Codex Full Access is covered by policy tests, not live
  execution: approval for an isolated workspace is not permission to test
  unsandboxed access to the computer.
- Stop/restore checks retain native IDs, model/reasoning and attachment history.
  Temporary permission expansion is revoked. Account routing discovery and TLS
  occasionally fail upstream; native errors are retained, not replaced by fake
  successful replies or credentials. Codex's post-restore read-only turn returned
  `CODEX_RESTORED_ATTACHMENTS RIVER-4827 17`; Pi's post-restore recall hit
  `fetch failed` (its history/configuration restoration passed separately).

`verify-controls.py` checks private traces, actual tool outputs, fixture bytes,
on-disk test files and the post-write read-only resume. It emits only sanitized
acceptance facts to `evidence/controls-acceptance.json`. UI screenshots are
separate evidence; the script does not claim to automate the browser.

```sh
python3 app/native/verify-controls.py "$DEDICATED_NATIVE_TEST_ROOT" \
  "$PI_NODE" "$CODEX_NODE" app/native/evidence/controls-acceptance.json
```

`evidence/` contains screenshots and a sanitized result record from real runs.
Private trace/history files stay under CANVAS_DATA_DIR. Tests use harmless
`printf` commands; both approval and denial must be observed in runtime data,
not inferred merely from a button disappearing.

The legacy custom-chat Playwright suite has not been adapted or run for these
cards. Native acceptance was exercised in the real browser and checked against
backend records, including full API restarts. A transient Codex `account/read`
network discovery failure can show the vendor sign-in screen despite an existing
login; refreshing retried successfully during acceptance. No fake account data
or replacement credentials were used.

```sh
cd app
node --import tsx --test --test-concurrency=1 test/unit/*.test.mjs
npm run build:api && npm run build
cd ..
python3 -m unittest discover -s tools/experiments/codex-native-ui -p 'test_*.py'
node --test tools/experiments/codex-native-ui/test_host.cjs
```

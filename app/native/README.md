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

## Deliberate limits

- Text chat, streaming, one-time approval/denial and local recovery are the
  acceptance scope, not all features of either desktop product.
- Pi model changes, attachments, desktop filesystem navigation, edit/regenerate,
  desktop todos and session-wide permission grants are not connected. Unsupported
  actions fail explicitly; they do not fabricate results. Existing e queue,
  collaboration and configuration backends remain, but the original composer
  does not expose the old custom UI's full feature set.
- Codex stays read-only/on-request/user-reviewed even if the original settings
  UI requests broader policy. Explicit **Allow once** can authorize the pending
  execution; session grants and permission expansions are rejected. Cloud chats,
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

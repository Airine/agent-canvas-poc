# Official Codex UI live-host experiment

This is a single-client development probe, not a production integration.
It serves an independently obtained official extension Webview unchanged,
injects a VS Code host adapter, and bridges a narrow set of messages to the
matching `codex app-server` over stdio. It does not use Canvas's Pi runtime.
No official assets or executables are included in this repository.

## Run

Requires Python 3.11+, an official extension package obtained separately,
its extracted Webview assets and matching Codex executable, an empty test
workspace, and a dedicated CODEX_HOME authenticated through Codex.
Use a durable directory for CODEX_HOME (not `/tmp`) if you want history to
survive system cleanup. Keep using the same home and workspace on restart.
Do not point the probe at your normal CODEX_HOME: use a separate directory
without user MCP servers, plugins, hooks, or custom configuration.

```sh
python3 tools/experiments/codex-native-ui/bridge.py \
  --codex /absolute/path/to/extension/bin/macos-aarch64/codex \
  --webview /absolute/path/to/extension/webview \
  --home /absolute/path/to/isolated-codex-home \
  --cwd /absolute/path/to/empty-workspace \
  --evidence /absolute/path/to/private-evidence
```

Open `http://127.0.0.1:4392/` for the card, or `/ui/` for the standalone view.
Do not open `card.html` directly with `file://`: its renderer and bridge require
the running HTTP server. Keep the server running while viewing the card.
Only use one view at a time: the event cursor and state are not multi-client
session-isolated. Ctrl-C stops the child app-server. Model turns consume the
signed-in account's usage. Never commit the home directory or raw evidence.

## Boundary

- The renderer's JavaScript and CSS remain original. `host.js` supplies
  acquireVsCodeApi, a transport, and the CSS variables normally supplied by
  VS Code. The card wrapper is our own HTML, not official UI.
- Real account status, model metadata, thread/turn RPC, streamed notifications,
  and server-initiated approval requests come from app-server.
- Host settings/state are minimal implementations. Workspace/project
  metadata points only to the provided test directory. Git, cloud history,
  plugins, preview, attachments, and other desktop services are not implemented.
- The Cap'n RPC adapter implements only service discovery and local thread
  project membership, including the observed export/promise numbering.
  Some optional features log errors; do not mistake this for full compatibility.
  Prewarm requests use ordinary thread/start rather than the extension's
  retained-response scheduler.
- Runtime requests are allowlisted. New threads are persistent; subsequent
  actions must refer to threads created by this bridge. The bridge forces
  read-only sandboxing, on-request approvals, and user review even if the
  renderer asks for broader access. This sandbox is not a VM or a guarantee
  against reads outside the workspace.
- The first approval experiment deliberately supports only decline/cancel.
  It must never silently accept an execution or permission request.
- HTTP binds to loopback, checks Host and request tokens, rejects foreign
  origins, and does not enable CORS. The token is injected into the local UI.
  CSP restricts renderer network requests to this host. Auth tokens are never
  requested for the renderer. The app-server handles model authentication.
- Trace logging redacts credential/account fields but can include prompts,
  local paths and model output. Keep evidence private. Treat stderr as private.

## Local history

App-server owns the durable conversation history, title, turn and item records
inside the dedicated CODEX_HOME. The bridge creates non-ephemeral threads and
forwards `thread/list`, `thread/read`, `thread/resume`, `thread/turns/list` and
`thread/items/list`; it does not reconstruct history from browser caches or logs.
Resume keeps the UI's pagination options but rejects path/history/configuration
overrides and reapplies the read-only approval policy.

`CODEX_HOME/native-ui-host.json` stores owned thread IDs, project mappings and
official UI persisted atoms, including drafts and the recent-chat filter. It is
written atomically with mode 0600 and fsync. Invalid files and workspace changes
fail closed rather than silently discarding ownership. Treat this file as private:
it can contain prompt drafts. Thread lists are restricted to the probe's workspace
and owned IDs, without replacing upstream cursors or faking missing results.

The original **Recent chats > Local chats** view is the default for a new host
store. Switching to All chats / Cloud chats still exposes the unsupported cloud
service error; no cloud result is fabricated or hidden with CSS. A page refresh
starts a fresh event cursor and retrieves history through RPC instead of replaying
old turns. Outstanding approvals are re-delivered on reconnect.

Use one bridge process and one browser view per dedicated home. Stop the bridge,
restart with the same arguments (but a fresh evidence directory), refresh the
page, then select a conversation from **Recent chats > Local chats** to resume.
Threads from the earlier ephemeral experiment cannot be recovered this way;
their original private trace logs remain available but are not imported as history.
The simplified prewarm adapter can leave unused empty "New chat" entries; archive
and deletion are still outside this probe's allowlist.

### Verified persistence result (2026-10-21, Asia/Shanghai)

Using the original composer and chat list, a real first turn saved the marker
`LANTERN-7429` and replied `SAVED_LANTERN_7429`. After a browser refresh the
original Local chats list showed the saved title; selecting it hydrated the
original user and assistant messages through `thread/resume.initialTurnsPage`.
The app-server process was then stopped (PID 8266) and restarted (PID 10843)
with the same dedicated home. Selecting the same thread restored the history.
A follow-up that did NOT repeat the marker returned `LANTERN-7429`, on the
same thread ID, proving continued model context rather than only a cached view.
Both model turns completed. No cloud history endpoint was implemented.

Evidence: [trace assertions](evidence/persistence-results.json),
[first reply](evidence/persistence-created.png),
[native Local chats list](evidence/persistence-list.png),
[refresh recovery](evidence/persistence-refresh.png),
[restart and continuation](evidence/persistence-resumed.png).
The live preview uses the durable home
`~/Library/Application Support/agent-canvas/codex-native-ui/home` and its sibling
`workspace` directory. The temporary original authentication link is not a copy
of the credential and must be removed when no longer using the preview.

To audit private traces without copying them into the repository:

```sh
python3 tools/experiments/codex-native-ui/verify_persistence.py \
  /private/path/before/trace.jsonl /private/path/after/trace.jsonl \
  THREAD_ID /private/path/summary.json
```

## Verification

```sh
python3 -m unittest discover -s tools/experiments/codex-native-ui -p 'test_*.py' -v
node --test tools/experiments/codex-native-ui/test_host.cjs
```

Protocol tests use a fake app-server call, not a real account. Live acceptance
requires separate browser evidence: an actual prompt sent using the original
composer, an actual model response, and an actual server approval displayed
and answered using the original approval UI. A mock approval is not sufficient.

### Verified live result (2026-10-21, Asia/Shanghai)

The original composer sent a real model turn using `gpt-6.1-sol`. The original
chat displayed `CODEX_NATIVE_UI_LIVE_OK`; app-server completed the turn.
In the same thread, a second prompt requested a harmless printf with explicit
approval. The real app-server emitted `item/commandExecution/requestApproval`.
The original approval UI displayed Deny / Allow once. Clicking Deny sent
the actual decision back to app-server. The command item became `declined`
with no process ID or output; the model replied `APPROVAL_DECLINED_OK` and
completed its turn. This verifies rejection, NOT approved command execution.

Evidence: [summary](evidence/results.json), [real reply](evidence/live-reply.png),
[approval pending](evidence/approval-pending.png),
[completed rejection](evidence/approval-completed.png).
All 19,524 extracted Webview files still matched the official archive byte for
byte after the experiment. Only host code and theme injection were added.
The production Canvas/Pi runtime was not changed.

The successful test used the existing local ChatGPT authentication through a
temporary auth-file link in the otherwise clean test home. The link was removed
after shutdown. No token was requested for or supplied to the renderer.
Earlier attempts exposed concrete missing host contracts (workspace metadata,
Git availability, project membership, queue settings, and prewarming), then
a missing inherited proxy configuration. These were fixed before the successful
two-turn test; the screenshots are not mock responses.

Not verified: accept/allow-once execution, session restoration after process
restart, multiple card isolation, attachments, cloud history, Git operations,
full theme fidelity, or compatibility with other extension versions.

For private trace validation:

```sh
python3 tools/experiments/codex-native-ui/verify_trace.py \
  /absolute/path/to/private-evidence/trace.jsonl \
  /absolute/path/to/output-results.json
```

## Version / licensing

Probe target: `openai.chatgpt` 26.51007.21434 (darwin-arm64), bundled
`codex-cli 0.162.0-alpha.17.2`. Host contracts are private and version-specific.
The official IDE extension is not open source. This experiment does not grant
redistribution rights; do not add the vendor bundle to this repository.

- https://learn.chatgpt.com/docs/app-server
- https://learn.chatgpt.com/docs/open-source
- https://marketplace.visualstudio.com/items?itemName=openai.chatgpt

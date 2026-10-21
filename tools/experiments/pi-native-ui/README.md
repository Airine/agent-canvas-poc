# PI Desktop original UI component probe

This is a **fixture-only exploration**, not a live Pi integration. No model was
called and no command was executed. The production Canvas app is unchanged.
"Native UI" here means PI Desktop's original React renderer components, not
macOS-native controls. The preview runs without starting Electron or PI Desktop.

## Pinned inputs

- Upstream: `https://github.com/vastsa/PI-Desktop`, tag `v0.20.1`.
- Commit: `cb88131b34680afd45d931a37d4bd0a7893f29ed`.
- Original CSS/assets: locally installed PI Desktop 0.20.1, version checked
  against `app.asar/package.json` before building.
- Upstream sources and generated vendor bundles remain outside this repository.
  The upstream checkout was clean after the experiment. Build output contains
  the upstream LICENSE. Upstream's root license is LGPL-3.0; this fixture does
  not establish redistribution compliance for a production component extraction.

The upstream source checkout had no compatible dependency environment, so a
separate temporary browser-only build environment was installed with package
scripts disabled. No Electron, Rust host or Pi runtime was installed for this
experiment. Existing Codex and PI Desktop application data were not read.

## What is actually reused

`fixture.tsx` imports unmodified upstream:

- `features/chat/transcript/ChatTranscript`: message grouping and scrolling.
- `features/chat/transcript/disclosure`: process/tool expansion state.
- `components/Composer`: original input, menus and submission behavior.
- `components/PermissionCard`, indirectly through ChatTranscript: approval UI.
- `stores/app-store`: original Zustand store, initialized with explicit fixtures.

There is no substitute chat UI and no screenshot-based replica. The surrounding
card frame and yellow fixture-status bar are ours. Two iframes each load their
own JavaScript module context and store, keyed to separate fixture session IDs.
The fixture replaces selected store actions (send and approval resolution) with
in-memory behavior. Other preload calls return an explicit unsupported error.
The static server has `connect-src 'none'`; it has no model or IPC backend.

## Verified in a real browser

- Both original transcript and composer instances rendered inside browser cards.
- Expanded the original process group, thinking/tool subgroup and read-tool row.
- Submitted `ONLY_CARD_A_731` with card A's original composer; it appeared as a
  user row in A. A direct visible-DOM check confirmed it was absent from B.
- Displayed the original permission card, clicked **Deny**, and observed the
  fixture action receive `deny`. No process or real approval request existed.
- Browser screenshots are in `evidence/`. This does **not** prove live model
  streaming, real approvals, persisted sessions, production multi-card lifecycle,
  all desktop menus, or mobile compatibility.

The unoptimized browser bundle traversed 5,193 input modules, including 345
upstream source modules, and produced about 15 MiB of JavaScript. This is not a
shipping bundle-size measurement, but shows that importing two components still
pulls in a substantial desktop dependency graph. The native stylesheet also has
a 450 px main-pane minimum; compact Canvas cards need a deliberate layout policy.

Known fixture gaps: checklist recovery (`pi-desktop/todos/get`) logs an explicit
unsupported-host error. Model/settings/files/branch/regenerate/voice/plugin actions
are not wired. A browser-injected MutationObserver error was also observed with
no source attribution; no clean-console claim is made. No upstream source was
patched to suppress these errors.

## Architecture findings

1. **Original UI is reusable.** Unlike an opaque renderer-only experiment,
   source-level imports allow the seam to be narrowed without rebuilding visuals.
2. **The store is the first seam, not raw Pi RPC.** Composer reads the module-level
   `activeSessionId`, messages, providers, queued prompts and action functions.
   Two bare React mounts in the same document would share this store. Iframes
   isolate it now; an eventual extracted component package should inject a
   per-card store/context instead.
3. **Electron preload is a second seam.** `window.piDesktop.invoke/on` connects to
   Desktop-specific session, queue, permission, file and plugin contracts. Current
   Canvas uses e/Pi contracts, not this IPC contract. Reusing Desktop's entire
   renderer would require a much wider host adapter.
4. **Keep one runtime authority.** Adapt Canvas `SessionSnapshot` messages/blocks,
   tools and approvals to `UiMessage` plus the component state. Map UI actions
   back to existing `LiveStore.sessionAction` and queue/configuration APIs. Do not
   import Desktop's independent host persistence/queue/runtime just for its UI.
5. **Preserve semantics.** Message projection needs stable IDs and turn boundaries;
   e approval generation/digest checks and queue submitted/consumed/unknown states
   must survive the UI swap. A type cast is not an adapter.

Recommended next step: a separate live spike with **one original component card
plus an e-backed adapter**, proving one real streamed turn, one real denied tool
approval, and session recovery. Keep this fixture as the visual/isolation control.
Only after that should production `LiveChat` be switched to the new adapter.

Relevant local source seams:

- `app/src/pages/canvas/LiveChat.tsx`
- `app/src/pages/canvas/live-store.ts`
- `app/src/pages/canvas/session-store.ts`
- `app/api/e/contracts.ts`

## Reproduce

Acquire the upstream tag and matching installed app separately. Replace paths:

```sh
node tools/experiments/pi-native-ui/prepare-deps.mjs SOURCE DEPS_DIR
npm install --ignore-scripts --no-audit --no-fund --prefix DEPS_DIR
node tools/experiments/pi-native-ui/build.mjs SOURCE DEPS_DIR OUTPUT_DIR \
  /Applications/PI-Desktop.app/Contents/Resources/app.asar
python3 tools/experiments/pi-native-ui/serve.py OUTPUT_DIR --port 4393
```

Open `http://127.0.0.1:4393/`, not the HTML file directly. The existing Codex
preview on port 4392 is independent and was left running.

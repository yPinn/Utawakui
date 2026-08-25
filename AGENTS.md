# AGENTS.md

This file contains project-specific guidance for coding agents. Do not duplicate
product status or detailed architecture here.

## Read First

- [Documentation map](docs/README.md): document roles and current ADR status.
- [Product specification](docs/spec.md): current scope, status and direction.
- [Architecture map](docs/architecture.md): implemented runtime and dependency boundaries.
- [Design guide](DESIGN.md): renderer visual system and component conventions.

When sources conflict, use the spec and active ADRs for intended behavior, then
verify current behavior in code, registries and tests. `tasks/`, when present, is
ignored local scratch and is never a durable product-status source.

## Product Boundary

Utawakui is a local-first Windows Electron control panel for OBS singing and cover
workflows. Local import, library and playback are the default core. Provider
acquisition, external lyrics, audio processing and public Output are separable,
gated flows. Do not add a built-in commercial library, licensing claims, chat song
requests, cloud collaboration or an OBS native plugin without an explicit product
decision.

## Commands

```bash
npm run dev
npm run dev:tools
npm run build
npm start
npm run dist:dir
npm run dist
npm run lint
npm run lint:md
npm run format:check
npm test
npm run test:coverage
npm run perf:startup
```

Tests are Vitest and stay next to the production file they cover. Use the recursive
`electron/lib/**/*.js` coverage shape: `electron/lib/library.js` and
`electron/lib/featureDependencies.js` are re-export barrels, while their logic lives
in subdirectories. Browser-bound player composables need DOM and Web Audio mocks;
do not force them into the plain Node test environment without providing those
boundaries.

## Runtime Rules

### Process Isolation

- `electron/main.js` is the composition root. Domain IPC belongs in
  `electron/main/*Handlers.js`, with named dependencies.
- Pure filesystem, provider, processing and protocol logic belongs in
  `electron/lib/`; it must not own BrowserWindow lifecycle.
- Renderer code uses `electron/preload.js` only. Keep `contextIsolation: true`,
  `nodeIntegration: false` and `sandbox: true`.
- Renderer intent must never provide filesystem paths, URLs, hashes, models,
  executables or arbitrary IPC channels that main can derive itself.

### Renderer State

- The HTML audio element is the only authority for playback timing and play state.
  Actions call the element; `play`, `pause`, `ended`, `timeupdate`, metadata and
  error events update reactive state.
- `usePlayer`, queue and lyrics composables remain the single renderer owners.
  Taskbar, SMTC, Performer Self-View and Output consume projections.
- The app uses module-scope composables and view switching, not Pinia or vue-router.
  Add either only for a demonstrated product need.
- `audio.crossOrigin = 'anonymous'` and the four-channel Web Audio graph are
  required. Separation channel order is accompaniment L/R then guide-vocal L/R.

### Local Media And Data

- Renderer media uses `utawakui-media:`. Keep privileged scheme registration before
  `app.whenReady()` and preserve `standard`, `stream`, `supportFetchAPI` and
  `corsEnabled` privileges.
- Range serving must return correct 206 responses. Do not replace the manual stream
  response with `net.fetch(file://...)` without byte- and header-level verification.
- The filesystem is authoritative for track existence. New assets live under
  `tracks/<trackId>/`; `library.json` stores scalar metadata only and no absolute
  paths.
- Sidecars are main-owned derived data. Renderer sends track ids and bounded product
  intents only.
- `playlists.json` owns ordered user collections. Source-backed albums have
  read-only membership from the renderer.

### Optional Services

- Every gated main operation rechecks its feature gate. A renderer notice is not a
  trust boundary.
- Provider runtime, FFmpeg, each active model and Audio Python capability locks are
  separate lifecycle units as defined in `docs/architecture.md`.
- Provider Python and Audio Python are different runtime families and must not share
  environments, activation files or process policy.
- `quick` and `general` are the runnable separation recipe intents. Refined and
  benchmark models must remain unavailable until their explicit gates pass.

### Output And Shared Code

- `overlay/` is an independent Browser Source delivery path, not a Vite view or an
  Electron window. It uses its own visual tokens.
- Canonical pure presentation projections belong in `shared/presentation/`;
  `overlay/shared/` contains Browser Source route adapters only.
- Output routes and media resolvers use exact allowlists. Never serve arbitrary
  renderer HTML, request-derived paths or filesystem data.
- Renderer remains player／queue／lyrics authority. Projection Hub validates
  `bootId`, `sourceEpoch` and revisions; the public WebSocket stays read-only.

### Errors And Diagnostics

- Operational errors are recorded in main with original private context, then
  crossed over IPC as bounded structured public errors.
- Gate-disabled flow is expected and is not a diagnostic failure.
- Do not expose stderr, provider bodies, paths, URLs or untrusted ids in public
  errors. Preserve `diagnosticRecorded` deduplication semantics.

## Packaging Rules

- `dist/` is the Vue renderer bundle; `overlay/` is packaged separately.
- Keep `electron-builder.yml`, `docs/operations/release-inventory.md` and packaging tests in
  sync whenever runtime files, workers, shared assets or dependencies move.
- The packaged executable filename intentionally remains `electron.exe`; installer
  product identity and AUMID are `Utawakui` / `com.utawakui.app`.
- App-managed optional dependencies do not belong in the base installer or startup
  critical path.

## UI Conventions

- Global renderer styles live in `src/styles/`; fixed public assets live in `public/`.
- Feature components are grouped under `src/components/<feature>/`; reusable
  primitives live in `src/components/ui/`.
- Prefer existing semantic design tokens and shared primitives. Avoid page-local
  hex colors, duplicate buttons, bespoke track rows or control-panel tokens in
  Overlay code.
- The control panel optimizes operator clarity and dense live use. Preserve visible
  focus, keyboard access, reduced-motion behavior and WCAG AA contrast.

## Change Discipline

- Keep changes minimal and preserve unrelated work in a dirty tree.
- Do not create commits until the user explicitly requests them. Keep iterative
  visual corrections uncommitted through manual acceptance.
- Add or update focused tests for changed contracts. Use CJS exports that remain
  statically discoverable where ESM tests import named values from CJS barrels.
- Vite HMR does not reload Electron main or preload code. Restart the complete dev
  process after those changes before treating desktop behavior as verified.
- Reproduce visual or alpha-composition failures in the same visible Electron／OBS
  mode. Offscreen capture and DOM/CSS assertions are supporting evidence, not
  substitutes for the requested manual acceptance.
- For architecture changes, update the relevant ADR or focused contract and the
  architecture map. For product status changes, update only the spec status table.
- Before completion, run proportionate lint, Markdown, formatting, tests, build and
  packaging/startup checks. Document only verified results.

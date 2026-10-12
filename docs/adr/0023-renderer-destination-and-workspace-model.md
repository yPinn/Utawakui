# ADR 0023: Renderer destination and workspace model

## Status

Accepted (2026-10-12). Implementation is planned in phased commits. Until the
navigation cutover is verified, the current `setlist`／`lyrics`／`output`／`import`
destinations remain runtime truth. This ADR defines the target information
architecture and migration constraints; it does not claim that the target is
already implemented.

## Context

The control panel currently exposes four Folder destinations named after the
first implementation modules: Setlist, Lyrics, Output and Import. That split no
longer matches the product boundary. Utawakui is now a local-first singing-session
control panel whose long-lived content root is the local library. Playlists feed
session preparation, live operation needs switchable tools, and OBS presentation
is a distinct operator workspace.

The existing destination names create three problems:

1. Import and Lyrics appear to be independent places even though their work is
   normally scoped to a track, a library task or an active performance.
2. Setlist mixes persistent library browsing with performance-session preparation,
   so a feature folder is incorrectly acting as the navigation model.
3. Output is both a technical projection domain and a user-facing destination.
   Reusing that word for both makes Browser Source runtime ownership look like
   page ownership.

The competitor evidence in
[competitive research](../research/competitive-research.md) supports lowering the
entry cost with user-language tasks such as singing and display. Utawakui cannot
collapse to only those two destinations, however, because the local library is
the product's durable content root rather than a setup detail.

## Decision

### Product destinations

The public control-panel navigation has three destinations:

| Visible label | Destination id | Composition owner               | Responsibility                                                                 |
| ------------- | -------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| 曲庫          | `library`      | `src/pages/LibraryPage.vue`     | Browse and organize local tracks, collections and track-scoped authoring work. |
| 演唱          | `performance`  | `src/pages/PerformancePage.vue` | Prepare a session and operate the bounded tools needed while singing.          |
| 顯示          | `display`      | `src/pages/DisplayPage.vue`     | Configure and inspect OBS／Browser Source public presentation.                 |

Settings remains a Titlebar utility; it is not a fourth Folder destination. The
target `SettingsPage` owns utility composition inside the existing
`AppUtilityPage` layout shell and initially wraps the current `SettingsView` body
as a migration adapter. Internal Tools remain development-only and are not part
of the product navigation.

The global keyboard order follows the visible order: F1 opens Library, F2 opens
Performance and F3 opens Display. F4 becomes unassigned rather than being reused
without a separate product decision. F5–F8 remain development-only workbenches,
and F9 remains Settings.

### Granularity contract

Renderer composition uses five levels:

| Level              | Meaning                                                     | Examples                                              |
| ------------------ | ----------------------------------------------------------- | ----------------------------------------------------- |
| Destination Page   | A stable user destination and top-level composition owner.  | `LibraryPage`, `PerformancePage`, `DisplayPage`       |
| Workspace          | A main-area task that may temporarily occupy a destination. | import, lyrics authoring, session preparation         |
| Panel／Tool        | A switchable or persistent instrument inside a context.     | live lyrics, Queue, player tools, Right Dock surfaces |
| Section／Object UI | A domain object or meaningful subsection of a task.         | track row, session item, output slot                  |
| `Ui*` primitive    | Domain-neutral behavior and visual anatomy.                 | button, search box, modal, tabs                       |

A component folder describes domain responsibility, not navigation. A workspace
may compose components from several domain folders, and a capability folder does
not gain a destination merely because it exists.

The first migration adds only `src/pages/`. It does not introduce parallel
`features/`、`entities/` or `workspaces/` directory trees. Existing
`src/components/<domain>/` folders remain the reusable domain boundary until a
real ownership conflict demonstrates that another level is needed.

### Contextual capabilities

Import, Lyrics, Analysis, Separation and Provider are capabilities opened from
the object or task that gives them meaning:

| Capability | Library context                                                 | Performance context                               | Display context                       |
| ---------- | --------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------- |
| Import     | Full workspace opened from Library.                             | Not exposed.                                      | Not exposed.                          |
| Lyrics     | Search, source management, text, timing and reading authoring.  | Read, synchronize and apply bounded live offsets. | Configure public lyrics presentation. |
| Analysis   | Track-scoped action and background job.                         | Consume verified results only.                    | Not exposed directly.                 |
| Separation | Track-scoped processing action and reusable result.             | Select or adjust an available result when needed. | Not exposed directly.                 |
| Provider   | Gated assistance inside import or track-scoped authoring flows. | Not a standalone live destination.                | Not exposed directly.                 |

The same canonical Lyrics, player, library and job owners continue to provide
state. Splitting authoring and live presentation means composing narrower
surfaces, not creating a second lyrics store or a mode-heavy duplicate
workspace.

### Performance time and tool dimensions

Reserve／待唱, confirmed Now Playing／演唱中 and History／已唱 are temporal
authorities of a performance session. They are not permanent destinations or
tabs, and the UI does not render empty future phases merely to make the layout
symmetrical.

These authorities remain distinct from playback projections:

- Session Reserve is not the playback Queue.
- Session History is not Recently Played or the Queue previous stack.
- Confirmed session playing may project a session-local display label, but media,
  timing and artwork continue to resolve through the canonical track id.
- BGM is a separate shell-owned playback lane and is never a session item.

Performance therefore composes the session state that currently exists and a
separate Live Tool Switcher. A tool switch changes the operator instrument; it
does not change the temporal phase.

### Persistent shell ownership

The IA migration does not move long-lived state into pages:

- the HTML audio element and `usePlayer` remain playback authority;
- Queue remains its own renderer owner;
- Lyrics retains one canonical renderer owner;
- PlayerBar, BGM, Right Dock and Titlebar remain shell-owned siblings;
- Right Dock session content remains a projection and entry point, while the full
  preparation workspace belongs to Performance;
- `overlay/` remains an independent Browser Source delivery path with its own
  tokens and route adapters.

Pages emit or consume bounded intent. They do not become new state stores.

### Rename and ownership matrix

The migration uses the following target mapping:

| Current navigation／owner                       | Target                                            | Migration rule                                                                                                  |
| ----------------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `setlist` destination                           | `library`                                         | Cut over only after Library contextual workspaces are reachable.                                                |
| `SetlistPage.vue`                               | Library-owned Workspace                           | Split first and name the extracted responsibility; use `LibraryBrowseWorkspace` only if it owns browsing alone. |
| `lyrics` destination／`LyricsView.vue`          | No destination                                    | Split into Library authoring and Performance live-tool compositions.                                            |
| `import` destination／`ImportPage.vue`          | Library `ImportWorkspace.vue`                     | Keep the old entry until the Library journey is verified.                                                       |
| `output` destination／`OutputPage.vue`          | `display`／`DisplayPage.vue`                      | Display composes the existing `ObsOutputWorkspace`; Output stays domain prose.                                  |
| `SettingsView.vue`                              | body adapter under `SettingsPage.vue`             | `SettingsPage` owns composition; `AppUtilityPage` remains the layout shell.                                     |
| `PerformanceSessionWorkspace.vue` under Setlist | Same workspace under Performance                  | Remove the coordinator's forced `setlist` navigation during the cutover.                                        |
| `setlist` surface                               | `library` surface                                 | Rename surface and overlay host in the same atomic navigation change.                                           |
| `lyrics` destination surface                    | contextual composition under Library／Performance | Add a registered child surface only when token, overlay-host or focus ownership requires one.                   |
| `output` surface                                | `display` surface                                 | Do not rename Output protocol, Overlay routes or `--ovl-*` tokens.                                              |
| `import` surface                                | child of `library`                                | Preserve gate, progress, error and cancellation owners.                                                         |

Navigation callers must express semantic intent before the cutover. Examples are
open Library content, open track lyrics authoring, open Performance live lyrics
and open session preparation. A temporary adapter may translate those intents to
the old destination ids, but it must remain one-way and must not create a second
active-destination state.

### Migration sequence

1. Add the `src/pages/` composition seam while preserving the current four
   visible destinations.
2. Split Lyrics authoring from live controls, make Import embeddable in Library,
   and replace direct old-id callers with semantic intents.
3. Atomically add Performance and switch navigation, shortcuts, surfaces, focus
   restoration and settings return behavior to `library`／`performance`／`display`.
4. After visible acceptance, rename workspace files and remove legacy adapters.
5. Update current-state architecture, design and product-status documents only
   after the implementation is verified.

The migration never hides an old formal entry before its replacement journey has
tests and an accessible return path.

## Rejected alternatives

- Keep Setlist／Lyrics／Output／Import as permanent destinations. This exposes
  implementation modules instead of current user goals.
- Reduce the product to only 「唱／顯示」. This hides the durable local-library
  root and makes preparation look subordinate to a live session.
- Add a top-level page for every capability. Analysis, Separation and Provider
  would repeat the same mistake as Import and Lyrics.
- Treat 待唱／演唱中／已唱 as fixed tabs. These are temporal authorities, and
  some phases are not implemented or relevant at all times.
- Move Player, Queue, Lyrics or BGM state into `PerformancePage`. Page lifetime
  must not create competing playback authorities.
- Introduce Vue Router, Pinia or a broad feature／entity taxonomy as part of the
  rename. The current module-scope composables and view switching remain adequate.
- Rename all folders during navigation cutover. That would mix behavioral risk
  with mechanical churn and make rollback difficult.

## Consequences

The public navigation becomes smaller and easier to explain, while capabilities
remain available at the point where the user needs them. Page names describe
destinations; domain folders continue to describe reusable ownership.

The transition requires temporary adapters and coordinated changes across
`App.vue`, Folder navigation, shortcuts, focus restoration, semantic entry
callers and the renderer surface registry. The destination cutover is therefore
one atomic, fully tested phase rather than a sequence of partially visible tab
changes.

Display becomes the user-facing destination name, but Output remains the correct
technical term for projection runtime, Browser Source routes and public data
contracts. Likewise, Performance does not rename Session, Queue or playback
history; it composes them without erasing their distinct authorities.

Current-state documents such as `docs/architecture.md` continue describing the
four-destination implementation until the cutover lands. The ADR and naming
contract are the intended-behavior sources during migration.

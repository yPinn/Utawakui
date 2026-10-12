# Codebase Naming Contract

This contract defines how names communicate ownership across the repository. It
does not require every runtime or file format to look alike.

## Framework-first rule

Established ecosystem conventions take priority over cosmetic uniformity:

- Vue SFC filenames use PascalCase. User-facing destination compositions live in
  `src/pages/` and end in `Page.vue`; a `View.vue` is a legacy composition or a
  development-only workbench, not a new product destination.
- Vue composable filenames and public factories use `useFeature`.
- JavaScript utilities and CommonJS modules use camelCase; constants use
  `UPPER_SNAKE_CASE`.
- Node/Electron handler files end in `Handlers.js` and export the matching
  `registerFeatureHandlers` function.
- Browser Source route directories and route-owned assets may use kebab-case;
  ESM assets keep `.mjs`, while Electron CommonJS keeps `.js`.
- Test files stay adjacent to the source or boundary they describe and use
  `.test.js`／`.test.mjs`. A behavior or cross-module contract test may use a
  descriptive suffix instead of pretending to have a one-file production owner.

Do not rename a stable upstream package term, URL path, IPC channel, serialized
field, or compatibility entry merely to make casing visually uniform.

## Repository matrix

| Scope                       | Naming rule                                                            | Example                                                  |
| --------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| `src/pages/`                | User destination composition ending in `Page`                          | `LibraryPage.vue`                                        |
| `src/components/<feature>/` | Product-role folder + PascalCase component                             | `output/ObsOverlayPreview.vue`                           |
| `src/views/`                | Legacy composition or dev-only workbench ending in `View`              | `MusicAnalysisView.vue`                                  |
| `src/composables/`          | Stateful Vue API beginning in `use`                                    | `useOutputRuntimeContext.js`                             |
| `src/utils/`                | Pure behavior named for its value or operation                         | `outputRoutes.js`                                        |
| `electron/main/`            | Lifecycle／IPC role in the filename                                    | `lyricsHandlers.js`                                      |
| `electron/lib/`             | Domain-qualified pure runtime responsibility                           | `lyricsReadingWorker.js`                                 |
| Contextual module           | Short name is allowed when its parent supplies the missing domain      | `featureDependencies/service.js`, `outputServer/http.js` |
| `shared/`                   | Cross-runtime contract or pure presentation role                       | `outputContract.js`                                      |
| `overlay/<route>/`          | Browser Source route and its owned assets                              | `now-playing/now-playing.mjs`                            |
| `scripts/`                  | Executable task or policy in kebab-case; imported helpers in camelCase | `music-analysis-evaluation.mjs`, `coveragePolicy.js`     |

A contextual module such as `service.js`, `state.mjs`, or `http.js` is valid only
inside a directory that makes its full responsibility direct when read as a path.
Broad-root modules must carry the domain in their filename.

During the ADR 0023 migration, remaining product files such as `SetlistPage.vue`,
`OutputPage.vue` and `SettingsView.vue` are bounded legacy adapters until their
callers move in Phase 4. The former `ImportPage.vue`／`ImportView.vue` adapters are
already removed because Import now owns a Dock panel plus modal review rather than
a destination Page. No new product destination or caller may adopt the remaining
legacy names. `AppFolderPage` and `AppUtilityPage` are
established layout-shell components named for the page frame they render; they
are not destination compositions and do not justify new feature-local `*Page`
names.

## Renderer composition scale

The filename must state the component's composition scale:

| Suffix／prefix          | Responsibility                                                             |
| ----------------------- | -------------------------------------------------------------------------- |
| `*Page.vue`             | A stable public destination or shell utility composition.                  |
| `*Workspace.vue`        | A main-area task that may temporarily occupy one destination.              |
| `*Panel.vue`            | A bounded region that can coexist with its surrounding task.               |
| `*Tool.vue`             | A switchable operator instrument; it does not own destination navigation.  |
| `*Section.vue`          | A meaningful subsection of one task or page.                               |
| `*Row.vue`／`*Card.vue` | One domain object presentation; the surrounding list remains caller-owned. |
| `Ui*`                   | Domain-neutral visual and interaction primitive.                           |

These names communicate ownership rather than size. A large component is not a
Page unless it is a real destination, and a full-height capability can remain a
Workspace. Time states such as Reserve／Now Playing／History are domain state, not
component scales or navigation names.

Component folders remain domain-oriented. `src/components/lyrics/` may supply an
authoring Workspace to Library and a live Tool to Performance; neither placement
creates a Lyrics destination. New Page composition may import across domain
folders without moving the imported components into a Page-named directory.

## Domain vocabulary

- **Library** is the public destination and durable local-content context.
  **Playlist**, **album**, **artist** and **Setlist** remain domain objects or
  projections; they do not rename the Library destination.
- **Performance** is the public destination that composes session preparation and
  live tools. **Session Reserve**, confirmed **Now Playing** and **History** remain
  distinct temporal authorities and are not synonyms for Queue or Recently
  Played.
- **Display** is the user-facing destination for configuring public presentation.
  **Output** remains the technical projection domain; Output runtime, server,
  Overlay routes and `--ovl-*` tokens are not renamed to Display.

- **Output** is the complete public projection feature. **Output runtime** owns
  Electron lifecycle and settings; **Output server** owns HTTP／WebSocket
  transport; **Overlay** is the read-only Browser Source renderer; **Workbench**
  is the control-panel inspection and configuration surface.
- **Music Analysis** is the user-facing capability, process, and Workbench.
  **Music Structure** is the produced document, sidecar, validated signal set,
  and IPC contract. These names are complementary, not synonyms to normalize.
- **Provider** names the gated acquisition boundary. `YouTube`, `yt-dlp`, LRCLIB,
  and Musixmatch remain concrete implementation or source names where that
  specificity matters.
- **Lyrics reading** covers the local Japanese reading and Korean romanization
  document pipeline. Runtime files at the broad `electron/lib/` root therefore
  use the `lyricsReading` prefix.
- **Separation** is the product action and result. **Audio processing** is the
  wider execution infrastructure that can also host analysis capabilities.
- Acronyms follow host-language casing: `Obs`, `Lrclib`, `Ffmpeg`, and `Ytdlp` in
  PascalCase/camelCase identifiers; `OBS`, `LRCLIB`, `FFmpeg`, and `yt-dlp` in
  user-facing prose where those are the established product spellings.

## Rename threshold

Rename only when at least one condition is demonstrable:

1. The file's public owner cannot be inferred from its full path.
2. The filename contradicts its exported API or framework convention.
3. Two names incorrectly imply duplicate ownership of one state or service.
4. A role-based asset is named after temporary content instead of its product use.

Large mixed-responsibility files are split before being cosmetically renamed.
Compatibility barrels retain stable entry paths until callers are migrated and
the barrel can be removed deliberately.

Navigation names are derived from product destinations, never from the current
`components/<domain>/` folder list. During the ADR 0023 migration, legacy product
Views and destination ids may remain only as bounded adapters; no new caller may
depend directly on them when a semantic navigation intent exists.

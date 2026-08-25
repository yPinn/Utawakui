# Codebase Naming Contract

This contract defines how names communicate ownership across the repository. It
does not require every runtime or file format to look alike.

## Framework-first rule

Established ecosystem conventions take priority over cosmetic uniformity:

- Vue SFC filenames use PascalCase; route-level views end in `View.vue`.
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
| `src/components/<feature>/` | Product-role folder + PascalCase component                             | `output/ObsOverlayPreview.vue`                           |
| `src/views/`                | Composition surface ending in `View`                                   | `MusicAnalysisView.vue`                                  |
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

## Domain vocabulary

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

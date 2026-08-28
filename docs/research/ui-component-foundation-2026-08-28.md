# UI Component Foundation

Status: implemented foundation candidate; visible acceptance and page migration
remain pending.

This record defines the shared Electron renderer component boundary that must be
accepted before Studio Library pages migrate. It changes the existing
`src/components/ui/` source directly and does not create a parallel `V2` component
library. `src/styles/tokens-v2.css` remains isolated from production renderer
entries until a later adoption decision.

## Architecture

| Layer               | Responsibility                                                                     | Examples                                                             |
| ------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Foundation          | Primitive values, semantic roles, focus, motion, density, and native-control basis | `tokens.css`, `tokens-v2.css`, `base.css`                            |
| Atomic primitive    | One native or visual interaction contract                                          | Button, text field, select, checkbox, range, progress                |
| Compound pattern    | Coordinates multiple primitives or one composite keyboard model                    | Field, search, tabs, modal, context menu, notice, track row          |
| Feature composition | Owns product data, renderer state, and workflow behavior                           | Playlist sidebar, queue, PlayerBar, settings blocks, Dossier modules |

Pages and shell roots remain composition surfaces. A layout repeating twice does
not automatically become a shared primitive; it needs stable semantics, behavior,
and a reusable consumer contract.

## Adoption Baseline

The baseline audit found sixteen Vue components. Seven new contracts plus the
normalized existing `UiTextField` bring the shared directory to twenty-three Vue
components. The ownership and adoption decisions are:

| Shared contract                                                                      | Decision                     | Current consumer boundary                                               |
| ------------------------------------------------------------------------------------ | ---------------------------- | ----------------------------------------------------------------------- |
| `UiButton`, `UiIconButton`, `UiTextButton`                                           | Preserve／adapt              | Actions across analysis, lyrics, output, playback, playlists, settings  |
| `UiChip`, `UiHint`, `UiNotice`, `UiStatusIcon`                                       | Preserve／adapt              | Status and support copy across every feature family                     |
| `UiModal`, `UiContextMenu`                                                           | Preserve behavior／normalize | Dialog and menu surfaces; keep existing focus and close ownership       |
| `UiCollageThumb`, `UiTrackThumb`, `UiTrackRow`                                       | Preserve／token-normalize    | Playlist, library, queue, import, lyrics track selection                |
| `UiMarqueeText`, `UiPageHeader`                                                      | Preserve／motion-normalize   | Player／queue／playlist text and top-level view headings                |
| `UiSearchBox`                                                                        | Structural correction        | Setlist, analysis picker, provider review; label no longer wraps button |
| `UiTextField`                                                                        | Normalize through `UiField`  | Lyrics search and provider review forms                                 |
| `UiField`, `UiTextarea`, `UiSelect`, `UiCheckbox`, `UiRange`, `UiProgress`, `UiTabs` | Add shared gap contracts     | Component lab first; feature adoption waits for a focused page slice    |

No existing component is retired in this pass. Feature components keep product
state and data ownership; the new controls only replace repeated native-control
presentation after their consumer is migrated deliberately.

The production component tree still contains eight native `select` elements, six
checkboxes, four ranges, two textareas, three independent tab implementations, and
one progressbar. These are proven contract gaps. The first foundation pass adds or
normalizes:

- `UiField`;
- `UiTextField`;
- `UiTextarea`;
- `UiSelect`;
- `UiCheckbox`;
- `UiRange`;
- `UiTabs`;
- `UiProgress`.

Radio and switch behavior are specified only when a confirmed product consumer
exists. There is no generic `UiCard`: Controlled Dossier, settings blocks, player
panels, and media rows have different structural semantics.

## Field Contract

`UiField` owns presentation and accessibility relationships. Native-control
components own values and native behavior.

Every visible field must provide:

- a stable `id` shared by the native control and its `<label for>`;
- a concise visible label; visually hidden labels remain real labels;
- `aria-describedby` containing the active hint or error id without discarding a
  caller-provided description id;
- `aria-invalid="true"` and an alert-associated error when invalid;
- native `required` and `disabled` attributes where supported;
- native attributes and listeners forwarded to the real control rather than the
  wrapper;
- a predictable `update:modelValue` event sourced from the native event value;
- a bounded public `focus()` method only where current consumers require it.

Error content replaces ordinary hint content in the field-owned message slot. A
caller may add an external description id; duplicate ids are removed while order is
preserved. Placeholder text is never a label.

## Token Contract

The renderer keeps three layers:

1. primitive tokens contain raw palette and scale values;
2. semantic tokens assign purpose and theme meaning;
3. component tokens exist only for stable control contracts.

Representative field mappings make the direction explicit:

| Component role                 | Semantic role               | Primitive／scale source            |
| ------------------------------ | --------------------------- | ---------------------------------- |
| `--ui-field-bg`                | `--ui-color-surface-raised` | neutral palette, remapped by theme |
| `--ui-field-fg`                | `--ui-color-text`           | neutral／warm-neutral palette      |
| `--ui-field-border-invalid`    | `--ui-color-danger`         | Clear Pastel red signal            |
| `--ui-field-height`            | `--ui-control-height`       | rem density contract               |
| `--ui-field-padding-*`         | `--ui-space-*`              | rem spacing scale                  |
| `--ui-field-radius`            | `--ui-radius-md`            | rem shape scale                    |
| checkbox／range／progress size | `--ui-space-*`              | rem spacing scale                  |

Clear Pastel status colors split by role in the light theme: darker hue-matched
semantic foregrounds meet text／control contrast, while the pastel primitives remain
the source for `*-soft` fills. A pastel primitive must never be promoted directly to
a light-theme text or border role without contrast evidence.

Shared fields use concise `--ui-field-*` component tokens that reference semantic
color, spacing, radius, typography, focus, and motion tokens. Component SFCs do not
contain raw colors or duplicated timing values. Scalable geometry uses `rem`; only
one-pixel accessibility utilities, hairlines, and focus outlines remain explicit
CSS pixels. JavaScript values crossing pixel-based DOM coordinate or raster-size
APIs remain pixels at that boundary; authored CSS geometry and breakpoints do not.

The active token file receives compatibility-preserving semantic names such as
`--ui-radius-md`, `--ui-font-weight-semibold`, and
`--ui-motion-duration-fast`. Candidate components consume those names directly;
legacy aliases remain only while untouched consumers still require them.

## State Matrix

| Contract                 | Required states                                                             |
| ------------------------ | --------------------------------------------------------------------------- |
| All interactive controls | default, hover, active where meaningful, focus-visible, disabled            |
| Async actions／progress  | determinate or indeterminate, busy announcement, reduced motion             |
| Fields                   | empty, populated, required, disabled, hint, invalid/error                   |
| Selectable controls      | unchecked／unselected, checked／selected, disabled                          |
| Themes and density       | dark, light, standard, compact where the token contract remaps              |
| Accessibility            | keyboard operation, visible focus, name／description association, 200% zoom |

## Compatibility And Migration Gates

- Existing default props, emitted event names, and feature-state ownership remain
  compatible unless a focused behavior test proves and documents a correction.
- Shared visual changes use semantic or necessary component tokens; no
  `UiButtonV2`, `UiFieldV2`, or page-local duplicate is permitted.
- The isolated component lab renders the real shared Vue components under candidate
  tokens but is not a production renderer entry.
- Focused component tests, full tests, coverage ratchet, lint, formatting, Markdown,
  production build, candidate token graph, and candidate import isolation must pass.
- Setlist is the first page-level adoption slice only after this component
  foundation receives visible and behavioral acceptance.

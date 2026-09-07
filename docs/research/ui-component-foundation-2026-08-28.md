# UI Component Foundation

2026-09-07 note: this is the foundation implementation record. The owner has since
required an F8 sequential review of Foundation and each component before returning
to the F7 View candidate. Current status and the next Select phase are maintained
in [Token v2 Component Review](../contracts/token-v2-component-review.md).

Status: implemented foundation candidate; a development-only real-library Setlist
slice is active, while visible acceptance and production page migration remain
pending.

This record defines the shared Electron renderer component boundary that must be
accepted before Studio Library pages migrate. It changes the existing
`src/components/ui/` source directly and does not create a parallel `V2` component
library. `src/styles/tokens-v2.css` remains isolated from production renderer
entries until a later adoption decision.

## Phase Handoff Snapshot

As of 2026-08-30, the component-foundation implementation is complete for the
current development slice:

- shared primitives were audited and corrected in place; no `V2` component fork
  was created;
- the native F7 Controlled Dossier reuses real library／playlist projections, the
  production Sidebar, and the production PlayerBar while remaining read-only;
- metadata is a conditional shell-level Context Inspector outside `AppInnerPage`,
  not a permanently reserved page column;
- Inspector visibility has one session-scoped owner, while the rail icon, expanded
  header icon, and PlayerBar artwork project the same disclosure contract;
- candidate tokens remain development-only, and production-bundle exclusion is
  verified.

The current gate is owner-visible F7 acceptance. Until it passes, the sample
metadata fields are not a generic block API, the candidate token mappings are not
a production contract, and production pages must not migrate. After acceptance,
freeze only the component／token subset proven by this slice. The owner authorized
an implementation snapshot commit on 2026-09-02; this records the candidate but
does not waive visible acceptance. The next implementation slice should connect
track selection and playback to the existing player／queue owners; it must not
expand the shared component layer speculatively.

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

The development-only Controlled Dossier follows the same boundary. `UiNotice`
owns informational icon／copy alignment and announcement semantics; `UiChip` owns
inline badge geometry; `UiStatusIcon` distinguishes a named standalone status from
a decorative glyph whose adjacent copy already carries the meaning; `UiSearchBox`,
`UiCollageThumb`, and `UiTrackThumb` keep their established contracts. The Dossier
header and track table remain feature compositions. `AppArchiveFrame` owns an
optional shell-level `context` slot;
`StudioLibraryContextInspector` remains feature-owned but renders through that
slot, outside `AppInnerPage`. In particular, the track table keeps its aligned
number／track／source／duration columns instead of forcing them into `UiTrackRow`'s
flex-row contract. Candidate-token scoping changes token values, not component
ownership, and is not a valid reason to duplicate a shared primitive.

### Context Inspector block specification

The Inspector may eventually contain multiple independently evolving information
blocks, but the current collection summary is not sufficient evidence for a stable
field-level component API. Freeze only these responsibility boundaries now:

| Boundary                | Owns                                                                                                        | Does not own                                          |
| ----------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Context Inspector shell | expanded／collapsed state projection, scroll containment, desktop rail and compact temporary-panel geometry | feature data, field order, playback state             |
| Context header          | active context identity and the canonical toggle intent                                                     | metadata editing or collection navigation             |
| Context block           | section heading, optional status／action area, and one body slot                                            | a universal metadata schema or fixed fact count       |
| Feature block payload   | semantic markup appropriate to facts, now-playing context, notes, provenance, or future tools               | shell width, collapse behavior, global spacing tokens |

Both the PlayerBar artwork and the Inspector header／rail icon invoke the same
session-scoped toggle action. PlayerBar receives the current expanded state and
controlled-region id, so its artwork button announces state-specific expand／
collapse copy plus `aria-expanded`／`aria-controls`; the dev-only controller is
loaded behind the same compile-time development boundary as the context view. The
collapsed rail is one stretched `UiIconButton`, not inert rail chrome containing a
small target: its entire surface carries the primitive's hover, pressed, and
focus-visible behavior. The expanded header uses the ordinary `UiIconButton`
variant for the matching collapse action, while collection artwork is rendered by
the existing `UiCollageThumb` cover／album-fallback contract. A future block
extraction may proceed only after at least two real block types share the same
heading／action／body anatomy and the accepted metadata taxonomy establishes minimum,
typical, empty, loading, error, and overflow states. Until then, keep the current
sections inside the feature composition. Facts use only a stable
`id`／`label`／`value` projection shape; do not encode sample labels such as `曲目`,
`總長`, or `格式` into a generic component contract.

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
- The isolated component lab and development-only Studio Library view render real
  shared Vue components under candidate tokens; neither is a production renderer
  entry.
- Focused component tests, full tests, coverage ratchet, lint, formatting, Markdown,
  production build, candidate token graph, and candidate import isolation must pass.
- The Metadata feature boundary validates its effective active＋candidate token
  references, and the Archive Frame／Inspector compact breakpoints remain paired by
  contract because ordinary CSS custom properties cannot define media conditions.
- `AppArchiveFrame` owns the Context Inspector's matching block-axis gutters. The
  feature component owns neither shell edge compensation nor page-local negative
  offsets; expanded and collapsed states therefore share the same top／bottom
  boundary above PlayerBar.
- Setlist is the first adoption slice. Its current F7 implementation is native Vue
  and reads the real library, but remains read-only and development-only until the
  component foundation and dossier receive visible and behavioral acceptance.

# Visual System Foundation

2026-09-07 note: this dated document remains the source for the selected visual
direction, but its “immediate next phase” section is historical. The owner inserted
the sequential F8 Foundation／component review gate before F7 View acceptance.
Current status and next decisions are maintained in
[Token v2 Component Review](../contracts/token-v2-component-review.md).

Status: implemented development candidate — the foundation, shared-component
contracts, and native F7 real-library slice have passed automated verification.
Owner-visible acceptance, candidate contract freeze, and production page migration
remain pending.

This document records visual-foundation decisions made after the approved
discovery brief and Studio Library direction. It does not authorize production
CSS or Vue component changes.

## Session Handoff Snapshot

As of 2026-08-30, the documented decision chain and implementation boundary are:

1. [Visual System Discovery](visual-system-discovery-2026-08-25.md) owns the
   approved product context, Session／Output／Feature Gate UX boundaries, viewport
   targets, platform posture, and control-panel／Overlay separation.
2. [Visual Direction Options](visual-direction-options-2026-08-25.md) owns the
   approved Direction B／Studio Library choice.
3. This document owns the selected foundation relationships, the development-only
   validation slice, and the remaining review gates.
4. [UI Component Foundation](ui-component-foundation-2026-08-28.md) owns the
   primitive／compound／feature boundaries and compatibility rules used by that
   slice.

Selected direction:

- macOS-like tool shell × Spotify-like music workspace;
- dark-first with an official light companion;
- Clear Pastel semantic signal families;
- Architectural Slate neutral／folder-material／accent relationship;
- `60／30／10` whole-screen visual weight;
- stable sidebar, full-width player bar, and main-filling archive frame;
- Controlled Dossier folder interior with restrained medium physicality and one
  in-flow note grammar;
- fixed rem-based product typography with structural narrow-window reflow;
- responsibility-based units, a `4px`-equivalent rem spacing scale, and discrete
  standard／compact density modes;
- restrained `2／4／6／8px`-equivalent radii, flat archival elevation, and a
  semantic z-index scale;
- a display-refresh／60Hz quality target with a measured, constrained 30Hz
  custom-loop capability that remains separate from reduced motion;
- restrained `100／140／200／280ms` timing, three purpose-based easing curves,
  component motion limits, and an OS-authoritative reduced-motion remap.

Implemented and automatically verified:

- a native Vue F7 view using the real local library and playlist projections;
- reuse of the mature production Sidebar and PlayerBar around a read-only
  Controlled Dossier composition;
- an external shell-level Context Inspector that expands, collapses, and uses the
  PlayerBar artwork as a symmetric disclosure entry point;
- shared primitive reuse for notices, chips, status icons, search, artwork,
  thumbnails, and Inspector icon buttons;
- desktop／compact source contracts, focused and complete tests, coverage ratchet,
  lint／format／Markdown, candidate token graph, production build, and production-
  bundle exclusion of the development-only view and candidate token payload.

Still candidate or pending:

- owner-visible F7 acceptance of material weight, metadata rail, note prominence,
  density, hierarchy, hover／focus behavior, and artwork at `1440 × 810` and
  `960 × 650`, in dark and light themes;
- accepted track-selection, playback-context, queue-precedence, and end-of-context
  behavior wired through the existing player／queue owners;
- final primitive → semantic → necessary component token freeze;
- a separately planned production page migration and later integrated-GPU／OBS
  performance matrix.

Production boundary:

- the product name, icon, Overlay tokens／templates, Session behavior, and Output
  behavior are unchanged;
- `src/styles/tokens.css` remains the active production token contract;
- `src/styles/tokens-v2.css` is imported only by the compile-time development F7
  module and remains absent from production bundles;
- shared components were compatibility-hardened in place, but production pages
  have not adopted the Studio Library visual system or Controlled Dossier layout.

History boundary:

- the owner authorized an implementation snapshot commit on 2026-09-02 for the F7
  native slice, Inspector, supporting shared-component changes, tests, candidate-
  token adjustments, and these records;
- that commit preserves the candidate for session handoff but does not constitute
  visible acceptance, a final token freeze, or production-page migration approval.

## Parallel Token File Contract

The visual refresh is expected to replace most of the current token values and
some token structure. Do not incrementally rewrite the active
`src/styles/tokens.css` while the system is still being designed.

- `src/styles/tokens.css` remains the active legacy contract.
- `src/styles/tokens-v2.css` is the inactive candidate contract and is not
  imported by either renderer entry point.
- The candidate is scoped to `:root[data-ui-system='v2']` so a future isolated
  prototype can opt in without overriding the active application.
- Keep both files until color, typography, spacing, shape, motion, and principal
  components have reached a reviewable level. Adoption or replacement requires
  a separate owner decision.
- Overlay continues to use its independent `--ovl-*` contract and is not part of
  this file migration.

Use concise conventional naming by layer:

| Layer       | Pattern                                   | Example                     |
| ----------- | ----------------------------------------- | --------------------------- |
| Color value | `--ui-palette-{hue}-{step}`               | `--ui-palette-indigo-400`   |
| Semantic    | `--ui-{category}-{role}[-{state}]`        | `--ui-color-surface-hover`  |
| Type scale  | `--ui-font-{property}-{step}`             | `--ui-font-size-lg`         |
| Leading     | `--ui-line-height-{role}`                 | `--ui-line-height-body`     |
| Spacing     | `--ui-space-{step}`                       | `--ui-space-4`              |
| Radius      | `--ui-radius-{step}`                      | `--ui-radius-md`            |
| Elevation   | `--ui-shadow-{role}`                      | `--ui-shadow-overlay`       |
| Stacking    | `--ui-z-{role}`                           | `--ui-z-dialog`             |
| Motion      | `--ui-motion-{property}-{role}`           | `--ui-motion-duration-fast` |
| Component   | `--ui-{component}-{property}[-{variant}]` | `--ui-control-height-live`  |

Components must not reference palette primitives directly. Add a component token
only when a component owns a real reusable override or state contract; otherwise
use the semantic token and avoid alias inflation. Temporary names such as `new`,
`final`, or palette-specific component names are not part of the token API.

## Stable Shell Anchors

The visual refresh preserves two established control-panel structures:

- The left sidebar remains the playlist／navigation surface.
- The bottom player bar remains the persistent playback control console.
- The right main region is filled by the archive／folder frame and its active page,
  rather than using the main canvas to hold a smaller folder card.

Their palette, typography, spacing, states, responsive treatment, and component
CSS may change with the new system. Their overall placement and product role do
not change as part of the visual refresh. Do not use a style migration to
silently redesign either information architecture.

All page-owned controls belong inside the archive／folder content boundary. This
includes page identity, readiness or visibility context, search／filter controls,
primary actions, and the content itself. Only genuinely shell-owned UI, such as
the persistent player bar or global notices, belongs outside that block.

Internal implementation may later be divided into clearer components or shared
abstractions when ownership, playback authority, keyboard behavior, persistence,
and visible behavior remain intact. Treat that as a focused refactor plan rather
than a prerequisite for establishing visual tokens.

## Status Color Direction

Use a restrained **Clear Pastel** posture derived from Zebra Mildliner color
families. The reference is inspirational rather than a claim that these are
official Zebra digital values.

The owner selected Clear Pastel over the softer baseline because its semantic
colors are easier to distinguish while retaining a light, marker-like character.
Color changes must not implicitly change indicator geometry, glow, coverage, or
component styling.

The conventional semantic baseline uses five hue families and six roles:

| Hue family | Semantic role | Product interpretation                                                       |
| ---------- | ------------- | ---------------------------------------------------------------------------- |
| Gray       | Neutral       | Idle, stopped, inactive, or not started.                                     |
| Blue       | Information   | Informational state, preparation, loading, or progress.                      |
| Green      | Success       | Ready, healthy, available, or completed.                                     |
| Amber      | Warning       | Attention or recoverable action required.                                    |
| Red        | Live          | Explicit public／performance state with persistent text or icon.             |
| Red        | Danger        | Failure, emergency, or destructive action with distinct component treatment. |

Confirmation and Feature Gate do not receive a unique purple status family.
Normal confirmation uses the future theme accent; warning is used only when the
user must address a blocking or degraded condition. Output maps its actual state
to the semantic roles rather than owning a permanent color.

## Candidate Signal Values

These values reproduce the approved comparison image. They are candidates for
the eventual primitive palette, not accepted production tokens. Final mapping
requires representative in-app screenshots, dark／light contrast verification,
color-vision simulation, and checks that labels, icons, placement, or shape carry
the same meaning without color.

| Role        | Dark candidate | Light candidate |
| ----------- | -------------- | --------------- |
| Neutral     | `#B2B8BF`      | `#BEC5CC`       |
| Information | `#7EC9ED`      | `#86D7FD`       |
| Success     | `#95CF96`      | `#9FDDA0`       |
| Warning     | `#EBC669`      | `#F7D37B`       |
| Live        | `#F79494`      | `#FFA9A8`       |
| Danger      | `#F79494`      | `#FFA9A8`       |

Comparison artifact:
[Soft Mildliner／Clear Pastel comparison](mildliner-status-colorize-comparison.png).

## Remaining Color Work

### Composition And Folder Material Direction

The owner selected a `60／30／10` visual-weight reference and identified
[Mosby's Files](https://www.awwwards.com/sites/mosbys-files) as the source of the
current folder-tab concept. Apply the ratio across a representative screen, not
inside every component:

- **60% neutral system structure:** canvas, chrome, ordinary surfaces, text, and
  negative space.
- **30% folder material layer:** collection, playlist, import-group, lyrics-source,
  or archive-like object surfaces.
- **10% primary accent:** selected tabs, primary actions, focus, and current-item
  cues.

Folder materials may use a small fixed palette, but they are not additional
interactive accents and must not reuse Clear Pastel status colors as decoration.
Translate Mosby's high-chroma stacked folders into restrained indigo, plum, and
olive material families; reserve red and amber for Live／Danger and Warning.

### Architectural Slate Direction

The owner selected **Architectural Slate** from the dark-first comparison. Its
relationship is adapted from Color Lisa's
[Rhythm of a Russian Dance](https://colorlisa.com/) palette for Theo van
Doesburg: `#BD748F`, `#3D578E`, `#BFAB68`, `#DAD7D0`, and `#272928`.

This selection approves the relationship, not a direct copy of every source
swatch into production:

- Graphite owns application canvas, chrome, and neutral surfaces.
- Light indigo `#8296D0` is the one interactive accent candidate.
- Deeper indigo `#3D578E` is the primary folder material and is not another
  action accent.
- Plum `#694D64` and olive `#69634E` are subordinate folder materials only.
- Warm neutral `#DAD7D0` is paper or document material, not the global dark-theme
  foreground.
- Clear Pastel remains the only semantic status palette.

The current dark semantic candidates are:

| Role              | Candidate | Intended use                                            |
| ----------------- | --------- | ------------------------------------------------------- |
| Canvas            | `#191A1E` | Window background and deepest workspace plane.          |
| Surface           | `#272928` | Sidebar, stable panels, and ordinary containers.        |
| Raised surface    | `#2D2F35` | Menus, popovers, and floating controls.                 |
| Hover surface     | `#3C3E46` | Neutral pointer hover.                                  |
| Active surface    | `#50535B` | Neutral pressed or active state.                        |
| Selected soft     | `#293A5B` | Indigo-tinted selection without a filled accent action. |
| Foreground        | `#F3F1EC` | Primary text and icons.                                 |
| Muted foreground  | `#A7A9AF` | Secondary text with body-text contrast.                 |
| Decorative border | `#3C3E46` | Low-pressure grouping and separators.                   |
| Control boundary  | `#70737B` | Boundaries that must reach 3:1 against `Surface`.       |
| Accent            | `#8296D0` | Primary action, focus anchor, and selected emphasis.    |
| Accent hover      | `#A5B3D8` | Hover for accent-filled controls.                       |
| Accent contrast   | `#191A1E` | Text and icons on the accent fill.                      |

The light theme remaps the same primitives instead of inverting the dark theme:

| Role              | Candidate | Intended use                                          |
| ----------------- | --------- | ----------------------------------------------------- |
| Canvas            | `#E8E4DD` | Warm outer workspace plane.                           |
| Surface           | `#F3F1EC` | Sidebar, stable panels, and ordinary containers.      |
| Raised surface    | `#FBFAF7` | Menus, popovers, and floating controls.               |
| Hover surface     | `#E2E2E4` | Neutral pointer hover.                                |
| Active surface    | `#C7C8CC` | Neutral pressed or active state.                      |
| Selected soft     | `#E0E5F3` | Pale indigo selection without a filled accent action. |
| Foreground        | `#272928` | Primary text and icons.                               |
| Muted foreground  | `#50535B` | Secondary text with body-text contrast.               |
| Decorative border | `#C7C8CC` | Low-pressure grouping and separators.                 |
| Control boundary  | `#85888F` | Boundaries that must reach 3:1 against `Surface`.     |
| Accent            | `#3D578E` | Primary action, focus anchor, and selected emphasis.  |
| Accent hover      | `#334873` | Hover for accent-filled controls.                     |
| Accent contrast   | `#F3F1EC` | Text and icons on the accent fill.                    |

Light folder materials use `#A5B3D8`, `#E3BCCF`, and `#DED39F`; paper uses
`#FBFAF7`. This retains the folder relationship without carrying the dark
theme's visual weight into a light workspace.

Each theme also exposes its matching native control scheme through the semantic
`--ui-color-scheme` token (`dark` or `light`). The prototype applies that token
to the document root so scrollbars, form controls, and other Chromium-owned
surfaces do not retain dark chrome in the official light theme.

Initial contrast checks pass the intended WCAG thresholds:

| Pair                      | Dark      | Light     | Threshold            |
| ------------------------- | --------- | --------- | -------------------- |
| Foreground／Canvas        | `15.40:1` | `11.56:1` | AA body text         |
| Muted foreground／Surface | `6.23:1`  | `6.82:1`  | AA body text         |
| Accent／Surface           | `5.04:1`  | `6.30:1`  | AA body text         |
| Accent contrast／Accent   | `5.98:1`  | `6.30:1`  | AA body text         |
| Status contrast／fill min | `7.96:1`  | `8.01:1`  | AA body text         |
| Control boundary／Surface | `3.09:1`  | `3.14:1`  | Non-text UI boundary |

These are mathematical pair checks, not complete accessibility acceptance.
Representative component states, opacity, adjacent colors, color-vision
simulation, and real Electron rendering still require validation.

Clear Pastel light values are intentionally pale. They must not be used as
standalone colored body text or a fine icon on a light surface. Use a bounded
indicator or fill with `status-contrast`, a contrasting outline, a stable label
or icon, and consistent placement. Color remains supportive rather than the only
carrier of meaning.

Folder component tokens should reference semantic material roles rather than raw
palette colors:

- `folder-primary` → deep indigo;
- `folder-secondary` → plum;
- `folder-tertiary` → olive;
- `folder-paper` → warm neutral paper;
- selected, focused, and actionable states remain separate accent／focus roles.

Do not use folder variants to communicate status, feature level, ownership,
legality, or readiness. Product-category assignment remains undecided until the
information architecture and representative components are reviewed.

Review artifact:
[Architectural Slate dark token map](architectural-slate-dark-token-map.png).

Theme-pair artifact:
[Architectural Slate dark／light comparison](architectural-slate-theme-pair.png).
The comparison preserves the implemented shell grid: full-width title bar,
playlist／navigation sidebar beside the main workspace, and a full-width
persistent player bar below both columns. It is a palette and styling study, not
a shell-layout proposal.

### Controlled Dossier Folder Interior

The owner selected **Controlled Dossier／受控檔案冊** as the folder-interior
direction after reviewing Mosby's Files' I. M. Pei case page. It carries the
reference's archive character into an operational product surface without
copying its editorial collage behavior.

The stable anatomy is:

1. Integrated folder tabs define the active workspace category.
2. The folder frame fills the primary workspace column rather than sitting inside
   another page card. An optional shell-level Context Inspector may sit beside it.
3. A bounded internal header owns the page title, readiness／visibility context,
   and primary actions.
4. A paper plane owns the structured list, table, editor, or grid appropriate to
   the active category.
5. Stable contextual facts belong to the optional Context Inspector, not a fixed
   column inside every dossier page.
6. Note and preview modules stay in normal document flow and communicate real
   information; they do not overlap controls or become decoration.

Use medium physicality: tabs, shallow layers, material color, and a restrained
paper boundary are enough. Do not use random rotation, scrapbook overlap,
physical props, large yellow fields, or decorative right-edge navigation in the
control panel. Repeated music rows keep Spotify-like scan efficiency even when
their parent collection uses the dossier metaphor.

Theme behavior is semantic rather than literal inversion. The light theme can use
the warm-white paper candidate as the full content plane. The dark theme uses a
neutral dark dossier plane and reserves warm paper for smaller document-like
modules; a large bright sheet would undermine low-light live operation.

Folder colors remain object material. Selection, focus, status, and actions keep
their independent semantic roles, so changing a folder hue cannot silently change
interaction meaning.

#### Accepted Material Weight

The reviewed anatomy is accepted with a lighter material perimeter. This is a
scale correction, not a new folder direction:

- Keep the dark folder perimeter at approximately `0.1875rem` to `0.25rem`
  (`3px` to `4px` at the default root) rather than the `8px` comparison band.
  Other persistent boundaries use the future one-pixel hairline token.
- Keep the light perimeter and shadow approximately 10% to 15% quieter than the
  comparison. Light paper remains a local document material, not the application
  canvas.
- Inactive tabs retain material identity but reduce their visible color weight;
  selection, focus, status, and action emphasis remain separate.
- The Context Inspector is conditional and contains stable contextual facts only.
  The current wide Candidate reserves a `17.5rem` context bay before expansion;
  its Inspector opens at that width and can be reduced to `14rem` inside the bay.
  The collapsed desktop rail is approximately `2.5rem` and remains pinned to the
  shell's right edge as the explicit expand control. The whole rail uses the shared
  icon-button hover／pressed／focus contract; there is no smaller nested hit target.
  The reserved remainder deliberately stays quiet between the dossier and the
  right-edge rail when collapsed, so opening the Inspector does not reflow the
  dossier. Its resize axis can also be double-clicked to toggle between the
  collapsed rail and the last expanded width.
- Transient Session／Output readiness stays in the bounded header instead of the
  Inspector. The Inspector owns a separate scroll region above PlayerBar, preserves
  its session open state across page changes, and never opens automatically because
  a collection changed.
- When the active workspace provides this context plane, the current-song artwork
  in PlayerBar and the Inspector's own header／rail icon are symmetric toggle
  affordances over the same session state. Either entry point expands or collapses
  the Inspector; pages without a context consumer keep PlayerBar artwork decorative
  instead of exposing a dead control.
- At the `960 × 650` target the Inspector becomes a temporary right-side panel when
  explicitly open; when closed its full-height edge rail overlays the context edge
  without reserving a persistent metadata column. Both states use the shell main's
  `0.75rem` top／bottom inset. The shell main and Inspector currently enter that
  projection at the same authored `70rem` breakpoint. A behavior contract keeps
  both literals synchronized; do not disguise the media condition as a CSS token
  that cannot be consumed there.
- Use one neutral in-flow note module with a hairline boundary and restrained
  material tint. Folder plum／olive must not become competing information or
  warning fills; real warning content uses the semantic warning family.
- Dark examples use the dark Clear Pastel candidates. The current comparison's
  light-theme status dots are reference-artifact drift, not a token decision.

## Typography And Information Hierarchy

The control panel uses a fixed rem-based product type system. The type remains
quiet and operational; Studio Library character comes from hierarchy, spacing,
and dossier material rather than a display face.

### Scaling Responsibilities

Keep four mechanisms separate:

1. **Windows／Electron DPI:** at 100% Chromium zoom, BrowserWindow geometry and
   CSS pixels are DIP. OS display scaling changes rasterization, not semantic type
   roles or layout mode.
2. **Rem root:** the default root remains `100%`, so `1rem` is normally `16` DIP.
   A small window must not reduce the root below this baseline.
3. **User UI scale:** future explicit `100%`, `110%`, and `125%` options may change
   the rem basis. Larger UI scale causes structural reflow earlier; it must not
   select smaller type roles to recover space.
4. **Density and reflow:** compact density changes padding, gaps, row height, and
   simultaneous information count, not font size. Container capacity changes
   columns, wrapping, rail disclosure, and action placement.

Do not use viewport-fluid `vw` type or `clamp()` as a substitute for product
layout adaptation. Use rem for typography, spacing, radii, control dimensions,
and bounded panel sizes; use `ch` for prose measure and `%`／`fr` for layout.
One-pixel hairlines and raster-aligned assets remain legitimate px exceptions.

### Candidate Font Contract

Use one local system-UI role with language-aware Windows fallbacks. Do not bundle
a control-panel brand font:

```css
--ui-font-family-base:
  'Segoe UI Variable Text', 'Segoe UI', 'Microsoft JhengHei UI',
  'Microsoft JhengHei', system-ui, sans-serif;
```

Japanese and Korean localized UI remap the same token through `:lang()` to
`Yu Gothic UI`／`Meiryo UI` or `Malgun Gothic` first. These are language fallbacks
for one role, not additional visual families. Mixed-script metadata must preserve
component-level language attributes and overflow validation.

Use only conventional size, weight, and leading names. Do not add aliases such as
`page-title-size`, `dossier-title-size`, or value-bearing names when a component
can compose the shared foundation tokens directly.

| Semantic role | Size token           | Weight token                | Leading token              |
| ------------- | -------------------- | --------------------------- | -------------------------- |
| Object title  | `--ui-font-size-2xl` | `--ui-font-weight-bold`     | `--ui-line-height-display` |
| View heading  | `--ui-font-size-xl`  | `--ui-font-weight-bold`     | `--ui-line-height-heading` |
| Section title | `--ui-font-size-lg`  | `--ui-font-weight-semibold` | `--ui-line-height-title`   |
| Body          | `--ui-font-size-md`  | `--ui-font-weight-regular`  | `--ui-line-height-body`    |
| Label         | `--ui-font-size-sm`  | `--ui-font-weight-semibold` | `--ui-line-height-label`   |
| Caption       | `--ui-font-size-sm`  | `--ui-font-weight-regular`  | `--ui-line-height-caption` |

The five distinct candidate sizes are `0.875rem`, `1rem`, `1.125rem`, `1.5rem`,
and `1.75rem`. Use weights `400`, `600`, and `700`; do not depend on a `600`／`650`
distinction that may collapse in CJK system fallbacks.

Consequential instructions, confirmations, declarations, and editable prose stay
at `1rem`. The `0.875rem` tier is for compact controls, row text, and supporting
metadata. A `0.75rem` micro tier is permitted only inside nonessential image-like
template previews and is not part of the core control-panel ramp.

Default tracking is `normal`. Use tabular numerals for time, duration, BPM, pitch,
tempo, percentages, counts, ports, and aligned metrics. Cap readable prose at
approximately `62ch` to `68ch` and concise page summaries at `52ch` to `60ch`;
tables and music rows use their own truncation or wrapping contracts.

Status hue supports meaning through fill, outline, icon, and placement. Small
status text uses a neutral contrast foreground and still meets `4.5:1`; color must
not be the only carrier of state.

### Workspace Reflow

- At `1440 × 810` DIP, retain the full sidebar, bounded dossier header, optional
  expanded／collapsed Context Inspector, primary content plane, and inline actions.
- At `960 × 650` DIP, keep the same type ramp. Render an explicitly opened Context
  Inspector as a temporary right-side panel, wrap header actions below identity,
  remove low-priority table columns, and move secondary tools into popovers.
- Validate both themes at `100%` and `125%` UI scale. Separately verify readable
  reflow at `200%` accessibility zoom.

## Units, Spacing, And Density

The candidate system is **rem-first, not rem-only**. Units follow responsibility
instead of forcing every value into one notation:

| Responsibility                                                                                     | Unit                        | Contract                                                                                            |
| -------------------------------------------------------------------------------------------------- | --------------------------- | --------------------------------------------------------------------------------------------------- |
| Typography, spacing, control／row dimensions, radii, material thickness, and responsive thresholds | `rem`                       | Scales from the shared UI basis and preserves product proportions.                                  |
| Hairlines, control boundaries, focus outlines, and drag indicators                                 | `px`                        | Represents an exact CSS-pixel optical boundary; device scaling still rasterizes it for the display. |
| Flexible layout tracks and proportions                                                             | `%`, `fr`, `minmax()`       | Responds to available container space rather than the type scale.                                   |
| Readable text measure                                                                              | `ch`／`ic`                  | Bounds Latin／CJK line length where content measure matters.                                        |
| Ruby and locally relative type details                                                             | `em`／`%`                   | Follows the owning text role without creating a new global size.                                    |
| Line height                                                                                        | unitless                    | Inherits proportionally with the text role.                                                         |
| Electron window and screen geometry                                                                | DIP numbers                 | Matches Electron's display-independent coordinate system.                                           |
| Raster assets and canvas backing buffers                                                           | physical pixel calculations | Preserves asset fidelity independently of CSS layout units.                                         |

This follows established web practice: relative units support scalable product
geometry, while one-pixel optical details remain explicit exceptions. Reference
[MDN CSS length units](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Values/length),
[Electron screen coordinates](https://www.electronjs.org/docs/latest/api/screen/),
[Bootstrap spacing](https://getbootstrap.com/docs/5.3/utilities/spacing/), and
[Tailwind responsive design](https://tailwindcss.com/docs/responsive-design).

### Base Spacing Scale

Use a compact numeric base scale derived from `0.25rem`, normally `4` DIP at the
default root:

| Token          | Value     | Default-root equivalent |
| -------------- | --------- | ----------------------- |
| `--ui-space-0` | `0`       | `0`                     |
| `--ui-space-1` | `0.25rem` | `4` DIP                 |
| `--ui-space-2` | `0.5rem`  | `8` DIP                 |
| `--ui-space-3` | `0.75rem` | `12` DIP                |
| `--ui-space-4` | `1rem`    | `16` DIP                |
| `--ui-space-5` | `1.5rem`  | `24` DIP                |
| `--ui-space-6` | `2rem`    | `32` DIP                |
| `--ui-space-7` | `3rem`    | `48` DIP                |
| `--ui-space-8` | `4rem`    | `64` DIP                |

Numeric spacing tokens are primitives, not semantic aliases. Components should
consume them directly unless a reusable component contract must remap by density.
Do not add aliases such as `small`, `medium`, `comfortable`, or page-specific gap
names that merely repeat the scale. A component token is justified when it owns a
stable dimension, safety floor, or a standard／compact override.

### Density Contract

Density is a discrete mode, selected with
`data-ui-density='standard'|'compact'`; it is not a global multiplier. Compact
density preserves the approved type ramp, Live／emergency target floors, focus
geometry, and dossier material identity. It reduces routine padding, row height,
and simultaneous information cost:

| Contract                | Standard  | Compact   |
| ----------------------- | --------- | --------- |
| Ordinary control height | `2.25rem` | `2rem`    |
| Live action target      | `2.75rem` | `2.75rem` |
| Emergency action target | `3rem`    | `3rem`    |
| Track row minimum       | `3.25rem` | `2.75rem` |
| Sidebar row minimum     | `3.25rem` | `3rem`    |
| Track artwork           | `2.5rem`  | `2.25rem` |
| List header             | `2.25rem` | `2rem`    |
| Player bar              | `4.75rem` | `4.25rem` |
| Panel inset             | `1rem`    | `0.75rem` |
| Shell gutter            | `0.75rem` | `0.5rem`  |

The Controlled Dossier keeps a `0.25rem` material perimeter and `2.5rem`／
`2.75rem` inactive／active tab heights in both modes. At `1440 × 810` DIP,
standard is the default working density. At `960 × 650` DIP, compact density may
be selected as part of the narrow workspace composition, but it does not replace
the structural reflow rules: the sidebar becomes an approximately `4.5rem` rail,
an explicitly opened Context Inspector becomes a shell-level temporary panel,
low-priority columns leave the table, and secondary tools move to popovers.

Exact optical tokens stay outside the rem scale: persistent boundaries use
`1px`, while focus and drag indicators use `2px`. These values describe CSS
pixels, not unmanaged physical display pixels.

## Shape, Elevation, And Layering

The control panel uses restrained geometry and **flat archival** depth. Shape
clarifies the boundary of a control or object; it does not turn every region into
a floating card. Elevation communicates actual overlap or a temporary lifted
state and is not decoration.

### Shape Scale

| Token              | Value      | Intended role                                       |
| ------------------ | ---------- | --------------------------------------------------- |
| `--ui-radius-xs`   | `0.125rem` | Tight micro-surfaces and narrow tracks.             |
| `--ui-radius-sm`   | `0.25rem`  | Rows, thumbnails, fields, and exposed paper edges.  |
| `--ui-radius-md`   | `0.375rem` | Buttons, tabs, controls, and note modules.          |
| `--ui-radius-lg`   | `0.5rem`   | Popovers, dialogs, and bounded floating panels.     |
| `--ui-radius-pill` | `999rem`   | Chips, status capsules, and circular variants only. |

Use literal `0` for structural seams instead of adding a `radius-none` token.
Shell chrome, sidebar／player boundaries, dossier planes, and adjoining table
edges stay square unless an exposed outer edge needs `sm`. Do not keep an
unqualified `--ui-radius`; explicit size names make mappings reviewable and avoid
the active contract's `radius`／`radius-md` ambiguity. Pill geometry must not
spread to ordinary buttons, fields, panels, or rows.

### Elevation Contract

| Level      | Token                 | Use                                                        |
| ---------- | --------------------- | ---------------------------------------------------------- |
| Structural | none                  | Shell, sidebar, player, dossier frame, rows, and controls. |
| Contact    | `--ui-shadow-contact` | An exposed light paper edge or deliberately lifted object. |
| Overlay    | `--ui-shadow-overlay` | Menus, popovers, tooltips, and drag previews.              |
| Dialog     | `--ui-shadow-dialog`  | Modal or otherwise blocking task surfaces.                 |

Dark dossier surfaces use no contact shadow; contour, surface tone, and the
accepted material perimeter carry their structure. The light paper plane may use
one quiet contact shadow. Static panels, rows, ordinary buttons, selected states,
and hover states do not acquire shadows. Every floating surface keeps a `1px`
contour so its boundary remains legible when a shadow is weak or unavailable.

The initial theme candidates are:

| Token                 | Dark candidate                        | Light candidate                           |
| --------------------- | ------------------------------------- | ----------------------------------------- |
| `--ui-shadow-contact` | `none`                                | `0 0.125rem 0.375rem rgb(39 41 40 / 10%)` |
| `--ui-shadow-overlay` | `0 0.75rem 1.875rem rgb(0 0 0 / 32%)` | `0 0.75rem 1.875rem rgb(39 41 40 / 18%)`  |
| `--ui-shadow-dialog`  | `0 1rem 2.5rem rgb(0 0 0 / 42%)`      | `0 1rem 2.5rem rgb(39 41 40 / 24%)`       |

The relationship and usage are selected; alpha and blur remain candidates until
both themes are reviewed in the isolated workspace. Do not add card, hover, or
component-specific shadow aliases unless a future component owns a distinct
reusable elevation contract.

### Stacking Contract

Global overlap uses semantic layers rather than component names or arbitrary
large values:

| Token             | Value | Responsibility                                  |
| ----------------- | ----- | ----------------------------------------------- |
| `--ui-z-sticky`   | `10`  | Sticky shell or content chrome.                 |
| `--ui-z-popover`  | `20`  | Menus, context menus, and nonblocking popovers. |
| `--ui-z-backdrop` | `30`  | Dialog backdrop and interaction boundary.       |
| `--ui-z-dialog`   | `40`  | Modal dialog or blocking task surface.          |
| `--ui-z-toast`    | `50`  | Global transient notices.                       |
| `--ui-z-tooltip`  | `60`  | Short-lived explanatory overlays.               |
| `--ui-z-drag`     | `70`  | Active drag preview and drop affordance.        |

Within one component or established stacking context, use local `0`／`1`／`2`
values and DOM order; do not allocate global tokens for internal ornament. Global
popover, dialog, notice, tooltip, and drag surfaces must mount in a top-level
layer host outside clipped scroll containers and transformed, filtered, or
isolated ancestors. A large z-index cannot escape an ancestor stacking context.

Visible elevation and stacking order are separate contracts: not every high
z-index surface needs the strongest shadow, and a material contact shadow does
not authorize global overlap. Set the correct layer before the first rendered
frame and never animate z-index. OBS Overlay retains its independent `--ovl-*`
stacking and motion rules.

## Motion Performance Boundary

The control panel targets display-refresh animation with `60Hz` as the quality
reference, not as an application-owned frame-rate setting. A nominal `60Hz`
frame provides approximately `16.67ms`; motion should therefore prefer compositor
friendly `transform` and `opacity` changes, avoid layout work inside animation
loops, and never animate blur, backdrop filters, ordinary filters, or shadows.

Keep a constrained `30Hz` capability for future custom JavaScript or canvas loops.
This is an implementation boundary, not a global CSS FPS token or a second set of
interaction durations:

- Standard motion follows the display refresh and retains the full set of
  approved, purposeful transitions.
- Constrained motion keeps the same interaction durations and response semantics,
  but disables nonessential continuous previews and loops. Gallery material stays
  static except for a selected preview; marquee content truncates or runs once
  instead of looping indefinitely.
- A future custom loop may use `requestAnimationFrame` timestamps to cap work near
  `33.33ms` intervals. CSS transitions remain refresh-driven; do not simulate a
  global 30fps mode with stepped easing or duplicated duration tokens.
- `prefers-reduced-motion` is an accessibility preference, not a performance
  detector. Reduced motion takes precedence when it is combined with the
  constrained profile.
- OBS Browser Source output keeps its independent Overlay contract and uses the
  Browser Source custom FPS setting when a 30fps Output is required. The control
  panel must not infer or mirror that rate.

Do not automatically select the constrained profile, or expose it as a product
setting, until the isolated prototype and OBS matrix demonstrate a repeatable
need. `@media (update: slow)`, `navigator.hardwareConcurrency`, and
`navigator.deviceMemory` do not measure current renderer load and must not be used
as automatic fallbacks. If later evidence supports automatic switching, base the
decision on sustained frame pacing with hysteresis and a reversible recovery path,
not one device-class hint.

The prototype performance matrix must include `1440 × 810` and `960 × 650`, the
current host and a representative integrated-GPU system, OBS at `1080p60`, and
Browser Source at both `60` and `30` FPS. Exercise Gallery preview, popover／dialog
entry, dossier scrolling, and representative static states. Record animation-frame
pacing, Chromium performance traces and Long Animation Frames, renderer CPU／GPU
load, and OBS rendering lag before deciding whether a user-facing performance
profile or runtime fallback is justified.

References: [Electron performance guidance](https://www.electronjs.org/docs/latest/tutorial/performance),
[Electron 43／Chromium 150](https://www.electronjs.org/blog/electron-43-0),
[MDN `requestAnimationFrame`](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame),
[MDN `update`](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/%40media/update),
[Chrome Long Animation Frames](https://developer.chrome.com/docs/web-platform/long-animation-frames),
[web.dev animation performance](https://web.dev/articles/animations-overview),
[OBS Browser Source](https://obsproject.com/kb/browser-source), and
[OBS performance troubleshooting](https://obsproject.com/kb/encoding-performance-troubleshooting).

## Motion Timing And Behavior

Motion is restrained, responsive, and operational. It explains state change or
spatial relationship; it does not add atmosphere to static dossier material.
The shared semantic timing tokens are:

| Token                           | Value                            | Responsibility                                      |
| ------------------------------- | -------------------------------- | --------------------------------------------------- |
| `--ui-motion-duration-feedback` | `100ms`                          | Color, contour, press, and necessary reduced fades. |
| `--ui-motion-duration-fast`     | `140ms`                          | Selection changes and compact exits.                |
| `--ui-motion-duration-standard` | `200ms`                          | Ordinary disclosure and spatial continuity.         |
| `--ui-motion-duration-slow`     | `280ms`                          | Blocking-surface entry only.                        |
| `--ui-motion-easing-standard`   | `cubic-bezier(0.2, 0, 0, 1)`     | State changes and spatial continuity.               |
| `--ui-motion-easing-enter`      | `cubic-bezier(0.22, 1, 0.36, 1)` | Decelerating entry.                                 |
| `--ui-motion-easing-exit`       | `cubic-bezier(0.4, 0, 1, 1)`     | Accelerating exit.                                  |

These are purpose-based cross-component tokens. Do not duplicate them as button,
popover, or dialog aliases unless a component later proves it owns a different
reusable timing contract. Exit normally uses the next shorter duration; do not
multiply every duration or add numeric aliases such as `duration-1`.

### Component Mapping

| Pattern              | Mapping                                                                                           |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| Hover／focus／press  | `feedback` with color／contour only; Live and emergency controls do not scale.                    |
| Tab／selection       | `fast`; no page-load choreography or dossier-height animation.                                    |
| Popover              | enter `standard`, exit `fast`; opacity plus `0.125rem` to `0.25rem` transform.                    |
| Dialog               | enter `slow`, exit `standard`; backdrop fades while focus and input become available immediately. |
| List insert／reorder | `standard` transform／FLIP; no mass stagger.                                                      |
| Status change        | `feedback` opacity／color; Live status never pulses continuously.                                 |

Do not animate blur, `filter`, `backdrop-filter`, box shadow, z-index, or layout
height. Tabs and dossier sections change geometry immediately or preserve it with
a transform／pseudo-layer. Use bounce, elastic easing, looping marquee, decorative
spin, and large stagger only if a later product contract establishes an essential
meaning; they are not part of this foundation.

### Reduced Motion

`prefers-reduced-motion: reduce` is authoritative. A future manual preference may
reduce motion further but cannot force full motion against the OS preference. The
candidate `data-ui-motion='reduced'` hook exists only for the isolated prototype
and future explicit product review; it is not activated in the production UI.

Reduced motion remaps `fast`, `standard`, and `slow` to `0ms`. The `feedback`
token remains `100ms` so an essential opacity or color confirmation can stay
perceivable. Components must also remove translate, scale, FLIP, stagger, marquee,
pulse, and nonessential spin; changing duration alone is insufficient. Content,
focus, progress meaning, and state labels remain immediately available, with a
static text／icon alternative whenever removing movement would otherwise hide
meaning. Reduced motion takes precedence over the constrained performance profile.

Review artifact:
[Controlled Dossier dark／light folder interior](architectural-slate-folder-interior.png).

Inactive candidate source:
[`src/styles/tokens-v2.css`](../../src/styles/tokens-v2.css).

### Isolated Workspace Prototype Snapshot

The first high-completion workspace prototype now lives under
`prototypes/studio-library-workspace/`. It is plain HTML／CSS／JavaScript and is
not a renderer entry point. It imports only the inactive candidate token file;
production Vue entries, the active renderer token contract, preload APIs, and
Overlay remain untouched.

The prototype exercises the approved titlebar, library／playlist sidebar,
full-width PlayerBar, Controlled Dossier header, horizontal／vertical metadata
rail, note module, multilingual track table, static state matrix, popover, dialog,
theme, density, and reduced-motion controls. Clean reference captures cover dark
and light themes at both `1440 × 810` and `960 × 650`.

Automated prototype verification currently proves:

- populated, loading, empty, search-empty, warning, and error state availability;
- search, ready filtering, mouse and keyboard playback, dialog, and popover paths;
- narrow sidebar accessible names and synchronized selection／playing ARIA state;
- structural reflow at `960 × 650`, `125%`, and `200%` zoom without page-level
  horizontal or vertical overflow;
- native dark／light `color-scheme`, OS and manual reduced-motion paths, and
  essential semantic text pairs at WCAG AA;
- a complete candidate graph of `214` unique token names after the shared-component
  foundation expansion, with no unresolved references and no production-bundle
  reference to `tokens-v2.css`.

This is visual-system evidence, not a production contract. Owner review of the
material weight, metadata rail, note prominence, density, and multilingual
hierarchy remains required. Integrated-GPU／OBS frame-pacing evidence and the
production migration plan remain later work.

### Native Real-Library Slice

The F7 development view now replaces its dossier iframe with native Vue
components. It reads the authoritative `useLibrary` and `usePlaylists` projections,
shows the selected real album／playlist or current library root, and projects the
existing player's current track without creating another store, audio element, IPC
contract, or playback action.

One component hierarchy adapts by collection type: albums use one release cover
and derived artist／year facts; playlists retain collage-capable artwork and manual
order; library roots use their existing source filters. Search remains local to the
candidate view. The real Sidebar stays in F7 while changing collections, and the
production PlayerBar remains the only transport console.

`StudioLibraryPrototypeView.vue` is still inside App's compile-time development
branch. It imports `tokens-v2.css` only in that excluded module and activates
`data-ui-system='v2'` for the view lifetime. The candidate semantic values override
the active system temporarily, while legacy component aliases continue to provide
compatibility for the mature Sidebar and PlayerBar. Production builds contain
neither the native dossier component nor the candidate token payload.

This slice is intentionally read-only. Track selection, playback, queue mutation,
sorting, editing, and deletion remain in the existing Setlist until their accepted
Spotify-informed behavior contracts are connected and tested separately.

The native slice also corrects the prototype's containment model. `AppInnerPage`
wraps only the primary Dossier and `AppArchiveFrame` owns only tabs plus that
primary workspace. `App.vue`'s `.shell__main` mounts the feature-owned Inspector as
a right-edge sibling, rather than as a second card inside the folder page. Pages
without context content create neither a wrapper nor reserved space. When context
exists at the wide target, shell main reserves the Token v2 `17.5rem` bay even
while the child is only its collapsed rail; the panel itself stays pinned right
with the same `0.75rem` block inset as Sidebar. At the compact target, the same rail
leaves normal flow and becomes a temporary right-edge overlay while the primary
page keeps its full width.

### Next Decisions

The immediate next phase is **F7 visible acceptance and candidate contract
freeze**. It is a gate, not production migration.

1. Start the Electron development surface with `npm run dev`, open F7, and review
   one real album, one ordinary playlist, and both library roots at `1440 × 810`
   and `960 × 650` in dark and light themes.
2. Exercise expanded／collapsed Inspector, full-rail hover／pressed／focus behavior,
   PlayerBar-artwork toggle, real cover／collage fallback, note prominence, long
   multilingual metadata, empty search, and no-current-track states.
3. Correct only acceptance defects inside the existing ownership boundaries. Do
   not add sorting, editing, deletion, queue mutation, or a second player.
4. When the visible matrix passes, freeze the accepted primitive → semantic →
   necessary component subset and create a phase commit only after explicit owner
   approval.

The following phase is the first behavioral vertical slice: connect row selection
and playback through the existing player／queue owners using the accepted Spotify-
informed rules. View filtering must remain separate from playback context; queue
precedence and end-of-context behavior must be explicit rather than inherited from
the legacy filtered-row snapshot. Production page migration and integrated-GPU／OBS
performance validation remain later gates.

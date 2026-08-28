# Visual System Foundation

Status: In progress — semantic status colors, the Architectural Slate palette
relationship, the Controlled Dossier material rules, and the rem-based typography
hierarchy were selected by the owner on 2026-08-28. Detailed theme values,
spacing, shape, elevation, and motion remain review candidates.

This document records visual-foundation decisions made after the approved
discovery brief and Studio Library direction. It does not authorize production
CSS or Vue component changes.

## Session Handoff Snapshot

As of 2026-08-28, the documented decision chain is:

1. [Visual System Discovery](visual-system-discovery-2026-08-25.md) owns the
   approved product context, Session／Output／Feature Gate UX boundaries, viewport
   targets, platform posture, and control-panel／Overlay separation.
2. [Visual Direction Options](visual-direction-options-2026-08-25.md) owns the
   approved Direction B／Studio Library choice.
3. This document owns the selected foundation relationships and the remaining
   review gates.

Selected direction:

- macOS-like tool shell × Spotify-like music workspace;
- dark-first with an official light companion;
- Clear Pastel semantic signal families;
- Architectural Slate neutral／folder-material／accent relationship;
- `60／30／10` whole-screen visual weight;
- stable sidebar, full-width player bar, and main-filling archive frame;
- Controlled Dossier folder interior with restrained medium physicality and one
  in-flow note grammar;
- fixed rem-based product typography with structural narrow-window reflow.

Still candidate or pending:

- exact theme values and final contrast acceptance;
- spacing, density, shape, elevation, motion, and reduced-motion details;
- the isolated `1440 × 810` prototype and `960 × 650` reflow;
- final primitive → semantic → necessary component token freeze and migration.

Unchanged by this research phase:

- product name and icon;
- active `src/styles/tokens.css` and production Vue styling;
- independent Overlay tokens and templates;
- Session／Output runtime behavior and other product implementation.

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

| Layer       | Pattern                                   | Example                    |
| ----------- | ----------------------------------------- | -------------------------- |
| Color value | `--ui-palette-{hue}-{step}`               | `--ui-palette-indigo-400`  |
| Semantic    | `--ui-{category}-{role}[-{state}]`        | `--ui-color-surface-hover` |
| Type scale  | `--ui-font-{property}-{step}`             | `--ui-font-size-lg`        |
| Leading     | `--ui-line-height-{role}`                 | `--ui-line-height-body`    |
| Component   | `--ui-{component}-{property}[-{variant}]` | `--ui-folder-bg-secondary` |

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
2. The folder frame fills the right main block rather than sitting inside another
   page card.
3. A bounded internal header owns the page title, readiness／visibility context,
   and primary actions.
4. A paper plane owns the structured list, table, editor, or grid appropriate to
   the active category.
5. A metadata rail appears only when the page has stable contextual facts that
   improve preparation or live operation.
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
- A metadata rail is conditional and contains stable contextual facts only. Its
  desktop target is approximately 16% to 18% of the dossier content width, with a
  practical range of `11rem` to `13rem`.
- Transient Session／Output readiness stays in the bounded header instead of the
  metadata rail. When the main content region becomes narrower than approximately
  `52.5rem`, the rail becomes a horizontal summary or collapsible disclosure.
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
  metadata rail, primary content plane, and inline actions.
- At `960 × 650` DIP, keep the same type ramp. Convert the metadata rail to a
  horizontal summary or disclosure, wrap header actions below identity, remove
  low-priority table columns, and move secondary tools into popovers.
- Validate both themes at `100%` and `125%` UI scale. Separately verify readable
  reflow at `200%` accessibility zoom.

Review artifact:
[Controlled Dossier dark／light folder interior](architectural-slate-folder-interior.png).

Inactive candidate source:
[`src/styles/tokens-v2.css`](../../src/styles/tokens-v2.css).

### Next Decisions

1. Define spacing, density, shape, elevation, and motion foundations.
2. Validate the combined foundations and Clear Pastel statuses inside
   representative operator components and a `1440 × 810` workspace composition.
3. Validate the `960 × 650` structural reflow and `100%`／`125%` UI-scale matrix.
4. After high-completion visual acceptance, freeze the primitive → semantic →
   necessary component contract and plan the production migration.

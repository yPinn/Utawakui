# ADR 0027: Output template elements and property workspace

## Status

Accepted on 2026-10-23 (proposed 2026-10-22). P1–P4 are implemented:
definition attributes with the `now-next` removal, inspector modified marks
and group reset, Cover Player element settings, and canvas selection from
Workbench-only element boxes. P5–P6 are not started.

The decision amends the "locked" list in
[ADR 0011](0011-overlay-instances-and-presentation-pack-delivery.md) and the
[Overlay Pack contract](../contracts/overlay-pack.md) only for element geometry,
stacking and visibility; executable layout behavior stays app-owned.
Implemented behavior is specified in
[Output appearance](../contracts/output-appearance.md).

## Context

Output appearance today is a flat list of settings per template.
`shared/outputAppearance.mjs` defines 21 fields in eight groups, each template
opts into a subset, and the Workbench inspector renders those groups with one
template-wide reset. The catalog, main validation and `--ovl-*` projection are
already a standardized-settings foundation. Schema 6 added three fields used
only by the receipt setlist (`receiptDirection`, `receiptReview`,
`receiptReviewInterval`), which shows the catalog growing one template at a
time. Three things are missing:

1. **No target.** A setting always applies to the whole template. There is no
   way to change only the title, only the next lyric line, or only the surface.
2. **No uniform property description.** Unit, step, tier, carry-over across
   templates and whether a consumer is verified live in code and prose rather
   than in the definition.
3. **Fixed geometry.** Layout freedom stops at a nine-point anchor with bounded
   offsets (Ornate Vertical only). The product direction now includes dragging
   and resizing parts of a template on a workspace canvas and changing their
   stacking order, comparable to image and illustration editors.

The owner wants the template to be the unit of operation, with a standard set
of adjustable properties shown in a Photoshop/Illustrator/Clip Studio-like
workspace, and future UI components designed from that model.

### Boundaries found in the current runtime

- **Viewport-relative geometry.** `overlay/lyrics/lyricsFit.mjs` sizes text from
  `window.innerWidth`／`innerHeight` fractions, and `lyrics.css` uses `vw`／`vh`
  for Ornate font size and the Manga stage. A box around an element would not
  reflow its content. The receipt setlist is the exception: `receipt.css`
  declares an inline-size container and `receiptView.mjs` measures its own
  history element.
- **Animated nodes.** GSAP owns transforms on rendered nodes, and ADR 0011
  forbids two engines owning one property.
- **Coupled elements.** `overlay/now-playing/artworkMotion.mjs` measures sleeve,
  record and stage rects to choreograph the exchange, and Art Card's stacking
  encodes physical order (tonearm over record, sleeve over platter).
- **Logical vs DOM identity.** Art Card duplicates `incoming-*` nodes for track
  change, Kinetic Pop renders one line as several paint tracks, and five lyric
  templates share one HTML document.
- **Root-only projection.** `overlay/shared/appearance.mjs` writes every setting
  on `documentElement`.
- **Flat storage.** `electron/lib/outputSlots.js` accepts at most 100 scalar
  settings with a restricted key pattern.
- **Absent vs default.** Ornate's palette special case exists because storage
  cannot tell "never set" from "set to the default color".
- **Constraints.** `ovl-constraints` currently enforces reduced motion only.
- **No preview channel.** The Workbench iframe is cross-origin loopback and
  scaled; nothing reports element positions to the control panel.

## Decision

### Template, group, element, property

- A **Template** remains the app-owned document: renderer, motion recipes, data
  bindings and invariants.
- A template declares a fixed tree of **Elements** with stable ids namespaced by
  template, for example `title`, `artist`, `lyric-current`, `lyric-next`,
  `reading`, `artwork`, `progress`, `surface`. An element is a logical role and
  may map to several DOM nodes, including transition duplicates and paint
  tracks. Kinds are `text`, `graphic` and `surface`.
- A **Group** binds coupled elements, such as Art Card's sleeve, record and
  tonearm. Layout properties apply to the group as a whole; order and geometry
  inside a group are invariants.
- Users cannot add, remove or rebind elements in this ADR.
- A **Property** is drawn from one shared catalog. Templates opt in per element
  or group and may only narrow ranges or options; they do not define controls
  of their own.
- A template that needs a new adjustment adds it to the shared catalog through
  review. The entry belongs to an existing family and takes a generic name
  where one fits, for example a layout flow direction or a motion review
  interval rather than a template-named key, so later templates can reuse it.
- A template may opt out of any family, including Look. The receipt setlist
  exposes no Look or surface because its paper material is its identity.
- Display names are separate from template ids. Ids, which stored settings
  and this ADR use, do not change when a display name is revised.

### Property definition

Each catalog entry declares:

| Attribute    | Meaning                                                                    |
| ------------ | -------------------------------------------------------------------------- |
| key／family  | Stable key and family from the table below                                 |
| scope        | `template`, `group`, or `element` limited to listed kinds                  |
| value type   | enum, bounded number with unit and step, hex color, font id, asset id, box |
| tier         | `basic` or `advanced`                                                      |
| reflow       | Whether a change re-runs fit; reflowing properties commit debounced        |
| floor        | Mandatory minimum applied in `ovl-constraints`, if any                     |
| carry rule   | Behavior on template switch                                                |
| verification | Whether both endpoints are verified for that template and target           |

Rules shared by all properties:

- **Overrides store only differences.** An absent key means "follow the layer
  below"; a stored value equal to a default is still an explicit choice. This
  replaces template-specific checks such as Ornate's palette case.
- **Custom colors override Look** for the same role; clearing the override
  returns the role to Look.
- **Properties never touch the node an animation engine owns.** Non-layout
  element values are element-namespaced custom properties and data attributes
  on the document root (for example `--ovl-el-title-font-weight` and
  `data-ovl-el-artist-visible`), read only by the declaring template's CSS.
  Geometry in P5 additionally requires each element's own wrapper.
- **Template-scoped values carry** under the existing rules. Element and group
  values carry only between templates that share element structure, such as
  Art Card and Cover Player; otherwise they reset on switch.

### Property families

| Family       | Scope                    | Members and bounds                                                        |
| ------------ | ------------------------ | ------------------------------------------------------------------------- |
| document     | template                 | capture size, look and amount, global type scale, content policy, reading |
| swatch roles | template                 | ink, accent, outline, shadow, surface                                     |
| character    | text element             | font role, weight, size multiplier                                        |
| legibility   | text element             | outline width, shadow strength; `contrastStyle` becomes a preset of these |
| fill         | template, group, element | transparent／soft／solid, opacity 0–100%                                  |
| layout       | group, element           | layout mode below, alignment, density                                     |
| stacking     | group, element           | order within a reorderable band                                           |
| visibility   | optional element         | shown／hidden                                                             |
| motion       | template                 | recipe variant, intensity, duration scale; no per-element timelines       |
| asset        | template, element        | deferred; verified asset ids only                                         |

- **Size multiplier is a ceiling.** It may enlarge text up to the template's
  declared maximum, and fit may always shrink it to keep content inside its
  box. Fit never enlarges past the user's value.
- **Meaning-bearing colors follow Look only.** Karaoke part and sung／unsung
  colors and similar roles that carry information are not user swatches; they
  change only through Look, so each template keeps its classic style identity.
- **Mandatory floors.** `ovl-constraints` gains a minimum rendered text size,
  a minimum outline or shadow when the surface is transparent, and clamping to
  the safe area. Contrast against the unknown OBS background cannot be computed,
  so legibility relies on these floors. P3 adds the text size floor
  (`--ovl-text-min-size`): element scaling never renders text below the floor
  or below its unscaled size, whichever is smaller, so default output is
  unchanged. The transparent-surface outline floor arrives with legibility
  properties and safe-area clamping with geometry, because each changes
  existing output.

The existing fields migrate as template-scoped properties in their matching
family, so current settings keep their meaning. The receipt fields are
classified as layout (`receiptDirection`) and motion (`receiptReview`,
`receiptReviewInterval`); their stored keys stay unchanged so saved settings
remain valid, and later generic catalog names map onto them. The retired
`now-next` configuration is removed; main already replaces an unregistered
template id with the slot default when reading settings. `focus-line` stays:
it is not in the Gallery, but it remains the generic lyrics path behind the
`generic-caption` profile, its timing capabilities and the renderer default.

### Layout modes

Each element or group declares the most permissive layout mode its renderer
supports:

| Mode       | Meaning                                                                 | Example today          |
| ---------- | ----------------------------------------------------------------------- | ---------------------- |
| `fixed`    | Geometry owned by the template; only non-layout properties apply        | Karaoke Stack lanes    |
| `anchored` | Anchor plus bounded offset inside a template-declared region            | Ornate Vertical column |
| `frame`    | A box (x, y, width, height) inside an allowed region, with min/max size | future drag/resize     |

- An element may declare `frame` only after its CSS uses container-relative
  units and its fit measures the container, not the viewport. That refactor
  changes rendered output and must be reviewed against the appearance baseline.
- Geometry is stored as fractions of the capture canvas so it survives capture
  size changes. Snapping and guides are editor behavior, not stored data.
  Fractions carry directly only between sizes with the same aspect ratio, such
  as Cover Player's 360×480 and 480×640; a template whose sizes differ in aspect
  must declare how geometry maps between them before adopting `frame`.
- A `frame` element must declare its overflow rule (fit, shrink to minimum, then
  truncate or page). Content never escapes the capture canvas or the safe area.
- Geometry reaches the page as validated custom properties on the element's
  wrapper. No user CSS, selectors or arbitrary properties.
- Rotation and free scale are excluded until a template demonstrates a need.
- Geometry properties default to an explicit `auto` (template-owned layout),
  like `inherit` for weight, because saves merge and cannot remove a key;
  resetting writes `auto` back.
- Canvas drag and resize are pointer shortcuts. The inspector exposes the same
  position and size as bounded numeric fields for the selected target, which is
  the keyboard and assistive-technology path.
- Cover Player sizes its root type from the viewport
  (`min(100vw / 30, 100vh / 40)`), so its container-relative refactor is the
  first P5 step and must be reviewed against the appearance baseline.

### Stacking

- Elements and groups belong to template-declared stacking bands, for example
  `backdrop`, `content`, `overlay`. Users may reorder within a band only when the
  template marks it reorderable, and never across bands.
- Paint order inside an element or group, such as Kinetic Pop's tracks or Art
  Card's turntable, is a renderer invariant.
- The UI shows a layer list; band ids are implementation detail.
- Reordering and the layer list wait for a template whose elements overlap in a
  reorderable band. Cover Player's elements do not overlap, so it pilots
  geometry only.

### Brand and user images

Live Stage's built-in brand mark stays fixed and visible. User-supplied images
are out of scope here; they require the asset pipeline listed as unimplemented in
the Output appearance contract (main picker, format and size validation, managed
asset ids, usage rights). When that exists, an element that shows a user image
may expose visibility, geometry and stacking, and a template may declare a brand
slot that accepts one. The built-in mark remains fixed.

### Resolution and storage

The resolution order from ADR 0011 is unchanged: template fallback → Style Set
→ User Variant → mandatory constraints. Element and group overrides join the
same settings, stored as flat `element.<elementId>.<propertyKey>` keys so the
existing merge, autosave and key rules apply. Groups share the element id
namespace and key form (for example `element.copy.<propertyKey>`), so a
template cannot declare an element and a group with the same id. Main drops element keys that the
slot's template does not declare, and switching to such a template clears them.

P3 raises the Output appearance schema from 6, which added the receipt
fields, to 7 for the element keys. Saved template settings need no migration.
Values are still stored in full: an element weight defaults to `inherit`
(follow the template) and size to a relative 100%, so a stored default never
overrides a later template-level change. Difference-only storage moves to P6,
where Style Sets add a second layer and an explicit removal path is needed
because slot saves merge into existing settings.

### Workspace

- The canvas is the real Output preview. In preview mode only, the page reports
  element and group boxes to the control panel over a postMessage channel that
  checks origin and converts for preview scale. The OBS route never loads editor
  code.
- The inspector is selection-driven. With nothing selected it shows template
  scope, which is today's inspector. Selecting an element or group shows its
  properties.
- Panels: Properties, Elements (layer list with order and visibility), Swatches
  and Styles (Style Sets and Variants). Each property row shows a modified mark
  and a per-property reset; the UI does not show which layer the value came from.
- Controls are built from shared `Ui*` primitives so new templates and sets add
  data, not UI.

## Initial template assessment

Derived from reading the runtime; not verified.

| Template        | Candidate targets                           | Most permissive layout                      | Invariants kept                                                        |
| --------------- | ------------------------------------------- | ------------------------------------------- | ---------------------------------------------------------------------- |
| queue-board     | current track, history rows, labels         | `fixed`                                     | section split, history paging                                          |
| receipt-setlist | header, now playing, history window, paper  | `fixed`; feed direction is a layout variant | two-line title slots, print on completion, 100-item review             |
| karaoke-stack   | current／next lanes, count-in               | `fixed`                                     | dual lanes, timing mask, part colors                                   |
| kinetic-pop     | lyric line                                  | later `anchored` on block axis              | canvas-centered inline axis, paint tracks                              |
| ornate-vertical | column                                      | `anchored`, later `frame` height            | at most two columns, grapheme grouping                                 |
| live-stage      | caption, title card, brand                  | caption `frame` candidate                   | brand mark, title-card window                                          |
| manga-frame     | bubble stage                                | `fixed`                                     | bubble safe layout, ruby atomicity                                     |
| art-card        | turntable group, title, artist              | group `anchored`                            | group internals and exchange choreography                              |
| cover-player    | artwork, copy group (title, artist), player | artwork and copy group `frame` candidates   | shared structure with art-card; motion fades artwork and copy as units |

Lyric templates mostly gain element-scoped character, legibility, fill and
visibility. Free layout is expected mainly in the Now Playing family and Live
Stage's caption.

## Phases

| Phase | Delivers                                                                                                                                                                                              | Exit condition                                                                            |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| P1    | Definition attributes (family, scope, tier, reflow) on every field; `now-next` configuration removed                                                                                                  | Rendered output and stored settings unchanged; baseline diff adds only the new attributes |
| P2    | Shared property section/row components with modified mark and group reset (per-field reset only where a control already has one)                                                                      | Workbench reaches parity with today's inspector                                           |
| P3    | Cover Player element declarations; root-level element projection; element weight, size and visibility; schema 7 element keys; text size floor                                                         | Endpoints and floor verified on the pilot; saved settings unchanged                       |
| P4    | Preview-only box reporting and canvas selection sharing the inspector target                                                                                                                          | Selection matches rendered boxes at every supported capture size                          |
| P5    | Container-relative refactor per adopting template, then `anchored`／`frame` geometry with canvas drag and numeric fields; reordering and the layer list only once a template has overlapping elements | Baseline diff reviewed; min/max size and edges verified                                   |
| P6    | Styles panel backed by Style Set and Variant storage; difference-only storage                                                                                                                         | Depends on the pack work in ADR 0011                                                      |

The pilot for P3 and P5 is a Now Playing template, Cover Player or Art Card,
because both have fewer timing invariants than any lyric template. The receipt
setlist already uses container-relative measurement, but its slot geometry is
too strict for a pilot. Other templates declare elements only when they adopt
element scope, so no declaration exists without a consumer. Each phase is
reviewed and reversible on its own. A template adopts element scope or `frame`
layout only after its own verification, not as a fleet-wide switch.

## Consequences

- Verification grows with properties × targets × templates. Endpoints and
  `frame` extremes must be tested per target before exposure, which keeps the
  "both endpoints tested" rule from the Overlay Pack contract.
- Adopting `frame` costs a per-template geometry refactor that changes rendered
  output and needs its own baseline review.
- Templates must wrap each declared element or group in its own container.
- Settings storage, main validation and shared Variant files change shape and
  need migration.

## Open questions

- Whether the Workbench may offer explicit synthetic scenarios (empty, long
  line, seek, track change) for preview. The current contract keeps demo data
  out of the Workbench.
- Cover Player's layout for P5. Its track-change motion fades the artwork and
  the copy container as units (opacity only), so title and artist must move
  together as a copy group, while the artwork and the player row can be
  separate targets. Whether the artwork becomes a selectable element, and with
  which property, is decided with P4.
- The user image pipeline's scope, rights handling and which templates declare a
  brand or image slot.

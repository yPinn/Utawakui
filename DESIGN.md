---
name: Utawakui
description: Baseline design-system scaffold for a local-first OBS singing-session control panel.
colors:
  canvas: '#1F2328'
  surface: '#292F35'
  surface-raised: '#30383E'
  surface-hover: '#344046'
  text: '#F7F1E7'
  text-muted: '#AEB8B6'
  border: '#3C4749'
  accent: '#55A2A7'
  accent-hover: '#6AB4B8'
  accent-contrast: '#102326'
  success: '#7BBD8B'
  warning: '#D6A84F'
  danger: '#DD7078'
  info: '#7FB8BD'
typography:
  display:
    fontFamily: "'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui, -apple-system, sans-serif"
    fontSize: '2rem'
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: '0'
  headline:
    fontFamily: "'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui, -apple-system, sans-serif"
    fontSize: '1.5rem'
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: '0'
  title:
    fontFamily: "'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui, -apple-system, sans-serif"
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: '0'
  body:
    fontFamily: "'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui, -apple-system, sans-serif"
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: '0'
  label:
    fontFamily: "'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui, -apple-system, sans-serif"
    fontSize: '0.875rem'
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: '0'
rounded:
  xs: '2px'
  sm: '4px'
  md: '6px'
  lg: '8px'
  pill: '999px'
spacing:
  0: '0'
  1: '0.25rem'
  2: '0.5rem'
  3: '0.75rem'
  4: '1rem'
  5: '1.5rem'
  6: '2rem'
  7: '3rem'
  8: '4rem'
components:
  button-primary:
    backgroundColor: '{colors.accent}'
    textColor: '{colors.accent-contrast}'
    rounded: '{rounded.md}'
    padding: '0.25rem 0.5rem'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.text-muted}'
    rounded: '{rounded.md}'
    padding: '0.25rem 0.5rem'
  track-row:
    backgroundColor: 'transparent'
    textColor: '{colors.text}'
    rounded: '{rounded.md}'
    padding: '0.5rem 0.75rem'
  panel:
    backgroundColor: '{colors.surface}'
    textColor: '{colors.text}'
    rounded: '{rounded.lg}'
    padding: '1rem'
---

<!-- BASELINE: this is a first-pass scaffold. Replace palette character, final type choices, and component details after the visual direction is confirmed. -->

## Overview

Utawakui is a product UI for live operation. The design system should support a calm desktop control panel first, then extend to responsive and OBS overlay surfaces without assuming that all surfaces share the same tokens.

This scaffold started with a restrained, neutral product baseline: stable rem-based scales, semantic states, predictable components, visible focus, and responsive constraints. The current visual direction now adds a more specific identity layer: a local-media card sleeve, a quiet cat-card presence, and a restrained graphite / teal / paper / coral palette.

**Key Characteristics:**

- Dense enough for repeated operation.
- Quiet enough for live performance.
- Structured enough for playlists, lyrics, queues, and processing states.
- Flexible enough to support dark, light, desktop, responsive, and overlay-specific tokens.

## Visual Direction

Utawakui should feel like a quiet, trustworthy, slightly alive local karaoke control panel. It is not a streaming platform, music platform, or rights service; the default visual language should keep users grounded in organizing and operating their own local materials.

### Reference Boundaries

- **Spotify:** use as a reference for music-management density, playlist/collection mental models, persistent playback, sidebar structure, and fast scanning.
- **iTunes / Music app:** use as a reference for narrow desktop toolbar chrome, centered playback/search/status slots, and quiet OS-integrated top hierarchy.
- **macOS:** use as a reference for OS-like clarity, local object metaphors, comfortable control spacing, and window/sidebar hierarchy.
- **Mosby's Files-style folder systems:** use as a reference for folder navigation, paper stacks, tabbed files, and local archive atmosphere.
- **Color Lisa-style palettes:** use as a reference for restrained artistic color relationships and 60/30/10 color balance, not for copying a single palette.

Avoid direct borrowing:

- No Spotify green as a brand anchor.
- No Apple system blue as the main identity.
- No literal iTunes toolbar clone, brushed-metal nostalgia, or forced center controls before those interactions exist.
- No marketing-page hero styling for operational surfaces.
- No heavy glass, glossy Aqua, heavy shadows, or decorative depth.
- No full skeuomorphic file-cabinet scene for the whole app.
- No red/blue reference-page palette as a direct theme.
- No feature-gated flow should look like the default product entrypoint.

## Brand Mark / App Icon

### Core Metaphor

The primary icon direction is:

```text
dark card sleeve / song-card container
  + teal cat-shaped inner card
  + paper / white voice line
  + small coral accent
  + sparse bottom audio bars
```

The mark should communicate:

- Local library and material storage.
- Singing, lyrics, or audio flow.
- A small amount of friendly life, without becoming a full mascot.

### Icon Rules

- The outer shape is a clean dark rounded card sleeve; do not add lid seams, clasps, chest hardware, or obvious outline strokes.
- The teal inner shape may imply cat ears or a tiny face, but should not become a full character.
- Keep expression minimal: at most two small eyes. Do not include mouth, whiskers, tail, paws, arms, or legs in the primary icon.
- The voice line is the main identifier. Prefer a paper/white main line with coral as a small offset or local accent.
- Keep bottom audio bars sparse: 4-6 bars, quiet playback signal, not a full equalizer.
- The primary icon should not use a visible border. Small taskbar/tray variants may use a low-contrast 1px edge highlight for separation.

Rejected icon directions:

- Top lid seams, clasp lines, treasure-chest cues, or box hardware.
- Heavy shadow used to explain the sleeve or box.
- Paw/claw action as the primary wave source.
- Red dots, because they read as recording state.
- Literal music notes, play triangles, microphones, and provider logos.

### Icon Outputs

| Version           | Use                        | Rule                                     |
| ----------------- | -------------------------- | ---------------------------------------- |
| Primary           | app icon, README           | Full sleeve, cat-card, and voice line.   |
| Small             | taskbar, tray, 16/24/32px  | Simplify bars; optional edge highlight.  |
| Monochrome / Mask | installer, system fallback | Keep sleeve contour and voice line only. |

## Color Direction

The brand should not be locked to folder blue. Use graphite, washed teal, paper, and coral as a restrained base.

```text
Graphite      #1f2328
Washed Teal   #3f8f94
Paper         #f7f1e7
Coral         #d26a45
Mist          #b8d8d2
```

Use a 60/30/10 ratio:

- **60% base:** app chrome, sleeve, major backgrounds.
- **30% secondary:** local-library surfaces, inner object areas, main voice line.
- **10% accent:** singing energy, current playback, selected cue, focused or gated hints.

Theme token targets should keep light and dark themes visually related, rather than treating light mode as a separate brand.

### Light Theme

Implemented in `src/styles/tokens.css` (`:root[data-ui-theme='light']`):

```css
--ui-color-canvas: #f7f1e7;
--ui-color-surface: #fffdfa;
--ui-color-surface-raised: #ffffff;
--ui-color-surface-hover: #edf2ef;
--ui-color-surface-active: #e4ece8;
--ui-color-surface-selected: #dceee9;
--ui-color-surface-playing: #f1d9cc;
--ui-color-text: #1f2328;
--ui-color-text-muted: #69747a;
--ui-color-border: #d8ded9;
--ui-color-border-strong: #b9c4c0;

--ui-color-accent: #327a7f;
--ui-color-accent-hover: #286a6e;
--ui-color-accent-soft: #dceee9;
--ui-color-accent-contrast: #fffdfa;
--ui-color-focus: #d26a45;

--ui-color-current: #d26a45;
--ui-color-current-soft: #f1d9cc;
--ui-color-info: #4d8793;
--ui-color-success: #5f9a72;
--ui-color-warning: #b78336;
--ui-color-danger: #bd5961;
--ui-color-gated: #9a6b45;
--ui-color-gated-bg: #f3eadc;

--ui-opacity-disabled: 0.5;
```

### Dark Theme

Implemented in `src/styles/tokens.css` (`:root`, the default):

```css
--ui-color-canvas: #1f2328;
--ui-color-surface: #292f35;
--ui-color-surface-raised: #30383e;
--ui-color-surface-hover: #344046;
--ui-color-surface-active: #3a464c;
--ui-color-surface-selected: #25474a;
--ui-color-surface-playing: #4a332e;
--ui-color-text: #f7f1e7;
--ui-color-text-muted: #aeb8b6;
--ui-color-border: #3c4749;
--ui-color-border-strong: #586568;

--ui-color-accent: #55a2a7;
--ui-color-accent-hover: #6ab4b8;
--ui-color-accent-soft: #25474a;
--ui-color-accent-contrast: #102326;
--ui-color-focus: #dd7a64;

--ui-color-current: #dd7a64;
--ui-color-current-soft: #4a332e;
--ui-color-info: #7fb8bd;
--ui-color-success: #7bbd8b;
--ui-color-warning: #d6a84f;
--ui-color-danger: #dd7078;
--ui-color-gated: #d6a84f;
--ui-color-gated-bg: #3a3226;

--ui-opacity-disabled: 0.5;
```

### Common States

| State                 | Token / color role                          | Usage rule                                                        |
| --------------------- | ------------------------------------------- | ----------------------------------------------------------------- |
| Default               | `surface`, `text`, `border`                 | Neutral app chrome and ordinary controls.                         |
| Hover                 | `surface-hover`                             | Row, button, menu, and sidebar hover.                             |
| Pressed / active      | `surface-active`                            | Momentary button or row press; should be subtler than selected.   |
| Selected              | `surface-selected`, `accent`, `accent-soft` | Sidebar item, active collection, selected playlist, chosen track. |
| Currently playing     | `current`, `current-soft`                   | Playback identity, now-playing line, live transport cue.          |
| Focus-visible         | `focus`                                     | Keyboard focus ring; do not reuse selected fill alone.            |
| Loading / processing  | `info`, `accent`                            | Import, scan, separation progress, and neutral activity.          |
| Completed / available | `success`                                   | Separation complete, local asset ready, synced lyric available.   |
| Needs attention       | `warning`                                   | Recoverable metadata, missing optional data, user confirmation.   |
| Error / destructive   | `danger`                                    | Failed operation, destructive action, nonrecoverable problem.     |
| Disabled              | `text-muted` plus `--ui-opacity-disabled`   | Disabled controls; never communicate state by opacity alone.      |
| Feature gated         | `gated`, `gated-bg`, optional coral edge    | Advanced/provider/overlay flows before user opt-in.               |
| Drag target           | `accent` border or inset line               | Reorder targets; avoid full teal fills during drag.               |

Selected and currently-playing states are intentionally separate. A row can be selected without being the active audio source, and the active audio source can continue to show a coral cue even when focus moves elsewhere.

Feature-gated flows should not use danger red. A gate means "available behind an explicit decision," not "broken." Use warm muted gated colors, short copy, and secondary actions.

### Palette Rules

- Coral is not a large action-button color and must not be used as a recording dot.
- Coral works best as a voice line, current-playback line, focus ring, or small gate edge.
- Teal is the brand color, but should not fill every major UI surface.
- Gold is reserved for possible future high-quality or special states; it is not part of the main palette.
- Replace the current Spotify-green sort indicator with `accent` or `current` when implementation tokens are refreshed.

## Product UI Direction

The control panel should combine Spotify-like music workflow efficiency with macOS-like local tool clarity.

### Layout

- Preserve the app shell model: playlist sidebar + top section tabs + main workspace + persistent player.
- Use the sidebar for collections and music-management context; primary section navigation (Setlist/Appearance/Lyrics/Import) lives in the top tabs above the workspace, not the sidebar.
- Keep track rows dense, aligned, and easy to scan.
- Playlist and album headers can show cover and metadata, but should remain operational rather than heroic.
- Do not use oversized marketing heroes or nested page cards.

### Folder-Library Metaphor

The folder reference should show up as a restrained local-library metaphor, not as a full novelty interface.

Use folder / file cues for:

- Playlist, album, and collection headers.
- Import candidate groups and source previews.
- Lyrics source lists, lyric versions, and synced-line workspaces.
- Empty states that explain "put songs here" or "this collection is empty."
- App icon and selected artwork treatments.

Avoid folder cues for:

- Transport controls.
- Track rows themselves.
- Dense queue rows.
- Global buttons, menus, and form fields.
- Error states and feature gates.

Allowed visual devices:

- A single folder tab or label notch on collection surfaces.
- Slight paper-stack layering behind playlist or lyric-source panels.
- Thin inset strokes and soft edge highlights.
- Small file-label strips for metadata, not large decorative labels.
- Folder-like cover placeholders when no custom cover exists.

Limits:

- Use at most one folder cue per major region.
- Keep shadows shallow and functional; avoid dramatic skeuomorphic depth.
- Do not turn every panel into a file folder.
- Folder styling must never reduce list density or make repeated rows harder to scan.
- The reference should inform organization and materiality, while Spotify still governs music-list efficiency.

### Shape And Density

Utawakui should split shape language by job:

- **Use macOS-like shape for containers:** app chrome, modals, popovers, search fields, and local-object surfaces should feel calm, softly rectangular, and OS-native.
- **Use iTunes-like restraint for the custom titlebar:** keep it narrow, quiet, and structurally reserved until real navigation, search, or playback controls are wired.
- **Use Spotify-like shape for repeated music surfaces:** track rows, playlist rows, queue rows, and player controls should stay dense, scannable, and rhythmically aligned.
- **Use folder-like shape for collection surfaces:** playlist, album, import, and lyrics-source areas can use tabs, paper layers, or cover placeholders when they represent stored material.
- **Use the brand mark shape only for the app icon and selected artwork treatments:** the card-sleeve / cat-card shape should not leak into every control.

Radius decisions:

| Target                         | Radius          | Reference | Reason                                              |
| ------------------------------ | --------------- | --------- | --------------------------------------------------- |
| Hairlines, progress fills      | `2px`           | Spotify   | Keeps thin interactive marks crisp.                 |
| Dense thumbnails and artwork   | `4px`           | Spotify   | Keeps album and track art compact.                  |
| Rows, buttons, inputs, menus   | `6px`           | Shared    | Default operational radius: friendly, not pillowy.  |
| Modals, popovers, major panels | `8px`           | macOS     | Softens system surfaces without card-heavy styling. |
| Chips, transport toggles       | `999px`         | Spotify   | Pills are reserved for binary and status controls.  |
| App icon                       | platform-native | macOS     | Follows OS icon masks, not component radii.         |

Do not increase general UI cards beyond `8px`. If a surface wants more softness, use tone, spacing, or artwork rather than larger radius. The app icon and overlay graphics may use larger rounded silhouettes because they are brand/art surfaces, not control-panel components.

Density decisions:

| Surface                     | Direction | Rule                                                        |
| --------------------------- | --------- | ----------------------------------------------------------- |
| Playlist sidebar            | Spotify   | Compact rows, clear selected state, no large cards.         |
| Track / queue rows          | Spotify   | Stable height, tight metadata stack, contextual actions.    |
| Player bar                  | Spotify   | Persistent, compact, transport-forward.                     |
| Search / modal / popover UI | macOS     | Calm fields, clear focus, restrained elevation.             |
| Playlist / album header     | Hybrid    | Music metadata density with restrained folder cues.         |
| Import / lyrics sources     | Folder    | Paper-stack or tab cue where it clarifies stored materials. |
| Feature notices             | macOS     | System dialog clarity, short copy, no alarm-like styling.   |

Spacing decisions:

- Keep the 4px spacing base.
- Use `8px` inside compact rows and toolbar groups.
- Use `12px` for row horizontal padding and compact panel gutters.
- Use `16px` for stable panel padding.
- Use `24px` for page/header breathing room.
- Reserve `32px+` for layout separation, not ordinary component padding.

Primary control heights:

| Control                    | Height target | Reason                                             |
| -------------------------- | ------------- | -------------------------------------------------- |
| Compact icon button        | `30px`        | Current desktop density; good for repeated tools.  |
| Menu item / context action | `32px`        | Easier target without wasting vertical scan space. |
| Track row                  | `52px`        | Enough for title + artist and 40px artwork.        |
| Player bar                 | `68px`        | Preserves persistent transport plus 52px artwork.  |

These numbers should be treated as implementation targets when refreshing tokens and components. If a future touch-first surface exists, it can introduce touch-specific component tokens instead of enlarging the desktop control panel.

### Unit Rules

Use `rem` for scalable dimensional tokens such as spacing, typography, control heights, player height, and titlebar height. Keep `px` for true device-pixel details: 1px borders, focus rings, hairline drag/drop indicators, image pixel slots, media-query breakpoints, and Electron API literals that require integer pixel values.

### Default vs Feature-Gated Visuals

Default core services:

- Local library.
- Playback.
- Queue.
- Playlist / collection.
- Metadata display.
- Windows shell integration.

These use the main UI palette, direct entrypoints, stable controls, and no warning-like badge treatment.

Contextual or advanced flows:

- Provider flow.
- Lyrics flow.
- Audio processing flow.
- Public output flow.

These should be visible but secondary. Use contextual panels, outline/secondary buttons, and clear feature notices. Coral may appear as a small edge or focus hint, but not as a full red warning surface. Gates record that a user enabled a flow; UI must not imply Utawakui completed external confirmation on the user's behalf.

### Style File Taxonomy

Global renderer CSS lives in `src/styles/` and is imported from `src/main.js`, so Vite can include it in the app bundle. Keep filenames short, lowercase, and purpose-based.

- `tokens.css`: control-panel design tokens and documented breakpoint values.
- `base.css`: document-level reset, `body`, `#app`, focus-adjacent element baselines, and native control defaults.

Add new global CSS files only when the purpose is real and shared. Likely future names are `themes.css` for light/dark token overrides and `utilities.css` for a small set of cross-component utilities.

Component-specific styling stays inside Vue SFC `<style scoped>` blocks unless it becomes a reusable primitive or global rule.

### Token Namespace Contract

CSS token namespaces are surface-specific. Do not share one token namespace across the Electron control panel and OBS overlay.

| Namespace | Surface                 | File timing                                             |
| --------- | ----------------------- | ------------------------------------------------------- |
| `--ui-*`  | Control panel renderer. | Lives in `src/styles/tokens.css` because the UI exists. |
| `--ovl-*` | OBS Browser Source.     | Documented here for now; create only with overlay code. |

Token names should describe role before value:

- Use `--ui-font-family-base`, not a visual mood name.
- Use `--ui-font-size-md` style names for typography sizes; avoid deprecated text-size aliases.
- Use `--ui-line-height-body`, not hardcoded component values when shared.
- Use `--ui-color-text-muted`, not `--ui-muted`.
- Use the `--ui-shadow-*` namespace for shadows instead of mixing shadow roles into other names.
- Use `--ovl-font-display-cjk`, not `--ovl-genwan`.

Control-panel token categories:

| Category    | Prefix               | Example                 |
| ----------- | -------------------- | ----------------------- |
| Color       | `--ui-color-*`       | `--ui-color-accent`     |
| Typography  | `--ui-font-*`        | `--ui-font-size-md`     |
| Line height | `--ui-line-height-*` | `--ui-line-height-body` |
| Spacing     | `--ui-space-*`       | `--ui-space-4`          |
| Radius      | `--ui-radius-*`      | `--ui-radius-lg`        |
| Shadow      | `--ui-shadow-*`      | `--ui-shadow-overlay`   |
| Opacity     | `--ui-opacity-*`     | `--ui-opacity-disabled` |
| Motion      | `--ui-motion-*`      | `--ui-motion-fast`      |
| Z-index     | `--ui-z-*`           | `--ui-z-dropdown`       |
| Dimensions  | `--ui-*-height`      | `--ui-control-height`   |

Deprecated text-size aliases should not be reintroduced; current component CSS should use `--ui-font-size-*`.

### Naming Conventions

Use naming to separate design intent, implementation role, and runtime state.

| Type                | Pattern                            | Example                             |
| ------------------- | ---------------------------------- | ----------------------------------- |
| Control-panel token | `--ui-{category}-{role}-{state}`   | `--ui-color-surface-selected`       |
| Component CSS var   | `--ui-{component}-{property}`      | `--ui-track-thumb-radius`           |
| Overlay token       | `--ovl-{category}-{role}`          | `--ovl-font-display-cjk`            |
| Primitive component | `ui-{component}`                   | `ui-btn`, `ui-chip`, `ui-track-row` |
| Component element   | `ui-{component}__{element}`        | `ui-context-menu__item`             |
| Component variant   | `ui-{component}--{variant}`        | `ui-btn--accent`, `ui-chip--gated`  |
| Local component     | `{feature}-{component}`            | `playlist-sidebar-row`              |
| Local element       | `{feature}-{component}__{element}` | `playlist-sidebar-row__play`        |
| Local variant       | `{feature}-{component}--{variant}` | `candidate-option--selected`        |
| Runtime state       | `is-{state}` / `has-{state}`       | `is-selected`, `has-error`          |
| Test id             | `kebab-case`                       | `track-row-play`                    |

Current code may still use local BEM-style state variants such as `candidate-option--selected`. New shared primitives should prefer `is-*` / `has-*` state classes when state is independent of visual variant. Do not rename stable component classes just for aesthetics; migrate naming when touching the component for visual work.

Component-scoped CSS custom properties are allowed when they are a public override API for a primitive, such as thumbnail radius or chip background. They should stay component-prefixed (`--ui-track-thumb-*`, `--ui-chip-*`) and should not become hidden global theme tokens.

#### Boolean Prop Naming

The table above covers CSS naming only. Vue `defineProps` boolean names follow a separate rule: state/quality props use a bare adjective or participle (`active`, `disabled`, `dragging`, `playing`, `saving`) — no `is`/`has` prefix, since these are naturally adjectival and read fine on their own (`:active="true"`). Kind/identity props keep the `is` prefix (`isAlbum`) when the underlying concept is a noun with no natural adjective form — `:album="true"` misreads as passing an album object, not answering "is this an album?" Plain JS predicate functions (`isActiveSource()`, `isPlayingThis()`) are a different, unrelated case and keep their idiomatic `is`/`has` prefix regardless of this rule; only the exported `defineProps` name is in scope here.

### Icon Usage

Lucide is the current control-panel icon source, but app code should import icons through `src/icons/index.js` instead of importing from `@lucide/vue` directly. The registry is the project-owned boundary for future icon swaps, aliases, and shared sizing.

Rules:

- Components and views import icon components from `src/icons/index.js`.
- Shared icon size is re-exported there as `ICON_SIZE`; the literal still lives in `src/constants/ui.js`.
- Pure utilities and composables must not import Vue icon components.
- Do not wrap every icon in a generic `<AppIcon>` component unless the app needs runtime icon lookup or theming behavior that named imports cannot express.

## Colors

The current palette is a placeholder baseline, not the final brand identity. Treat these tokens as semantic slots to be replaced or refined.

### Primary

- **Accent** (`accent`): Primary action, selected state, focus anchor, and active operational state.
- **Accent Hover** (`accent-hover`): Hover state for accent-filled controls.
- **Accent Contrast** (`accent-contrast`): Text and icon color on accent-filled surfaces.

### Neutral

- **Canvas** (`canvas`): App-level background.
- **Surface** (`surface`): Main panels, sidebars, toolbar regions, and stable containers.
- **Raised Surface** (`surface-raised`): Menus, popovers, floating panels, and elevated controls.
- **Surface Hover** (`surface-hover`): Hover, pressed, and active neutral states.
- **Text** (`text`): Primary readable text.
- **Muted Text** (`text-muted`): Secondary metadata, inactive controls, helper text.
- **Border** (`border`): Dividers, input outlines, subtle boundaries.

### Status

- **Success** (`success`): Completed or available state.
- **Warning** (`warning`): Needs attention but not blocked.
- **Danger** (`danger`): Destructive action or failed state.
- **Info** (`info`): Informational state and neutral progress.

### Color Rules

**The Placeholder Color Rule.** These colors are structural placeholders. Do not treat the current teal accent or dark neutral surface as final brand identity.

**The One Accent Rule.** A screen should have one primary accent role. Do not introduce competing highlight colors for decoration.

**The Overlay Separation Rule.** Control-panel `--ui-*` colors and overlay `--ovl-*` colors are designed separately.

## Typography

- **Control Panel Font:** native system UI stack. Do not bundle brand fonts into the control panel by default.
- **Overlay CJK Display Font:** `GenWanMin2 TW`, with CJK serif fallbacks.
- **Overlay Latin Display Font:** `Playfair Display`, with practical serif fallbacks.
- **Overlay Utility Font:** system sans.
- **Label/Mono Font:** pending; only introduce mono if timestamps, technical metadata, or counters clearly benefit.

**Character:** Product typography should be functional, internationalized, and calm. It must handle Japanese, Korean, Traditional Chinese, English, long song titles, artist metadata, and dense table labels without feeling cramped.

### Surface Strategy

Control panel typography and OBS overlay typography serve different jobs.

| Surface       | Typography direction       | Reason                                                             |
| ------------- | -------------------------- | ------------------------------------------------------------------ |
| Control Panel | Native/system sans stack.  | Stable, fast, dense, accessible, and familiar during live control. |
| OBS Overlay   | Ornate display serif pair. | Public-facing, animated, more atmospheric, and brand expressive.   |

The control-panel default is:

```css
--ui-font-family-base:
  'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei', system-ui,
  -apple-system, sans-serif;
```

This matches the current `src/styles/tokens.css` direction. Keep this stack compatible and local-first; do not bundle brand fonts into the Electron control panel.

The overlay default pairing is:

```css
--ovl-font-display-cjk:
  var(--ovl-font-display-cjk-custom, 'GenWanMin2 TW'), 'GenWanMin2 TC',
  'GenWanMin2 PJP', 'Noto Serif TC', 'Noto Serif JP', 'Noto Serif KR', serif;
--ovl-font-display-latin:
  var(--ovl-font-display-latin-custom, 'Playfair Display'), 'Source Serif 4',
  Georgia, serif;
--ovl-font-ui:
  system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

Do not add these `--ovl-*` tokens to `src/styles/tokens.css`. They belong in `overlay/shared/tokens.css`, because OBS overlay and control panel are separate delivery paths.

First-version bundled overlay fonts should stay small:

- Bundle `GenWanMin2 TW` for CJK display.
- Bundle `Playfair Display` for Latin display.
- Let Korean and other CJK fallback through system / Noto-family fallbacks first.
- Consider optional font packs or user-selected local fonts only after the overlay MVP exists.

`GenWanMin2 TW` and `Playfair Display` are suitable for bundling under SIL Open Font License 1.1, but release artifacts must include license notices.

### Custom Overlay Fonts

Overlay font customization should be local and overlay-scoped:

- Allow custom CJK display font.
- Allow custom Latin display font.
- Provide reset-to-default.
- Preserve license notices for bundled fonts.
- Prompt users to confirm their custom font license for streaming, recording, VOD, clips, and commercial use.

Custom font settings should not affect control panel UI. The control panel should continue using native/system typography even when overlay fonts are customized.

### Hierarchy

- **Display** (650, `2rem`, 1.15): Rare page-level headings or empty-state anchors.
- **Headline** (650, `1.5rem`, 1.2): Major view titles and modal titles.
- **Title** (600, `1.125rem`, 1.3): Section headers, panel titles, and active item titles.
- **Body** (400, `1rem`, 1.5): Standard UI copy and readable prose.
- **Label** (600, `0.875rem`, 1.25): Buttons, tabs, metadata labels, compact controls.
- **Caption** (400, `0.875rem`, 1.4): Secondary/metadata text — artist lines, row subtitles, hints, empty/status messages. Shares Label's size but stays regular weight; the two exist specifically to be told apart (a bold 14px control vs. a quiet 14px description).

Naming here is this project's own semantic roles, not a literal port of any platform's type-style names. In particular, Apple's HIG `Headline` style (small, bold, body-adjacent emphasis) is not what this document's `Headline` means (a big view/modal title, closer to HIG's `Title 1`/`Title 2`) — don't assume HIG familiarity carries over to these names.

### Typography Rules

**The Fixed Scale Rule.** Product UI uses fixed rem scale, not viewport-fluid type. Responsive behavior comes from layout, not shrinking text.

**The Multilingual Fit Rule.** Long metadata must truncate, marquee, wrap, or resize by component rule; it must not overflow its container.

## Elevation

Utawakui should be flat by default and layered by tone before shadow. Depth exists to clarify stacking order: menus over panels, dialogs over content, tooltips over controls.

### Shadow Vocabulary

- **Overlay Shadow** (`0 1.5rem 3rem rgb(0 0 0 / 28%)`): Floating menus, popovers, and modal surfaces.
- **Focus Ring** (`0 0 0 2px {colors.accent}`): Keyboard focus and critical interaction target.

### Elevation Rules

**The Flat-At-Rest Rule.** Surfaces are flat at rest. Elevation appears only when an element is floating, focused, dragged, or actively layered above another surface.

## Components

Components should use a single product vocabulary across library, import, lyrics, playlist, and player surfaces.

### Folder Taxonomy

Component folders are grouped by product role, not by current visual style. Existing UI may be temporary, but new or rebuilt components should land in the category that describes their responsibility.

- `src/components/layout/`: app shell, global navigation, and long-lived frame components.
- `src/components/playback/`: persistent playback controls, transport, pitch/tempo, and now-playing surfaces.
- `src/components/library/`: track rows, artwork, metadata, album grouping, and media-library surfaces.
- `src/components/playlists/`: playlist, album, setlist, and collection navigation components.
- `src/components/queue/`: active queue, upcoming tracks, reorderable queue sections.
- `src/components/import/`: source import, candidate preview, provider flow, and gated acquisition UI.
- `src/components/lyrics/`: lyrics workspace, synced-line display, lyric editing and timing surfaces.
- `src/components/analysis/`: Music Analysis selection, capability, batch, benchmark, and Music Structure result surfaces.
- `src/components/output/`: OBS Output Gallery, Workbench, preview, slot, and appearance surfaces.
- `src/components/performer/`: Performer Self-View stage, lyric cue, and window toolbar surfaces.
- `src/components/separation/`: vocal-separation recipe and result controls that are not persistent playback chrome.
- `src/components/settings/`: app configuration, dependency, diagnostics, update, and device settings surfaces.
- `src/components/ui/`: low-level primitives only, such as buttons, menus, text rows, status icons, and typography helpers.

Do not place feature-specific behavior in `ui/`. A component belongs in `ui/` only when it can be reused without knowing about tracks, playlists, providers, lyrics, playback, or OBS.

### Buttons

- **Shape:** compact rounded rectangle (`6px`) for tool buttons; circular only when the control is a true transport action.
- **Primary:** accent-filled, used sparingly for the main action in a local context.
- **Ghost:** transparent at rest, neutral hover fill, used for toolbar and repeated actions.
- **Focus:** visible 2px focus ring with 1-2px offset.
- **Touch baseline:** desktop buttons can be compact, but touch-responsive surfaces should preserve at least `44px` iOS / `48dp` Android target guidance.

### Inputs / Fields

- **Style:** tonal surface or transparent field with visible border.
- **Focus:** border or ring shift, never color-only.
- **Error / Disabled:** semantic state tokens plus text/icon support.
- **Mobile / responsive:** respect safe-area and keyboard insets when used in narrow surfaces.

### Lists / Tables

- **Track rows:** stable thumbnail slot, title/artist stack, optional duration, optional trailing actions.
- **Alignment:** text columns left; numeric/time columns may align right.
- **State:** selected, hover, loading, processing, unavailable, and error states must be visually distinct.
- **Drag:** drag handles and thumbnails must not trigger accidental text/image selection.

### Navigation

- **Desktop:** sidebar or panel navigation is acceptable for the control panel.
- **Responsive web:** collapse navigation structurally; do not rely on fluid typography.
- **Native-reference guidance:** if a mobile shell is ever built, iOS should preserve safe areas and edge-swipe expectations; Android should honor system Back and Material navigation patterns.

### Panels / Menus

- **Panels:** use `surface` or `surface-raised`, with stable padding from the spacing scale.
- **Menus:** render above layout stacking contexts and group actions by intent.
- **Modals:** use only when interruption is necessary; prefer inline or progressive disclosure first.

### Sliders / Transport Controls

- **Sliders:** use for continuous values such as volume, pitch cents, and tempo rate.
- **Steppers:** use for discrete increments such as semitone changes.
- **Transport:** play/pause/next/previous controls should be visually stable and never shift layout.

## Do's and Don'ts

### Do

- **Do** use rem-based spacing and type tokens as the baseline.
- **Do** define dark and light theme token values before declaring a visual direction complete.
- **Do** keep component states explicit: default, hover, focus, active, selected, disabled, loading, processing, error.
- **Do** use iOS `44pt` and Android `48dp` touch-target guidance when designing narrow or touch-capable surfaces.
- **Do** separate control-panel tokens from OBS overlay tokens.
- **Do** design safe-area and keyboard-inset behavior for responsive or mobile-like surfaces.
- **Do** verify contrast and text fit with Japanese, Korean, Traditional Chinese, and English metadata.

### Don't

- **Don't** treat the current dark-blue placeholder palette as the final brand.
- **Don't** use glow, glassmorphism, purple-blue gradients, beige/cream defaults, or decorative effects as the product identity.
- **Don't** use nested cards as page structure.
- **Don't** create hover-only controls that fail on touch.
- **Don't** use viewport-fluid heading scales for dense product UI.
- **Don't** merge `--ovl-*` overlay tokens with control-panel `--ui-*` tokens.
- **Don't** reinvent iOS or Android native conventions if a future native surface is created.

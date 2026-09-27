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
  xs: '0.125rem'
  sm: '0.25rem'
  md: '0.375rem'
  lg: '0.5rem'
  pill: '999rem'
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

<!-- BASELINE: this is a first-pass scaffold and remains the current production
     baseline. A successor direction (Studio Library／Architectural Slate) has
     already been owner-approved as a development candidate — see the status
     callout below — but has not been adopted here. Replace palette character,
     final type choices, and component details once that adoption happens. -->

> **Visual refresh status — 2026-09-14:** Token v2 is reviewed in strict
> Foundation → primitive／Field family → compound component → View order. The
> development-only F8 component review now covers all 30 catalogue sections,
> from Foundation through UiModal; its recorded decisions and next gate live in
> [Token v2 Component Review](docs/contracts/token-v2-component-review.md).
> F7 Studio Library／Controlled Dossier is now an active development-only View
> candidate. Its current owner checkpoint still cannot approve Candidate
> production adoption by implication.

The owner-selected replacement direction remains recorded in
[Visual System Foundation](docs/research/visual-system-foundation-2026-08-28.md):
Direction B／Studio Library, Architectural Slate, semantic status signals, and the
Controlled Dossier folder interior. Candidate values in
`src/styles/tokens-v2.css` remain isolated from production until a separate
adoption decision. The only active component change across this review remains
the Icon Button hard floor: `sm` is removed, `md` is 2rem／32 CSS px, and `lg` is
2.75rem／44 CSS px.

## Overview

Utawakui is a product UI for live operation. The design system should support a calm desktop control panel first, then extend to responsive and OBS overlay surfaces without assuming that all surfaces share the same tokens.

This scaffold started with a restrained, neutral product baseline: stable rem-based scales, semantic states, predictable components, visible focus, and responsive constraints. It also carries a more specific identity layer that remains the current production baseline: a local-media card sleeve, a quiet cat-card presence, and a restrained graphite / teal / paper / coral palette. An owner-approved successor direction already exists as a development candidate (see the status callout above) but has not replaced this baseline in production.

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

This section documents the palette currently shipping in production
(`src/styles/tokens.css`). The owner-approved successor — Architectural Slate's
indigo accent and folder-material roles, with the Clear Pastel status-color
system — is recorded as a development candidate in
[Visual System Foundation](docs/research/visual-system-foundation-2026-08-28.md)
and is not reflected below until it is adopted.

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

--ui-color-current: #9f4629;
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

--ui-color-current: #f39a85;
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
- Keep the persistent playlist sidebar inset `1rem` from the shell content row's top and bottom in both the current production UI and Token v2; it is an independent navigation plane, not a continuation of the tabbed main-workspace baseline.
- Treat production Queue and Token v2 playback metadata as surfaces in one `.shell__main` right Dock rather than page columns or PlayerBar popovers. Reserve its `17.5rem` desktop bay, pin the `2.5rem` collapsed rail and expanded panel to the shell's right edge with the same `1rem` block inset as Sidebar, and let its resize axis double-click bidirectionally between collapsed and the last expanded width. Queue may replace metadata in the foreground while retaining metadata as its fallback; closing Queue reveals that fallback, and activating the player artwork while Queue is visible cancels Queue and navigates directly to metadata. Only a Dock with no visible surface folds automatically.
- Use the sidebar for collections and music-management context; primary section navigation (Setlist/Appearance/Lyrics/Import) lives in the top tabs above the workspace, not the sidebar.
- Align Sidebar collection rows and standard track rows to the same 3.25rem／2.5rem rhythm. Sidebar keeps collection semantics: one click selects, a double-click or the artwork control starts playback.
- Keep track rows dense, aligned, and easy to scan.
- Queue rows reuse the standard `UiTrackRow` 3.25rem／2.5rem geometry; single-click selects, double-click or artwork activation plays, duration is hidden, and track titles remain plain text. The 3rem artwork recipe belongs only to the bottom-left PlayerBar.
- Keep Queue and Recently Played as two true tabpanels inside the same Right Dock surface. Reuse `UiTabs` with the flat Bar presentation; the caller owns panel ids, visibility, and scrolling rather than turning the labels into ad-hoc buttons.
- Keep the Queue tab／close chrome sticky within the content scroller. At scroll origin it remains flat; after content passes beneath it, use the shared Right Dock translucent background, blur, and theme-aware shadow tokens. Do not copy Spotify brand green, gradients, or bespoke row anatomy.
- Recently Played reuses the Queue `UiTrackRow` adapter and its selection／activation contract. It does not add timestamps, durations, or a history-specific row primitive unless a later workflow proves those fields necessary.
- Keep Queue and Recently Played as two true tabpanels inside the same Right Dock surface. Reuse `UiTabs` with the flat Bar presentation; the caller owns panel ids, visibility, and scrolling rather than turning the labels into ad-hoc buttons.
- Keep the Queue tab／close chrome sticky within the content scroller. At scroll origin it remains flat; after content passes beneath it, use the shared Right Dock translucent background, blur, and theme-aware shadow tokens. Do not copy Spotify brand green, gradients, or bespoke row anatomy.
- Recently Played reuses the Queue `UiTrackRow` adapter and its selection／activation contract. It does not add timestamps, durations, or a history-specific row primitive unless a later workflow proves those fields necessary.
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
| Hairlines, progress fills      | `0.125rem`      | Spotify   | Keeps thin interactive marks crisp.                 |
| Dense thumbnails and artwork   | `0.25rem`       | Spotify   | Keeps album and track art compact.                  |
| Rows, buttons, inputs, menus   | `0.375rem`      | Shared    | Default operational radius: friendly, not pillowy.  |
| Modals, popovers, major panels | `0.5rem`        | macOS     | Softens system surfaces without card-heavy styling. |
| Chips, transport toggles       | `999rem`        | Spotify   | Pills are reserved for binary and status controls.  |
| App icon                       | platform-native | macOS     | Follows OS icon masks, not component radii.         |

Do not increase general UI cards beyond `0.5rem` (8 CSS px at the default root). If a
surface wants more softness, use tone, spacing, or artwork rather than larger
radius. The app icon and overlay graphics may use larger rounded silhouettes
because they are brand／art surfaces, not control-panel components.

Density decisions:

The desktop shell projects one explicit density value onto the document root.
A restored／windowed `BrowserWindow` uses `data-ui-density="compact"`; maximized
and full-screen states use `data-ui-density="standard"`. Electron native window
state is authoritative: manual resizing does not switch density, and CSS viewport
or media queries must not guess it. The active production tokens intentionally do
not consume this attribute yet; only Token v2 surfaces that explicitly opt into
`data-ui-system="v2"` remap their dimensions. Content-driven responsive reflow
remains a separate parent-layout responsibility.

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

- Keep the `0.25rem` spacing base (4 CSS px at the default root).
- Use `0.5rem` inside compact rows and toolbar groups.
- Use `0.75rem` for row horizontal padding and compact panel gutters.
- Use `1rem` for stable panel padding.
- Use `1.5rem` for page／header breathing room.
- Reserve `2rem+` for layout separation, not ordinary component padding.

Primary control heights:

| Control                    | Height target                   | Reason                                                   |
| -------------------------- | ------------------------------- | -------------------------------------------------------- |
| Routine icon button        | `2rem`–`2.25rem` (32–36 CSS px) | Keeps a 16-unit glyph while preserving the target floor. |
| Live icon button           | `2.75rem` (44 CSS px)           | Separates primary playback from routine toolbar actions. |
| Menu item / context action | `2rem` (32 CSS px)              | Easier target without wasting vertical scan space.       |
| Track row                  | `3.25rem` (52 CSS px)           | Enough for title + artist and compact artwork.           |
| Player bar                 | `4.25rem` (68 CSS px)           | Preserves persistent transport and artwork.              |

These CSS-pixel equivalents assume a `16px` root and 100% Chromium zoom. Treat the rem values as implementation targets when refreshing tokens and components. A future touch-first surface can introduce touch-specific component tokens without shrinking the desktop hard floors.

### Unit Rules

The control panel is **rem-first, not rem-only**. Choose units by responsibility:

| Responsibility                | Unit                       | Rule                                                                                                              |
| ----------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Scalable product geometry     | `rem`                      | Typography, spacing, radius, control／row height, panel bounds, material thickness and CSS responsive thresholds. |
| Exact optical boundaries      | `px`                       | One-pixel borders plus two-pixel focus, drag and state indicators that must stay optically crisp.                 |
| Flexible layout tracks        | `%`, `fr`, `minmax()`      | Columns and proportions that respond to available container space.                                                |
| Readable text measure         | `ch`／`ic`                 | Latin／CJK reading width where content measure matters.                                                           |
| Line height                   | Unitless                   | Inherits proportionally from the owning text role.                                                                |
| Electron window geometry      | DIP number                 | BrowserWindow bounds and screen coordinates passed through Electron APIs without a CSS unit suffix.               |
| Raster source／canvas backing | Physical pixel calculation | Encoded image dimensions and backing-buffer fidelity, independent from CSS layout size.                           |

CSS responsive thresholds use `rem`; Electron window acceptance examples such as
`960 × 650` are BrowserWindow DIP values, not media-query `px` tokens. CSS image slots
use `rem` or flexible layout units; only raster source dimensions and canvas
backing buffers use physical-pixel calculations. A CSS `px` is an optical CSS-pixel
boundary and must not be described as a physical display pixel.

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

**The Placeholder Color Rule.** These colors are structural placeholders. Do not treat the current teal accent or dark neutral surface as final brand identity — a successor palette (Architectural Slate) is already an owner-approved development candidate; see the status callout at the top of this document.

**The One Accent Rule.** A screen should have one primary accent role. Do not introduce competing highlight colors for decoration.

**The Overlay Separation Rule.** Control-panel `--ui-*` colors and overlay `--ovl-*` colors are designed separately.

## Typography

- **Control Panel Font:** native system UI stack. Do not bundle brand fonts into the control panel by default.
- **Overlay CJK Display Font:** `GenWanMin2 TW`, with CJK serif fallbacks.
- **Overlay Latin Display Font:** `Playfair Display`, with practical serif fallbacks.
- **Overlay KTV Display Font:** `Utawakui Open Huninn`.
- **Overlay Kinetic Pop Display Fonts:** `Utawakui M PLUS Rounded 1c` for the flat／split-depth materials; `Utawakui Keifont` for the enlarged gradient material.
- **Overlay Ornate Vertical Display Font:** `Utawakui Hina Mincho` for Japanese-first grouped-kanji vertical lyrics.
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

The `queue-board` Setlist template is a utility-output exception to the more
ornate lyric templates. It keeps the Overlay utility sans stack so a viewer can
scan song identity quickly. At the canonical 480×810 source capture, its
small／standard／large setting is a bounded role scale rather than uniform page
zoom:

| Role                  | Small | Standard | Large | Treatment                   |
| --------------------- | ----: | -------: | ----: | --------------------------- |
| Current song title    |  28px |   29.6px |  34px | Primary, semibold, ≤2 lines |
| Completed song title  |  16px |   16.8px |  18px | Repeated scan, ≤2 lines     |
| Current artist        |  13px |   14.1px |  16px | Secondary identity          |
| Completed artist      |  12px |   12.2px |  14px | Repeated metadata           |
| Section／source label |  12px |     12px |  13px | Navigation metadata         |
| Sequence number       |  11px |   11.2px |  12px | Tabular metadata            |

These are source-canvas sizes. Long CJK／Latin titles receive up to two lines with
anywhere wrapping before truncation. In completed rows, the artist stays on one
secondary line directly below the title and shares its left edge; do not reserve a
fixed trailing artist column that shortens the title. Short-height layouts preserve
the role floors and use measured history overflow instead of shrinking metadata.
Setlist consumes every played item retained by the bounded Output snapshot rather
than trimming the projection to the visible row count. Overflow history rests for
four seconds per row-aligned page, moves between pages in about 450ms, then fades
before returning to the top. When a song changes, the current identity exits in
about 160ms and its successor arrives in about 260ms; interrupted handoffs always
commit the newest identity. Reduced motion replaces spatial movement with opacity
handoffs while retaining readable page changes. Gallery detail previews mirror the
static hierarchy, while compact thumbnails keep their dedicated single-line
thumbnail treatment and are not evidence of final capture readability.

First-version bundled overlay fonts should stay small:

- Bundle `GenWanMin2 TW` for CJK display.
- Bundle `Playfair Display` for Latin display.
- Let Korean and other CJK fallback through system / Noto-family fallbacks first.
- Consider optional font packs or user-selected local fonts only after the overlay MVP exists.

The `karaoke-stack` template is a deliberate display exception. It uses the
bundled jf open-huninn 2.1 Traditional Chinese rounded TTF under the local CSS
family name `Utawakui Open Huninn`. Both fixed A／B lanes use the same face, size,
line-height, tracking, stroke, and shadow. Unsung text is white with a dark navy
outline; the sung portion replaces it with dark blue solo／male, dark red female,
or dark green group fill and a thicker white outline. Explicit `[男]`, `[女]`, and
`[合]` source cues select those roles; unmarked and unknown-speaker lines use the
solo blue default. A newly active lane follows its lyric timestamp immediately;
the completed lane remains visible for two seconds before receiving the following
line and remains fully filled during that hold. The KTV adapter consumes the
shared lyric source analyzer for cue cleanup and phrase diagnostics, while the
normalized LRC timestamp／row remains the authoritative sentence boundary. T2
segments drive exact sung progress. When only synced line timing is
available, the active lane uses a clearly estimated whole-line left-to-right sweep
and freezes that estimate whenever playback is not advancing. The control-panel UI
remains on the native system stack.

The `kinetic-pop` template is the Japanese-first rounded display exception. Its
first and third materials use the bundled M PLUS Rounded 1c ExtraBold face under
the local CSS family name `Utawakui M PLUS Rounded 1c`; the larger gradient
material uses bundled Keifont as `Utawakui Keifont`. Traditional Chinese output
falls back to the bundled jf open-huninn face. One stage hides the next-line lane
and can pin one of three print-like materials or rotate them by
source-line index: a flat yellow face with a surrounding black outline; an
enlarged heavy face with a lower-right black shadow, white rim, and gradient from
deep upper-right to light lower-left; and a white face whose cyan／magenta split
depth is offset only to the lower right. Material two is the default and renders
at 1.18×; materials one and three share the base scale. Material two keeps a
`0.03em` paper-white rim, then paints a hairline `0.0125em` paper-white stroke on
the top gradient face. Together they read as the reference video's thin separator
between gradient face and black depth, never as a heavy white band or black inner
outline.

The Workbench also exposes a Kinetic Pop-only text arrangement choice. `端正` is
the default and compatibility fallback, leaving every glyph on the shared
baseline after its entrance. `些微偏移` applies a bounded, deterministic
eight-pose rest pattern with small rotation, baseline, horizontal, and scale
differences. It is a settled layout treatment rather than continuous jitter: the
depth, rim, and fill copies of a glyph always share one pose, and the Gallery and
Browser Source consume the same presentation motion contract.

Workbench appearance edits use visible autosave instead of a manual save button.
Select, capture-size, and reset actions persist immediately; continuous color and
range input is coalesced for 350ms and its final change flushes immediately. Writes
are serialized and keep only the latest pending snapshot, so controls remain
editable while saving. The header exposes `儲存中…`, `已儲存`, or `儲存失敗` with
an explicit retry after failure. Leaving the Workbench, changing output kind, or
applying a template first flushes the draft; template application and Output
runtime settings remain deliberate actions.

Appearance controls are template-effective rather than slot-wide. Every available
template exposes a bounded semantic palette: Template Original, Warm Stage, Cool
Stage, Monochrome, and High Contrast. The palette remaps the roles actually used by
each template, including KTV role fills, Kinetic Pop materials, Manga ink／paper,
and general text／surface colors; it is not a raw theme object. Ornate Vertical
keeps its explicit text and ink-echo color pickers as advanced overrides, while a
non-original palette supplies those roles whenever the colors remain at their
template defaults.

The inspector always orders fields as Color, Typography, Readability, Background,
Layout, Motion, then Content Visibility, omitting empty groups. `queue-board` and
`now-next` additionally expose spacing density; `quiet-caption` and `focus-line`
expose text contrast, spacing density, and content width. Existing font, alignment,
surface-opacity preset, furigana, Kinetic material／arrangement, and Ornate position
controls remain available only where their CSS or runtime consumes them. Controls
fixed by an artwork layout stay absent instead of presenting settings with no
visible effect. Every registered template receives its appearance metadata from
the shared schema; a template with no controls also omits the appearance reset
action.

The `manga-frame` template uses the bundled normal-width GenEi Antique 6.0a face
under the local CSS family name `Utawakui GenEi Antique` when the projected line
is Japanese. Ruby annotations inherit the same face so kanji and kana retain one
comic-dialogue texture in vertical setting. Traditional Chinese and other content
continue through the selected profile font stack; this exception does not alter
the control panel or any other Output template.

The `ornate-vertical` template defaults to bundled Hina Mincho Regular under the
local CSS family name `Utawakui Hina Mincho`; the user may select bundled GenEi
Antique as its only alternate. It is a Japanese-first Output exception, not a
control-panel brand font: continuous kanji runs reveal as groups, kana reveal as
graphemes, and punctuation remains attached to the preceding unit. One
conservative kanji group may receive a restrained same-size ink echo; lines
without a reliable candidate stay unaccented. Safe appearance controls expose one
of three consistent type scales, the main／ink-echo colors, a right-side
top／center／bottom safe-area anchor, and bounded X／Y offsets. A visually long line
may split into at most two vertical columns at an authored break, punctuation,
Japanese word, or particle boundary; unbalanced stubs and cuts through continuous
kanji runs are rejected. The first segment stays in the right column and the
second expands left, while both retain the canonical source line and timing. Swaps
change only opacity and clip-path, so layout coordinates remain fixed. The Gallery
mirrors the default shared presentation and motion rules without bundling any MV
scene artwork.

Each timed source line occupies one horizontal presentation row at any instant;
Kinetic Pop never repairs an overlong source line by wrapping it into a second
visual row. The lyric stage uses equal safe insets from the complete output canvas;
its line, row, and depth／rim／fill tracks all span that same stage and center their
glyph group within it. The programme artwork is never an alignment anchor, and an
overwide `nowrap` phrase extends or clips equally on both sides instead of falling
back to one-sided overflow. For this Japanese-first template, authored whitespace
inside a source line is a sequential phrase boundary within its existing timing
interval: presentation assigns each phrase a duration share by visual weight,
shows the earlier phrase first, and then replaces it with the later phrase. This
visual phrase schedule neither creates nor rewrites canonical or T2 timing. An
unspaced overlong line still belongs to the upstream lyrics document and timing
pipeline. Every visible phrase is split into
presentation-owned, grapheme-aware visual entrance units; small kana and the
prolonged-sound mark enter independently while punctuation stays attached to the
preceding glyph. These units are choreography only and do not claim T2 timing.
Caption and punch entrances, including each authored phrase replacement, use one
interruptible GSAP timeline with a bounded interleaved burst rather than a
left-to-right sweep. Every unit begins at its final horizontal slot; an eight-step
deterministic phase pattern repeats across the row within a 28 ms window, while odd
and even units start with opposing vertical offset, rotation, and scale. A 115 ms
back-out settle supplies the single quick rebound. The three material tracks remain
ordered depth／rim／fill across the complete row, while the matching unit in each
track receives the same delay, transform, and opacity tween. This preserves
per-glyph motion without letting a neighboring glyph's white rim paint above the
gradient face.
Material two uses a 1.12 line-height so the clipped gradient background covers
Keifont's full ascent instead of exposing a white cap. Reduced motion and playback
discontinuities commit the readable final state immediately. The Gallery shows one
fixed material-two sample in the shared line position; users choose a fixed
material or the explicit three-material rotation from the Workbench, and may
preview either the straight or subtle-offset settled arrangement.

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
- **Caption** (400, `0.875rem`, 1.4): Secondary/metadata text — artist lines, row subtitles, hints, empty/status messages. Shares Label's size but stays regular weight; the two exist specifically to be told apart (a bold 14 CSS px control vs. a quiet 14 CSS px description at the default root).

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

- **Shape:** compact rounded rectangle (`0.375rem`) for tool buttons; circular only when the control is a true transport action.
- **Primary:** accent-filled, used sparingly for the main action in a local context.
- **Ghost:** transparent at rest, neutral hover fill, used for toolbar and repeated actions.
- **Focus:** visible 2px focus ring with 1-2px offset.
- **Touch baseline:** desktop buttons can be compact, but touch-responsive surfaces should preserve at least `44pt` iOS / `48dp` Android target guidance.

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

- **Don't** treat the current graphite/washed-teal palette as the final brand — the approved successor (Architectural Slate) is a development candidate, not yet adopted.
- **Don't** use glow, glassmorphism, purple-blue gradients, beige/cream defaults, or decorative effects as the product identity.
- **Don't** use nested cards as page structure.
- **Don't** create hover-only controls that fail on touch.
- **Don't** use viewport-fluid heading scales for dense product UI.
- **Don't** merge `--ovl-*` overlay tokens with control-panel `--ui-*` tokens.
- **Don't** reinvent iOS or Android native conventions if a future native surface is created.

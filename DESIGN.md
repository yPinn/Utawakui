---
name: Utawakui
description: Baseline design-system scaffold for a local-first OBS singing-session control panel.
colors:
  canvas: '#111418'
  surface: '#191D23'
  surface-raised: '#222832'
  surface-hover: '#2B3340'
  text: '#F4F7FA'
  text-muted: '#A8B0BA'
  border: '#343C49'
  accent: '#5B8CFF'
  accent-hover: '#74A0FF'
  accent-contrast: '#08111F'
  success: '#35C77A'
  warning: '#F0B84D'
  danger: '#FF6670'
  info: '#60B7FF'
typography:
  display:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft JhengHei UI', sans-serif"
    fontSize: '2rem'
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: '0'
  headline:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft JhengHei UI', sans-serif"
    fontSize: '1.5rem'
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: '0'
  title:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft JhengHei UI', sans-serif"
    fontSize: '1.125rem'
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: '0'
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft JhengHei UI', sans-serif"
    fontSize: '1rem'
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: '0'
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft JhengHei UI', sans-serif"
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
    padding: '0.5rem 0.875rem'
  button-ghost:
    backgroundColor: 'transparent'
    textColor: '{colors.text-muted}'
    rounded: '{rounded.md}'
    padding: '0.5rem 0.75rem'
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

This scaffold starts with a restrained, neutral product baseline: stable rem-based scales, semantic states, predictable components, visible focus, and responsive constraints. It intentionally avoids a finished brand atmosphere until the next style-direction pass.

**Key Characteristics:**

- Dense enough for repeated operation.
- Quiet enough for live performance.
- Structured enough for playlists, lyrics, queues, and processing states.
- Flexible enough to support dark, light, desktop, responsive, and overlay-specific tokens.

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

**The Placeholder Color Rule.** These colors are structural placeholders. Do not treat the current blue accent or dark neutral surface as final brand identity.

**The One Accent Rule.** A screen should have one primary accent role. Do not introduce competing highlight colors for decoration.

**The Overlay Separation Rule.** Control-panel `--ui-*` colors and future overlay `--ovl-*` colors must be designed separately.

## Typography

- **Control Panel Font:** native system UI stack. Do not bundle brand fonts into the control panel by default.
- **Overlay CJK Display Font:** `GenWanMin2 TW`, with CJK serif fallbacks.
- **Overlay Latin Display Font:** `Playfair Display`, with practical serif fallbacks.
- **Label/Mono Font:** pending; only introduce mono if timestamps, technical metadata, or counters clearly benefit.

**Character:** Product typography should be functional, internationalized, and calm. It must handle Japanese, Korean, Traditional Chinese, English, long song titles, artist metadata, and dense table labels without feeling cramped.

### Surface Strategy

Control panel typography and OBS overlay typography serve different jobs.

| Surface       | Typography direction       | Reason                                                             |
| ------------- | -------------------------- | ------------------------------------------------------------------ |
| Control Panel | Native/system sans stack.  | Stable, fast, dense, accessible, and familiar during live control. |
| OBS Overlay   | Ornate display serif pair. | Public-facing, animated, more atmospheric, and brand expressive.   |

The overlay default pairing is:

```css
--ovl-font-display-cjk:
  'GenWanMin2 TW', 'GenWanMin2 TC', 'GenWanMin2 PJP', 'Noto Serif TC',
  'Noto Serif JP', 'Noto Serif KR', serif;
--ovl-font-display-latin: 'Playfair Display', 'Source Serif 4', Georgia, serif;
--ovl-font-ui:
  system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
```

Do not add these `--ovl-*` tokens to `src/styles/tokens.css`. They belong in the future overlay CSS entrypoint, because OBS overlay and control panel are separate delivery paths.

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
- **Do** separate control-panel tokens from future OBS overlay tokens.
- **Do** design safe-area and keyboard-inset behavior for responsive or mobile-like surfaces.
- **Do** verify contrast and text fit with Japanese, Korean, Traditional Chinese, and English metadata.

### Don't

- **Don't** treat the current dark-blue placeholder palette as the final brand.
- **Don't** use glow, glassmorphism, purple-blue gradients, beige/cream defaults, or decorative effects as the product identity.
- **Don't** use nested cards as page structure.
- **Don't** create hover-only controls that fail on touch.
- **Don't** use viewport-fluid heading scales for dense product UI.
- **Don't** merge future `--ovl-*` overlay tokens with control-panel `--ui-*` tokens.
- **Don't** reinvent iOS or Android native conventions if a future native surface is created.

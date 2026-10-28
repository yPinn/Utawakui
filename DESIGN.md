---
name: Utawakui
description: Current design guide for the local-first Windows singing-session control panel; renderer values are owned by src/styles/tokens.css.
rounded:
  xs: '0.125rem'
  sm: '0.25rem'
  md: '0.375rem'
  lg: '0.5rem'
  pill: '999rem'
---

> **Visual system status — 2026-10-03:** Token v2 is the sole control-panel
> token system. `src/styles/tokens.css` is the only renderer token entry; every
> registered Main／Performer surface uses the same v2 boundary contract. Token
> v1, migration aliases, generated invalidation／manifest files and dual token
> imports have been removed. The completed replacement record lives in
> [Token v2 Replacement](docs/archive/token-v2-replacement.md).

F8 remains a development-only component catalogue and regression surface. It uses
the production `AppFolderPage` workspace composition, `UiTabs` category navigation
and one `UiScrollLayout` content owner; its page track stays full width while groups
change. It does not keep a parallel page shell, migration status or frozen v1
comparison layer. Adopted components use the formal `Ui*` implementation; an
unresolved contract may keep one clearly labelled proposal specimen without
presenting it as production truth. The component review history and unresolved
product-level choices remain in
[Token v2 Component Review](docs/contracts/token-v2-component-review.md).

The adopted visual direction is recorded in the
[Visual Direction History](docs/archive/visual-system-evolution.md#色彩與材質選擇):
Direction B／Studio Library, Architectural Slate, semantic status signals and the
Controlled Dossier folder interior. Folder exterior material remains owned by
`AppFolderLayout`; feature surfaces own their content and approved artwork.

## Overview

Utawakui is a product UI for live operation. The design system should support a calm desktop control panel first, then extend to responsive and OBS overlay surfaces without assuming that all surfaces share the same tokens.

The production baseline uses stable rem-based scales, semantic states, predictable components, visible focus, responsive constraints and the adopted Architectural Slate identity. Local-media sleeve, cat-card, paper and feature artwork remain feature-owned; status color never doubles as content material.

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
(`src/styles/tokens.css`): Architectural Slate uses neutral／warm-neutral canvas
roles, Indigo for accent and selection, dedicated folder-material roles, and
Clear Pastel signal primitives mapped through accessible semantic foregrounds.

Folder color is a component material, not the global brand accent. Status roles
remain independent from folder and artwork color.

```text
Dark Canvas   #191a1e
Dark Accent   #8296d0
Light Canvas  #e8e4dd
Light Accent  #3d578e
Paper         #fbfaf7
```

Use a 60/30/10 ratio:

- **60% base:** app chrome, sleeve, major backgrounds.
- **30% secondary:** local-library surfaces, inner object areas, main voice line.
- **10% accent:** singing energy, current playback, selected cue, focused or gated hints.

Theme token targets should keep light and dark themes visually related, rather than treating light mode as a separate brand.

Light is the first-run default for the control panel and Performer window. A
persisted explicit theme remains authoritative, so choosing Dark survives later
launches; Light is only the fallback when no valid saved／bridge value exists.

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

| State                 | Token / color role                          | Usage rule                                                          |
| --------------------- | ------------------------------------------- | ------------------------------------------------------------------- |
| Default               | `surface`, `text`, `border`                 | Neutral app chrome and ordinary controls.                           |
| Hover                 | `surface-hover`                             | Row, button, menu, and sidebar hover.                               |
| Pressed / active      | `surface-active`                            | Momentary button or row press; should be subtler than selected.     |
| Selected              | `surface-selected`, `accent`, `accent-soft` | General selected controls; Sidebar uses its neutral component role. |
| Currently playing     | `current`, `current-soft`                   | Playback identity, now-playing line, live transport cue.            |
| Focus-visible         | `focus`                                     | Keyboard focus ring; do not reuse selected fill alone.              |
| Loading / processing  | `info`, `accent`                            | Import, scan, separation progress, and neutral activity.            |
| Completed / available | `success`                                   | Separation complete, local asset ready, synced lyric available.     |
| Needs attention       | `warning`                                   | Recoverable metadata, missing optional data, user confirmation.     |
| Error / destructive   | `danger`                                    | Failed operation, destructive action, nonrecoverable problem.       |
| Disabled              | `text-muted` plus `--ui-opacity-disabled`   | Disabled controls; never communicate state by opacity alone.        |
| Feature gated         | `gated`, `gated-bg`, optional coral edge    | Advanced/provider/overlay flows before user opt-in.                 |
| Drag target           | `accent` border or inset line               | Reorder targets; avoid full teal fills during drag.                 |

Selected and currently-playing states are intentionally separate. A row can be selected without being the active audio source, and the active audio source can continue to show a coral cue even when focus moves elsewhere.

Feature-gated flows should not use danger red. A gate means "available behind an explicit decision," not "broken." Use warm muted gated colors, short copy, and secondary actions.

Persistent background-work entries use accent for active work, warning for paused work, and danger only when a failed or cancelled item still needs attention. A status dot is supplemental: the control must expose the same state through its accessible label and tooltip. Do not turn ordinary processing or downloading into a red alert, and do not add a second badge to the Windows notification-area icon when taskbar progress already communicates the active job.

Capacity next to an action describes that action only. For accompaniment preparation, show an upper-bound added-size estimate only when every planned track has reliable duration; otherwise show the track count alone. Whole-library usage and cleanup limits belong in Settings, not in a playlist- or album-scoped work panel.

### Palette Rules

- Coral is not a large action-button color and must not be used as a recording dot.
- Coral works best as a voice line, current-playback line, focus ring, or small gate edge.
- Teal is the brand color, but should not fill every major UI surface.
- Gold is reserved for possible future high-quality or special states; it is not part of the main palette.
- Replace the current Spotify-green sort indicator with `accent` or `current` when implementation tokens are refreshed.

## Product UI Direction

The control panel should combine Spotify-like music workflow efficiency with macOS-like local tool clarity.

### Layout

- Preserve the app shell model: playlist sidebar + top section tabs + main workspace + persistent player. The left Sidebar has fixed 64px collapsed and 256px expanded states using the existing boundary separator for drag, double-click and keyboard disclosure; it never keeps intermediate widths. Pointer dragging switches immediately on crossing the 24px threshold, including repeated reversals during one held gesture; each reversal measures 24px from the furthest point in that direction to resist jitter; retain the existing boundary highlight and resize cursor across the snap until release or cancellation, without adding a pointer-following guide. Automatic collapse preserves the manual preference. Manual expansion always occupies 256px and pushes the workspace; a further window shrink may collapse it again, without an overlay or backdrop.
- Keep one `0.5rem` outer inset on all four sides of the persistent playlist sidebar, primary workspace and Right Dock in both the current production UI and Token v2; panel content inset and inter-panel gap remain separate layout roles.
- Treat production Queue and Token v2 playback metadata as surfaces in one `.shell__main` right Dock rather than page columns or PlayerBar popovers. Keep both side panels in flow at every window width. An expanded Dock defaults to `17.5rem` and permits `17rem`–`24rem`; a folded Dock keeps the same effective bay at every supported width to preserve the Folder composition and stable workspace geometry, including during every disclosure frame. Only its `2.5rem` restore control paints; the rest remains transparent Shell space without pointer interception. Shell first collapses navigation from `16rem` to `4rem`, then limits the shared Dock bay toward `17rem` in both disclosure states. Folded whitespace cannot shrink below expanded content needs; the `40rem` Folder target gives way before disclosure can move the workspace or change table columns. Navigation thresholds use the complete preferred bay in both disclosure states. Narrow expanded content reflows instead of switching to an overlay; growth restores the bay before navigation. Recovery uses `4rem` headroom and manual preferences survive restriction. Content width and structural bay width are distinct roles; the folded bay never makes notifications or player tools `2.5rem` wide. See [Shell layout](docs/contracts/shell-layout.md). Keep the shared `0.5rem` outer inset and mount the pointer／keyboard Dock resize separator only while expanded. Queue may replace metadata in the foreground while retaining metadata as its fallback; a Queue-owned navigation may remove Queue and reveal that fallback, while activating the player artwork during Queue navigates directly to metadata. The shared header disclosure and Escape fold the Dock without removing its current surface, and a Dock with no visible surface also folds automatically.
- Playback Info is a persistent player／queue projection, independent of the active workspace page. PlayerBar artwork exposes its toggle only while the audio-backed player or prepared Queue has a current track; losing both forgets the metadata surface. Its production order is current-track Hero, lyric preview, local artist context, actual next-track preview, then track facts／readiness; the Dock header already owns the playlist／album source identity, so no duplicate「播放來源」block follows the facts. The Hero title opens its verified local album and each pairable artist credit opens its Artist page; an unresolved destination remains plain text. The next-track preview shows at most the first item from the canonical queued-then-source order, never exposes a total count and disappears when that item does not exist;「開啟佇列」is the destination for the remaining order. Its row reuses the Queue artwork playback cue, artist destination and contextual song menu, while selection, drag, reorder and clear remain exclusive to the full Queue. The passive compound row still paints the same hover／focus-within／pressed／menu-open group surface around its nested actions without creating a whole-row button or selected state. Navigation CTAs change the destination or foreground Dock surface without folding the expanded Dock; only the shared header collapse intent, Escape handling owned by the shell, or the absence of every visible Dock surface may collapse it. Missing optional data removes the section instead of leaving a permanent placeholder. The lyric preview is the deliberate pending-state exception: while a current track's lyric document is loading, its contained block stays mounted with a fixed 4.5rem content viewport sized for three `lg`／`title` text line boxes. Lyric sentences wrap naturally without ellipsis; the whole viewport clips and fades only at its lower edge. Once the document is ready, timed lyrics preload their first readable lines before the first cue starts; after any cue starts, its latest line remains visible through a timing gap and switches directly when the next cue starts. A prepared Queue track or untimed document also previews from its first line. Confirmed missing or empty lyrics remove the complete section instead of leaving a blank block or CTA. Stable geometry belongs only to predictable anatomy: the Hero reserves a 1:1 ratio, artist artwork stays 64px, controls and track rows retain their shared minimum heights, and an active asynchronous request may use an isomorphic skeleton. Sections do not share arbitrary min／max block sizes; Dock panel remains the only height cap and scroll owner. The Hero is its own media block; every other visible Playback Info section opts into the shared contained appearance and uses the Dock stack gap instead of a second divider. Its block rhythm is an 0.5rem rail content inset, 1rem sibling stack gap, 0.75rem contained padding, 0.5rem section header／body／content gap and 0.25rem Track Row list gap; the panel and shared section own those boundaries, while feature children use only scale tokens for tighter internal groups and do not add outer margins. `AppRightDockSection` remains plain by default for other Right Dock consumers. Track facts stay in the upper part of the contained section; a single internal `UiSeparator` may divide them from a passive two-column capability matrix without becoming a divider between sibling sections. Capability cells expose a natural-language name and current status directly, keep icon and tone supplemental, and use tooltip copy only for explanation; the first version reports lyrics granularity and separation-artifact readiness, never an inferred live vocal-removal state. Playback Info is operational chrome, so its lyric preview, artist summary, Queue metadata, facts and passive capabilities prevent text selection; real Text Actions keep their focus and underline affordances, while editable Lyrics workspace content and form fields keep their own selection behavior. Section destinations use explicit 36px controls with verb＋destination labels such as「開啟歌詞」、「前往藝人」and「開啟佇列」rather than generic「顯示更多」copy. A contributor section is omitted until the library owns role-bearing credits and a truthful destination; performer names never impersonate composer／lyricist／producer data.
- **Performance session:** 演出安排 owns source／total facts, the shared Current, continuous playback, session BGM, pending occurrences and full result history. Default 1280×850 Compact with the 280px Dock is the primary composition: wide lists use 3:2 for history readability; narrow actual containers use UiTabs. Search results coexist with the ordered queue. Reuse AppFolderWorkspaceToolbar, PerformanceSessionCurrent, PerformanceSessionSummary, UiTrackRow, UiPopover and UiScrollLayout; occurrence identity stays itemId. Full BGM controls compose the existing source／transport／picker with one operational projection. Summary details use an inline popover; BGM progress and volume stay visible in the transport, while source search and manual addition retain their owning controls. Current and BGM share artwork／text origins and the trailing action edge, without extra visible section headings. Talk and Emergency Cut stay reachable. App lifetime owns initialization; navigation never recreates audio. Cross-page arrangement Dock exposes only necessary BGM status／return, Talk and cut during activity or errors, never duplicate main-page controls. The visible session page also owns Current and continuous playback; the Dock keeps its summary and lists until navigation restores its cross-page controls. No titlebar BGM trigger, floating MiniPlayer or Pin. Source replacement／clear live in the trailing shared menu and keep confirmation semantics. EOF pause is not operator pause; ended retains the post-roll boundary.
- BGM Pause reflects only a current BGM play request. A performance start resets the primary control to disabled Play immediately; Play／Pause share one always-mounted primary action node, the currently audible lane remains BGM until fade-and-pause is confirmed, and any deferred post-performance restore is shown in its reserved concise-status slot. Track identity stays single-line truncated; session, phase, restore, time, and transport slots retain stable dimensions across idle／active／restore／error states. Errors replace the phase badge and keep full detail in its tooltip／accessible name rather than inserting a notice that changes player geometry. Talk／Dim starts active at 25% of the current effective BGM target while remaining a manual control without microphone detection. BGM controls and source replacement cannot cancel a performance handoff that already owns lane priority.
- An explicit performance pause uses the existing phase slot for a concise muted `track-paused` badge and re-enables the same BGM Play node without auto-starting it. Buffering, seeking, and stalled keep the performance lock. Resuming without audible BGM adds no delay; resuming after manual BGM playback still completes exact-zero pause and pre-roll. The integrated BGM row follows the session workspace container; Right Dock geometry remains shell-owned.
- Use the sidebar only for collections and music-management context; primary section navigation uses「曲庫」／「演唱工具」／「畫面輸出」／「設定」in the top folders above the workspace. Same-level labels keep their shortest complete user-language name; `UiTabs` spacing, target geometry and active indicator establish rhythm, so labels do not gain filler words merely to match character counts.「曲目準備」remains a direct global utility in the window Titlebar; Settings keeps a direct Titlebar shortcut to its Folder destination.
- Align Sidebar collection rows and standard track rows to the same 3.25rem／2.5rem rhythm. Sidebar keeps this 52px／40px geometry in both Standard and Compact window density because its collection content is fixed; only the Sidebar's own width changes between expanded and icon-rail states. Its search／create Toolbar and the two global library destinations stay fixed above the collection `UiScrollLayout`; only playlist, album and artist collections move. Sidebar keeps collection semantics: one click selects, a double-click or the artwork control starts playback.
- Sidebar selection uses one neutral whole-row surface through `--ui-sidebar-row-selected-bg`, mapped to the existing neutral `--ui-color-surface-active` in both document and chrome scopes. Fixed library destinations and collection rows keep that same surface when expanded or collapsed; hover does not replace a selected row with a weaker surface. Selection adds no icon／artwork ring or accent tint. The filled functional-entry icon plates, artist／album artwork shapes and playback-source cues retain their existing meanings. Keyboard focus remains a separate whole-row `--ui-color-focus` outline.
- Keep track rows dense, aligned, and easy to scan. Interactive Track Rows share one quiet selected recipe: `color-mix(in srgb, var(--ui-color-text) 8%, transparent)` with no persistent accent edge. Keyboard focus remains a separate visible focus ring, and currently playing remains a title-only current-color cue.
- Right Dock track identities reuse `UiTrackRow` through a Dock-scoped fixed-density recipe: Queue, Recently Played, Playback Info next-track preview and Import source／download objects remain 3.25rem／2.5rem (52px／40px) in both Standard and Compact. Its start-side rhythm mirrors the expanded Sidebar without coupling the two features: an 0.5rem panel perimeter, 0.25rem row content inset, and 0.25rem state-surface outset place state paint／section content／artwork at 4／8／12px from the panel start edge. Both panels map their row radius to the same small-radius role and paint hover, pressed, and selected feedback on the same state surface; feature semantics remain separate. `UiTrackRow` therefore keeps whole-row `interactive` semantics separate from its optional compound `stateSurface`: Queue／Recently Played use both, while Playback Info and Import use only the state surface around independently focusable actions. Import owns its pending／downloading／done／error presentation and download or retry action; it directly composes `UiTrackRow` and must not reuse `QueueTrackButton`, playback, row selection, drag or reorder behavior. Import preserves the complete title and artist data while its compact Dock row presents each on one ellipsized line with the shared overflow tooltip; a row trail shows either its current action or its terminal status, and an inline notice does not repeat success already visible on the object row. Expanded Dock width and window density are separate state axes; Compact may still remap generic Track Rows outside the Dock to 44px／36px. Queue and Recently Played single-click select with a neutral text-color 8% surface and no accent edge, double-click or artwork activation plays, duration is hidden, and track titles remain plain text. Artist credits use the shared `TrackArtistCredits` destination only when the canonical artist index can pair each visible credit; unpairable artist text stays plain. They share one Right Dock interaction recipe: the neutral row hover／focus surface reveals an artwork Play cue, the matching current audio track switches that cue to Pause, and the action keeps a fixed trail lane to avoid layout shift while staying visually hidden until row hover, selection, focus-within, or menu open. Reorderable Queue rows use the whole row as the native pointer drag source without a dedicated drag icon; artwork, artist Text Actions, and the independent `…` track-action button never start reorder. Sidebar playlist rows follow the same drag-origin rule for their artwork playback action. Before／after drop guidance composes the actual `UiSeparator` between adjacent rows in both ordered lists: the primitive keeps its shared thickness while the caller chooses its accent tone, instead of painting a row border or state-surface shadow. Queue remains the sole Queue reorder owner and shared `UiTrackRow` stays ordering-agnostic. Both Queue and Recently Played are interaction surfaces and keep row chrome plus metadata `select-none`; source and artist names that are real destinations remain distinct Text Actions with the shared default-no-underline／hover-and-focus-visible-underline state. Their row roots must not use paint containment such as `content-visibility: auto`, because the shared state surface extends beyond the row box and must retain the same visible boundary regardless of reorder capability. The row boundary is constrained to the Right Dock inline size, and the 3rem artwork recipe belongs only to the bottom-left PlayerBar.
- Sidebar and Right Dock vertical lists use the same overlay-scrollbar boundary formula. Fixed chrome keeps the ordinary 0.5rem inset; a scroll body keeps that inset on block and inline-start edges. The 0.75rem rail remains an overlaid pointer target, while `UiScrollLayout` reserves only the 0.5625rem distance from the panel edge to the visible thumb's inner edge (`0.75rem lane - 0.1875rem thumb inset`). With the caller's 0.25rem state-surface outset, the row box ends 0.8125rem from the panel edge and its state surface expands to 0.5625rem, exactly touching the thumb without painting underneath it. The row's own inline padding keeps text and trailing actions farther inside. Reserving this visual boundary even without overflow prevents state or action alignment from shifting when overflow appears. This boundary does not replace descendant shrinkability: each feature root and list propagates `min-inline-size: 0`, while each caller-owned row class uses a border-box `inline-size`／`max-inline-size` of 100% so intrinsic title or trail content cannot widen a row beyond the panel content boundary.
- Sidebar and Right Dock panel frames paint their 1px stroke inward without consuming the content box. Geometry-sensitive `UiSurface` consumers use its inset-stroke mode, whose overlay is independent of `box-shadow`, so the Right Dock's narrow-window elevation shadow cannot erase the frame. Both expanded resize axes use a 0.75rem hit target, 2px indicator, separator value semantics and keyboard resizing; the Sidebar target keeps only the scrollbar rail's transparent 3px edge inside the panel and extends the remaining 9px into the shell-owned 12px inter-panel gap, so it never covers the visible thumb. Right Dock unmounts that separator completely when collapsed. The Shell still reserves the complete desktop Dock bay, but its wrapper is layout-only and does not accept pointer input. A collapsed Right Dock has only a button-sized local containing block rather than a full-height rail: its restore disclosure uses the shared 2.5rem `UiIconButton` command variant, aligned to the shell's lower-right rail. Sidebar create and Dock restore share the outlined Chrome Command recipe because both execute an immediate command without a selected state. The two fixed library destinations keep the filled Navigation Entry plate and only they may add the selected indicator. All three roles share 2.5rem geometry, small radius, glyph scale and focus grammar without collapsing their interaction semantics. The collapsed root uses a bounded clip margin for the control and focus ring without turning hidden translated content into document scroll overflow; expanded panel geometry, resizing and surface priority stay unchanged.
- Keep Queue and Recently Played as two true tabpanels inside the same Right Dock surface. Reuse `UiTabs` with the flat Bar presentation: the rail fills the parent available width without drawing a shared baseline, while each native tab button remains content-sized with zero inter-tab gap, shared inline inset, and a minimum hit boundary equal to the control height. Selected text uses the accent role with a 2px inset indicator; this is not an equal distribution or a surrounding Panel frame. The composing header or tabpanel owns any divider below the tabs. The caller owns panel ids, visibility, and scrolling rather than turning the labels into ad-hoc buttons.
- `UiActionMenu` owns one logical placement contract. A pointer opener passes an `anchor` with `kind: 'point'`; a button opener passes `kind: 'element'` and the trigger element. Element anchors prefer `bottom-start`; point anchors prefer the pointer's logical inline-end. Both clamp to the 8px viewport inset and flip when necessary. A submenu opens toward logical `inline-end`, flips to `inline-start`, and, only when neither side fits, chooses the wider side and reduces its inline size. The visible chevron follows the resolved physical side. Callers must not pre-add the surface gap, precompute physical left／right alignment, or branch on LTR／RTL.
- Keep the Queue tab／collapse chrome sticky within the content scroller. At scroll origin it remains flat; after content passes beneath it, use the shared Right Dock translucent background, blur, and theme-aware shadow tokens. Do not copy Spotify brand green, gradients, or bespoke row anatomy.
- Recently Played reuses `QueueTrackButton` as the shared interactive Right Dock row adapter. It preserves the Dock 52／40px geometry, current cue, single-click selection, double-click／Enter activation, explicit artwork replay, and the same hover／focus artwork cue plus conditionally visible per-track overflow action as Queue. Its row-level capability delta is only ordering: it passes `draggable=false` and owns no drag, drop-target, separator, or reorder contract. Chronological membership remains main-owned, and list-level clearing stays under Settings「曲庫與儲存」with confirmation rather than becoming a row action. It does not add timestamps, durations, or a history-specific primitive unless a later workflow proves those fields necessary.
- Playlist and album headers can show cover and metadata, but should remain operational rather than heroic.
- Do not use oversized marketing heroes or nested page cards.

Queue and arrangement headers use the same full `UiTabs` Bar geometry: 0.75rem tab inline padding, control-height hit targets, and 0.75rem spacing between the identity and action group and between its icon buttons. `AppRightDockHeader` owns the action group, including the existing view switch and collapse control; `AppRightDockPanel` forwards the caller's actions slot. The header stays on one line: the Dock minimum is 17rem (272px), with a 17.5rem (280px) default and 24rem (384px) maximum, further bounded by the shared Shell workspace budget. Do not wrap the actions, reduce tab padding or shrink icon buttons in the receipt variant. Receipt changes local color semantics and paper treatment, while common controls retain their native hover, focus and selected-state recipes.

The active arrangement history is one uninterrupted list of the controller's ascending completed occurrences. Crossing midnight or leaving the arrangement open for days does not create a new section or imply a closed session. Reuse Recent Playback list and Track Row geometry, selection and the record menu. Completed Dock records omit ordinals; pending rows likewise omit visible ordinals while preserving their actual queue order. Completed-only totals remain in the fixed history footer. Paper edges and shared dividers provide the receipt treatment without inserting date headings between individual performances. The current session menu offers explicit finish/archive and the two exports in the [arrangement contract](docs/contracts/performance-session-preparation.md#紀錄頁封存與雙匯出). Archived sessions appear as named collections below the active list, with only the type「演出歌單」as their subtitle and the same menu. The main dossier also uses「演出歌單」as its type; the section heading stays「已封存場次」. Count, duration and end time stay in the main collection dossier; details use the shared TrackTable with a read-only performance-archive profile, occurrence keys and ordinal / identity / duration / performance-status columns. Narrow layouts retain identity and status while collapsing duration and then ordinal through the existing layout resolver. Existing Modal, Text Field, Select, Action Menu and semantic spacing own confirmations and previews. Keep these actions in history content, retaining the single Dock header row throughout the 272–384px range.

Current and archived history sections reuse the plain `AppRightDockSection` heading/body rhythm and label typography; collection names use the compact Track name role, and supporting metadata/empty copy use `UiHint` caption typography. A confirmed empty history is a short, left-aligned explanation with natural height, without a reserved card or fake row. `RecentPlaybackList` uses `UiSkeleton` only while a read is pending and no entries or error are available; existing entries remain visible during refresh. Read failures show the warning without also claiming an empty history. Archive detail loading follows the same skeleton contract; a marker-only archive explains that its markers remain available in the timeline.

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

### Folder Page Layout

- **Navigation semantics:** the upper Folder choices are application destinations, so use one `nav` landmark with native buttons and `aria-current="page"`. Do not apply `tablist`／`tab`／`tabpanel` unless one local surface actually controls a set of related panels without changing the application view.
- **Structural grammar:** read the surface from outside inward as persistent App Shell, destination Folder exterior, then one primary paper document. App Shell is the environment and is not counted as part of the Folder material. Entity dossier、action rail、table and canonical metadata are regions on the same sheet, not inserted cards or separate paper weights. Explicitly classified supplemental assets or content tools may follow the paper in a Folder-material extension; ordinary headings、rows and notices cannot use that escape hatch. Folder color identifies the application destination; it may tint document rules or hairlines at low strength, but it never becomes the paper base or a data／status color.
- **Composition:** `AppFolderLayout` is the public outer owner for Folder navigation, cover rail, exterior material, paper alias and perimeter. `AppFolderPage` owns the paper composition, optional header, optional Folder extension sibling, optional Folder-wide floating plane, optional `folder-tools` background action and one explicit body mode. In document mode the header is the first region of the moving sheet and any extension follows the complete paper in source order; the floating plane is a transparent sibling that spans those two material rows without changing that order. Folder tools belong to the existing extension material at the row's upper end; they do not add a full-area child surface、dock paint、top seam or third row. The floating plane paints above this background action, while the outer Scrollbar remains above both. Workspace mode may keep its header fixed above explicitly bounded panes; it mounts the same loose-leaf sheet (see Loose-leaf edge) but no extension、document floating plane or Folder tools. A registered feature boundary wraps the complete page composition to provide tokens and the local overlay host; it is infrastructure, not a full-height paint layer inside document flow. The former three-component layout split has been removed and is not a compatibility API.
- **Material ownership:** Folder exterior color is intrinsic to `AppFolderLayout` and maps through data-driven semantic materials on each destination record. Library／Performance／Display use primary／secondary／tertiary; Settings uses neutral, mapped to charcoal／near-black in dark mode and cool gray in light mode. The same owner maps `--ui-folder-page-background` to the neutral `--ui-folder-sheet-background`; destination changes must not remap it. In document mode, the outer page frame stays transparent while one inner sheet owns the paper paint、header、body、binding edge and visible bottom. Workspace mode uses the same sheet owner, filling the Folder at a fixed height. Dossier、ledger and `AppFolderContentField` use transparent local backgrounds so that sheet remains the only large paper paint owner. `--ui-folder-ledger-*` rules are printed marks on that paper, not another surface. The content field has no card border or radius and ends with its owned content. Its `state` variant uses `--ui-folder-content-state-min-block-size` to keep loading／error／empty feedback readable without filling the document. A page cannot pass a raw color／background, bind Folder color to feature identity, or reach through scoped CSS to repaint these owners. Secondary paper families remain reserved until a real consumer proves a named material difference.
- **Paper material:** because the continuous sheet occupies most of the workspace, it is a first-class material rather than a generic white background. Light mode starts from a warm low-chroma paper stock, then earns any fibre／grain treatment only through an approved low-amplitude raster asset applied once by the page paint owner. Texture must remain stationary across dossier、actions and table, survive dense rows without reducing text／focus contrast, and never vary by destination. Do not imitate grain with CSS gradients or add another tinted plane to create depth.
- **Paper geometry:** a document sheet has a viewport-aware minimum block size and a bounded maximum inline size. It does not receive a hard maximum block size: canonical rows extend the paper rather than clipping or creating nested scrolling. When a named Folder extension exists, it is a sibling after the sheet, grows from its own content and reveals the surrounding Folder material. A Folder-wide floating plane also requests the shared extension minimum so movable assets retain a usable lower ground even when no ordinary extension content exists. Folder tools reuse that ground without adding another row or inflating the empty extension; their semantic inset positions only the control itself. Without extension、floating or tools content no empty region is added. The Folder frame still owns a stable end gap after the final Folder content.
- **Loose-leaf edge:** document sheets reserve one start-side binding gutter with a thin full-height margin rule and three inert punched holes, matching the full-size American dossier language chosen for this reference. A first-sheet binding field follows the shorter paper when necessary but caps at `--ui-folder-sheet-binding-field-max-block-size`; the fixed three-hole rail is vertically centered inside that field. Long tables therefore extend below the first-sheet field instead of stretching the hole spacing or leaving the pattern pinned to the minimum sheet's top offset. The holes use the current Folder material to read as openings through the paper, remain `aria-hidden`, never receive pointer events and never overlap copy、focus rings、row drag handles or action targets. Narrow containers reduce the gutter and hole diameter together. Workspace pages currently reuse the same edge and inset on a sheet without a maximum inline size, so the content edge does not jump between destinations. This is provisional (2026-10-16): the owner may still give Folder page interiors a separate design. Do not add red rules or decorative ruling without a new product reason. Stationery belongs to Folder objects, not to the sheet: see the stationery rule under Folder artifact boundary.
- **Ledger behavior:** a populated `TrackTable` is one continuous note-paper document, not a stack of row cards. Its heading and rows share the same ledger background; functional horizontal rules follow real row boundaries, and the heading rule may be stronger. Column descriptors own header alignment and value alignment separately; statistical values such as local play count align to the inline end, use tabular numerals and pass through the shared locale-grouped integer formatter (`1,234`, not a hard-coded separator). The duration cell keeps accompaniment status／action before the time value with a `--ui-space-4` internal gap, so the duration sort mark does not visually cut into the row control. The fixed actions lane is exactly one `--ui-space-5` track for the final chooser／overflow control and does not add a separate spacer. Hover、selected、current、focus and drag feedback remain interaction layers above the paper and must not redefine its base color. Do not add repeating decorative stripes or turn the binding gutter into a data column.
- **Scroll behavior:** the Folder exterior、tabs and full-height work frame stay fixed. In document mode, that transparent frame owns the only page-level vertical Scroll Region and places its rail at the Folder edge; `--ui-folder-sheet-scrollbar-gap` adds visible separation between the paper edge and shared Scrollbar reserve without duplicating thumb geometry. The paper header、dossier、action rail、ledger、bottom edge and Folder-wide floating plane move together; an optional extension and its Folder tools follow in the same scroll content and keyboard order. Folder tools use the existing Folder／document insets, so they retain a visible safe distance from the outer Scrollbar lane. Short content receives one viewport-derived minimum sheet length plus a visible Folder-colored end gap; long canonical content extends the paper instead of paginating or adding nested scrolling. Loading、error and empty feedback remain on the same bounded paper rather than replacing it with a new card.
- **Folder artifact boundary:** coordinate、material and paint ownership are separate. `AppFolderPage` lays out the complete legal work area as paper followed by the optional Folder extension, then provides one transparent floating plane spanning both rows. `UiFolderArtifactCanvas material="folder"` fills that combined plane and measures three physical regions: paper、the side reserve beside its bounded inline edge and the bottom Folder reserve after it. Every object, pinned or not, stores one placement: a semantic paper／side／bottom region chosen from its visible centre plus a region-local normalized anchor, so an object left below the paper stays there when the ledger grows. Drag or keyboard movement is free across the combined plane; release snaps to the stored placement so later resizes never move it. Pin only locks movement and converts the visible pose into the placement. Side objects render in that reserve only while the entire side collection fits its rotation-aware width and shared inset; otherwise the collection is projected into the bottom reserve without changing or saving its side placement. Restoring width returns it to the side. Resize never scrolls the document、moves focus or emits persistence writes. Pinning or unpinning during fallback stores the currently visible bottom pose, avoiding a jump to the hidden side pose. Home restores the declared placement, and an oversized object still keeps the shared minimum grab area visible. Durable and derived objects hydrate one page-scoped placement、rotation、Pin and shared finite order. A newly created user object receives one main-owned persisted pose in the bottom Folder region: a 4×3 slot grid by current user-object count gains at most ±0.04 normalized jitter on each axis and rotation leans 0.75°–4° either way from the same single random draw. This randomness runs once at creation, never during render. An object added during the current page session is then placed by the canvas instead: it cascades down-right from the topmost bottom-region object by the shared minimum grab size (or starts at the bottom region's inset origin), wraps within that region, and persists that placement, so every earlier object keeps a grabbable edge; main's slot pose remains the fallback. Notes are thin paper: every note uses the translucent material so overlapping sheets faintly show what lies beneath without becoming see-through, and each note offsets its grain by one of four variants chosen from a stable hash of its key, so no two neighbouring notes need to share one texture and none changes between renders. Notes carry no printed fold or crease lines; variety comes from the paper material itself. A user note is also printed on one paper stock picked at random by main at creation and persisted: periwinkle, rose and canary (fine grain, after the reference's saturated sticky notes but lifted away from the Lyrics／Output tab hues and the indigo accent), kraft (coarse grain) or ruled (printed rules on fine grain); tissue stays the Folder-tinted sheet of derived notes. Stocks are a bounded token set with light and dark values; the note editor's paper swatch picks one (a new note starts on a random stock), and main keeps only known stocks; grain is a project-owned grey noise SVG blended with`soft-light`at low strength, loaded as a separate asset because the renderer CSP does not allow`data:`images. A user note without a known stock gets a stable stock from its key, persisted once, and derived notes stay on tissue. A derived object without a saved record starts behind saved objects at a fixed bottom-region default and gains a record only on its first layout change. Photos are printed on one of three stocks picked at random by main at creation and persisted like note papers: print (light mat, the default`--ui-photo-frame-_` tokens), archival (a dark thin frame and grayscale filter that only restates those tokens) or instant (print with a wider `--ui-photo-frame-instant-padding-block-end` lower margin, reserved for a short handwritten line); a photo saved before stocks existed derives a stable stock from its key, persisted once. Main also files every photo under the nearest print shape on a log scale, measured as displayed after any JPEG EXIF quarter turn: landscape 4:3, portrait 3:4, square 1:1, wide 16:9 or tall 9:16. Instant film is drawn only for square, portrait and landscape. Every print is sized from its real stock in millimetres (`--ui-photo-mm` is one millimetre at 96 dpi): print is a 4×6 in sheet (152×102 mm) and archival a smaller 3R sheet (127×89 mm), whose long edge carries landscape and wide shapes, narrowed for portrait and tall and using the short edge for square; instant film uses the real instax sheets, mini (54×86 mm, 46×62 image) for portrait, SQUARE (72×86, 62×62) for square and WIDE (108×86, 99×62) for landscape, laid out as fractions of the sheet so its margins and image area scale as one object. The page shows every stock at `--ui-photo-page-scale` (0.5) and the Preview at `--ui-photo-expanded-scale` (1.25), so their size relation matches the objects on a desk; a small instant print is enlarged on expand but never to the full media bounds. Photos saved before shapes existed are measured once from the stored image and written back. `UiPhotoFrame` owns both stocks and shapes, so the expanded Preview prints on the same stock as the thumbnail. A photo carries two optional texts, both edited only in `AppFolderPhotoTextEditorModal` from the photo context menu「編輯照片文字」or the Preview rail: instant film alone takes a short line (at most 16 characters, single-line ellipsis) written in its lower margin on the page and in Preview, and any photo may take a caption note with the same title (at most 80 characters) and body (at most 2,000) as a page note. On the page only a corner of its paper peeks from behind the print's lower end corner; in Preview the full translucent note stands in its own column between the print and the action rail, top-aligned with both, never overlapping the print. That column's width comes out of the print's media bounds, and a long body scrolls inside the note. Its paper is one of the user note stocks, chosen in the photo text editor with a small swatch tucked at the preview print's lower end corner whose overlay `UiIconButton` cycles the same stocks as the note editor (a first caption starts on a random one); main keeps it while the caption is edited; clearing a field removes that text. A user note whose committed text is one short line (at most 24 characters) uses the compact stock (`--ui-folder-artifact-note-width-compact`／`-min-height-compact`, utility-face body); content decides, never a size control, and editing always uses the full stock. A long user note stops at `--ui-folder-artifact-note-max-height` (a square of the note width): its title stays whole while the body fades out under a mask and a muted `…` marks the lower end corner. Only a note the cap actually cuts off, as measured after layout, becomes activatable (click-like release, Enter／Space or the context menu「閱讀便條」) and opens `AppFolderNoteReaderModal`: the same shell-free media presentation as a photo, showing a letter-proportioned sheet (`--ui-folder-note-reader-width` × `--ui-folder-note-reader-aspect`, inside the media bounds) of the note's own stock. Text that outgrows the sheet flows into column pages turned from the sheet's lower end corner or with ←／→ and PageUp／PageDown, with a `n / total` page count; keys typed into a field never turn pages. Reading stays apart from editing: the rail holds close, edit and delete, and edit opens the note editor above the sheet. Note titles use the display face and eyebrows the utility face. The derived artist summary is a data card: eyebrow 藝人資料, the artist as title and label／value rows (曲目、專輯、年份) in the utility face. Stationery (approved by the owner 2026-10-10) is decoration drawn by `UiFolderArtifact`inside the object, so it moves and rotates with it.`src/utils/folderStationery.js` derives every parameter from the object key through a seeded generator, so objects differ but each one renders the same way every time: a paperclip straddles the top edge at a varied position and angle in silver or brass, its back loop painted behind the paper (faint through translucent notes) and its front loop on the paper, never stuck halfway; tape is one strip across the top edge or two strips over the corners, with varied length, angle and washi tint (`--ui-folder-stationery-tape-_`) and ragged ends; a torn edge is a generated irregular outline on the bottom or top of a note. Stationery is always `aria-hidden`, never a hit target, and avoids the pin corner. The data card is always clipped and about one in three user objects carries stationery (tape on photos, a torn edge on notes). New objects lean 0.75°–4° either way rather than one of four fixed angles; saved rotations are kept. User-placed stationery waits for the user-preference discussion.
- **Artifact geometry refresh:** the canvas observes item size changes as well as its bounds and Folder regions. Image completion, source replacement and note content changes reproject the existing region placement on the same scheduled frame, without emitting persistence writes; active drags retain their current pose until release. Removed item observations and unmounted observers are cleaned up.
- **Artifact note composition:** the shared textarea keeps Escape available to an active IME composition (including keyCode 229). Outside composition, Escape and blur commit once per edit session; reopening initializes from the current caller-owned body.
- **Folder artifact stacking:** paper and Folder extension paint below the floating plane; focus or drag raises an artifact only inside that local plane, and artifact order is rebased to the current finite set rather than accumulating unbounded z-index values. A page with derived and durable objects must merge them into one `UiFolderArtifactCanvas`; a second canvas would split collision、focus and layer authority. Neither the paper edge nor the extension seam clips artifact paint, so an object may bridge both materials and its rotated edge or shadow may cross the paper content edge into the Folder reserve. Folder tools remain controls on the second-row Folder background rather than a floating dock; an artifact may naturally cover them when it occupies that corner. The outer `UiScrollRegion` viewport remains the real clip owner and its overlay rail stays above viewport content; tabs and fixed Shell chrome remain outside that viewport stacking context and cannot be covered.
- **Single owner:** the layout family owns the Folder tabs, colored perimeter, continuous paper, page header placement and body-mode boundary. A feature supplies title／description／actions and body content through the shared page composition; it must not add a second Folder perimeter, page frame, destination lining or independent paper palette.
- **Fixed envelope:** every tab keeps the active-height hit box mounted. Selection moves the clipped surface and its independent content wrapper inside that envelope; it must not transition button height or move the document origin.
- **Optical center:** derive label placement from the visible material above the cover rail, not from the full hit box. The mathematical active center is `(active height - cover size) / 2`; the resting center adds half of `(active height - resting height)`. Then apply the shared 1 CSS px downward optical offset to both states, balancing the extra visual weight of the Folder-colored lower rail without letting surface and label drift independently.
- **Layering:** inactive surfaces remain behind the Folder-colored cover rail; the current destination sits in front and visually joins the perimeter. Focus rises above both without changing geometry. A repeated component instance must own a unique SVG clip-path id.
- **Overflow:** narrow layouts compress to the defined minimum before using horizontal overflow. Keyboard／programmatic focus reveals the destination with nearest-edge scrolling; labels remain single-line ellipsis. The first and last destinations retain the same inline inset as the Folder perimeter.
- **Document mode:** tabs and Folder identity stay fixed. The page title、description、primary action and body belong to the moving sheet inside the single keyboard-focusable Folder-frame Scroll Region; its scrollbar stays outside the paper at the frame edge.
- **Library page:** every collection page follows one Spotify-style page logic: 「全部曲目」is the true union of every library track and「本機檔案」is its local-file subset. Both use the same dossier and action rail as playlists, albums and artists (an icon plate stands in for artwork), so the library has one header and search always lives in the action rail. Library playback and queue sources use the `library:<view>` id so the header can show its playing state; loading, error, empty and track-list states follow it in the same document. Library views default to `importedAt` descending, with the existing title／artist ordering used only as a deterministic tie-breaker. A selected playlist keeps its cover／description dossier in collection content; session preparation opens under Performance「演出安排」rather than switching the Library page into a workspace.
- **Track editing:** all track surfaces use one context-menu「整理歌曲」entry and the App-owned `WorkVersionEditor` workspace. `UiTabs` separates「歌曲資訊」from「版本與連結」; the latter keeps version settings on the left and per-track linking on the right. Version name and singer category precede the collapsed recording format／arrangement／vocal／notes details; advanced selects stack one per row, and notes use the shared multiline textarea. Original／Demo labels do not change stored enum values. `TrackMetadataFields` reuses the existing artwork preview／search and metadata controls without a nested modal. One footer saves dirty domains and confirms discarding drafts once; a partial failure keeps unfinished drafts and identifies the successful part. Provider-managed metadata remains read-only. The current track's shared ⋯／context menu stages「解除連結」with undo; no standalone management section or shared-name setting. Linking expresses a relationship only: each track keeps its own title, performer／collaboration credits and version information. Artwork choices remain staged until footer Save, with the existing focus, accessible labels and keyboard behavior.
- **Artist identity:** once credits share one artist entity, every artist-aware track identity shows the same canonical display name; search still matches every grouped raw credit. The correction Modal is recovery-first and content-height: its wide large-container layout places current grouping before automatic status in two columns, then collapses to one column. Display-name override, manual merge and MusicBrainz re-identification stay behind one「進階修正」action; Undo appears only when a recovery snapshot exists.
- **Library content range:** a playlist／album dossier is the first region on the continuous paper, followed by its action toolbar and the loading、error、empty or track-list region inside `AppFolderContentField`. Loading／error／empty use its bounded `state` variant; populated lists retain intrinsic height. The field ends after its primary content instead of filling the remaining viewport; an album may then show local same-artist albums on the paper. Its local-library artist summary is supplemental reference material, so it appears as one movable note on the Folder-wide floating plane and may travel across the paper and lower Folder ground; it is omitted when no credited artist projection exists. Playlist／album／artist pages may hold up to 12 user-created objects (currently local photos; derived objects do not count) and add them through one square-default `Plus` Command `UiIconButton` in a compact same-material command dock at the upper end corner of the Folder ground immediately below the paper. That button opens one shared `UiActionMenu`（照片／便條）instead of growing a row of per-type buttons. Notes are created and edited only in `AppFolderNoteEditorModal`, which shares the playlist details anatomy: a 160px swatch of the note's own stock, named in the utility face, whose corner overlay `UiIconButton` cycles periwinkle → rose → canary → kraft → ruled, beside an optional title (at most 80 characters) and a body field that reaches the preview's bottom edge, with a short footnote at the start of the action row. A note exists only after Save with a non-empty title or body, so no blank card is created; editing opens from the context menu, never from a click, so overlapping objects cannot start an edit by accident. Notes saved before titles existed read as untitled. Each object also offers a context menu (pointer or keyboard menu key): photos expand／edit text／Pin／remove, user notes edit／Pin／delete, derived notes Pin only; removal always goes through the shared confirmation owner; the control shares the existing extension row and never appends a separate tools row or full-area child surface. The collection action rail retains only collection commands and search, while default library pages and workspace mode do not create ownerless durable objects. A photo remains activatable while pinned: click-like pointer release or Enter／Space opens a dedicated image-only presentation inside the shared Modal mechanics, while movement beyond the shared drag threshold only moves it. Thumbnail and expanded Preview compose the same shared `UiPhotoFrame` material and vintage filter: mat padding、strong semantic border、paper surface、artifact shadow and image treatment remain continuous, while the thumbnail alone uses a cover crop to its filed print shape and Preview uses intrinsic contain. `UiModal presentation="media"` keeps renderer-root Teleport、scrim、focus、Escape and finite stacking but removes the raised surface、visible title bar、content scrollport、dialog border and generic footer. Its inline-end action rail is outside the frame, aligns to the frame's top edge and stacks neutral close, then edit text, above destructive remove; DOM、Tab and visual order are all close→edit→remove. All remain square-default Overlay `UiIconButton` controls, while remove uses the shared `danger` intent and existing danger tokens instead of feature-local styling. Disabled、Tooltip and focus remain shared primitive states, and the rail's logical-start Tooltip placement points back toward the media. Only this disposable media presentation opts into backdrop self-click dismissal: clicking the framed image or its controls stays inside, `closeDisabled` blocks every close path, and ordinary dialog backdrops remain inert. Open and close use one paired transform、opacity and clip-path transition on existing motion tokens, with no overshoot or layout animation; reduced motion removes the transition. The image keeps intrinsic `auto` dimensions bounded by the shared `72dvw × 70dvh` media tokens and viewport insets after reserving the external rail width and gap; landscape、portrait、square and extreme ratios therefore scale down proportionally without canvas letterbox or crop, while smaller images are never forced to upscale. Removal goes through the shared confirmation owner. Overlapping shared Modals use one rebased finite open-order stack for Escape、focus and paint, so a removal confirmation opened from the preview remains above it regardless of Teleport mount order. Overflow remains under the existing single Folder-frame scroll owner, and changing the selected collection returns that document scroll to the start.
- **Collection identity and actions:** The dossier artwork, action rail, compact bar Play and track table share one paper content edge, so the dossier adds block space only. `AppFolderDossier` is the feature-agnostic header anatomy: artwork slot, short type marker (utility face), title (display face, content `lang`), one summary line of owner plus field values (utility face, `·` separators that assistive tech skips) and an optional description. `LibraryEntityDossier` adapts library, playlist, album and artist data into it; all collection pages share the `CollectionActionRail` rhythm but keep separate capability adapters. Once the dossier scrolls fully above the Folder viewport, `AppFolderCompactBar` (a zero-height sticky anchor whose bar overlays content, so revealing it never shifts the document) keeps the title and the same Play／Pause reachable, and the opaque ledger header sticks below it through `--ui-folder-sticky-offset`. The paper clips with `overflow: clip` rather than `hidden`, so sticky chrome resolves against the Folder scroll viewport. Collection pages always show the list density; the rail has no density switch. `TrackTable` keeps a `density="compact"` presentation (no artwork, title and artist on one line, `--ui-track-row-compact-min-height`) fed by the session-wide `useTrackListDensity` for a future caller. Secondary page regions use `AppFolderSection`: a display-face title at the `--ui-type-heading-*` role, optional utility-face meta (such as a count) and trailing actions over one `--ui-color-border-strong` rule, spaced by `--ui-folder-heading-gap`／`--ui-folder-section-gap`; the heading level follows the outline without changing the look. Release-type filter chips wait until imports record album／single types, since a single category never shows filters. The stable core order is Play／Pause, Preview, Shuffle, Add to queue, entity action, then More; search remains a separate tool. Playlist／album adds a distinct Tickets entry in its existing More menu for the performance pending list; the two queues keep separate destinations without adding a persistent toolbar control. Right-aligned primary actions apply only inside Right Dock, without reordering main collection or performance workspace controls. Preview is the first secondary action as a Ghost `GalleryVerticalEnd` button (a vertical feed of highlight cards; `Headphones` stays reserved for the monitor output device) while Play keeps the only Accent weight, and it is disabled with its reason in the accessible name while recording or live because the preview lane cannot sound. Preview opens the shared `UiModal` (wide, no footer), which mounts on the renderer root like every modal, and follows the conventional feed arrangement: the now-playing copy and the media read as one pair centred in the free width, with a fixed 15rem info lane narrower than the cover so the copy sits inset from the dialog edge — a title one step above the dialog's own title (`--ui-font-size-2xl`, bold, title leading), a small muted artist line and a label-hidden segment `UiProgress` spanning that lane — beside the enlarged artwork with neighbours one clear tier below it (70% size, receding behind a `--ui-color-overlay-scrim` shade that deepens toward their outer edge and eases off on hover) clipped to fixed edge slices; current and neighbour covers lift with `--ui-shadow-overlay`, and the stage clips only vertically so those shadows stay whole. Real playback starts from the cover's bottom-end corner: the app's `PlaybackPrimaryButton` (accessible name「從這首開始播放」) inside `UiArtworkReveal`, shown only on hover or keyboard focus together with a corner vignette of `--ui-color-overlay-scrim` in the shared `UiArtworkOverlay` plane, so the dialog shows no Play glyph at rest and the cover is never fully darkened. The whole dialog surface takes the cover's own colour through `UiModal`'s optional `tint` (sampled from the thumbnail, lightness-capped and washed in from the media edge, crossfading on the standard motion token), following the Material Color Rule: it never recolours text, progress or controls. One edge column holds two units: the track-action rail, centred on the cover, with the row right-click menu itself (`Ellipsis`, same per-track options as the row) plus the `ListEnd` add-to-queue shortcut taken from it; and feed stepping at its foot at the live control size (`ChevronUp`／`ChevronDown`, `size="lg"`, stacked like the vertical feed; a deliberate owner exception to reusing PlayerBar's horizontal Skip glyphs). Mute is a session-wide preview tool in `UiModal`'s optional header tool area, separated from close by one vertical `UiSeparator`. Title and artist credits open their album and artist pages like PlayerBar (both dismiss the dialog first); right-clicking the current cover opens the same row menu at the pointer. A preview plays on its own, follows window focus like a feed and replays its segment when it ends: there is nothing to click or press for Play／Pause, and moving on is always the operator's choice. Track switches slide by direction on the standard motion tokens: the cover moves a full frame inside its clipped artwork slot, each neighbour slice moves one slice height within its fixed row, and only the title shifts by `--ui-space-2` while the artist line simply updates; all of them crossfade with the outgoing copy taken out of flow; reduced motion zeroes the duration, so no separate rule is needed. A nested `track-preview` boundary only hosts its menu and stays transparent so the modal owns the raised paint. Artist previews start at the selection and shuffle the rest so they differ from album order. Collection playback always uses the complete explicitly sorted membership, never the filtered search result, and delegates to the existing player／queue authorities. Playlist owns editable membership and details; album membership remains source-backed and read-only. Artist may reuse the anatomy only after a real artist projection and durable capabilities exist; do not create placeholder Follow／Saved／Download state.
- **Track preparation:** Titlebar「曲目準備」is one fixed `ListChecks` controlled disclosure for the shell-owned Right Dock; it opens without replacing the active destination and closes when activated again. `PreparationDockPanel` alone owns the Dock header and Scroll Region. Its fixed identity chrome reuses the same `UiTabs` Bar recipe、keyboard semantics、linked tabpanels and switch-to-top behavior as Queue／Recently Played for `ImportDockContent` and `SeparationDockContent`; neither child may nest another Dock shell or define parallel navigation chrome. Local selection, provider search, single-track candidates, progress, completion, error and retry stay in the Import content as `UiTrackRow`-based object rows and never open a confirmation Modal. A playlist／album stays one summary row in the Dock; the whole row opens the existing wide review Modal while its trail continues to show the object status, so no separate「檢視」button displaces state. Multi-track filtering and selection require protected focus. Width and height are independent decisions: the wide variant supplies horizontal room for track rows, while Import selects the existing medium semantic max-block token instead of inheriting the wide variant's large cap. The dialog therefore remains content-height for short collections; longer collections stop at that cap and the existing body Scroll Region owns overflow. The Modal shell alone owns the dynamic playlist／album title, close action, body Scroll Region and fixed footer. Its content is one collection review composition without a nested panel or duplicate close／footer: `UiSegmentedControl` owns status filters, secondary bulk selection／retry commands use shared icon buttons with Tooltip and accessible names, and the footer keeps only the explicit「下載／加入 N 首」primary action instead of repeating the selected count. Each result directly composes the formal `UiTrackRow` with an Import-owned `UiCheckbox` lead and download-status trail. Rows keep shared identity／artwork／duration／ellipsis anatomy without inheriting Library browse selection, playback, sorting, drag or menu behavior; `TrackTable` remains the collection-page table owner. Title and artist retain complete source data for the shared overflow tooltip while each visible line stays single-line ellipsized, so long metadata never changes row height. Normal identified state stays quiet; identity status appears only when pending or review is required, while each row still owns its download state. Successful object copy is suppressed when that row already exposes completion; errors, skipped work and recovery instructions remain visible. Separation first exposes one collection-scale source selector:「目前播放順序」is the first native option, followed by semantic「播放清單」and「專輯」groups in that order; single-track processing remains contextual outside this Dock. `UiSelect` owns the native `optgroup` projection while flat callers keep the same typed-value contract. Adding snapshots the selected collection's current order; a removed collection falls back visibly to playback order. Source occupies the first setup row, and mode／prepare-again／Add share one compact second row. Queue sections compose `AppRightDockSection` and `TrackIdentityRow navigation="artist"` for the same heading tone、spacing、canonical artist destinations and one-line title／artist hierarchy, while retaining Separation-owned progress、reorder、retry and cancel intents. Low-frequency row actions no longer reserve a visible ellipsis lane: pointer right-click and the Context Menu key／Shift+F10 open the same action menu. Pending list position carries order without a duplicate ordinal or「等候中」label, and its section-level「清除佇列」removes only pending work without cancelling the active item; failed、cancelled、completed and skipped rows use shared status icons with Tooltip／accessible labels. The active status lane stays structurally above the active row, and `UiProgress` owns the single visible item percentage so progress updates do not move the row. The same import session remains authoritative across Dock and Modal. Completed items become Local Library objects; the Dock does not invent a second durable download-history page.
- **Preparation source identity:** Playlists retain their saved manual order. Albums reuse the shared artist-ascending、same-artist release-newest-first and title tiebreak rule; option copy is static「專輯名 · 藝人」with the primary object first, and unknown artists omit the suffix. Actionable options never marquee on hover. A future searchable／two-line requirement must adopt the existing Combobox recipe rather than add native-select animation.
- **Workspace mode:** a bounded `minmax(0, 1fr)` body does not create a page-level vertical scroll. The feature may own one or more explicitly named internal Scroll Regions for panes such as Lyrics, Output or session preparation; those regions must not sit inside another vertical page Scroll Region. Panes sit directly on the paper and are divided by `--ui-folder-ledger-*` rules, not framed as bordered or rounded cards.
- **Workspace toolbar:** when tool tabs already name the tool, `AppFolderWorkspaceToolbar` does not repeat that name as a heading. It shows the current context (display face, content `lang`) with an optional muted note, then status chips and trailing actions, over one ledger rule on the paper content edge. 演唱工具's 演出安排 and 歌詞 use it; 歌詞's appearance is due for a separate redesign.
- **Session preparation boundaries:** ordered plan and library-search lists retain `UiScrollLayout` padding; list resets own margin and list markers only, never a padding shorthand that clears the shared reserve. Both detail editing and manual creation compose the feature-local `PerformanceSessionReviewPane`: one labeled scroll body maps the existing inset and focus roles into `UiScrollLayout`, while the fixed action footer shares its content edges through the canonical scrollbar reserve. The pane owns layout only; each form retains its drafts, validation and product intents. Read-only canonical track facts stay flat on the sheet with a ledger rule. Titles use the complete Title recipe, small group labels use Label, metadata and saving feedback use Caption, and explanatory manual-source prose uses Body.
- **Lyrics display controls:** the source selector lists saved sources and stays operable with a single source; only lyrics loading temporarily disables it. Selecting a reading variant loads its existing reading or generates a missing one through the same entry, with a passive busy status rather than another generate button. An explicit reactivation of the selected segment retries; keyboard focus navigation does not trigger retries. Read failures remain errors and never silently start generation. The existing lyrics and reading composables retain canonical state; the workspace coordinates requests and drops stale continuations.
- **Context boundary:** Right Dock／Inspector content remains a shell-owned sibling outside the Folder perimeter. Neither `AppFolderLayout` nor a feature page reserves an empty context column or accepts feature-owned context paint.
- **State ownership:** view selection is controlled by the application owner. The layout emits destination intent but does not own routing, unsaved-change guards, persistence, or post-navigation focus restoration. The fixed first version does not support closeable, reorderable, user-created, vertically oriented, or per-tab semantic-color variants.
- **Accessibility:** forced-colors must preserve a system-highlight current destination and visible focus. Shape and color are supplemental; the current page remains exposed through `aria-current`.

### Folder Composition Recipes And Acceptance

Settings modals reuse `UiModal` header-actions for tools and explicit local actions, keeping the shell close control beyond its separator. Short choice, feedback and export flows use Notice width with Small maximum height; device lists keep Wide width for complete names, and formal rights documents keep Wide/Medium reading bounds. Content determines natural height. A repeated command row must not remain inside the body after moving to the header. Consent and destructive confirmations keep their fixed footer after the explanatory content. Selection, local draft/preview and explicit apply/send/copy remain distinct workflow steps.

Settings optimizes first for a restored 1280×850 window and remains usable at 960×650. Its shared document row keeps purpose, current value and status together, centers the trailing action group against that information, and places recovery across the full text axis. At narrow container widths actions may move below but remain end-aligned. DOM order follows visual order: secondary commands precede the primary action, and an Ellipsis overflow menu, when present, remains the terminal control at the far right. Field-local commands belong beside the actual input through the shared field action slot, with validation below. Settings orders common library/audio controls first, then acquisition/processing/experimental lyrics, OBS/output, and lower-frequency application/support controls; this order reflects task relationships, not measured popularity. Editable connection fields require explicit save, while independent immediate preferences must not commit their drafts.

Choose the recipe by the task's scrolling and visibility needs, not by destination color. The existing Folder Page Layout rules above own material and geometry; this section is the cross-page composition checklist.

| Owner               | Shared responsibility                                                   | Feature responsibility                                                |
| ------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------- |
| App Shell           | Sidebar, persistent PlayerBar and Right Dock bay                        | Consume player and task projections without duplicating their state   |
| `AppFolderLayout`   | Destination navigation, semantic material and perimeter                 | Emit bounded navigation intent through the existing application owner |
| `AppFolderPage`     | One loose-leaf sheet, binding gutter, body inset and explicit page mode | Choose document or workspace; supply content and optional header      |
| Content composition | Shared headings, controls, row primitives and semantic tokens           | Domain identity, permissions, interaction capabilities and state      |

| Recipe    | Current consumers                             | Header and scrolling contract                                                                                                                      |
| --------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document  | Library browsing; Settings                    | Heading and content move with the sheet. Page owns the vertical Scroll Region; ordinary rows extend the sheet.                                     |
| Workspace | Library lyrics authoring; Performance; Output | Context and necessary tools stay outside bounded pane scrolls. Page owns no vertical Scroll Region; each pane names its own scroll responsibility. |

- Keep object identity, task context, state and commands distinct. A collection dossier identifies a browsed object; `AppFolderWorkspaceToolbar` identifies the current working context. Local tabs identify related tools or output kinds. Do not repeat their labels as another large page heading. Settings retains its document heading.
- Group commands by scope: local navigation first, editing or display mode next, runtime or primary task commands together. Preserve DOM and keyboard order when groups wrap. A state indicator describes its owning task; it is not another navigation entry. Keep low-frequency commands in the existing menu pattern where appropriate.
- Sections, ledgers and controls share the paper content edge. Use `AppFolderSection` for document chapters and the existing workspace toolbar for context; do not add a common wrapper where a feature already has a justified composition. Reuse `UiScrollLayout` when scroll content needs a reserved thumb boundary; use bare `UiScrollRegion` only with an explicit full-bleed or caller-owned boundary recipe. Focus rings must remain inside the clipping boundary.
- Reflow uses the container that actually constrains the content. Folder-wide insets can query `app-folder-layout`; a multi-pane workspace with its own padding must establish and query its own named content container. Column minima, gap and scroll/focus reserves must fit before choosing a side-by-side arrangement. Native Standard/Compact density does not choose pane topology.
- Shared primitives do not imply shared capabilities. Track identity may reuse `UiTrackRow`, while Library sorting, Queue playback and session occurrence identity remain separate contracts. Reuse existing semantic typography and spacing tiers; a new custom property alone does not establish a new design-system tier.
- Dossier artwork, `AppFolderCompactBar`, Folder extensions and movable photo/note artifacts are opt-in recipes for real content. They are not prerequisites for a destination to count as a Folder page. Output previews remain feature content; public `overlay/` keeps its independent tokens and delivery path.

Accept each migrated page against this matrix:

| Axis                       | Required evidence                                                                                                                                                                                                                                             |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Window and available width | Actual Electron default 1280 × 850, minimum 960 × 650 and maximized window; Sidebar and Right Dock expanded/collapsed states. Record Folder and content widths separately, including widths immediately around a pane breakpoint.                             |
| Theme and content          | Dark and light; long CJK/Latin text; realistic populated content plus loading, empty, disabled and recoverable-error states relevant to the page.                                                                                                             |
| Geometry and interaction   | No accidental horizontal overflow, clipped commands or focus rings. Correct pane topology, accessible tab/panel relationships and keyboard order; one named owner per scrolling region.                                                                       |
| Proof boundary             | Focused component/contract checks and build accompany actual Electron geometry checks. Captured frames support inspection; neither source assertions nor an isolated renderer probe replaces owner acceptance in the real app, or OBS for public composition. |

### Settings Destination

- Settings is the fourth Folder destination and is also reached from a direct Titlebar gear. Its Folder tab uses `aria-current="page"` while active; the gear carries the passive update marker and, when activated while current, performs the bounded history return. It is not a popover or profile menu.
- Settings uses the shared document-mode Folder page with the neutral Folder material, one moving page heading and one description. The complete loose-leaf sheet, including its header, sections and bottom edge, belongs to the Folder page's single Scroll Region. The registered `settings` boundary supplies its local overlay host; no Utility shell or nested Folder layout exists.
- Keep Settings as one continuous document with seven functional chapters in this order: Library and Storage, Audio Output, Application, External Sources and Lyrics, Local Audio Processing, Public Output and OBS, and Support and Maintenance. Do not add local tabs, an inner Scroll Region or a second sidebar until section count or findability demonstrates the need.
- Safe library maintenance that runs automatically belongs in Settings as a passive status／scope row, not a routine action. The metadata row states that saved source information is organized when the library starts, that it does not connect to a provider, and that uncertain manual edits are preserved; do not restore a refresh button unless a distinct recovery workflow requires it.
- `SettingsPage` owns the Folder document composition and surface boundary. `SettingsView` is only the ordered section composer. The five focused section owners retain their domain entry points, confirmations and local dialogs; the capabilities owner presents three functional chapters. Singleton feedback and chapter dialogs mount once in the Shell so their state and keyboard ownership survive navigation. Deep-linked optional-feature requests scroll and focus their target within the same document.
- Define the functional hierarchy before choosing surfaces: chapter → feature entry → child setting or service → that service's advanced fields. `SettingsSection` owns the H2 title band (`canvas`), shared content (`surface-raised`), outline and sibling dividers. `SettingsFeatureGateRow` owns a transparent H3 feature header, enablement and disclosure information; it is not a settings row. Its H4 child preferences and services share the chapter content without individual cards. Child settings and tools are explicit contracts; an empty conditional slot never creates a child surface. Browser Source connection settings belong inside its service group, with Spout2 as a peer. BPM automatic analysis and GPU preference remain directly visible; component install／repair／removal belongs in `SettingsDependencyList`, collapsed when ready and revealed for active work, faults or a setup request. A row followed by its disclosure has one divider, owned by the chapter.
- Primitive roles stay distinct: `UiChip` reports read-only state; checkbox and select edit saved preferences; buttons execute connection, start／stop and maintenance actions; disclosure reveals the owning row's advanced content. Field validation stays in `UiField`; local read and operation failures use `UiHint` and a natural-width retry button in that row's feedback area. Reserve `UiNotice` for region-wide recovery, modal results and notifications. A feature being enabled does not mean its service is connected or its dependencies are ready.
- Settings block copy keeps only purpose or an operational consequence. Chapter gaps inherit one SettingsView role, and SettingsSection owns row／child block padding for both ordinary rows and feature entries; children do not add another outer margin. Reuse existing spacing, field and border tokens before introducing a local geometry role. The shared port width derives from five digits plus field chrome; reading measures, scroll caps and responsive breakpoints retain their functional units instead of borrowing an unrelated component token.
- Settings rows follow their actual `settings-section` container width rather than viewport or native density: wide chapters use the `3fr／2fr` copy-and-detail row; at `48rem` spacing tightens, at `40rem` rows stack, and below `30rem` decorative icons become hidden while their lane stays reserved. Every ordinary row, feature title, child setting and advanced disclosure summary shares one content text axis; decorative icons and disclosure arrows occupy the same leading lane. Advanced form labels align to that axis without adding primitive body padding. Feature headers and tool disclosures inherit the chapter content rather than painting extra bands. Nested rows do not repeat the feature icon. Chapter spacing follows the `app-folder-layout` container at `56.25rem`. Compact／Standard density remains Electron-window-state-owned and does not choose these breakpoints. The Folder document remains the only page scroll owner at every tier.

### Titlebar Status And Feedback

- Keep three stable titlebar zones: start-side passive app health, a flexible draggable reserve, and end-side persistent session state followed by global utilities. Session state may grow toward the center, but the utility buttons remain right-anchored and never shift when OBS connects or a value changes.
- The trailing sequence is fixed by live-operating scope: passive `LIVE` then `REC`, Track Preparation, the Performer companion window, appearance preference, then the Settings destination at the terminal edge. The controls share the Ghost app-surface recipe; Preparation uses controlled disclosure state, Performer uses pressed state, and Settings uses current-page state. Activating an already active control closes its surface or returns from Settings.
- Global utility icons describe the user task rather than one implementation step: Track Preparation uses fixed `ListChecks` because the shared surface contains both import objects and accompaniment jobs; the live current／next lyric companion uses `PictureInPicture2` with「提詞器」copy. The Preparation icon never morphs to download or waveform when its internal tab changes.
- PlayerBar trailing actions follow the listening-flow sequence: optional guide output (`Cable`), current-song Lyrics (`MicVocal`) then Queue (`ListMusic`), performance tools (`SlidersHorizontal`), and Volume. Preserve the optional guide action as a reserved edge slot so capability changes do not shift the centered transport; use the shared icon-button primitive and a uniform 4px gap across adjacent trailing controls without decorative separators. Queue and performance tools are disclosure controls: selected paint means their surface is open, while a separate passive marker and concise tooltip may indicate an active performance function.
- Right Dock keeps its existing single view-switch icon button beside the owning view's tabs. Use fixed `Tickets` with「切換一般佇列／切換演出安排」action labels; preserve the original slot and header height without adding a segmented control or another row. Only the expanded arrangement Dock uses a fixed warm-white receipt boundary in either app theme: reuse existing Light semantic mappings and recompose field／range／row aliases locally. Keep the same tabs and current／pending lists. Keep BGM only on the pending tab; put completed-only count／total duration in the history footer as receipt totals, using the collection summary utility font／caption tokens and shared formatLongDuration (for example「12 首曲目，47 分」). Mixed or manual records retain「項」and unknown durations remain explicitly unknown; completed records follow the controller’s ascending completion time with ordinal 1 first; integrate observed LIVE／REC into the existing pending information or current-session heading row, without an empty summary lane or floating labels over controls; the original solid divider below header tabs stays visible; fine top／bottom paper teeth and dashed content／footer rules carry the receipt identity without smaller type or extra transaction fields. Observed LIVE／REC uses outlined inline stamps with the shared base font and label tokens; the warm-white paper edge and original tab divider remain neutral, without a status line along the paper teeth. Archived sessions reuse PlaylistSidebarRow and UiCollageThumb as collection destinations, with canonical 52px rows and 40px artwork, a non-playing select action and independent trailing menu. Selection opens the read-only archive in the main Folder document, sharing Dossier artwork／title／summary geometry and UiTrackRow while retaining every occurrence and manual item; Back／Forward restores archive identity. General Queue, other Dock surfaces and the collapsed restore control retain their dark Chrome boundary. Disconnected or failed OBS status clears the old LIVE／REC stamps. Teleported menus and tooltips retain their own established overlay color boundary. Do not use a full-panel gradient to carry state. Selection changes the Dock view only, without starting or ending a performance or implying LIVE／REC status. Keep the Spotify-aligned PlayerBar lyrics `MicVocal` entry; the BGM attenuation action uses the text「壓低 BGM」without a microphone icon. Its pressed state reports attenuation, and its accessible name retains the visible label while describing how to restore BGM volume when active.
- Persistent PlayerBar and BGM identities share `PlaybackTrackIdentity`: artwork, one-line title with the existing album action／marquee and credited artist navigation use the same composition and typography. The PlayerBar retains its caller-owned expandable artwork; BGM uses Dock artwork sizing. Operational status belongs in a separate fixed-height BGM line outside the shared identity, so it never adds a third metadata field or changes the identity's typography or height. The source-change action lives in the context row below progress and never shrinks to make room for status copy. BGM source search uses `UiPopover` above that action; progress and volume remain mounted in the footer without a separate adjustment trigger or Popover. The Dock defaults to shared track identity (artwork, title and artist), elapsed／duration and one seek range, plus an explicit expand button. Its artwork and UiTrackRow both use UiTrackArtworkButton with the same RightDockTrackArtworkCue (solid icon, shared scrim, hover／focus-within reveal, external focus ring and click／double-click isolation) for play／pause; the shared primary-action projection preserves the same performance handoff lock. Mixer and source tools remain hidden. Expanded Dock reveals the shared track identity → compact time／progress → context row (operational status, source change, emergency cut) → operation row (BGM guide vocal, dim, mute and volume); play／pause stays on the artwork in both Dock sizes without a duplicate toolbar action. The expand button remains at the trailing artwork-row edge in both sizes, with aria-expanded／aria-controls and a stable focus node. Error state remains signaled on the compact disclosure with its full accessible label. Disclosure changes presentation only: the same transport and audio owners remain mounted, and collapsing closes source search. The main session page stays fully expanded. The BGM guide-vocal toggle uses MicVocal; relative attenuation uses Volume1 as a UiIconButton with its dB／restore tooltip and pressed state. Both expanded bottom rows stay fixed even at the 272px Dock minimum; moving emergency cut to the context edge gives volume a usable range without a third control row. opening, typing, empty results and selecting a source never insert layout content or move the footer transport. Focus enters the search field, Escape returns to the trigger, failed saves retain the query and recovery, and successful selection closes the picker without starting playback.
- `UiPopover` observes its mounted panel size and reanchors when search results or asynchronous content change its height. A top placement keeps its bottom edge above the trigger while space permits; the observer disconnects on close and unmount. Content lists retain their own bounded scroll region.
- The accompaniment work list lives inside the shared Preparation Right Dock and reuses `SeparationToolbarList`; App shell owns the only `useSeparationQueue` subscription, while Titlebar tone and Dock content consume the same projection. The fixed active-status lane precedes the active song row; its `UiProgress` owns the single visible item percentage, and the row keeps identity plus its canonical artist destination. Row menus are implicit low-frequency actions reached by pointer context menu or the Context Menu key／Shift+F10, so no persistent ellipsis competes with artist text. The setup area first selects「目前播放順序」followed by native playlist／album groups, then places mode, prepare-again and Add in one compact action row. Mode options, order, and default reuse the same separation recipe catalog as Lyrics; feature surfaces must not substitute near-synonym labels.
- The source selector keeps album name first and appends artist context without hover marquee; long copy stays a static single-line value, while the full option label remains available to assistive technology.
- A titlebar status must be global across feature pages, continuously valid, glanceable without sentence-level reading, and useful during live operation. OBS LIVE／REC qualifies. CPU／RAM may remain a muted app-health projection with semantic color only at thresholds; normal samples do not generate notifications.
- Use fixed notifications for transient completion, failure, retry, or cross-page attention; use an inline Notice for feedback owned by the visible task; keep multi-item progress in its owning panel or Right Dock. Do not place arbitrary feature copy, progress logs, success messages, or recoverable errors in the titlebar.
- Library read failures stay with their list or document; menu mutations report one bounded failure through the shared notification owner. Editors retain their draft and show failures inside the open Modal. Folder layout retries resend the retained writes for the original document, with newer edits taking precedence; reloading is only a read recovery action. Local import and compatibility conversion publish one batch summary with an action back to the Import Dock, while conversion confirmation, imported rows and per-file skip reasons remain there. Cancelled file selection produces no notification; duplicate-only results use informational feedback.
- Output URL copy uses shared result notifications; a failure remains available with a retry for the original output kind, even after the active kind changes. Main continues to derive the URL. Research single-track analysis completion, cancellation and corpus export results also use shared notifications without repeating the terminal copy in the page. Analysis progress, batch summaries, result data and active-workbench errors stay with their owner; an idle status without a completed response is informational, not proof of success. Corpus load and decision-save errors remain inline and are not overwritten by export feedback.
- Research lookup copies and external-open actions use shared notifications, with retries bound to the original candidate and fixed action; selectable lookup values and approval validation stay in the form. Performance archive and playlist-save confirmations publish success through the shell after their Modal closes; failures remain inside the Modal. Performance list move, reorder, duplicate, remove and clear failures use one notification per operation, without automatic destructive retries. Read, editor, field-validation and playback-progress errors stay with their context; unrelated menu success must not clear them.
- A passive capability marker may attach to its owning utility destination, as the update marker attaches to Settings. It must not become a second notification channel or replace an actionable notice when the user needs to make a decision.

### Shape And Density

Utawakui should split shape language by job:

- **Use macOS-like shape for containers:** app chrome, modals, popovers, search fields, and local-object surfaces should feel calm, softly rectangular, and OS-native.
- **Use iTunes-like restraint for the custom titlebar:** keep it narrow, quiet, and structurally reserved until real navigation, search, or playback controls are wired.
- **Use Spotify-like shape for repeated music surfaces:** track rows, playlist rows, queue rows, and player controls should stay dense, scannable, and rhythmically aligned.
- **Use folder-like shape for collection surfaces:** playlist, album, import, and lyrics-source areas can use tabs, paper layers, or cover placeholders when they represent stored material.
- **Use the brand mark shape only for the app icon and selected artwork treatments:** the card-sleeve / cat-card shape should not leak into every control.

Radius decisions:

| Target                                        | Radius          | Reference | Reason                                              |
| --------------------------------------------- | --------------- | --------- | --------------------------------------------------- |
| Hairlines, progress tracks／fills             | `0.125rem`      | Spotify   | Keeps thin interactive marks crisp.                 |
| Dense thumbnails, artwork, checkbox indicator | `0.25rem`       | Spotify   | Keeps compact inner objects precise.                |
| Rows, buttons, inputs, menus                  | `0.375rem`      | Shared    | Default operational radius: friendly, not pillowy.  |
| Modals, popovers, major panels                | `0.5rem`        | macOS     | Softens system surfaces without card-heavy styling. |
| Chips, transport toggles                      | `999rem`        | Spotify   | Pills are reserved for binary and status controls.  |
| App icon                                      | platform-native | macOS     | Follows OS icon masks, not component radii.         |

The Folder exterior perimeter／cover rail and major panels
share the `0.5rem` large-surface radius. The nested neutral
Folder document may keep its smaller sheet radius; it must not change the visible
four-corner contract of the colored exterior.

Do not increase general UI cards beyond `0.5rem` (8 CSS px at the default root). If a
surface wants more softness, use tone, spacing, or artwork rather than larger
radius. The app icon and overlay graphics may use larger rounded silhouettes
because they are brand／art surfaces, not control-panel components.

Density decisions:

The desktop shell projects one explicit density value onto the document root.
A restored／windowed `BrowserWindow` uses `data-ui-density="compact"`; maximized
and full-screen states use `data-ui-density="standard"`. Electron native window
state is authoritative: manual resizing does not switch density, and CSS viewport
or media queries must not guess it. The stable production token entry consumes
this attribute only for dimensions explicitly listed in its compact remap.
Content-driven responsive reflow remains a separate parent-layout responsibility.

The accompaniment toolbar popover is an explicit production opt-in to this native
density projection. Compact／windowed uses 17–20rem by 14–21rem;
standard／maximized／full-screen uses 20–24rem by 18–32rem. Both remain
viewport-clamped and keep one internal scroll owner. This is native-state
adaptation, not viewport inference.

PlayerBar trailing controls are the second explicit production opt-in. Standard／
maximized／full-screen uses 36px icon actions and a 112px Volume range;
Compact／windowed uses 32px icon actions and a 96px range. Adjacent controls use
a uniform 4px gap. Volume keeps its exact percentage in `aria-valuetext` but does
not render a persistent numeric label; its dedicated semantic width keeps the
visible track practical without coupling it to the generic range primitive.
The PlayerBar shell remains 76px high in both densities because the 44px live
transport plus progress stack does not shrink in Compact; density changes its
routine actions and Volume width without removing the stack's outer spacing.
The center column uses equal semantic side reserves so the transport and
progress midpoint remains the viewport midpoint in both densities. At the
`960 × 650` minimum, the center progress width yields before fixed actions or
Volume controls, while the DOM and keyboard order remain track, playback, tools.

Pending accompaniment rows reuse Queue's list interaction grammar: the whole
row is draggable, an Accent `UiSeparator` marks the before／after destination,
and Ellipsis plus pointer context-menu open the same concise action menu. The
menu trigger is excluded from drag start. This reuse does not import Queue's
selection, double-click playback, or artwork-control semantics.

Action menus (`UiActionMenu`) open toward logical inline-end, like their
submenus. A button-anchored menu aligns to the trigger's start edge and grows
toward inline-end; it aligns to the trigger's end edge only when inline-end
cannot fit and the mirrored alignment can. A pointer menu likewise opens on the
pointer's inline-end side and mirrors to end at the pointer only when needed.
Vertically the menu prefers below the trigger and flips above when it cannot
fit. RTL mirrors every inline rule.

The public menu contract separates placement from content. `anchor` is either
`point` or `element`; `size` is the semantic `sm`／`md`／`lg` width recipe
(184／220／240px). `content.kind="actions"` renders grouped short actions, while
`content.kind="filterable-actions"` additionally owns its search field, pinned
actions, bounded internal `UiScrollRegion`, no-result copy and empty copy.
Callers provide stable groups and items; groups create separators, and items use
`kind="action"` or one-level `kind="submenu"` with optional `intent`, `shortcut`
and `disabledReason`. Feature owners retain availability, payload and effects;
they must not reconstruct search, separators, overflow, focus or submenu logic.
The surface ceiling is `--ui-action-menu-max-block-size`; search and pinned
actions remain fixed while the final flex-sized results viewport is the only
scroll owner. Root and submenu offsets share `--ui-floating-gap`.

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

| Control                    | Height target                   | Reason                                                     |
| -------------------------- | ------------------------------- | ---------------------------------------------------------- |
| Routine icon button        | `2rem`–`2.25rem` (32–36 CSS px) | Keeps a 16-unit glyph while preserving the target floor.   |
| Fixed shell control        | `2.5rem` (40 CSS px)            | Aligns persistent Chrome commands and navigation geometry. |
| Live icon button           | `2.75rem` (44 CSS px)           | Separates primary playback from routine toolbar actions.   |
| Menu item / context action | `2rem` (32 CSS px)              | Easier target without wasting vertical scan space.         |
| Track row                  | `3.25rem` (52 CSS px)           | Enough for title + artist and compact artwork.             |
| Player bar                 | `4.75rem` (76 CSS px)           | Preserves persistent transport and artwork.                |

Artwork edge ramp (`--ui-artwork-size-*`, mirrored in pixels by `ARTWORK_SIZE`
in `src/constants/ui.js` for component `size` props). Role tokens such as
`--ui-track-artwork-size-*`, `--ui-bgm-player-artwork-size` and
`--ui-folder-dossier-artwork-size` alias a step; new artwork surfaces pick a
step instead of a raw length.

| Step   | Size                  | Current roles                                     |
| ------ | --------------------- | ------------------------------------------------- |
| `2xs`  | `2.25rem` (36 CSS px) | Compact-density track rows.                       |
| `xs`   | `2.5rem` (40 CSS px)  | Standard rows, Right Dock, sidebar, preview peek. |
| `sm`   | `3rem` (48 CSS px)    | Prominent rows, player bar, artwork search.       |
| `md`   | `4rem` (64 CSS px)    | Track preview thumbnails.                         |
| `lg`   | `5rem` (80 CSS px)    | Narrow track editor artwork.                      |
| `xl`   | `8.5rem` (136 px)     | Album cards and Folder dossier.                   |
| `2xl`  | `10rem` (160 CSS px)  | Playlist details and Folder editor previews.      |
| `3xl`  | `14rem` (224 CSS px)  | Track editor artwork column minimum.              |
| `hero` | `20rem` (320 CSS px)  | Track preview overlay.                            |

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
- `base.css`: document-level reset, viewport geometry, system-neutral `body` fallback, `#app`, and non-visual element baselines. Visual-token native control recipes belong to their formal `Ui*` primitive rather than a global selector.
- `UiScrollRegion.vue`: component-scoped overlay scrollbar behavior and paint. Native scrollbar suppression must remain local to its viewport rather than returning to `base.css`.
- `UiScrollLayout.vue`: layout composition over `UiScrollRegion`. It owns axis-aware lane reserve and logical content padding; feature consumers map their own perimeter tokens into this contract.

Add new global CSS files only when the purpose is real and shared. Likely future names are `themes.css` for light/dark token overrides and `utilities.css` for a small set of cross-component utilities.

Component-specific styling stays inside Vue SFC `<style scoped>` blocks unless it becomes a reusable primitive or global rule.

Inside a scoped block, write a selector that depends on root or ancestor state entirely inside `:global()`, for example `:global(:root[data-ui-motion='reduced'] .x)`. Vue compiles `:global(x) .y` to just `x`, so the rule silently lands on `x` (often the document root) instead of `.y`; `src/scopedGlobalSelectors.test.js` rejects that form. Transitions timed with `--ui-motion-duration-fast`／`standard`／`slow` need no reduced-motion rule at all, because `tokens.css` zeroes those durations for both the manual and the OS preference.

The document root remains the authority for theme／density／motion／language metadata and literal platform `color-scheme`, but it is not a visual-system root. Main and Performer register their full-viewport `#app` surface before Vue mount; nested recipes resolve from the nearest registered v2 boundary and Teleport content resolves through that surface's overlay host. `UiModal` is the exception: as a window-level interruption it mounts on its renderer root host (App Shell or Performer) and hands that host to its content, because a feature surface host can sit inside the Folder page stacking context beneath the Folder tabs and Right Dock. The completed transition record and stable boundary contract live in [Token v2 完整替換契約](docs/archive/token-v2-replacement.md).

A component whose CSS outgrows its SFC may split it into sibling files imported with `<style scoped src="./Name.part.css">`. Keep the files beside the SFC so relative `url()` paths stay valid, and prove a CSS-only split by comparing compiled output before and after (normalize `data-v-*`). `@keyframes` split away from their scoped users go in an unscoped `<style src>` block with component-unique names: Vue only renames an `animation` reference when its keyframes sit in the same scoped block, so split scoped keyframes silently stop animating.

The Output template gallery is the one shell／preview composition. `ObsTemplateMockup.vue` owns only the shared 16:9 gallery box (backdrop, motion and template data attributes) and, inside it, a canvas at the template's capture size (1920×1080 for Lyrics, the 480-wide widget size otherwise) whose container query defines `--obs-canvas-rem`. Thumbnails letterbox that canvas in 16:9; the detail preview takes the capture's own shape, capped by `--ui-output-gallery-preview-max-height`. It renders the preview that `previews/outputTemplatePreviews.js` maps from the template id. Each `previews/<Template>Preview.vue` takes the same `{ scene, size, animated }` props and owns its markup, presentation logic and sibling `<Template>Preview.css`:

- Template CSS is unscoped because previews render their own markup; every class stays inside the `obs-template-mockup__*` namespace, so a preview stylesheet only names its own template's classes or `[data-template-id]`.
- Order is the cascade: the registry imports `ObsTemplateMockup.base.css` before any preview, then each preview's stylesheet loads, then the shell loads `motion` and `reduced-motion` last, in that order. Thumbnails scale the same canvas; do not add size-variant overrides.
- Gallery sizes mirror the runtime Overlay as it renders at that capture size, including the Overlay `@media` rules that apply there: write runtime `rem` values as `calc(<n> * var(--obs-canvas-rem))` and keep a source-contract test that compares them with the Overlay stylesheet.
- Source-contract tests read the combined text through `readObsTemplateMockupSource()` and one preview through `readObsTemplatePreviewSource('<Template>')`.
- Do not add a shared mixin or utility layer for template CSS; prefer CSS custom properties if template size variants are consolidated.

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

| Category    | Prefix               | Example                     |
| ----------- | -------------------- | --------------------------- |
| Color       | `--ui-color-*`       | `--ui-color-accent`         |
| Typography  | `--ui-font-*`        | `--ui-font-size-md`         |
| Type recipe | `--ui-type-*`        | `--ui-type-title-size`      |
| Line height | `--ui-line-height-*` | `--ui-line-height-body`     |
| Spacing     | `--ui-space-*`       | `--ui-space-4`              |
| Radius      | `--ui-radius-*`      | `--ui-radius-lg`            |
| Shadow      | `--ui-shadow-*`      | `--ui-shadow-overlay`       |
| Opacity     | `--ui-opacity-*`     | `--ui-opacity-disabled`     |
| Motion      | `--ui-motion-*`      | `--ui-motion-duration-fast` |
| Z-index     | `--ui-z-*`           | `--ui-z-popover`            |
| Local layer | `--ui-layer-*`       | `--ui-layer-raised`         |
| Dimensions  | `--ui-*-height`      | `--ui-control-height`       |

Deprecated text-size aliases should not be reintroduced; current component CSS should use `--ui-font-size-*`.

### Naming Conventions

Use naming to separate design intent, implementation role, and runtime state.

| Type                | Pattern                            | Example                             |
| ------------------- | ---------------------------------- | ----------------------------------- |
| Control-panel token | `--ui-{category}-{role}-{state}`   | `--ui-color-surface-selected`       |
| Component CSS var   | `--ui-{component}-{property}`      | `--ui-track-thumb-radius`           |
| Overlay token       | `--ovl-{category}-{role}`          | `--ovl-font-display-cjk`            |
| Primitive component | `ui-{component}`                   | `ui-btn`, `ui-chip`, `ui-track-row` |
| Component element   | `ui-{component}__{element}`        | `ui-action-menu__item`              |
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
- **Navigation Entry** (`entry`): Persistent selectable destinations in app Chrome. It uses a filled plate; selection remains a separate indicator state.
- **Chrome Command** (`command`): Persistent immediate commands without a selected state. It uses an outlined, dark raised surface so create／restore actions remain visible without impersonating navigation.

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

**The Material Color Rule.** Folder、paper and artwork colors identify material or content. They do not replace Accent or semantic status roles.

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
- **Control Panel Font Roles:** `--ui-font-family-base` for UI and body text, `--ui-font-family-display` (Bahnschrift Latin) for Folder titles, `--ui-font-family-utility` (Cascadia Mono／Consolas Latin) for labels, counters and field values. Each role swaps only the Latin face and then falls back to the CJK face for the content language: Microsoft JhengHei for Traditional and Simplified Chinese (see The Content Language Rule), Malgun Gothic for Korean (whose base role leads with it, Latin included), and for Japanese the local `Utawakui Gothic JA` alias, which maps regular text to Yu Gothic Medium and heavier text to Yu Gothic Bold because Yu Gothic UI narrows kana and Yu Gothic Regular renders Light in Chromium.

**Character:** Product typography should be functional, internationalized, and calm. It must handle Traditional Chinese, Simplified Chinese, English, Japanese, Korean, long song titles, artist metadata, and dense table labels without feeling cramped.

### Surface Strategy

Control panel typography and OBS overlay typography serve different jobs.

| Surface       | Typography direction       | Reason                                                             |
| ------------- | -------------------------- | ------------------------------------------------------------------ |
| Control Panel | Native/system sans stack.  | Stable, fast, dense, accessible, and familiar during live control. |
| OBS Overlay   | Ornate display serif pair. | Public-facing, animated, more atmospheric, and brand expressive.   |

The control-panel default is:

```css
--ui-font-family-base:
  'Segoe UI Variable Text', 'Segoe UI', 'Microsoft JhengHei UI',
  'Microsoft JhengHei', system-ui, sans-serif;
```

This matches the current `src/styles/tokens.css` direction. Keep this stack compatible and local-first; do not bundle brand fonts into the Electron control panel.

Right Dock uses the same fixed type scale in Queue and playback metadata:

| Role                             | Size | Weight | Line height |
| -------------------------------- | ---: | -----: | ----------- |
| Dock title                       | 18px |    600 | Title       |
| Collection／entity title         | 16px |    600 | Title       |
| Section／tab／track title        | 14px |    600 | Label       |
| Artist／metadata／header context | 14px |    400 | Caption     |
| Multiline description            | 14px |    400 | Body        |

Single-line identities use the owning component's ellipsis rule. Descriptions are prose: they use `text-wrap: pretty`, allow long unbroken metadata to wrap, and must not inherit label-style `white-space: nowrap`.

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
editable while saving. The header keeps `儲存中…` and `儲存失敗` visible, exposes
an explicit retry after failure, and shows `已儲存` only as short-lived confirmation
instead of permanent chrome. Leaving the Workbench, changing output kind, or
applying a template first flushes the draft; template application and Output
runtime settings remain deliberate actions.

Output is a bounded workspace rather than a document page. Its output-kind tabs,
Workbench/Gallery mode and runtime commands stay in the fixed `AppFolderPage` header without an additional visible
`輸出` heading. Workbench treats the preview as primary and the inspector as supporting:
Widget sizes are named once by their selectable preview caption, while the fixed Lyrics
size appears as compact metadata in the shared top tool area. Template descriptions remain in Gallery;
the inspector keeps only the active template name, runtime state, error recovery, and
effective controls. Inspector group headings use the 14px semibold Label role, field
labels and status use the 14px regular Caption role, and group boundaries—not every
field row—own visual separation. Overlay artwork typography remains independent.
The Lyrics preview scales against both available width and height, so its complete 16:9
frame remains visible in a bounded stage. Its control-panel frame is the sole inspection
composition owner while the runtime is unavailable; once the live cross-origin iframe is
present, that inspection iframe owns checker／dark／light and the optional performer guide
through bounded Workbench-only query state. The copied Browser Source URL contains neither.
Output opts into the workspace-only `AppFolderPage surface="canvas"` recipe: it fills
the Folder interior without the document paper-width cap or binding gutter. Both modes
compose `ObsOutputSplitLayout` with the same bounded top tool area, side width,
header/footer rows and scrollbar reserves. Workbench teleports its existing preview
controls into that area; Gallery uses it for template search without applying a selection.
The session-local navigation owner holds one requested side width and one collapsed state
for both modes. CSS geometry defaults to 18rem, bounds the side to 14–24rem, and leaves
at least 16rem for the main pane plus the shared spacing-token resize separator.
The 14rem side minimum was checked against registered template controls; the upper
limit is a layout policy rather than a ratio copied from another product.
Pointer and keyboard resizing emit bounded preferences; shrinking the container clamps
only effective width, and cancellation restores the original preference. Normal windowed
and maximized layouts keep the same topology. Below the sum of the minima, an explicit
shared compact-pane reveal preserves a reachable return action and moves focus out of
any pane being hidden. Side subtrees stay mounted when collapsed. The external Dock
reservation remains independent. Each pane retains its own Scroll Region and the page
still has no vertical scroll owner.
Gallery keeps the template name and apply command outside its detail scroll; preview and
description scroll together so the preview cannot consume the entire detail pane height.
The inspector maps its visible inline inset into `UiScrollLayout` content padding.
The shared `--ui-scrollbar-visual-reserve` token defines the visible thumb boundary for
both the scroll layout and aligned fixed header/footer; the scroll layout adds its
axis-aware reserve once, while the caller retains the outward focus-ring outset.
Full-width fields stay inside that boundary without changing shared focus presentation.

Output inspector titles use the complete Title role; appearance group headings use
Label, and field labels, passive save feedback and preview metadata use Caption.
Empty states, disabled reasons and local-font status／warnings compose `UiHint`,
preserving their existing live regions and control-description ids. These roles do
not restyle template artwork or font samples. The range control's numeric lane uses
the feature-owned `--ui-output-range-value-width`; its track can shrink to the shared
control height so the numeric value remains inside the minimum-width inspector.

Preview artboards keep their native capture aspect ratio and remain centered in
available canvas space. Size metadata uses `ObsPreviewCaption` at the upper left
of its preview workspace, while contextual tools occupy the upper right. Lyrics
and Widgets use the same Workbench tools row outside the gray canvas stage.
Widget options project their size information into that external row while retaining
their capture-size owner; multiple sizes keep keyboard-operable selection buttons
in the row as well as selectable artboards. Their shared-height canvas regions stay
centered and preserve artboard bottom alignment. Gallery details use the same size component opposite preview
tools, with sample／motion context on a separate row to fit a narrow inspector.
Gallery retains its bounded, scrollable detail preview rather than adopting the
Workbench's larger stage size. Preview scaling never changes output resolution. Transparency checkers use fixed 8px CSS cells (16px repeating tiles) in display space. Workbench frames own checker paint outside the scaled iframe, whose inspection backdrop is transparent; Gallery mockups use the same cell size. Canvas framing stays centered without changing template content alignment. Embedded preview iframes use `color-scheme: normal` to match Overlay documents and preserve canvas transparency under dark control-panel chrome. The canvas stage and Gallery
canvas well reserve `--ui-output-preview-inset`, derived from shared spacing and
focus-outset tokens, so the complete artboard border and selection ring remain
visible. Lyrics fitting subtracts computed stage padding before calculating scale.
Simple preview action／label rows compose `UiStack`; feature grids and the native
external-info Teleport target retain their own layout responsibilities.

Appearance controls are template-effective rather than slot-wide. Every available
template exposes a bounded color-grading-style Look: Template Original, Warm Stage,
Cool Stage, Monochrome, and High Contrast. The persisted compatibility key remains
`paletteId`, but the operator-facing control and component vocabulary use `Look`.
The Look field is a compact select-only combobox: its closed trigger keeps the
selected name and three representative role Swatches visible, while the popup
lists the same previews in the established option order. Arrow keys only browse;
click／Enter commits and Escape preserves the previous Look, so exploring the
list does not create autosave noise.
`ObsLookSelect` composes select-only `UiCombobox`, using its `value` and `option`
slots for representative Swatches. The shared primitive owns keyboard browsing,
floating placement, focus and menu exclusivity; the feature owns Look ids, palette
role previews and suppressing commits of the already-selected value. The `value`
slot customizes selected content only and leaves editable combobox input behavior
unchanged.
Each non-original Look remaps the roles actually used by the template, including KTV
role fills, Kinetic Pop materials, Manga ink／paper, and general text／surface colors;
it is not a raw theme object or a LUT. `lookAmount` blends the complete semantic role
pairs from Template Original at 0% to the selected Look at 100%, rather than reducing
the finished Overlay opacity. Amount stays visible but disabled for Template Original
with an explicit reason. Ornate Vertical keeps its raw Hex text and ink-echo Swatches
under a separate Custom Color group; a non-original Look supplies those roles whenever
the colors remain at their template defaults. Each raw Hex field projects the same
Output-workspace color preferences without becoming their state owner: Recent Swatches
are an eight-entry MRU, while Common Colors are an eight-entry stable user-managed
Palette with explicit add／remove actions and no silent eviction. Both survive restart
and are shared across Output slots and templates, but selecting a Swatch still applies
only to the field where it was invoked. Look, template defaults, LUT concepts, and the
app-wide `UiColorField` primitive do not consume this Palette.

The raw Hex editor presents those preferences as one compact Color Shelf below the
current-color／Hex control. Common Colors stay first and Recent Swatches second; each
source is bounded by the shared eight-color preference capacity and keeps a stable
four-column／two-row footprint so repeated choices retain their position in the narrow
inspector. The Shelf header owns the explicit add／remove／full action, while each source
rail owns only selection. A selected Swatch uses a nested well border and `aria-pressed`
instead of covering the color with a large check. The current-color trigger remains a
native `input[type='color']`; its OS／Chromium picker paints as system top-layer content
and may temporarily cover inspector content, so Output does not clip, restyle, or replace
that popup. Classic Paint is a reference for fixed-palette density and clear current-state
framing only: the control continues to use Utawakui field tokens, focus rings, theme
colors, typography, and spacing rather than importing a retro or modern Paint skin.

Output spatial position stays a feature-level three-by-three radio grid rather than a
global UI primitive. Its intrinsic footprint includes every option, gap, padding, and
border; the visible selected name is centered below the grid instead of consuming a
second inline track beside it. This keeps the control inside the narrow inspector and
leaves the shared setting row as the sole owner of label／control column alignment.

The shared appearance schema owns the inspector hierarchy: Color Treatment, Custom
Color when supported, Typography, Readability, Background, Layout, Motion, then
Content Visibility. Templates omit empty groups but cannot redefine their relative
order. `queue-board` additionally exposes spacing density. Existing font, alignment,
surface-opacity preset, furigana, Kinetic material／arrangement, and Ornate position
controls remain available only where their CSS or runtime consumes them. Controls
fixed by an artwork layout stay absent instead of presenting settings with no
visible effect. Every registered template receives its appearance metadata from
the shared schema; a template with no controls also omits the appearance reset
action.

A field whose value differs from the template default shows a small accent dot
after its label, with a visually hidden `（已修改）` where the row labels its
control. Each group heading is composed by `ObsPropertySection` and shows a ghost
`恢復「<group>」預設` icon action only while one of its fields is modified; the
action is pulled into the Label line box so revealing it never changes heading
height or control width. Group reset and the footer's template-wide reset both
persist immediately. Per-field reset stays limited to the range control's
existing context-menu reset, because the 4rem label column cannot hold an icon
action at the shared control size.

A template that declares elements adds one `調整對象` setting row above its
groups, composed from the shared setting row and `UiSelect`. It defaults to
`整個模板`, which shows today's template groups; choosing an element replaces
them with that element's groups only, so the inspector never lists every
element at once. Changing template returns the target to `整個模板`. The
canvas selection sets the same target rather than adding a second inspector
mode. On the selected capture size only, a pointer layer over the preview
hit-tests reported element boxes: the smallest box under the pointer wins, and
anywhere else, including the cover, returns to `整個模板`. Hovered elements show
a dashed accent outline and the selected element a solid focus-width outline.
The layer is `aria-hidden`; the `調整對象` select remains the keyboard and
assistive-technology path, so no focusable canvas targets are added.

Live Stage alone pilots local font selection. Its font control is a searchable
combobox: clicking the closed field opens the complete available list and highlights
the committed family, then brings that option back into the nearest visible portion
of the list; only text the operator actually types activates filtering. The committed
family name remains in control-panel UI type,
while a separate Traditional Chinese／Korean／Japanese／Latin sample uses the
candidate family in both the closed control and rich options. Bundled presets stay
visible before any permission request. The app never scans at startup; an explicit
`載入本機字體` action requests access and reports loading, ready, unsupported,
denied, or retryable failure. Local selections show a concise public-output rights
notice. A saved family is marked unavailable only after a completed catalog check,
then the Overlay falls back to its safe UI stack. Fixed-artwork templates keep their
bundled font contract and do not inherit this capability.

The `live-stage` Lyrics template follows an original K-pop broadcast hierarchy on
the fixed 1920×1080 canvas. Top chrome shares the 6.25%／5% horizontal safe anchors
and 5.556% top anchor. Its display-first type ladder is label 18px, support 24px,
title 40px, and caption 56px; the 72px brand mark and 64px channel bug sit above
that text ladder, with outline protection for bright stage lighting. The persistent
lower-left caption owns `min(34%, 42rem)` and at most two lines, while the transient
120px-tall lower-right song card owns `min(32%, 39rem)` and keeps title／artist as a
vertical stack. Both use the 8.333% bottom anchor, leaving the middle stage clear
for the performer. The Gallery mockup mirrors these roles and proportions, and the
template defaults to the overlay sans stack without changing explicit saved font
choices.

The `manga-frame` template defaults its font choice to the bundled normal-width
GenEi Antique 6.0a face (`antique`, local CSS family `Utawakui GenEi Antique`), so
kanji and kana keep one comic-dialogue texture in vertical setting. The choice also
offers the overlay sans, serif and rounded stacks and applies to every language;
ruby annotations inherit the bubble face. This default does not alter the control
panel or any other Output template.

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

### Semantic Type Recipes

Semantic type recipes group size, weight and line height into named reading or operator roles. They sit above foundation typography tokens and below component recipes.

| Role         | Recipe                     | Values                  | Intended use                            |
| ------------ | -------------------------- | ----------------------- | --------------------------------------- |
| Display      | `--ui-type-display-*`      | `1.75rem` / 700 / 1.15  | Rare identity or page anchors           |
| Heading      | `--ui-type-heading-*`      | `1.5rem` / 700 / 1.2    | Major view and modal titles             |
| Title        | `--ui-type-title-*`        | `1.125rem` / 600 / 1.3  | Section, entity and editable titles     |
| Body         | `--ui-type-body-*`         | `1rem` / 400 / 1.5      | Standard copy and readable prose        |
| Body compact | `--ui-type-body-compact-*` | `0.875rem` / 400 / 1.25 | Dense values, command rows and controls |
| Label        | `--ui-type-label-*`        | `0.875rem` / 600 / 1.25 | Field labels, tabs and button labels    |
| Caption      | `--ui-type-caption-*`      | `0.875rem` / 400 / 1.4  | Metadata, hints and status copy         |

Type recipes never own text color. Text color remains a semantic surface/content/state decision through tokens such as `--ui-color-text`, `--ui-color-text-muted`, status colors and component state aliases.

Spacing and radius follow the same layered rule. `--ui-space-*` and `--ui-radius-*` are foundation scales; a component may consume them directly for one local decision, while repeated shared anatomy receives a component recipe such as `--ui-floating-row-*`. Margin belongs to the surrounding layout owner. Internal padding, gap, radius, focus geometry and state styling belong to the primitive or component that renders them, so consumers do not repair shared anatomy with deep selectors.

Promote a repeated combination into a semantic recipe only after two production consumers share the same intent or anatomy. A recipe should reduce ambiguity, not create a synonym for every primitive value.

### Text Intent Mapping

Intent names describe what copy means in a component; they do not automatically become global type roles. Use the conventional role first, then add a component recipe only when a repeated anatomy needs a stable bundle.

| Text intent                | Typography owner             | Color owner                               |
| -------------------------- | ---------------------------- | ----------------------------------------- |
| Page title                 | Heading                      | Primary text                              |
| Section or entity title    | Title                        | Primary text                              |
| Content or readable copy   | Body                         | Primary text                              |
| Description or subtitle    | Caption; Body for long prose | Muted text                                |
| Metadata                   | Caption                      | Muted or subtle text                      |
| Field label                | Label                        | Field semantic foreground                 |
| Field value                | `--ui-field-font-*`          | Field component foreground                |
| Multiline field value      | `--ui-textarea-font-*`       | Field component foreground                |
| Menu item or command       | `--ui-floating-row-font-*`   | Floating-row component foreground         |
| Helper, validation, status | Caption                      | Muted or contextual semantic status color |

`--ui-field-font-*` and `--ui-floating-row-font-*` both resolve to Body compact today because their measurements match, while preserving independent component contracts. `--ui-textarea-font-*` keeps the same compact size and weight but uses Body line height for multiline readability. Description, metadata, helper and validation remain intents that combine Caption with the appropriate semantic color; they are not extra global type levels. Typography recipes contain only strongly related font size, weight and line height. Margin, padding, gap, radius, surface color, text color, focus geometry and interaction state stay with layout, semantic color or component recipes.

Tooltip copy uses the Caption role through the shared `--ui-tooltip-font-*` component aliases. Its dark floating material is explicit through `--ui-tooltip-background`, `--ui-tooltip-text`, `--ui-tooltip-detail-text`, `--ui-tooltip-border` and `--ui-tooltip-shadow`, and remains dark in both app themes instead of being derived by swapping page text and canvas colors. Icon-only actions keep an accessible name through visually hidden button text, while the tooltip remains a regular-weight visible hint rather than a second ARIA label. Placement is owned by the semantic trigger (`top` by default; logical `start`／`end` only when the object-level rail context requires it) and must still pass viewport collision handling. The surface uses intrinsic content width first; the shared max-inline-size and viewport inset are upper bounds rather than a fixed text column. Long labels wrap only after reaching those bounds, while a caller-owned short action suffix may be marked as one non-breaking phrase so CJK operation words such as「的更多選項」do not split mid-word. A collection-information tooltip may add one secondary detail line; that detail belongs to the collection object, while a playback tooltip remains owned by the playback button.

Operator-facing hints use the shared App Tooltip system; native HTML `title` is not an interaction or disclosure primitive. The only production exception is a semantic accessible name required by an embedded document such as an `iframe`. Action hints open after the shared pointer delay, open immediately from keyboard focus, close on Escape, suppress touch hover, and attach viewport listeners only while visible. A tooltip never travels with scrolled content: scrolling a container that holds the trigger closes it, while sibling scrolling, scrolling inside the trigger and resize leave it in place. Pointer-down or Enter／Space activation closes it, and it stays closed until both hover and focus leave the trigger; a trigger reporting `aria-expanded="true"` never shows its tooltip over the surface it opened. Only one tooltip is visible at a time; hovering another trigger within 300ms of leaving one skips the pointer delay, except after a scroll dismissal. To satisfy WCAG 1.4.13, the pointer may move onto a tooltip without closing it; only pointer-following previews such as the Range value stay non-interactive. A caller chooses placement from object context, while the shared position owner resolves viewport collisions. Truncated identity or metadata uses `UiOverflowTooltip`／the shared marquee owner and reveals full text only after measured horizontal or vertical overflow; visible text that already fits stays silent. A moving marquee is itself the reveal, so it adds no tooltip and long titles behave like short ones; only when reduced motion (root `data-ui-motion="reduced"` or `prefers-reduced-motion`) stops it at an ellipsis does it fall back to the overflow tooltip. Do not add unconditional tooltips to repeat a visible label, description, group heading, or value.

Naming follows common design-system vocabulary without claiming identical measurements across platforms. `Heading` is the major view or modal title here; intent mappings such as Description and Field value remain project-specific usage guidance rather than additional global roles.

### Typography Rules

The control-panel lyrics reader uses a feature recipe in `src/styles/features/lyrics.css`, shared by Performance sheet and Library authoring. Small／standard／large primary lyrics map to the existing lg／xl／2xl tiers (18／24／28px at a 16px root); romanization maps to md／lg／xl (16／18／24px), and furigana maps to sm／sm／md (14／14／16px). No font size is derived by multiplying the main text. Main and romanization use regular weight and Body leading; furigana uses semibold and Title leading. Ruby neighbour gaps use the measured annotation-to-main font-size ratio only for geometry. Script language belongs on the reading group, and romanization carries `ja-Latn`／`ko-Latn`. Local list and sheet mark the latest started line with the same highlighter: amber by default, sky／red／green for a whole-line male／female／group role, pre-mixed with the sheet like the amber stroke. Vocal painting (Edit → 標註聲部) offers a 男／女／合／清除 segmented pen; clicking a row paints it, Shift-click paints the range from the last stroke, every marked row shows its stroke plus a short muted role label, and name-marker rows read 段落起點 because painting them carries the role to the next name. Mixed-role rows keep amber. The marker covers unapplied, unsupported and unbounded analysis. The marker stays through silence and after the last line, then switches at the next line start; seeking recomputes the location from the current player time, and no marker appears before the first cue or without a matching playback clock. Only the currently active timed chunk gets a blue underline, with no cumulative progress paint. Original whitespace is preserved for layout but never underlined, including inside an active chunk. Waiting retains the line marker without a word underline. Reading spans and timing chunks are intersected at text boundaries so furigana never drops or broadens the active chunk; the underline does not skip glyph ink. Native/model intervals and known pauses retain their original timing. Ordinary whole-line timing does not invent word underlines. Forced colors retain a system-color whole-line outline when background images are removed. All rows retain the same font weight and cloned inline padding, so cue activation does not change wrapping. Automatic following aligns the first primary lyric line box at the reader's upper third, once enough content has passed above it. The document starts with its normal top inset; negative scroll targets clamp to zero, without an artificial leading blank. Measured tail space lets the last line reach the follow position. Manual browsing still suspends following until the explicit return action, and reduced motion uses immediate scrolling. Self-View and public Overlay retain their own presentation recipes.

**The Fixed Scale Rule.** Product UI uses fixed rem scale, not viewport-fluid type. Responsive behavior comes from layout, not shrinking text.

**The Multilingual Fit Rule.** Long metadata must truncate, marquee, wrap, or resize by component rule; it must not overflow its container.

**The Content Language Rule.** The document language is `zh-TW`; user content (track title／artist／album, collection names, notes) carries its own `lang` from `contentLangAttribute`／`trackContentLang` in `src/utils/contentLanguage.js`. It judges related fields together: kana or Hangul first, then Japanese-only shinjitai, then simplified versus traditional characters derived from OpenCC's raw tables (shinjitai shared with simplified forms is not Chinese evidence); anything undecided keeps the document default. Simplified Chinese keeps the `zh-Hans` tag but no font override: JhengHei covers its characters, while YaHei draws about one weight step heavier and made mixed lists look uneven. Each `:lang()` token block (ja, ko) restates every font role, and a lang-tagged element re-resolves the base stack at zero specificity, so put `lang` on the element that owns the text's font role. Pure-kanji Japanese with no kana or shinjitai in any related field stays in the default face until a user-chosen language exists.

## Elevation

Utawakui should be flat by default and layered by tone before shadow. Depth exists to clarify stacking order: menus over panels, dialogs over content, tooltips over controls.

### Stacking Layers

- **Global layers** (`--ui-z-*`): sticky 10, floating 15, popover 20, backdrop 30, dialog 40, toast 50, tooltip 60, drag 70. Only shell chrome and teleported overlays use them; `floating` is for persistent shell overlays, so menus always paint above it.
- **Local layers** (`--ui-layer-*`): behind -1, base 0, raised 1, overlay 2, indicator 3, focus 4. They resolve against the nearest owner that isolates its stacking context (`isolation: isolate`); a repeated row or control isolates its own root so inner values never compete with siblings. A row that must paint over a neighbour (a drop target) raises itself, not its inner indicator.
- **Literal values:** every `z-index` uses one of these tokens or a runtime-derived component variable such as the finite Folder artifact order; `src/styles/zIndexLayers.test.js` enforces it.
- **Overlay hosts:** a surface's overlay host must sit outside every content stacking context between it and the renderer root. The Folder perimeter therefore creates none, `AppFolderPage` isolates its own content, and a child surface nested in an isolated region (the Lyrics authoring workspace inside Library) mounts its host beside the parent's via `AppSurfaceBoundary` `childHosts`／`detachedHost`.

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
- `src/components/playback/`: persistent playback controls, transport, pitch/tempo, now-playing surfaces, and shell playback context under `context/`.
- `src/components/library/`: Library destination browsing, collection presentation, album grouping, Folder artifacts, metadata, and artist-identity surfaces.
- `src/components/playlists/`: playlist membership and navigation only.
- `src/components/demo/`: development-only component specimens and catalogue compositions; adopted page candidates must be removed instead of retained as parallel product pages.
- `src/components/track/`: track identity, actions, shared tables, and the independent track-preview surface.
- `src/components/queue/`: active queue, upcoming tracks, reorderable queue sections.
- `src/components/import/`: source import, candidate preview, provider flow, and gated acquisition UI.
- `src/components/lyrics/`: lyrics workspace, synced-line display, lyric editing and timing surfaces.
- `src/components/analysis/`: Music Analysis selection, capability, batch, benchmark, and Music Structure result surfaces.
- `src/components/internal-tools/`: dev-only Operations／Evaluation navigation and composition shell; domain state remains in each feature owner.
- `src/components/lyrics-provider/`: private provider-corpus review surfaces; not the ordinary Lyrics product workflow.
- `src/components/output/`: OBS Output Gallery, Workbench, preview, slot, and appearance surfaces.
- `src/components/performer/`: Performer prompter surface, lyric cue, bounded sync／display controls, and Electron-only window toolbar.
- `src/components/separation/`: vocal-separation recipe and result controls that are not persistent playback chrome.
- `src/components/settings/`: app configuration, dependency, diagnostics, update, and device settings surfaces.
- `src/components/ui/`: low-level primitives only, such as buttons, menus, text rows, status icons, and typography helpers.

Do not place feature-specific behavior in `ui/`. A component belongs in `ui/` only when it can be reused without knowing about tracks, playlists, providers, lyrics, playback, or OBS.

### Performer Prompter Surface

With readable lyrics, preview the first line as the primary lyric before its onset, retain the latest positioned line through gaps and after the final end, and keep the following line secondary. Do not substitute a waiting placeholder for available lyrics. Reading location does not imply sung activity. A static accent underline may mark only the current T2／applied T1+ word from the existing lyrics cue projection; gaps and unknown timing stay plain. Preserve complete text and ruby when timing and reading partitions cross, using the shared cue-text grouping. Do not add continuous fill, cumulative underlines or timing inferred from reading partitions.

`PerformerSurface` is the reusable reading composition. Product mode (`prompter`／`remote`／`combined`) and reading distance (`near`／`desk`／`stage`) are separate explicit inputs; viewport width may reflow a mode but must not change its meaning or infer viewing distance. The Electron titlebar remains shell chrome outside the surface.

The Performer is a reading instrument, not an information dashboard. The current lyric is the only high-salience layer; reading aids and the next lyric recede through size, weight and spacing while retaining readable contrast on their actual background. The feature secondary foreground maps to the shared muted text role; next-cue ruby uses independent 14px／16px／18px near／desk／stage sizes instead of inheriting the current cue's 55% proportion. Track metadata／sync／reading controls form quiet edge chrome. Do not restore outlined status chips, full-width section dividers, decorative surfaces, or empty placeholders merely to preserve the previous layout. Optional context such as the next track is absent when there is no real value.

The surface owns a named size container and applies queries to its inner layout. Use existing `UiButton` and `UiSegmentedControl` behavior, `--ui-*` foundation／semantic roles, then the `--ui-performer-*` feature aliases for cue scale, reading scale, line measure, gap, and action target. Near／desk／stage use 72rem／64rem／56rem line measures and 16px／24px／32px comfortable cue gaps respectively; the distance-specific gap applies only at the 30rem comfortable-height tier, while shorter surfaces return to 16px. Coarse-pointer actions use `--ui-control-height-live`; desktop retains normal control density. Safe-area padding and a scrollable cue region keep the same component viable as a future mobile prompter, but they do not imply a mobile network transport.

The default Electron prompter is 960×540 so the primary cue stack has real vertical breathing room between quiet top／bottom chrome; 800×360 is its safety minimum, not a visible preset. At 30rem surface height and above, perimeter、major row and current／next cue spacing move to the comfortable tier; 24rem and below remains compact. Do not create breathing room with absolute offsets, hidden controls or a larger type scale.

Reading distance and native window geometry are independent authorities. Switching near／desk／stage changes typography, line measure and cue rhythm but never resizes or moves the BrowserWindow; fullscreen remains an explicit shell action. Electron main persists only validated normal bounds, debounces move／resize writes, flushes on close, and re-fits restored bounds to the current display work area with a 32px visible margin. Renderer code does not send geometry, and fullscreen／maximized dimensions never replace the saved normal bounds.

The Performer surface is live-reading and control chrome, so it explicitly prevents text selection with prefixed and standard `user-select: none`. Keep that ownership at the surface boundary: do not turn it into a global reset or apply it to the editable Lyrics workspace, OBS Overlay, or public error notices outside the surface. Native button and radiogroup focus／keyboard semantics remain intact.

Performer display settings use the shared Popover panel-style interface for a bounded 15rem width and semantic border outline; long recovery copy wraps inside the existing Scroll Region. Labels use muted text on the raised surface. Offset failures use `UiNotice` with its danger surface and retry action. The shared Segmented Control owns separate selected-foreground and selected-indicator tokens: readable text plus an inset boundary, with an independent focus outline and a forced-colors selection fallback. Feature code does not override the primitive's selected paint.

`PerformerActionBar` uses three `UiButtonGroup` regions for play／pause, lyrics sync, and display tools, with vertical `UiSeparator` between regions. `UiButtonGroup` owns the joined borders, flat child corners and inset focus for both `UiButton` and `UiIconButton`. Icon actions retain Tooltip and accessible names. Sync remains limited to delay 0.1 seconds, reset, advance 0.1 seconds and retry, with its offset, saving and bounded public errors visible. A `UiPopover` contains the shared reading preference and the independent reading-distance controls. Play／pause and reading choices emit bounded intents to the main renderer; the HTML audio element and canonical composables retain authority. Queue, track skipping, source selection, timing authoring, filenames and arbitrary offset entry stay outside the surface. The full authority, reuse-tier, RWD specimen, and future mobile boundary are defined by [Performer 提詞與窄域控制契約](docs/contracts/performer-prompter-contract.md).

### Buttons

- **Shape:** compact rounded rectangle (`0.375rem`) for tool buttons; circular only when the control is a true transport action.
- **Primary:** accent-filled, used sparingly for the main action in a local context.
- **Ghost:** transparent at rest, neutral hover fill, used for toolbar and repeated actions.
- **Destructive intent:** use `intent="danger"` only for irreversible deletion or an explicitly confirmed loss. Keep it orthogonal to Accent／Secondary／Ghost hierarchy; do not add a parallel `danger` variant or infer danger from a label containing「清除」、「停止」or「取消」.
- **Action confirmation scope:** immediate persisted cover／photo removal and playlist membership loss use the existing confirmation owner; artwork draft removal remains neutral until the editor's Save. Automatically saved annotation merges require confirmation when they remove boundaries／roles. BGM Emergency Cut retains its explicitly defined danger emphasis and immediate response. Cross-feature decisions and stale-target guards are documented in the [action intent contract](docs/contracts/action-intent-and-confirmation.md).
- **Focus:** visible 2px focus ring with 1-2px offset.
- **Touch baseline:** desktop buttons can be compact, but touch-responsive surfaces should preserve at least `44pt` iOS / `48dp` Android target guidance.

### Inputs / Fields

- **Notification drag geometry:** Keep list FLIP／entry／exit on a stationary outer item and drag translation on a separate inner card. Capture the outer item on press, but require a 12px dead zone and 1.5:1 horizontal intent before moving. Dismiss only on release after visible travel reaches 35% of the card width, with a 72px floor; crossing and returning before release cancels dismissal. Clamp travel to one card width and clip it to the original notification frame. Successful swipes exit in the same direction inside that frame without snapping back; cancellation restores the card and remaining timer. Verify dense forward／reverse pointer traces and fast first moves across the frame, including native capture／cancel, alongside list reordering.

- **Grouped fields:** `UiField group` reuses Field label／hint typography for multiple controls, associates its visible label through `aria-labelledby`, and avoids an HTML label targeting a non-labelable group. Lyrics display controls order source／text／reading／font size, compose neutral `UiIconButton` controls inside `UiButtonGroup`, and leave paint／focus to those primitives.
- **Style:** tonal surface or transparent field with visible border.
- **Focus:** border or ring shift, never color-only.
- **Error / Disabled:** semantic state tokens plus text/icon support.
- **Button disabled semantics:** `UiButton`／`UiIconButton` preserve focus and Tooltip access for `aria-disabled="true"`, but capture guards block click and Enter／Space activation before caller listeners and native submit／reset defaults. Native `disabled` and `loading` still remove the control from keyboard navigation. All hover／pressed rules exclude both disabled paths; focus stays visible and disabled opacity／variant colors reuse existing tokens. Clearing ARIA-disabled restores normal actions without changing caller-owned toggle state.
- **Input catalogue coverage:** RadioGroup, Switch and Combobox state pages directly compose their formal primitives. Demo-only shared CSS owns layout and captions, never control paint or forced interaction overrides. Fixed validation specimens stay distinct from value-driven recovery examples. RadioGroup recovery uses native disabled/unlock semantics; Switch and both Combobox trigger modes clear or restore Field errors from sample values. Reset also clears a pending Combobox query and popup. Theme and density remain global authorities.
- **Field validation precedence:** Text Field, Textarea, native Select, Color Field and both Combobox triggers keep `--ui-field-border-invalid` authoritative during hover／focus／press and disabled error states. Hover changes the field surface without hiding its error border; the focus outline remains independent. Color Field's picker and text entry share the Field validation projection. Only the caller clearing validation (and an invalid color draft becoming valid) restores the normal border; interaction alone never does.
- **Checkbox / Radio boundaries:** the indicator's resting border uses `--ui-color-control-boundary`, distinct from decorative borders. It reuses Neutral 300 in dark surfaces and Chrome, and Neutral 500 in light surfaces, preserving at least 3:1 against normal, raised, hover and selected surfaces. Checkbox hover has lower specificity than checked／mixed fill and invalid borders; focus remains an independent outline and disabled controls suppress hover feedback.
- **Switch validation:** the resting track border reuses `--ui-color-control-boundary`. Invalid uses `--ui-color-danger` for the track border throughout hover／focus／press and disabled states, while checked fill and thumb position continue to describe the value. Focus remains an independent outline and disabled retains its shared opacity. Only clearing both caller validation inputs (`invalid` and `error`) restores the normal boundary; toggling alone does not clear validation.
- **Radio identity:** DOM option IDs use a Vue instance namespace and a lossless typed key, so Unicode／punctuation and numeric／string IDs remain distinct across groups and reorder. Labels target their own input. The caller retains native group naming and the original domain value; native radio inputs own keyboard navigation and disabled behavior.
- **Inline choice geometry:** Radio list and Switch align their indicator to the first Label line, independent of wrapping and supporting copy. Block padding derives from half the difference between `--ui-control-height` and the actual Label line box (`1lh`), matching Standard 36px／Compact 32px targets without a new spacing tier. Radio list centers its indicator within that first line; Switch centers its track within the target's first row and keeps its native input over the complete main label row, excluding the separate hint／error. Radio tiles retain their indicator-above-copy anatomy. The Checkbox catalogue delegates to the production primitive; forced hover previews apply only to unchecked indicators so checked／mixed marks keep their contrast.
- **Mobile / responsive:** respect safe-area and keyboard insets when used in narrow surfaces.
- **Choice controls:** keep `UiSelect` native for short, fixed choices whose options need no custom anatomy. Use `UiCombobox` for long or growing datasets that need filtering, semantic groups or rich option presentation; flat items and grouped `{ label, options }` entries share one selected-value and keyboard order. Editable consumers keep focus on the input and search `searchText`; closed-set consumers use the same primitive with `editable="false"`, which renders a real select-only button trigger instead of a readonly input. Its teleported listbox uses `UiScrollRegion` as the only owner allowed to hide native scrollbar chrome while retaining a visible overlay thumb. Pointer hover and keyboard navigation share one active-option state, while selection uses a fixed trailing indicator. Do not add a generic feature-local Dropdown or globally hide scrollbars to restyle an OS-owned `<select>` popup.
- **Combobox sizing and truncation:** the listbox border box matches its trigger, including parent layout resizing; the anchor observer follows trigger-mode changes and disconnects on unmount. Both the selected value and option text own their single-line ellipsis, leaving the arrow and selection indicator visible. Lyrics source selection uses select-only `UiCombobox` for long saved labels, while the management action keeps its intrinsic width. Inside a Popover, a teleported listbox belongs to the panel only when a contained combobox references its ID through `aria-controls`; pointer and scroll remain inside that interaction boundary. Escape closes an expanded child first, then restores the parent trigger on the next Escape.
- **Action Menu spacing:** root and child menus share the Combobox `--ui-space-1` row gap, including pinned actions and scrolling results. Internal separators remove their own block margin because the list gap already supplies both sides; the pinned／results divider retains its existing margins. Icon, label, accessory and submenu-arrow columns use `--ui-space-2`, with fixed `--ui-space-4` icon／arrow slots. Labels ellipsize; accessory text is bounded within a column capped at half the available row width and ellipsizes inside that column, so long shortcuts or disabled reasons cannot displace the label or arrow. Fallback placement estimates include the row gap; native body scrolling remains the only scroll owner.
- **Disclosure and grouped actions:** Disclosure keeps native details／summary activation and mounted body drafts. Summary prose wraps unbroken tokens; a caller collapse returns focus from its own hidden body to summary, while external focus is preserved. Button Group is a labeled group of independent native buttons, without toolbar-style roving navigation or a group-level disabled API. Bound the group to available width and let the existing Button label ellipsize; the group owns one outer border and adjacent seams, including secondary／accent children. Child focus outlines use the shared inset offset within the clipped group boundary.
- **Feedback and status:** Notice titles and messages use the normal text token over semantic soft fills; its action composes the existing secondary Button recipe so resting text remains readable on every tone. Bound the action column and wrap unbroken prose; Hint also wraps long tokens, while the read-only Chip label ellipsizes within its container without shortening slot content. Chip info uses info-soft, and accent chips use normal text on accent-soft for AA contrast. Notification Host forwards action-disabled state, retains overlapping pointer／focus／hidden pauses across lifecycle or duration updates, and never re-arms a dismissed timeout on pointer leave. Same-id content changes preserve the remaining deadline; removing an id or unmounting clears its timer. Status Icon remains read-only: accessible label and tooltip update together, decorative mode suppresses duplicate meaning, caller events and external descriptions compose with tooltip bindings, and reduced motion suppresses spinning.
- **Notification geometry and dismissal:** Shell notifications share the expanded Right Dock width (272–384px) and its shell edge tokens, including the gap above PlayerBar. Keep the full text width without a top close icon or its reserved lane. Purpose variants own footer policy independently of tone: result, recovery and progress show only their supplied actions, while confirmation alone supplies an acknowledgement and remains persistent. Dismissibility does not add a default Close or Hide button; a caller may explicitly request one before its contextual Secondary action. Hiding a task never cancels it. Horizontal mouse／touch／pen drags exclude interactive origins and vertical gestures and preserve remaining time after cancellation; focused notifications also accept Escape, with a visible focus target when no button exists. Only transient results count down for six seconds; persistent and progress records remain owner-controlled. Inline Notice actions respond to the Notice content container, while a custom actions slot composes the fixed notification footer. The catalogue demonstrates the actual Host at both Dock widths instead of maintaining a second notification implementation.
- **Navigation identity and overflow:** Tabs and Segmented Control resolve keyboard targets by stable item id, including after item reordering. If an owned focused item disappears or becomes disabled, focus moves to the enabled tab stop after render; external focus is preserved, and item changes never rewrite the caller-owned selected value. Selected surfaces remain authoritative during hover; disabled selection retains its indicator with the shared disabled opacity. Tabs use inherited direction for horizontal arrows; Segmented Control retains its radio-group arrow policy and explicit reselect behavior. Content-sized horizontal controls scroll full labels; equal-width Tabs and bounded vertical segments ellipsize inside their label slot while keeping the after slot separate. Breadcrumb uses native button／link keyboard behavior, guards disabled segments, and marks only the final non-interactive segment current; segment labels retain the existing width token.
- **Text input spacing:** Text Field retains the shared field inline inset without an unused accessory slot. Search Box uses `--ui-space-2` between its leading icon (or divided icon cell) and editable text, and between the text area and the separate clear-button hit target. Its existing `--ui-search-clear-hit-size` remains intact; glyph spacing inside that target is distinct from the decorative Select／Combobox arrow slot. Text inputs retain native horizontal caret scrolling for long values instead of applying closed-choice ellipsis or shortening stored text.
- **Native Select spacing:** the closed control uses the same `--ui-space-4` decorative arrow slot and `--ui-space-2` text gap as Combobox, inside the existing field inline inset. Selected text ellipsizes without shortening option labels or values; the decorative arrow never intercepts pointer input and follows disabled opacity. The real `<select>` retains native keyboard behavior, grouping and platform popup sizing／highlighting. Action Menu shares the 8px content gap; its separate option-row layout does not apply to OS-owned Select popups.
- **Combobox spacing:** flat list entries and options within a semantic group use `--ui-space-1` between row surfaces. The trigger reserves the arrow width plus a separate `--ui-space-2` text gap; truncation never consumes that gap. Option text retains its `--ui-space-2` separation from the fixed selection indicator. These spaces are shared by editable and select-only triggers in both densities; the existing floating list inset and row hit heights stay independent.
- **Combobox IME ownership:** composition lifecycle, native `isComposing`, and the IME compatibility key code 229 leave key handling to the input method. They never navigate, dismiss or commit a list option. A new ordinary Enter after composition confirms the highlighted choice; blur, disabled changes and editable-mode changes clear unfinished composition state.

- **Page Header wrapping:** title and description keep complete text and allow unbroken content to wrap. The title／actions row wraps with the shared space-3 gap; the actions group wraps within its available width using space-2. A short title returns to one row when space is restored, and caller-owned heading ids remain intact.

### Lists / Tables

- **Artist credits:** `TrackArtistCredits` preserves the canonical credit order and each artist's intrinsic text width. One shared viewport truncates only the trailing content and paints a single ellipsis; earlier artists never shrink to make room for later credits. The complete line remains available in the overflow tooltip, and each resolved artist retains its own native navigation button. Keyboard focus reveals later credits and leaving the line restores its beginning; pointer focus keeps the clicked text stationary.

- **Track rows:** stable thumbnail slot, title/artist stack, optional duration, optional trailing actions. `UiTrackRow` remains the feature-agnostic anatomy／interaction primitive. Product surfaces that need verified local identity destinations compose `TrackIdentityRow` with `navigation="album"`, `"artist"` or `"identity"`; its default `"none"` keeps title and artist as plain metadata. Album title actions render only when membership resolves, artist actions continue to use canonical `TrackArtistCredits` pairing, and unavailable destinations leave no disabled or misleading CTA. The adapter emits `navigate` before the existing Library transition so a Modal or Dock may dismiss itself first; artwork remains caller-owned because it may mean playback or preview instead of album navigation.
- **Alignment:** text columns left; numeric/time columns may align right.
- **State:** selected, hover, loading, processing, unavailable, and error states must be visually distinct.
- **Initial data reads:** Sidebar collections, track tables and related-album grids compose the existing `UiSkeleton` within their owning layout. Keep fixed navigation and table headings available; use the same row density, column projection, card artwork size and grid spacing as real content. Reserve geometry immediately and reveal placeholders only after 180ms through `useDeferredLoading`. A valid read for the same navigation identity replaces its placeholder immediately; only content replacing a visible skeleton receives the shared `ui-loading-content-enter` opacity animation, using `--ui-motion-duration-fast` (140ms) and `--ui-motion-easing-enter`. The whole content region enters once, without a skeleton exit delay, row stagger, spatial movement or cross-region sequence. Fast reads, empty/error states, background refresh and destination changes do not inherit another read's animation. Native animation completion clears the entry state, and reduced motion zeroes the existing duration token. The data owner rejects superseded success/error/finally effects by request revision, preserves serialized playlist mutations, and distinguishes an initial read (including a retry before the first successful read) from background refresh; existing content stays visible during refresh, including a failed refresh. Announce one loading status per region and keep placeholder shapes out of the accessibility tree.
- **Drag:** drag handles and thumbnails must not trigger accidental text/image selection.

### Navigation

- **Desktop:** sidebar or panel navigation is acceptable for the control panel.
- **Responsive web:** collapse navigation structurally; do not rely on fluid typography.
- **Native-reference guidance:** if a mobile shell is ever built, iOS should preserve safe areas and edge-swipe expectations; Android should honor system Back and Material navigation patterns.

### Panels / Menus

- **Preparation collection modals:** Import review and accompaniment preview use the wide／medium workspace `UiModal` with `selectable=false`. `PreparationReviewLayout` fixes one source-name／total line and an optional storage estimate above one `UiScrollLayout`; its notice slot alone remains text-selectable. Selection counts stay in the Import footer, and section headings own their status counts. Both lists hide duration, use ellipsis, lazy／async artwork and state surfaces, and stack their two columns below the same 42rem container breakpoint. Modal rows inherit the renderer's Standard／Compact density through the root overlay, with a shared space-1 inline inset; they do not inherit the Dock's fixed-density map. `TrackIdentityRow` retains verified local artist navigation, while external Import rows keep selection／status intents. Import keeps its primary batch action in the shared footer, distinguishes this batch's「已完成」from「已在曲庫」and keeps draft selection separate from accepted batch details. Accepted details reopen by batch id even after a new source; closing or Escape leaves work running. The Dock delays active batch summaries by 180ms, uses fixed download-item counts with two concurrent slots, and retains failures plus the latest success; short tasks reveal their result without flashing a progress bar. Finalizing remains busy until collection persistence succeeds. Retry preserves completed tracks. Existing local members still synchronize without downloading again. Accompaniment batch entry stays in the external Dock; preview row actions remain per-track preparation and explicit regeneration. The existing session／queue owners retain all work state.

- **Playback destinations and motion:** Playback Info「開啟歌詞」opens Performance live lyrics; authoring remains an explicit「編輯歌詞」action, and its「返回歌詞」returns to live lyrics. Queue enters upward from the bottom PlayerBar and exits downward, including first mount, foreground switches and Dock collapse／restore. The Queue surface owns this displacement once; its parent does not add horizontal or vertical travel. Keep the full clipping box through exit, then snap to the local restore-control boundary. App and system reduced-motion preferences remove both travel and delayed collapse.

- **Progressive disclosure:** use `UiDisclosure` for collapsible settings groups. Its native `details` / `summary` owns disclosure interaction; slotted fields stay mounted while collapsed so drafts and lifecycle subscriptions survive. The feature owns error / setup-target expansion through `open` or `v-model:open`; recovery notices and actions that must remain available stay outside the collapsed body. `UiDisclosure` is an adopted production primitive, not a catalogue-only component.
- **Settings consistency:** `SettingsDocumentItem` owns the label, supporting copy, status and action axes; live process states opt into `statusLive` on the same status chip. Experimental lyrics uses the same rows and `UiDisclosure`, while its preview child mounts only after explicit expansion and cleans up on collapse. Keep unresolved rights and quality notices visible before download controls. Device and FFmpeg choices reuse `UiRadioGroup`; selecting a download source changes only the draft until an explicit apply action. The device picker uses the shared small Modal height bound with workspace body and one `UiScrollLayout`, preserving full device names and role aliases.
- **Settings simplification:** keep the necessary main action and one trailing overflow menu for maintenance; active cancellation and contextual error recovery stay visible. Global settings do not enumerate per-song processing history: analysis, language, cancellation, retry and application use the existing lyrics source context. Omit passive chips that merely repeat a count or description. SettingsSection supplies local content-sized control bounds: short numeric inputs, bounded text and select fields, and a 16–24rem capture-volume range that can shrink to its container. These bounds do not change shared primitive defaults or constrain the width needed by readable errors.

- **Panels:** use `surface` or `surface-raised`, with stable padding from the spacing scale.
- **Menus:** render above layout stacking contexts and group actions by intent.
- **Modals:** use only when interruption is necessary; prefer inline or progressive disclosure first.
- **Tooltip visibility ownership:** Hover and keyboard-visible focus independently keep a tooltip open. Losing either one must not dismiss it while the other remains; apply the close delay only after both leave. Escape dismisses immediately and cancels pending hover timers. Popover and Tooltip surfaces keep their own semantic background and foreground tokens when a trigger changes state.
- **Persistent settings popovers:** `UiPopover` and `UiCombobox` retain `closeOnScroll=true` by default. Lyrics settings, track columns, track density, performer display settings and matching catalogue examples opt out explicitly: sibling scrolling, incoming data and internal setting changes keep the surface open, while scrolling an anchor ancestor updates its position. Density selection updates its value without dismissing the settings. Outside pointer, trigger toggle and scoped Escape remain deliberate dismissal paths; a catalogue's explicit Done action may close it. Temporarily entering source management restores the settings popover on return, after the Modal has returned focus to the persistent trigger. The BGM source picker retains its existing close-after-success contract; Action Menu dismissal remains separate.
- **Waveform reference popover:** waveform authoring opts out of both scroll and outside-pointer dismissal so sentence editing can continue beside it. `UiPopover.closeOnOutsidePointer` remains true by default for other surfaces. Provide explicit close, trigger toggle and Escape; the title grip moves the reference panel by pointer or focused arrow keys within the viewport, with no saved position. The overview window and detail waveform use grab／grabbing for viewport navigation, preserve zoom and never seek or edit timing. Preserve the exact overview window width; make the entire overview draggable, so long tracks do not require grabbing a tiny frame. The focused overview supports arrows, Home／End and PageUp／Down with a visible focus ring. Keep previous／next buttons and omit a duplicate coarse slider. Use the existing accent for raw extrema, dashed foreground lines for saved sentence starts and a warning-color solid cursor with a top indicator; retain a time axis and center line. A pinned playhead with an upper time ruler and persistent current-time readout follows actual playback on opening; the overview keeps the absolute playhead visible. Manual viewport navigation exits following, and the location toggle restores it without playing or seeking. Paused playback freezes the viewport. Keep signal filtering outside this reference. See the [waveform contract](docs/contracts/lyrics-waveform.md).
- **Waveform readability:** a light outer envelope shows raw signed peaks; a stronger inner envelope shows measured cross-channel RMS energy on the same fixed scale, independent of playback volume. Clip these exact paths to emphasize the valid current sentence and overview window in accent, with neutral subdued signal outside; dense peaks must not hide the selection. Keep saved dashed and draft solid bounds in front of the signal, with vertical edges only at real endpoints. Unknown ends do not invent or highlight a range. Keep the sentence text above the ruler, label changed drafts and move inferred-end detail to its tooltip. Both themes reuse semantic tokens; overlays remain pointer-transparent. Color never implies a vocal or frequency classification.
- **Waveform information density:** combine navigation, current time, following and zoom into one row. Keep routine playback state in the timer's accessible description, while exceptional states stay visible. Move reload, clear cache and optional explanation／legend into the shared ActionMenu; its ellipsis is always the rightmost header action. Keep a nearby retry for failures. Omit repeated caveats, range labels and “local zoom” copy from the default panel.
- **Waveform asynchronous layout:** keep overview, controls, caption, ruler and canvas mounted with stable dimensions throughout reads and empty／error states. The caption reserves the shared control height for explicit sentence seek／play actions, the canvas 7rem and the timer 7ch. Reserve a 2rem status row below the canvas for notices and retry; never overlay the waveform or add temporary layout rows. Truncate long visible copy with the shared Tooltip and complete accessible text. Clear stale signal immediately; stable geometry must not depend on retaining invalid media. Navigation and zoom stay available while detail loads if overview remains valid. Verify delayed replies and continuous following frame by frame, including panel position, rather than comparing settled screenshots alone.
- **Waveform timing handles:** only an active, unlocked sentence draft exposes shared-button start／end handles at real visible endpoints, split between the top and bottom edges. Normal waveform dragging pans; handles preview the existing editor validation and commit once on release, with one undo and manual save. Pointer-down freezes following without transport changes. Keep hover hints hidden during dragging; Escape cancels that gesture before closing the popover when idle, using `UiPopover.closeOnEscape` with its unchanged true default. A distinct middle「移」handle shifts the whole draft through the same gesture owner and validation, including existing segments; unknown ends stay unknown and use the known start as the handle anchor. Unknown ends keep the existing explicit endpoint input. Sentence seek and play are separate caption actions through the existing lyrics／player owners; paused seeking stays paused, pending starts／arrangement work and unlinked tracks are unavailable. Existing separated playback is labelled as the current mix; no route or queue changes.
- **Modal keyboard ownership:** `UiModal` owns initial focus, Tab containment, stacked Escape and focus return. Mounting an already-open dialog follows the same focus path as opening an existing one. Focus the first available visible field, or the dialog itself when there is no field; never select a destructive button by default. Ignore delayed focus from an earlier open cycle or a lower dialog. Tab／Shift+Tab enter or wrap through available controls, and busy dialogs with no enabled controls retain focus on the dialog. Returning focus must not escape a still-open top modal. If disabling the submit control during a commit drops focus to the document body, unlocking a still-open top modal restores focus through the same first-field path; it preserves surviving field focus and ignores closed or covered dialogs. Feature dialogs reuse this mechanism and retain their own draft／save／cancel contracts; they do not add parallel focus scripts or local focus styling.
- **Modal scroll ownership:** `UiModal bodyMode="scroll"` remains the default body scroll owner. A bounded query／results workspace may opt into `bodyMode="workspace"`: the shell keeps its shared perimeter and a shrinkable grid body, while the caller composes a fixed query region and one `UiScrollLayout` for results. Do not nest a second active body scrollport or derive feature heights from viewport subtraction. Use `maxBlockSize` tokens independently of width; available-lyrics lists and search both use the small 35rem height cap, with natural height for short content. Their surface hierarchy is Raised shell → Surface collection／query → Canvas expanded preview; row state and status chips keep their own semantic roles.
- **Modal catalogue coverage:** The formal catalogue uses `UiModal` for dialog forms, scrollable document reading, bounded media and stacked dialogs, separately from the labelled unadopted Candidate. `closeDisabled` gates shell dismissal; caller-owned footer actions use the same lock. Unlocking restores dismissal without discarding the example state. Content uses existing spacing, typography and media-bound tokens; shell paint, density and focus remain primitive-owned.
- **Document notices:** `UiModal presentation="document"` uses semantic Surface with the Folder reading-sheet treatment, the existing Base font stack for headings, XS radius, 32px content inset and 24px section rhythm. It retains the shared scroll body and fixed footer; it does not add a separate focus or overlay owner. Feature-gate confirmation and re-reading dialogs use `size="wide"` with `max-block-size="medium"` (48rem width, 45rem height cap), constrained by the shared viewport bounds. Feature-gate notices use registry-owned document titles and paragraph headings alongside the canonical disclosure text. Chinese-numbered paragraphs follow the document reading order; confirmation and cancellation stay in the shared footer. Saving disables both actions and shell dismissal. This editorial presentation does not change notice versions or imply a signed contract.
- **Chinese document typography:** Prose reuses `--ui-font-family-base` (Microsoft JhengHei UI for Chinese) at the existing Body 16px／400／1.5 role. Document titles retain Heading 24px／700 in Base; section headings and markers use Base at 16px／600. Section headings use the Body 1.5 line height, keeping a 24px baseline with the prose. Paragraph gaps use Space 5／24px, heading-to-copy gaps Space 2／8px, and the Chinese marker lane Space 6／32px plus Space 2／8px item inset. Do not add a separate document font stack, tracking or duplicate first-line indentation; the numbered hanging layout owns paragraph structure. Controls and errors keep their existing UI font roles.
- **Re-reading gate notices:** Initial confirmation and the Settings information action share `AppFeatureNoticeDocument` and the canonical feature registry. The Settings action opens the same document presentation for reading, with shell close and Escape only; an enabled gate does not acquire another confirmation action. Keep the document markup and typography in the shared feature component instead of mirroring CSS in Settings.
- **Media presentation:** reuse `UiModal` mechanics without forcing its raised dialog anatomy onto a single image. `presentation="media"` is image-led、non-scrollable and shell-free; its square icon controls form an external vertical action rail at the image frame's inline-end and top edge instead of overlaying pixels or consuming a header row. Media close is the first DOM／Tab／visual action and caller tools follow below it; ordinary dialog tools still precede their final close control. The accessible dialog title stays available to assistive technology, and media supplies shared `72dvw × 70dvh` intrinsic bounds constrained again by the safe viewport inset after reserving the rail width and gap. Image callers may compose a shared material frame inside those bounds; the Modal itself does not own that feature material.
- **Short confirmations:** `AppConfirmationModal` is a decision surface, so it opts out of text selection locally; ordinary／diagnostic `UiModal` content stays selectable. Keep the hierarchy compact: action title, optional primary `subject` plus one short `meta`, then only the outcome and disclosure needed for the decision. Do not add a facts card／table, parse values from prose, render raw HTML, or emphasize an entire paragraph when one value carries the identity.

### Scroll Regions

- **Appearance:** use a transparent `0.75rem` overlay hit lane with a visually narrower `0.375rem` pill thumb. Default, hover, and active increase neutral contrast; Accent and status colors are not scrollbar states.
- **Density:** Standard and Compact keep the same lane geometry so a window-density change does not alter the drag target.
- **Thumb length:** derive length from the native viewport／content ratio, then clamp it to `2rem`／32px–`4.5rem`／72px. The cap avoids a long border-like thumb while the remaining rail travel still communicates scroll position and range.
- **Behavior ownership:** `UiScrollRegion` keeps its native overflow viewport as the wheel／keyboard／touch and scroll-position authority. It measures overflow, projects the thumb, and maps pointer drag back to native `scrollTop`／`scrollLeft`; the caller declares the axis and still owns content, overscroll, and scroll-driven dismissal behavior.
- **Layout ownership:** `UiScrollLayout` composes `UiScrollRegion` with one semantic content wrapper. It derives the active axis's visual safe reserve from `lane size - thumb inset` and adds caller-mapped logical padding without knowing Sidebar, Right Dock, modal, table, or page semantics.
- **Range boundary:** Header、Tabs、Toolbar and table headings stay outside the Scroll Region. Only the body／list that actually changes scroll position owns the rail, so the thumb never appears to cross fixed titles. `AppFolderPage` document mode maps its responsive perimeter into `UiScrollLayout`; workspace mode supplies a bounded non-scrolling body for named feature-owned pane regions. Folder navigation uses a raw horizontal `UiScrollRegion` with hidden chrome because it must not reserve a lane.
- **Visibility:** a feature may hide only the overlay chrome while retaining native scroll authority when its interaction shape requires it. The Playlist Sidebar does this in collapsed compact mode and restores automatic overflow chrome when fully expanded.
- **Layout:** the rail is absolutely overlaid at the scrollport edge, does not participate in content sizing, and is absent when that axis does not overflow. `UiScrollRegion` constrains its native viewport in a zero-minimum grid track, including when a flex parent caps the root height. `UiScrollLayout` defaults to `scrollbarReserve="stable"` so content geometry does not shift when overflow appears; `scrollbarReserve="overflow"` releases each axis's reserve when that axis fits. Hidden chrome releases both reserves. Tabs, Breadcrumb and horizontal Segmented Control compose through this layout owner, with at least `--ui-space-1` between the visible thumb and interactive content when overflowing; their local insets must not inherit a containing page's padding. Parent layouts must not reach into these primitives to add a second scrollbar lane. `scrollbar-gutter: stable` belongs only to an explicitly native, non-overlay consumer that has a demonstrated geometry-stability requirement; it is not the overlay default.
- **Consumer boundary:** `UiScrollRegion` never guesses content padding and feature components never repeat scrollbar arithmetic. `UiScrollLayout` adds the 9px visual safe reserve to a caller-owned logical inset. Side panels map the 4px row state-surface outset into that inset, so the row box ends 13px from the panel edge and state paint ends at the visible thumb's 9px inner edge. The viewport forms the lower stacking context and the rail stays above it, so positioned row content cannot paint over or intercept the scrollbar.
- **Accessibility:** the viewport remains keyboard-focusable, the visual rail is `aria-hidden`, and forced-colors uses system `Canvas`／`CanvasText`. Hiding native chrome is permitted only inside this local component because the visible overlay thumb preserves the overflow affordance.

### Sliders / Transport Controls

- **Sliders:** use for continuous values such as volume, pitch cents, and tempo rate.
- **Primitive ownership:** `UiRangeControl` owns the single native range input, authored track／fill／thumb, optional in-track stops and pointer-position preview. It also supports an opt-in numeric default: only an enabled caller that provides `defaultValue` converts right-click／keyboard context-menu intent into a bounded, step-aligned model update followed by a `reset` intent; disabled controls and consumers without a default preserve the native context menu. The caller remains responsible for persistence. Output appearance and performance adjustments with canonical domain defaults opt in explicitly: Transpose／Pitch／Speed and monitor／capture guide-vocal mix all reuse `PLAYER_AUDIO_DEFAULTS`; playback progress and playback／BGM volume remain transport controls and do not gain reset behavior merely because they reuse the primitive. `UiRange` adds Field label／hint／error and optional current-value output, and only forwards that optional default／reset contract; compact transport and tool recipes use the bare control instead of forcing a Field wrapper into dense chrome.
- **Appearance:** the production token system uses a neutral track and fill at rest, hides the thumb until hover／drag／focus, switches the fill to Accent during interaction, uses Accent Active while pressed, and lets invalid Danger override interaction color across the complete track (filled and unfilled) and thumb. Hover／focus／drag never clear validation; the caller's valid value clears the error and restores normal interaction colors. Disabled controls remain at 50% and show neither preview nor interaction thumb.
- **Preview:** mouse／pen movement previews the clamped, step-aligned pointer position without changing the model. The caller formats time, percentage, signed units or rate through `formatValue`; `valueText` continues to describe the current model for visible output and `aria-valuetext`. Touch does not open the hover preview.
- **Compatibility:** all production range consumers use this formal contract. Do not reintroduce native-appearance branches or duplicate Range aliases.
- **Steppers:** use for discrete increments such as semitone changes.
- **Transport:** play/pause/next/previous controls should be visually stable and never shift layout.

## Do's and Don'ts

### Do

- **Do** use rem-based spacing and type tokens as the baseline.
- **Do** define dark and light theme token values before declaring a visual direction complete.
- **Do** keep component states explicit: default, hover, focus, active, selected, disabled, loading, processing, error.
- **Do** place the primary action at the right end of a horizontal action group, with secondary actions before it; keep DOM and keyboard order aligned with the visual order.
- **Do** use iOS `44pt` and Android `48dp` touch-target guidance when designing narrow or touch-capable surfaces.
- **Do** separate control-panel tokens from OBS overlay tokens.
- **Do** design safe-area and keyboard-inset behavior for responsive or mobile-like surfaces.
- **Do** verify contrast and text fit with Japanese, Korean, Traditional Chinese, and English metadata.
- **Do** keep scroll position discoverable on mouse-operated desktop surfaces; derive overlay scrollbar chrome from the same semantic palette as other controls while preserving native scrolling as the authority.

### Don't

- **Don't** reintroduce the retired graphite／washed-teal baseline or use Folder material as the global accent.
- **Don't** use glow, glassmorphism, purple-blue gradients, beige/cream defaults, or decorative effects as the product identity.
- **Don't** use nested cards as page structure.
- **Don't** create hover-only controls that fail on touch.
- **Don't** hide every scrollbar globally once the shared Scroll Region appearance is adopted; keep hidden-scrollbar behavior explicit and local.
- **Don't** use viewport-fluid heading scales for dense product UI.
- **Don't** merge `--ovl-*` overlay tokens with control-panel `--ui-*` tokens.
- **Don't** reinvent iOS or Android native conventions if a future native surface is created.

The current-session workspace uses the same TrackTable ledger as archived performance playlists. Its performance-session profile delegates occurrence selection, edit, keyboard moves, play and menus to PerformanceSessionPlanList; table row keys remain itemId and no Library action is substituted. At narrow widths the feature repeats collapsed status in the identity subtitle while retaining its action lane. The Dock retains its compact track-list presentation. Current/archive sections use one ui-space-3 section gap and matching divider padding, with no additive margin; archive collection rows use ui-track-list-gap. Existing section headers retain their own content gap.

The current-session main board always uses Pending / Performance History tabs at every width. Each table occupies the full content width; switching tabs retains mounted panels and their state, with no width observer or side-by-side mode. Dock pending and completed lists omit visible ordinals while keeping occurrence identity, reorder actions and compact row geometry. Main-table ordinal behavior is unchanged.

Performance table identity columns consume the remaining width instead of leaving a growing empty spacer. Duration, performance status and action lanes sit together at the end edge; both current-session tabs share the same profile. Pure duration uses the existing typography and end alignment without the Library separation-control lane. Sidebar collection menus retain the ordinary Queue action and add an explicit Add to Performance Pending action; showing the performance Dock never silently changes the ordinary queue destination.

Lyrics shared text controls live in the shared Display popover for reading and authoring, outside template appearance. Keep one concise Output-only hint and complete candidate text with short line/action labels. Explicit bylines, vocal cues and paired round-parenthetical content default hidden; each Checkbox restores or hides that line’s eligible content without changing source text or timing. 全部還原 uses the existing accent primary action, aligned to the end edge. Vocal roles are painted from Edit → 標註聲部, not from this popover. Role changes save separately and survive restarting; changing source text resets session filtering and invalidates incompatible saved roles. Output Workbench labels supported presentation policies as 模板進階顯示 and distinguishes them from common source text processing. Live Stage defaults to Balanced for sung-content preservation; explicitly selected Broadcast Compact retains its behavior and shows the omission hint.

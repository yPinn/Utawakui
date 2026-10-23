---
version: 1
slug: 'overlay-cover-player'
primary_target: 'overlay/now-playing'
related_targets: ['src/components/output/previews/CoverPlayerPreview.vue']
---

# Cover player

Scope: public read-only Now Playing template, independent overlay tokens; existing art-card identity and lifecycle remain intact. User selected the Apple Music screenshot and approved the 480×640 study before authorizing adoption.

## Direction contract

THESIS: cover-led 3:4 player with album-derived dark color, square artwork, aligned metadata and thin progress rails.

FIRST VIEWPORT: 480×640 portrait, 24px padding, approximately 400px square cover. Title22px and artist18px align with full-width progress/time and volume rails. Short or long text stays one line with ellipsis; preserve element font-scale and visibility controls.

DETAIL: user allowed representative controls only, then clarified that faithful visual details such as volume should stay. Keep previous/play-or-pause/next and volume; omit favorite, more, shuffle and repeat. Public output remains read-only. Volume/mute, playback state and progress consume authoritative player projections. Mute shows zero with a muted speaker; unmute restores the player's stored level. Missing volume data hides that row's content while preserving layout.

MATERIAL: no screenshot or album-art asset ships. Existing validated artwork route and palette extraction supply the actual album and background. White text over dark color-derived gradients, rounded cover and card corners. Missing artwork retains a title-initial fallback.

VERIFY: compare480×640 with320×427 visible Electron captures; cover square, rails aligned, no overlap, long metadata, large font, missing artwork, playing/paused/seek, element hiding and art-card roundtrip. Thumbnail uses distributable synthetic artwork, never the user-reference album.

Existing DESIGN.md remains control-panel authority; this narrow template replacement does not redesign the app. Finish with independent source/visual review and provenance.

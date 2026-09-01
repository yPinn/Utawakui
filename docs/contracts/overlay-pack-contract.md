# Overlay Pack Contract

## Status and scope

Draft planning contract, 2026-08-23. It elaborates
[ADR 0011](../adr/0011-overlay-instances-and-presentation-pack-delivery.md).
The current app implements three fixed slots, placeholder `styleSetIds`, and an
app-bundled fallback CSS cascade that keeps those routes independent from future
pack installation. No remote Presentation Pack updater or User Variant import
exists yet.

This contract deliberately separates executable template runtime from declarative
appearance content. Examples are illustrative until backed by JSON Schema
2020-12, fixtures, and compatibility tests.

## Domain objects

| Object                     | Identity and responsibility                             | Trust / delivery         |
| -------------------------- | ------------------------------------------------------- | ------------------------ |
| Output Instance            | Stable OBS endpoint and selected appearance             | User config              |
| Template                   | Layout, motion recipe, renderer, settings schema        | Signed app runtime       |
| Template Category          | Gallery discovery metadata only                         | App or official catalog  |
| Official Presentation Pack | Style Sets, parameters, assets, previews, licenses      | Verified content updater |
| Official Style Set         | Named default values for compatible templates           | Inside official pack     |
| User Variant               | Allowlisted override diff against an Official Style Set | Local or shared data     |
| Feedback Record            | Optional style context plus user request                | Untrusted outbound data  |

Template ids must not encode the instance id, category, or style id. A template
declares its canonical data requirements, renderer capability, exposed settings,
and compatible pack contract independently.

## Shared host and reusable building blocks

The Overlay host is shared infrastructure, not part of any visual identity. It
owns canonical state subscription, playback-clock projection, pack resolution,
font and asset loading, safe-area measurement, reduced-motion/performance policy,
renderer capability detection, error fallback, and lifecycle cleanup.

It consumes the Projection Hub contract from ADR 0012 and treats `bootId` and
`sourceEpoch` changes as interpolation discontinuities. It never connects directly
to OBS WebSocket, VTube Studio, VMC/OSC, Shoost, or a native texture transport;
those connections belong to main-owned adapters under ADR 0013.

App-owned templates compose a small reusable catalog rather than copying complete
pages. The initial catalog should cover these roles conceptually:

- track identity, now/next metadata, and artwork-with-fallback;
- queue window and stable item transitions;
- lyric line, segment progress mask, next-line preview, and optional reading row;
- bounded text fitting, overflow, alignment, safe-area, and surface containers;
- decoration layers that consume asset ids instead of URLs;
- one animation host tied to the canonical clock; and
- one optional GPU-canvas host with capability and static fallback handling.

These are product components and recipes distributed with the app. Community
ideas may become new catalog entries through review, tests, rights checks, and an
app release. Presentation Packs can parameterize and decorate them but cannot
replace their implementation.

## Styling composition and adjustment levels

The target CSS composition keeps source ownership visible even if physical files
are reorganized later:

1. reset and containment;
2. app-bundled fallback primitives;
3. shared semantic roles;
4. reusable template-family roles, such as Track or Lyrics;
5. concrete template roles; and
6. resolved Official Style Set and User Variant values, followed by mandatory
   accessibility/performance constraints.

CSS cascade layers may enforce that order, but token hierarchy is still a
separate semantic model. Pack data is converted to validated custom-property
values by the host; a pack never injects a stylesheet or arbitrary property name.

The implemented fixed-route baseline uses explicit layers in this order:

- `base.css`: `ovl-reset` plus final `ovl-constraints`;
- `fallback.css`: app-bundled `ovl-fallback` primitive values;
- `tokens.css`: shared `ovl-semantic` roles and current allowlisted
  `ovl-appearance` settings; and
- each route's CSS: app-owned `ovl-template` layout and presentation rules.

All four HTML routes load those assets in the same order. The fallback is a
release-bundled recovery baseline, not an Official Style Set. Future validated
pack values resolve into the appearance layer and must not replace reset,
template behavior, or mandatory constraints.

Every exposed setting has one product-owned definition, type, default, bounds,
compatible template list, and user-facing label. Adjustment is classified as:

- **Locked invariant:** state binding, DOM structure, renderer choice, timing
  ownership, security, accessibility minimums, and hard performance ceilings;
- **Safe appearance:** palette roles, typography role, scale, weight, alignment,
  surface, spacing density, and allowlisted decoration choice;
- **Bounded motion/composition:** enable/disable, intensity, duration, stagger,
  particle density, crop/focus, and layout variants within template-declared
  ranges; and
- **Advanced asset selection:** only compatible verified asset ids, never upload
  paths or URLs.

The first User Variant delivery should prioritize safe appearance settings. A
bounded motion/composition setting is added only when its extremes are tested in
all compatible templates. Locked invariants are never exported or made editable.

## Presentation Pack manifest

An official pack includes a small manifest and immutable content-addressed assets.
A planning example is:

```json
{
  "schemaVersion": 1,
  "packId": "official.neon-stage",
  "packVersion": "1.2.0",
  "minAppVersion": "0.8.0",
  "contractVersion": 1,
  "capabilities": ["dom", "svg", "font"],
  "styleSets": [
    {
      "styleSetId": "set-a",
      "name": "Neon Stage A",
      "compatibleTemplates": ["track.now-next", "track.art-card"],
      "tokens": {
        "color.accent": "#66e3ff",
        "type.display": "font.display-01"
      },
      "recipeParameters": {
        "enterDurationMs": 480,
        "accentIntensity": 0.7
      }
    }
  ],
  "assets": [
    {
      "assetId": "font.display-01",
      "path": "assets/display.woff2",
      "sha256": "<lowercase hex digest>",
      "size": 123456,
      "mediaType": "font/woff2",
      "licenseId": "OFL-1.1",
      "redistributable": true
    }
  ]
}
```

`packVersion`, pack `schemaVersion`, presentation `contractVersion`, Output
contract version, and application version are independent. Compatibility is
resolved before activation. Unknown required capabilities or schema versions fail
closed.

The manifest cannot contain executable script, inline CSS, HTML, shader source,
remote URL dependencies, post-install hooks, or migration code. Recipe parameters
must match bounds declared by the app-owned template.

## User Variant resolution

A User Variant stores only a diff:

```json
{
  "schemaVersion": 1,
  "variantId": "var_01J...",
  "name": "My Set A prime",
  "base": {
    "packId": "official.neon-stage",
    "styleSetId": "set-a",
    "versionPolicy": "follow-compatible"
  },
  "overrides": {
    "color.accent": "#ff70c8",
    "enterDurationMs": 560
  }
}
```

Allowed values are bounded numbers, booleans, enums, validated colors, text-role
values, font ids, and asset ids explicitly exposed by the template. Values are
clamped or rejected at the trust boundary. Unsupported setting ids are ignored at
render time but preserved in storage so rollback does not destroy user intent.

Resolution order is template fallback, Official Style Set, User Variant, then
mandatory accessibility and performance constraints. `follow-compatible` is the
default. A `pinned` policy may name an exact pack version; the UI must communicate
that it no longer receives compatible style changes automatically.

### Sharing

- `.utawakui-style` is the portable JSON representation of one User Variant.
- `UTS1.<base64url>.<checksum>` is an optional compact encoding of the same
  schema, not a separate capability.
- The checksum detects transcription errors only. It is not a signature, trust
  signal, or publication authority; decoded data passes the same untrusted import
  validation as a file.
- Local-only fonts are omitted or replaced by a declared fallback.
- A variant cannot embed binary assets. Redistributable assets and their licenses
  require a `.utawakui-pack` import/export container.
- Imports never resolve URLs or absolute paths and never gain executable
  capability through an unknown field.

## Output Instance target model

The future `overlays.json` revision stores independently named instances and
reusable variants. A planning example is:

```json
{
  "version": 3,
  "instances": [
    {
      "instanceId": "now-playing",
      "name": "Now Playing",
      "templateId": "track.now-next",
      "variantId": "var_01J...",
      "enabled": true
    }
  ],
  "variants": []
}
```

The canonical endpoint is `/overlay/slot/<instanceId>`. The existing Setlist,
Lyrics and Now Playing routes become aliases to migrated default instances. The
current Now Playing instance already owns Compact CD, 黑膠主題 and Cover
Player templates; a future need for two simultaneous track layouts creates a
second instance instead of restoring a template-specific route.

The instance stores ids and bounded settings only. It never stores live playback
state, absolute asset paths, media URLs, executable content, or provider secrets.

## Installation and activation

The main process owns the content updater and storage. The sequence is:

1. refresh and verify TUF metadata from the embedded root of trust;
2. download a target to `staging` with declared size limits;
3. verify target hash, schema, compatibility, asset metadata, and asset policy;
4. move the pack into an immutable `packs/<packId>/<packVersion>` directory;
5. atomically update an active pointer when activation is safe; and
6. retain the previous known-good version and app-bundled fallback.

Failed or suspicious content moves to `quarantine` with bounded diagnostic
metadata. Partial staging data is never served. A runtime resolves and pins one
exact version for its lifetime. Activation waits for no active clients, explicit
confirmation, or the next session; a background download alone does not alter a
live scene.

Offline startup uses the last verified active version. If it is unavailable or
incompatible, the previous known-good pack is attempted, then the immutable
built-in fallback. User Variants remain separate from pack directories throughout
rollback and update.

## Feedback record

Contextual feedback and global style requests use one bounded schema:

```json
{
  "schemaVersion": 1,
  "kind": "style-feedback",
  "message": "Please add a calmer entrance option.",
  "category": "missing-adjustment",
  "context": {
    "templateId": "track.now-next",
    "packId": "official.neon-stage",
    "packVersion": "1.2.0",
    "styleSetId": "set-a"
  },
  "reference": {
    "url": "https://www.youtube.com/watch?v=example",
    "startSeconds": 42,
    "endSeconds": 55,
    "note": "Text entrance only"
  }
}
```

`context` and `reference` are optional. Suggested categories include existing
style issue, missing adjustment, new style, motion/text reference, 2D/3D
reference, and other. The first implementation may prefill a fixed official HTTPS
form rather than POST from the app.

Only bounded HTTPS reference URLs are accepted. The app does not fetch their
metadata or media. It never auto-attaches lyrics, track/library metadata, local
paths, installed-font lists, screenshots, or OBS URLs. Any future screenshot or
file attachment needs a separate explicit-consent design.

## Compatibility and lifecycle requirements

- Templates expose stable setting ids and declare whether changes are compatible.
- Breaking setting semantics require a major or contract change.
- Templates have mount, apply, update, resize, and destroy lifecycle boundaries.
- Song-synchronized renderers follow the canonical host playback clock.
- One instance owns at most one GPU canvas and must provide a non-GPU fallback.
- Reduced-motion and aggregate performance constraints can override pack values.
- Gallery previews prefer static media; they do not instantiate every WebGL
  template simultaneously.
- A connected WebSocket does not mean assets or renderer initialization succeeded;
  capability and ready-state diagnostics remain an implementation requirement.

## Non-goals for the first delivery

- remote executable JavaScript, CSS, HTML, or shader packs;
- an open community marketplace;
- automatic import of copyrighted video visuals, fonts, models, or logos;
- mid-song pack activation;
- arbitrary local file references;
- song-specific M3 choreography authoring; and
- a full in-app social feedback service.

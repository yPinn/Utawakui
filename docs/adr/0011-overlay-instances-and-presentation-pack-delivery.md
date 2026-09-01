# ADR 0011: Overlay Instances and Presentation Pack Delivery

## Status

Accepted for planning on 2026-08-23; revised on 2026-09-01. The existing three-slot runtime and explicit
app-bundled fallback cascade are the implemented baseline; the instance and pack
model described here is not yet implemented.

## Context

The current Output model has three fixed slots: `now-playing`, `setlist`, and
`lyrics`. The earlier Artwork slot duplicated Now Playing's job and left the
Workbench split across two categories for the same track-information workflow.
Because no released user or OBS scene depended on that route, 黑膠主題 and
Cover Player were folded into Now Playing without a compatibility alias. The
fixed-slot model still conflates an OBS endpoint, a template category, a concrete
template, and its data needs, which the planned instance model must separate.

The product also needs to distinguish executable template behavior from remotely
updated appearance content. Official Style Sets A/B/C should update without an
application release, while a user should be able to derive and share A-prime
without receiving permission to run arbitrary HTML, CSS, JavaScript, shaders, or
filesystem paths. Feedback about an existing set and requests for an entirely new
style need different entry points but do not require two unrelated backends.

## Decision

### Separate instance, template, category, and data requirements

- An **Output Instance** is a stable, independently configurable OBS endpoint.
- A **Template** is app-owned layout, renderer, and motion behavior.
- A **Template Category** is Gallery metadata used only for discovery.
- **Data Requirements** declare which canonical projections a template consumes,
  such as track, queue, lyrics, or artwork.

Compact CD, 黑膠主題 and Cover Player are members of one Track template
family and share one current `now-playing` instance, tokens, components and
canonical track frame. Lyrics and Setlist remain independent default instances.
Future scene/composite templates and multiple instances of the same category are
allowed without changing the meaning of a template id. If simultaneous compact
and cover layouts become a demonstrated need, users create a second Track
instance instead of relying on a template-specific default route.

The future canonical route is `/overlay/slot/<instanceId>`. Existing routes stay
as aliases to their default instances:

- `/overlay/now-playing`
- `/overlay/lyrics`
- `/overlay/setlist`

Performer Self-View remains a local Electron window and is not a public Output
Instance.

### Keep executable runtime in the application

Overlay delivery has three trust levels:

1. **App-owned Template Runtime** contains DOM/SVG layout behavior, GSAP recipes,
   render adapters, validators, and any executable JavaScript or shader code. It
   initially ships only through signed application releases.
2. **Official Presentation Packs** contain declarative catalog records, Official
   Style Sets, token defaults, bounded motion parameters, previews, license
   metadata, and validated assets such as fonts, images, sanitized SVG, GLB,
   Lottie, or Rive files. They may hot-update independently.
3. **User Variants** contain only an allowlisted override diff referencing an
   Official Style Set.

A future independently updated executable template is a signed code-pack problem
with a larger trust boundary. It requires a separate ADR and is explicitly
deferred. Community distribution initially covers declarative variants or packs,
not executable components.

### Use GSAP as the Overlay choreography core

GSAP owns timelines, sequencing, playhead synchronization, and lifecycle cleanup.
CSS transitions or native Web Animations remain acceptable for simple,
independent, non-song-synchronized effects. Motion is not included in the Overlay
bundle; it may be evaluated separately for control-panel gestures or layout
animation when a concrete need appears.

DOM, CSS, and SVG are the default renderer. PixiJS is an optional 2D GPU adapter,
and Three.js is the only planned 3D adapter. Renderer-local clocks such as a
Three.js mixer, Rive state machine, Lottie timeline, or shader uniform must be
seekable from the host's canonical playback clock when synchronized to a song.
Two engines must not own the same animated property or timeline.

Every template implements a host lifecycle equivalent to `mount`, `apply`,
`update`, `resize`, and `destroy`. Cleanup, deterministic random seeds, reduced
motion, context-loss fallback, and bounded performance profiles are contract
requirements rather than template conventions.

### Separate token semantics from CSS cascade ownership

Token hierarchy and CSS source order are independent concerns:

- primitive values belong to an Official Style Set;
- semantic roles translate those primitives into reusable intent;
- template/component roles consume the semantic roles; and
- User Variant overrides may change only explicitly exposed settings.

Shared core CSS owns reset, accessibility, containment, layout invariants, and
fallbacks. It must not impose a visual identity. A Presentation Pack supplies the
palette, typography, decoration references, and bounded recipe parameters. User
overrides are applied last, followed by mandatory accessibility and performance
constraints.

The current fixed routes implement that ownership boundary through ordered
`ovl-reset`, `ovl-fallback`, `ovl-semantic`, `ovl-template`, `ovl-appearance`, and
`ovl-constraints` cascade layers. `fallback.css` ships inside the application and
is served from the explicit loopback allowlist, so missing future pack content
cannot make a route depend on an unavailable stylesheet. This is fallback
delivery only; it does not make placeholder `styleSetIds` resolvable packs.

### Deliver official packs through a separate verified updater

Presentation Pack updates do not use Electron's application updater. The app
embeds a trusted TUF root and the main process alone downloads, verifies, and
installs targets using TUF metadata, content digests, size limits, schema checks,
compatibility checks, and asset preflight.

Machine-local storage is under `userData/overlay-content/`:

```text
overlay-content/
  trust/
  metadata/
  staging/
  packs/<packId>/<packVersion>/
  active/
  quarantine/
```

Installation is staged and then activated by an atomic pointer. The current
version, previous known-good version, and an immutable app-bundled fallback are
retained. Hot update means independently downloadable, not an automatic mid-song
visual replacement. A downloaded pack activates when no active Output clients
are using it, on explicit confirmation, or at the next session. Each running
instance pins an exact resolved pack version.

Remote official publication prefers a small manifest plus immutable hashed
assets. ZIP remains an import/export container for user-facing
`.utawakui-pack` files, not the update authority. `packVersion`, `schemaVersion`,
Output `contractVersion`, `minAppVersion`, and capabilities are versioned
independently. Declarative documents will use JSON Schema 2020-12 and fail closed.

### Model Official Style Sets and A-prime as inheritance

An Official Presentation Pack may provide Sets A, B, and C. A user creates A-prime
as a User Variant referencing A and saves only the override diff. Resolution is:

1. template fallback;
2. Official Style Set defaults;
3. User Variant overrides;
4. accessibility and performance constraints.

Variants follow compatible pack updates by default and may optionally pin a pack
version. Removing an exposed setting causes it to be ignored at runtime but
preserved in storage for rollback. Breaking setting semantics require a major or
contract version change; packs cannot run migration JavaScript.

Portable variants use declarative `.utawakui-style` JSON. A short share code may
encode the same schema as `UTS1.<base64url>.<checksum>`. Both permit bounded
numbers, enums, colors, text roles, font ids, and asset ids only. They reject
JavaScript, CSS, HTML, shaders, URLs, absolute paths, and machine-local font
references. Redistributable assets require a full pack and license metadata.

### Unify feedback records, not feedback entry points

The product exposes two paths:

- contextual feedback for a specific template/style-set/version, optionally
  including a User Variant diff or share code; and
- a global new-style request containing free text and optional category,
  reference-video URL, time range, and note.

Both map to one feedback schema with optional context. Initially they may open a
fixed official HTTPS form, avoiding a premature in-app submission service.
Reference videos are URL-only: the app does not upload, download, or automatically
inspect them. Lyrics, library data, local paths, local fonts, screenshots, and OBS
URLs are never attached automatically.

The writable, untrusted, rate-limited feedback plane is isolated from the signed,
read-only update plane. Feedback cannot become an official asset without
moderation, rights review, compatibility testing, signing, and publication.

### Treat asset safety, licensing, and aggregate OBS cost as gates

The concrete validation policy is maintained in
[`docs/contracts/overlay-asset-security.md`](../contracts/overlay-asset-security.md). It includes
archive traversal and bomb protection, MIME/magic/digest checks, SVG sanitation,
embedded-only GLB dependencies, decode and GPU budgets, font redistribution
metadata, CSP restrictions, and quarantine behavior.

Performance budgets apply across all simultaneously active OBS Browser Sources.
Each instance may own at most one GPU canvas; DPR, FPS, textures, particles, and
triangles are bounded. Hidden output pauses work, context loss falls back safely,
and Gallery must not keep many live WebGL previews. A WebSocket client count is
not proof that a template or its assets initialized successfully; capability
preflight and renderer diagnostics are future requirements.

### Keep external integrations outside the presentation runtime

Browser Source state remains a read-only presentation plane. OBS WebSocket,
VTube Studio, VMC/OSC, and native transports such as Spout2 use separate adapters,
credentials, lifecycle, capabilities, and performance budgets under ADR 0013.
Presentation Packs cannot open vendor sockets, issue commands, embed credentials,
or select native helpers. Adapter readiness is an observed runtime facet under
ADR 0012 and does not delay the interactive shell or local playback.

## Rejected options

- **Keep fixed kinds as the permanent identity model.** It prevents multiple
  instances and confuses category with endpoint identity.
- **Keep separate Now Playing and Artwork default routes.** They describe the same
  track-information workflow, duplicate Workbench navigation, and had no released
  compatibility dependency. Future concurrent layouts belong to multiple Track
  instances.
- **Allow remote packs to contain arbitrary web code.** That creates a remote code
  execution and persistent OBS attack surface.
- **Use the Electron updater for content.** App binaries and presentation content
  have different cadence, rollback, and compatibility semantics.
- **Activate a pack immediately during playback.** It risks visible discontinuity
  and inconsistent resources across instances.
- **Install community templates directly.** The first community boundary is
  declarative data; executable contributions go through product review and an app
  release.
- **Build a social feedback platform first.** A structured official form validates
  demand without coupling feedback to update authority.

## Consequences

- Current three-slot storage and routes need an explicit migration to instances;
  the three implemented routes remain aliases when that migration ships.
- Template runtime releases are slower but maintain a small executable trust
  boundary; presentation and user styling can evolve independently.
- The main process gains a separate content updater, immutable storage, rollback,
  and quarantine responsibilities.
- Users can safely share A-prime variants without sharing local paths or code.
- More advanced 2D/3D effects remain possible, but only behind capability,
  lifecycle, and combined-resource budgets.
- Lyrics T2 and the Output content/state split in ADR 0010 remain the prerequisite
  for segment-synchronized lyrics templates.

## References

- [Overlay pack contract](../contracts/overlay-pack-contract.md)
- [Overlay asset security policy](../contracts/overlay-asset-security.md)
- [ADR 0010: Lyrics Timing Granularity](0010-lyrics-timing-granularity-and-output-content-split.md)
- [ADR 0012: State Convergence and Startup Phases](0012-state-convergence-and-startup-phases.md)
- [ADR 0013: External Integration Planes](0013-external-integration-planes.md)
- [The Update Framework specification](https://theupdateframework.github.io/specification/latest/)
- [tuf-js](https://github.com/theupdateframework/tuf-js)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)
- [Electron security recommendations](https://www.electronjs.org/docs/latest/tutorial/security)
- [GSAP documentation](https://gsap.com/docs/v3/)
- [PixiJS guides](https://pixijs.com/8.x/guides)
- [Three.js documentation](https://threejs.org/docs/)

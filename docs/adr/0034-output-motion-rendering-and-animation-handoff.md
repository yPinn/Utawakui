# ADR 0034: Output motion rendering and animation handoff

## Status

Accepted on 2026-11-22. It amends [ADR 0011](0011-overlay-instances-and-presentation-pack-delivery.md)
for the concurrency model and renderer roles. The rules apply to new templates
and to rewrites of existing ones. On-demand loading covers the fisheye lens,
Phantom Thieves and textured credits lyrics templates. PixiJS draws the
textured credits doodle cloud; the animation handoff is not in use yet. Concrete rules live in the
[Output motion and rendering contract](../contracts/output-motion-rendering.md)
and the [animation handoff spec](../contracts/output-animation-handoff.md).

## Context

Output is the public face of the product, and templates should reach
After Effects–level detail: layered motion, masks, glow, distortion, particles
and occasional 3D. The template count will keep growing, and professional
After Effects animators are expected to contribute designs.

An audit of the 2026-11-22 working tree found:

- GSAP is used in 18 overlay modules, but only two (textured credits and the
  fisheye lens) seek a timeline to the song clock. Most tweens are
  fire-and-forget transitions.
- The lyrics page imports every template module and links every template
  stylesheet, so each new template adds load and parse cost to every lyrics
  source.
- Some effects animate `filter`, gradient `mask` and `text-shadow` per frame,
  which repaints large areas on the Browser Source main thread.
- Users run at most three Browser Sources at once: Lyrics, Now Playing and
  Setlist. Streaming PCs generally have a discrete GPU.

ADR 0011 planned multiple Output Instances and listed "keep fixed kinds as the
permanent identity model" as a rejected option. It already named GSAP as the
choreography core, PixiJS as an optional 2D GPU adapter and Three.js as the
only planned 3D adapter, but it did not divide work between them or state how
After Effects material enters the product.

## Decision

### Three fixed slots are the concurrency ceiling

Lyrics, Now Playing and Setlist each map to one Browser Source. Performance
budgets are the sum of these three sources plus the Workbench preview running
on the same machine. The multi-instance model and `/overlay/slot/<instanceId>`
routes from ADR 0011 are deferred, not rejected; they no longer shape current
design. Remote Presentation Pack delivery and User Variant sharing stay deferred
with them.

### Five rendering roles

A template divides its work into timeline (GSAP), text and layout
(DOM, CSS, SVG), material (CSS), GPU effects (PixiJS with pixi-filters) and
media (Lottie, Rive, image sequences, video). These are responsibilities, not
the background/content/foreground stacking layers of the
[layer plan](../governance/output-layer-implementation-plan.md); the contract
defines what each role owns.

- **One time source.** Song-synchronized motion is sampled from the host
  playback clock and never accumulates its own time. GSAP timelines are the
  orchestration layer that samples it; PixiJS uniforms, Lottie frames, Rive
  state machines, image-sequence frames and Three.js mixers follow the GSAP
  timeline. A plain linear sweep may use the Web Animations API when every
  render resets its start and remaining duration from the host clock, as the
  existing karaoke sweep does.
- **Per-frame changes are limited** to DOM `transform` and `opacity`, shader
  uniforms and media frames. Animated `filter`, gradient `mask`, `text-shadow`
  radius and layout properties move to the GPU effects role.
- **Lyrics text stays in the DOM.** An effect may sample text into a texture,
  but layout, fonts, ruby and accessibility remain DOM-owned.

### Effects are shared components; templates are recipes

GPU effects, reveal patterns and transitions are app-owned components with
bounded parameters. A template composes components, parameters and assets. A
new template adds components only for effects no existing component covers.
This is the "reusable components, packs only parameterize" boundary of the
[overlay pack contract](../contracts/overlay-pack.md) applied to motion.

### Renderer adoption

- **PixiJS with pixi-filters** is the 2D GPU effects renderer.
- **Three.js** (with postprocessing) is used only when a template needs real 3D.
- Each slot owns at most one GPU canvas, so a template never combines PixiJS and
  Three.js.
- Template modules, effect components, renderers and assets load on demand for
  the active template and are released when the template changes.

### After Effects handoff

Lyrics and titles are dynamic, so an After Effects render cannot be shipped as
the template. Animators deliver two kinds of material:

1. **Motion specs** for text and song-synchronized motion: the project, a
   reference render, exported keyframe data, an effect list and timing rules
   relative to line start and end. Developers rebuild these with GSAP and
   effect components.
2. **Media assets** for parts without dynamic text: Lottie, GLB, textures, LUTs,
   image sequences and video with alpha.

Image sequences can be frame-synchronized. Video is limited to motion that does
not need to follow the song clock, because seeking is not frame-accurate.
Assets never carry scripts or shaders; unsupported After Effects effects become
app-owned components.

## Rejected options

- **Replace GSAP with CSS and the Web Animations API.** CSS cannot seek a
  sequence cleanly, and the Web Animations API has no shipped grouping or
  sequencing model, so song-synchronized choreography would need a home-grown
  timeline.
- **Ship After Effects renders as video templates.** Dynamic lyrics, vertical
  text and per-song timing cannot be baked.
- **Accept After Effects effects as shader or script assets.** This crosses the
  executable trust boundary of ADR 0011.
- **Allow several GPU renderers in one slot.** It multiplies GPU contexts and
  memory across the three concurrent sources.
- **Keep loading every template on every page.** Load cost would grow with the
  catalog instead of with the active template.

## Consequences

- PixiJS and pixi-filters must be added to the dependency inventory, release
  notices and the Output server allowlist when the first template adopts them.
- Lyrics templates whose code is interleaved with the shared renderer move to
  on-demand loading as they are rewritten; new templates load on demand from
  the start.
- Existing templates converge through the
  [GSAP migration plan](../governance/output-gsap-migration-plan.md); fire-and-forget
  transitions may stay on CSS where they do not need the song clock.
- Budgets are set from measurements of three concurrent sources on a
  discrete-GPU streaming PC, not from estimates.
- ADR 0011's instance, pack delivery and variant sections remain the plan of
  record if that work restarts.

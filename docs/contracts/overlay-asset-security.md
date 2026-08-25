# Overlay Asset Security Policy

## Status and purpose

Draft planning policy, 2026-08-23. It defines the minimum acceptance boundary for
Official Presentation Packs and user-imported `.utawakui-pack` archives. It does
not authorize executable third-party templates. The implementation must convert
these rules into shared validators, fixtures, and limits before enabling remote
content installation.

## Trust boundaries

- The Electron main process is the only download, verification, extraction, and
  installation authority.
- The renderer may request an install or select verified ids; it cannot provide a
  destination path, digest bypass, trust root, or executable payload.
- The loopback Output server serves only files resolved from an activated,
  verified pack through exact route and asset-id allowlists.
- Official update metadata is signed and read-only. User feedback is writable,
  untrusted, rate-limited, and isolated from update publication.
- App-bundled template JavaScript and render adapters remain the only executable
  runtime in the first delivery.

## Verification pipeline

Every candidate passes all stages before activation:

1. verify TUF role metadata, expiry, rollback/freeze protections, target name,
   length, and digest;
2. download to a unique staging directory with byte and time limits;
3. parse JSON with depth, property-count, string-length, and collection limits;
4. validate the declared schema version and application compatibility;
5. inspect every asset's declared media type, extension, magic bytes, length, and
   digest;
6. decode or parse supported assets under format-specific limits;
7. verify license and redistribution metadata;
8. move the immutable pack version into verified storage; and
9. atomically activate only at a safe boundary.

Any failure is fail-closed. The candidate is never partially served and never
falls back to treating an unknown file as generic web content. Diagnostics must
avoid including user paths or complete remote responses.

## Archive import rules

Official remote delivery should use manifests plus immutable hashed assets. When
ZIP-based `.utawakui-pack` import is supported, extraction must reject:

- absolute paths, drive-qualified paths, `..` traversal, alternate separators,
  NULs, and normalized-name collisions;
- symlinks, hard links, device files, and nested archives;
- encrypted entries or unsupported compression methods;
- excessive entry count, per-file size, total expanded size, compression ratio,
  or directory depth; and
- duplicate manifest or asset identifiers.

Extraction writes only beneath a resolved staging directory. The final resolved
path of every entry is checked before opening the destination file.

## Supported asset policies

### Images

- Allow only explicitly supported raster formats and validated dimensions.
- Bound encoded bytes, decoded pixel count, frame count, and animation duration.
- Decode before activation so malformed images fail outside the live overlay.
- Strip metadata when re-encoding is required; never interpret embedded profiles
  as paths or executable instructions.

### SVG

- Sanitize to a conservative graphical subset.
- Reject scripts, event handlers, external references, animation elements,
  `foreignObject`, embedded HTML, remote fonts, and data that exceeds complexity
  limits.
- Resolve gradients, masks, filters, and references only within the same validated
  document and cap node/filter complexity.
- Serve with a restrictive Content Security Policy; sanitation is not replaced by
  CSP.

### Fonts

- Permit only app-supported local formats with validated tables and bounded size.
- Require a stable asset id, family/style metadata, license identifier, attribution
  where required, and an explicit redistribution flag.
- A user selects a local font through a main-owned file picker. The main process
  validates and copies it into a managed user-font store addressed by content
  digest; templates never retain or serve the original absolute path.
- A machine-local user font may be used only locally and is omitted from a shared
  variant in favor of its declared fallback. Its bytes may enter a shared pack
  only after the user explicitly confirms redistribution rights and the pack
  records the license.
- Templates use font ids and declared fallbacks, never OS paths or arbitrary
  family discovery.

### GLB / glTF

- Prefer a single GLB with embedded buffers and images.
- Reject external URIs, network references, filesystem paths, and unsupported
  extensions.
- Bound file size, nodes, meshes, primitives, vertices, indices, materials,
  textures, texture dimensions, animation tracks, morph targets, bones, and
  decoded GPU memory.
- Preflight parse before activation and provide a DOM/SVG or static-image fallback
  when WebGL capability or budget is insufficient.

### Lottie and Rive

- Runtime libraries ship with the application; content cannot select or download
  a runtime implementation.
- Reject scripts and external image, font, audio, or network dependencies.
- Bound state machines, layers, shapes, keyframes, paths, embedded assets,
  dimensions, duration, and decoded memory.
- Song-synchronized playback is driven or corrected by the template host clock,
  not an uncontrolled asset-local timer.

### Shaders and executable content

Presentation Packs cannot contain shader source, WebAssembly, JavaScript, HTML,
CSS, native modules, browser extensions, or install hooks. Any future signed
code-pack requires a separate threat model, signing policy, sandbox design, and
ADR.

## Runtime serving and browser isolation

- Keep the Output server bound to `127.0.0.1` and preserve the exact static-route
  allowlist.
- Map public URLs from validated pack id, version, and asset id; never accept a
  client-provided filename or absolute path.
- Use explicit media types, `nosniff`, restrictive CSP, and no directory listing.
- Do not grant remote network access through pack configuration. References shown
  in a feedback form are not loadable overlay assets.
- Do not expose the pack store through the existing `utawakui-media:` track asset
  resolver.
- Keep WebSocket state read-only and independently validate all persisted instance
  and variant documents.

## Resource and availability budgets

Concrete numeric limits are implementation constants shared by validation,
Workbench, and runtime; they require representative OBS measurements before being
fixed. The policy requires limits for:

- total installed and staged bytes per pack and across retained versions;
- asset count and decoded image/texture memory;
- one GPU canvas per Output Instance;
- maximum DPR, FPS, particles, triangles, draw calls, and animation complexity;
- total cost across all active OBS Browser Sources, not just one template; and
- bounded logging, retry, quarantine, and rollback storage.

Hidden or disconnected instances pause nonessential work. WebGL context loss and
unsupported capabilities produce a deterministic fallback rather than an endless
reload loop. Gallery and Workbench use static previews unless the selected item is
actively inspected.

## Activation, rollback, and recovery

- A running instance pins an exact verified pack version.
- Background download and verification never change a live scene.
- Activation occurs with no active clients, explicit user confirmation, or at the
  next session.
- Keep the previous known-good version and immutable app-bundled fallback.
- A crash or initialization failure can quarantine the candidate and roll the
  active pointer back without modifying User Variants.
- Deleting old versions is a bounded maintenance operation and never removes a
  version still pinned by an active instance.

## Feedback URL policy

New-style requests may carry a bounded HTTPS reference URL, optional time range,
and note. Initial implementation does not follow redirects, fetch metadata,
download media, or create previews. Reject credentials in URLs, non-HTTPS schemes,
local hosts, IP literals, and file-like paths if an in-app submission service is
later introduced. Opening a fixed official form should use the system browser and
show the user exactly which fields are prefilled.

No feedback action automatically attaches lyrics, track or library metadata,
local paths, installed fonts, screenshots, logs, or OBS URLs. Attachments require
a future explicit-consent and retention policy.

## Rights and publication

- Pack assets require documented ownership or redistribution permission.
- Visual references may inform reusable visual language, but the app does not
  reproduce unlicensed music-video artwork, logos, fonts, models, or distinctive
  branded assets, and does not imply affiliation.
- A community submission becomes official only after moderation, license review,
  asset validation, compatibility tests, signing, and publication through the
  official update repository.

## References

- [ADR 0011: Overlay Instances and Presentation Pack Delivery](../adr/0011-overlay-instances-and-presentation-pack-delivery.md)
- [ADR 0012: State Convergence and Startup Phases](../adr/0012-state-convergence-and-startup-phases.md)
- [ADR 0013: External Integration Planes](../adr/0013-external-integration-planes.md)
- [The Update Framework specification](https://theupdateframework.github.io/specification/latest/)
- [Electron security recommendations](https://www.electronjs.org/docs/latest/tutorial/security)
- [JSON Schema Draft 2020-12](https://json-schema.org/draft/2020-12)
- [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- [W3C SVG 2 specification](https://www.w3.org/TR/SVG2/)

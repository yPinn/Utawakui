# Output Template Thumbnails

These preview images are bundled into the renderer at build time. Their presence
does not establish content accuracy or redistribution rights; see `provenance.json`.
They are not user-selected local media and must not be routed through preload,
IPC, or the Output server.

Name each image after an existing output template id, for example:

- `karaoke-stack.webp`
- `live-stage.webp`
- `manga-frame.webp`

Use a 16:9 image at 1280 × 720. Prefer WebP or AVIF and keep each image under
200 KB when visual quality permits. PNG and JPEG are accepted for source artwork
that does not encode well in the preferred formats.

Only one image format may exist for a template id. The renderer discovers these
files through Vite. Every registered template must have a static image; missing
or undecodable images show a lightweight placeholder without mounting a live
preview. The Gallery's selected preview also starts with this static image and
loads its dynamic mockup only after pointer dwell or an explicit play action.

The `queue-board`, `kinetic-pop` and `ornate-vertical`
JPEGs were rendered from the existing programmatic templates and
fixed sample scene at 1280 × 720 with animation disabled. They are derived
project artwork, not additional third-party source images.

## Provenance and replacement review

`provenance.json` maps every active template to the existing image hash and its
content status. Six images (`karaoke-stack`, `live-stage`, `manga-frame`,
`art-card`, `receipt-setlist`, `cover-player`) are style references, not runtime
captures; their rights remain unverified and G01 remains a delivery blocker.
The other three are legacy
programmatic captures per the earlier record, pending current-runtime review.
No image is automatically approved by filename, successful decoding or a hash.

On 2026-10-24, the user supplied `kqtoc.jpg` for `receipt-setlist` and
`apple-music-rebrand-icon.jpg` for `cover-player`. Both retain their original
bytes; the receipt reference is 4:3 and uses the Gallery's existing cover crop.

Generate inspection captures with `npm run output:audit`. The tool writes fresh
artifacts under ignored `tasks/output-appearance-audit-*`, never here. It uses
synthetic text and existing procedural graphics, with no private library or
external artwork. Its default native widget sizes and scaled FHD captures are
inspection inputs, not ready-made 1280 × 720 Gallery assets.

For a separately authorized replacement, retain the original reference and record
the source commit/dirty hashes, tool report, scene/time, settings, CSS viewport,
PNG size/zoom, fonts/artwork, rights basis, and human content/crop review. Generate
the final 16:9 crop separately; never stretch a widget screenshot to claim a native
16:9 layout. Update the image and provenance together after review. See the
[acceptance runbook](../../../docs/operations/output-appearance-acceptance.md).

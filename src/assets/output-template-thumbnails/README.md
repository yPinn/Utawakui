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
files through Vite. Every registered template has a static image. Missing or
undecodable images show a lightweight placeholder. The selected template starts
with its static image and plays its dynamic preview when Gallery details are open
and the system allows motion. A preview failure returns to the static image.

The `queue-board` and `ornate-vertical`
JPEGs were rendered from the existing programmatic templates and
fixed sample scene at 1280 × 720 with animation disabled. They are derived
project artwork, not additional third-party source images.

## Provenance and replacement review

`provenance.json` maps every registered template to the existing image hash and its
content status. Manga Frame uses the original black-and-white manga reference
restored from Git on 2026-11-25.
Templates marked `style-reference` in the provenance catalog have unverified
rights and remain blocked for delivery under G01.
The older programmatic captures retain their previous review status.
The ticket-stub thumbnail captures the current 480 × 270 Browser Source in
Electron using the project's synthetic stage artwork, composited on a dark
backdrop and scaled proportionally to 1280 × 720.
The ribbon-setlist thumbnail uses the red and black ribbon collage supplied
on 2026-11-12. The bundled PNG retains the original bytes and uses the
Gallery's existing cover crop.
No image is automatically approved by filename, successful decoding or a hash.

On 2026-10-24, the user supplied `kqtoc.jpg` for `receipt-setlist` and
`apple-music-rebrand-icon.jpg` for `cover-player`. Both retain their original
bytes; the receipt reference is 4:3 and uses the Gallery's existing cover crop.

On 2026-11-25, four user-supplied JPEGs were added as Gallery covers. The
repository preserves their original bytes and the Gallery applies its usual fit.

- `calculating.jpg` for `textured-credits.jpg`
- `deco miku.jpg` for `fisheye-lens.jpg`
- `take your heart.jpg` for `phantom-thieves.jpg`
- `ado ashura.jpg` for `kinetic-pop.jpg`

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

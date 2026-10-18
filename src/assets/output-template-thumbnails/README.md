# Output Template Thumbnails

These are project-owned preview images bundled into the renderer at build time.
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

The `queue-board`, `kinetic-pop`, `ornate-vertical` and
`cover-player` JPEGs were rendered from the existing programmatic templates and
fixed sample scene at 1280 × 720 with animation disabled. They are derived
project artwork, not additional third-party source images.

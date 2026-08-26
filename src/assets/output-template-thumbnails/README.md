# Output Template Thumbnails

These are project-owned preview images bundled into the renderer at build time.
They are not user-selected local media and must not be routed through preload,
IPC, or the Output server.

Name each image after an existing output template id, for example:

- `quiet-caption.webp`
- `live-stage.webp`
- `manga-frame.webp`

Use a 16:9 image at 1280 × 720. Prefer WebP or AVIF and keep each image under
200 KB when visual quality permits. PNG and JPEG are accepted for source artwork
that does not encode well in the preferred formats.

Only one image format may exist for a template id. The renderer discovers these
files through Vite and uses the current programmatic mockup until an image is
supplied or when an image cannot be decoded.

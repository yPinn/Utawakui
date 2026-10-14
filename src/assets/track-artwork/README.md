# Track artwork assets

These four transparent PNGs are the production default artwork pool for tracks
without usable custom cover art. `TrackArtworkContent` chooses one with a stable track
identity resolver, so the same track keeps the same image across single-track and
collection surfaces.

| File                              | Source size | Role                                |
| --------------------------------- | ----------- | ----------------------------------- |
| `track-thumb-fallback-blue.png`   | 736 × 736   | Blue default track artwork member   |
| `track-thumb-fallback-pink.png`   | 736 × 736   | Pink default track artwork member   |
| `track-thumb-fallback-red.png`    | 736 × 736   | Red default track artwork member    |
| `track-thumb-fallback-yellow.png` | 736 × 736   | Yellow default track artwork member |

The PNGs are transparent outside the circular artwork. Do not select them with
render-time randomness or use them as ordinary cover examples. The fallback order
is custom cover, stable default artwork, then a title initial only if both image
sources fail.

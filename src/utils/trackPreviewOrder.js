// Authored orders (album source, user playlist) are kept; derived views
// (artist, all tracks) have no meaningful order, so previews sample them.
const SHUFFLED_PREVIEW_MODES = new Set(['artist', 'all']);

export function orderPreviewTracks(
  tracks,
  { mode, pinnedId = null, random = Math.random } = {},
) {
  return SHUFFLED_PREVIEW_MODES.has(mode)
    ? shufflePreviewTracks(tracks, { pinnedId, random })
    : tracks;
}

// A selected track still opens first; the rest follow in random order.
export function shufflePreviewTracks(
  tracks,
  { pinnedId = null, random = Math.random } = {},
) {
  const pinned = tracks.find((track) => track.id === pinnedId) ?? null;
  const rest = tracks.filter((track) => track !== pinned);

  for (let index = rest.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [rest[index], rest[swapIndex]] = [rest[swapIndex], rest[index]];
  }

  return pinned ? [pinned, ...rest] : rest;
}

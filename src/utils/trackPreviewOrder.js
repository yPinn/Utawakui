// Artist previews sample the catalogue instead of replaying album order. A
// selected track still opens first; the rest follow in random order.
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

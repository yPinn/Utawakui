export function tagMediaActivity({
  player = {},
  bgm = {},
  bgmTrackIds = [],
  preview = {},
} = {}) {
  const ids = [];
  ids.push(player.pendingStartTrackId);
  if (
    player.isPlaying ||
    ['loading', 'buffering', 'seeking'].includes(player.playbackPhase)
  )
    ids.push(player.track?.id);
  if (
    bgm.isPlaying ||
    bgm.playIntentActive ||
    ['loading', 'buffering'].includes(bgm.playbackPhase)
  )
    ids.push(...bgmTrackIds);
  if (preview.isOpen) ids.push(preview.tracks?.[preview.index]?.id);
  return [...new Set(ids.filter((id) => typeof id === 'string' && id))];
}

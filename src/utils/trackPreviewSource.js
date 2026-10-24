// Preview consumes Main-owned local media only. Provider metadata is not audio.
export function isLocalPreviewTrack(track) {
  return Boolean(
    track?.id &&
    typeof track.url === 'string' &&
    track.url.startsWith('utawakui-media://track/'),
  );
}

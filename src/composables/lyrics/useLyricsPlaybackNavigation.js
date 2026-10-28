import { toPlayableTrack } from '../../utils/playableTrack.js';

// Coordinates existing lyrics, queue and player owners; owns no playback state.
export function useLyricsPlaybackNavigation({
  state,
  selectedTrack,
  lyricsTiming,
  player,
  setQueue,
  arrangementBusy,
}) {
  const {
    state: playerState,
    samplePlaybackClock,
    playTrack,
    play,
    seek,
  } = player;
  async function playFromLine(line) {
    if (!line || !Number.isFinite(line.start) || !selectedTrack.value) return;
    const targetTime = Math.max(0, line.start - state.offsetSeconds);
    if (playerState.track?.id !== selectedTrack.value.id) {
      setQueue(state.tracks, selectedTrack.value.id, {
        sourceName: '歌詞',
        sourceId: 'lyrics-workspace',
      });
      await playTrack(toPlayableTrack(selectedTrack.value));
    }
    seek(targetTime);
    await play();
  }

  // Explicit authoring navigation only uses the loaded player. Unlike the reader's
  // playFromLine, these actions never replace a queue or start a different track.
  function timingPlaybackTarget(canonicalMs, session) {
    const current = lyricsTiming.value.sourceSession;
    const track = selectedTrack.value;
    if (
      !Number.isSafeInteger(canonicalMs) ||
      canonicalMs < 0 ||
      !session?.id ||
      session.id !== current?.id ||
      session.timingRevision !== current.timingRevision ||
      state.isLoadingLyrics ||
      state.timingSave.isSaving ||
      state.offsetSave.isSaving ||
      state.offsetSave.error ||
      arrangementBusy.value ||
      playerState.pendingStartTrackId ||
      !track ||
      playerState.track?.id !== track.id ||
      playerState.track.url !==
        (playerState.track.usesSeparatedAudio ? track.stemsUrl : track.url) ||
      samplePlaybackClock()?.trackId !== track.id
    )
      return null;
    const positionMs = canonicalMs - Math.round(state.offsetSeconds * 1000);
    if (
      !Number.isFinite(positionMs) ||
      positionMs < 0 ||
      !Number.isFinite(playerState.duration) ||
      playerState.duration <= 0 ||
      positionMs >= playerState.duration * 1000
    )
      return null;
    return {
      positionSeconds: positionMs / 1000,
      usesSeparatedAudio: Boolean(playerState.track.usesSeparatedAudio),
    };
  }
  function seekTimingPosition(canonicalMs, session) {
    const target = timingPlaybackTarget(canonicalMs, session);
    if (!target) return false;
    seek(target.positionSeconds);
    return true;
  }
  async function playTimingPosition(canonicalMs, session) {
    if (!seekTimingPosition(canonicalMs, session)) return false;
    return playerState.isPlaying ? true : (await play()) !== false;
  }

  return {
    playFromLine,
    timingPlaybackTarget,
    seekTimingPosition,
    playTimingPosition,
  };
}

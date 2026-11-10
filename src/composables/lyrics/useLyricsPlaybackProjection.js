import { computed } from 'vue';
import {
  deriveLyricsPlaybackState,
  deriveLyricsPositionLineIndex,
  projectLegacyLyricLines,
} from '../../utils/lyricsDocument.js';
import { projectNativeLyricsFrame } from '../../../shared/presentation/lyricsFineFrame.mjs';

export function useLyricsPlaybackProjection({
  state,
  playerState,
  samplePlaybackClock,
  displayLyricsDocument,
  currentLyricsPositionMs,
  estimatedFrame,
}) {
  const lyricLines = computed(() =>
    projectLegacyLyricLines(displayLyricsDocument.value),
  );
  const isSelectedTrackPlaying = computed(
    () =>
      Boolean(state.selectedTrackId) &&
      playerState.track?.id === state.selectedTrackId,
  );
  const playbackState = computed(() =>
    deriveLyricsPlaybackState(
      displayLyricsDocument.value,
      currentLyricsPositionMs.value ?? Number.NaN,
      Number.isFinite(playerState.duration)
        ? playerState.duration * 1000
        : null,
    ),
  );
  const activeLineIndex = computed(() => playbackState.value.activeLineIndex);
  const positionedLineIndex = computed(() =>
    deriveLyricsPositionLineIndex(
      displayLyricsDocument.value,
      currentLyricsPositionMs.value,
    ),
  );
  const localLyricsFrame = computed(() => {
    const estimated = estimatedFrame.value;
    if (estimated) return estimated;
    const line = displayLyricsDocument.value.lines[activeLineIndex.value];
    const frame = projectNativeLyricsFrame(line, currentLyricsPositionMs.value);
    if (!frame?.fineTiming) return frame;
    const sample = samplePlaybackClock();
    const transport = playerState;
    return {
      ...frame,
      paintClock: {
        positionMs: sample
          ? sample.positionMs + state.playbackOffsetSeconds * 1000
          : currentLyricsPositionMs.value,
        sampledAtMs: sample ? Date.parse(sample.sampledAt) : Date.now(),
        rate: sample?.rate ?? 1,
        playing: sample?.phase === 'playing',
        revision: `${transport.playbackRevision}:${transport.continuityRevision}:${transport.playbackPhase}:${transport.tempoRate}`,
      },
    };
  });
  const activeLine = computed(() =>
    activeLineIndex.value >= 0 ? lyricLines.value[activeLineIndex.value] : null,
  );
  const activeLineId = computed(() => playbackState.value.activeLineId);
  const activeSegmentId = computed(() => playbackState.value.activeSegmentId);

  return {
    lyricLines,
    isSelectedTrackPlaying,
    playbackState,
    activeLineIndex,
    positionedLineIndex,
    localLyricsFrame,
    activeLine,
    activeLineId,
    activeSegmentId,
  };
}

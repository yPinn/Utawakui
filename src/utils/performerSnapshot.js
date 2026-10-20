import performerValues from '../../shared/performerContractValues.json';
import { normalizePerformerReadingVariant } from '../../shared/performerViewContract.mjs';
import { projectOutputSnapshot } from './outputSnapshot.js';

function projectReadingLine(line, lyricText) {
  if (!line || line.text !== lyricText) return null;
  const segments = Array.isArray(line.segments)
    ? line.segments
        .slice(0, performerValues.maxReadingSegmentsPerLine)
        .flatMap((segment) => {
          if (!segment || typeof segment.t !== 'string') return [];
          return [
            {
              text: segment.t,
              ...(typeof segment.r === 'string' && segment.r.length > 0
                ? { reading: segment.r }
                : {}),
            },
          ];
        })
    : [];
  return {
    text: lyricText,
    ...(typeof line.romaji === 'string' && line.romaji.length > 0
      ? { romaji: line.romaji }
      : {}),
    segments,
  };
}

const MAX_PUBLIC_ERROR_LENGTH = 240;

function projectLyricsOffsetControls(input, state) {
  const available = Boolean(
    state.lyrics.synced === true &&
    state.lyrics.trackId &&
    state.lyrics.trackId === state.playback.track?.id &&
    typeof input.lyrics?.source?.filename === 'string' &&
    input.lyrics.source.filename.length > 0,
  );
  if (!available) {
    return { available: false, saving: false, error: '' };
  }
  const error =
    typeof input.lyrics?.offsetSave?.error === 'string'
      ? input.lyrics.offsetSave.error.slice(0, MAX_PUBLIC_ERROR_LENGTH)
      : '';
  return {
    available: true,
    saving: input.lyrics?.offsetSave?.isSaving === true,
    error,
  };
}

export function projectPerformerSnapshot(input = {}, options = {}) {
  const state = projectOutputSnapshot(
    {
      player: input.player,
      queue: input.queue,
      lyrics: input.lyrics,
      output: { displayDelayMs: 0 },
    },
    options,
  );
  const readingLines = Array.isArray(input.readings?.lines)
    ? input.readings.lines
    : [];

  return {
    version: performerValues.stateVersion,
    state,
    adjustments: {
      transposeSemitones: Number.isFinite(input.player?.transposeSemitones)
        ? input.player.transposeSemitones
        : 0,
      pitchCents: Number.isFinite(input.player?.pitchCents)
        ? input.player.pitchCents
        : 0,
      tempoRate:
        Number.isFinite(input.player?.tempoRate) && input.player.tempoRate > 0
          ? input.player.tempoRate
          : 1,
    },
    readings: {
      trackId: state.lyrics.trackId,
      variant: normalizePerformerReadingVariant(input.readings?.variant),
      availableVariants: Array.isArray(input.readings?.availableVariants)
        ? input.readings.availableVariants
        : [],
      preparing: input.readings?.preparing === true,
      error:
        typeof input.readings?.error === 'string'
          ? input.readings.error.slice(0, MAX_PUBLIC_ERROR_LENGTH)
          : '',
      lines: state.lyrics.lines.map((line, index) =>
        projectReadingLine(readingLines[index], line.text),
      ),
    },
    controls: {
      lyricsOffset: projectLyricsOffsetControls(input, state),
    },
  };
}

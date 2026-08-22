import performerValues from '../../shared/performerContractValues.json';
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
      lines: state.lyrics.lines.map((line, index) =>
        projectReadingLine(readingLines[index], line.text),
      ),
    },
  };
}

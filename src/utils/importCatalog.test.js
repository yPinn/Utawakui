import { describe, expect, it } from 'vitest';
import {
  DOWNLOAD_FAILURE_CODES,
  downloadFailureHint,
  downloadFailureLabel,
} from './downloadFailureDisplay.js';
import { t } from './i18n.js';
import { playbackKindLabel } from './importCandidateDisplay.js';

// Failure codes and playback kinds pick keys at runtime, out of the static catalog test's sight.
describe('import catalog coverage', () => {
  it('words every download failure code', () => {
    for (const code of [...DOWNLOAD_FAILURE_CODES, 'unknown', 'not-a-code']) {
      for (const text of [
        downloadFailureLabel(code),
        downloadFailureHint(code),
      ])
        expect(text, code).not.toMatch(/^import\./u);
    }
  });

  it('names every playback kind', () => {
    for (const kind of [
      'yt-music-song',
      'youtube-topic-audio',
      'youtube-official-audio',
      'yt-music-source',
      'youtube-lyric-video',
      'youtube-official-mv',
      'youtube-live',
      'youtube-variant',
      'youtube-other',
      'not-a-kind',
    ])
      expect(playbackKindLabel(kind), kind).not.toMatch(/^import\./u);
    expect(playbackKindLabel('not-a-kind')).toBe(
      t('import.candidate.kindFallback'),
    );
  });
});

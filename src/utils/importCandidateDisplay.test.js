import { describe, expect, it } from 'vitest';
import {
  candidateId,
  candidateSourceLabel,
  identityArtistLabel,
  identityStatusClass,
  identityStatusLabel,
  identityTitle,
  platformLabel,
  playbackKindLabel,
} from './importCandidateDisplay.js';

describe('import candidate display helpers', () => {
  it('formats candidate ids for UI display', () => {
    expect(candidateId({ playbackVideoId: 'audio123456' })).toBe('audio123456');
    expect(candidateId({ id: 'source12345' })).toBe('source12345');
  });

  it('maps technical candidate fields to user-facing labels', () => {
    expect(playbackKindLabel('yt-music-song')).toBe('音樂版');
    expect(platformLabel({ searchProvider: 'yt-music' })).toBe('YT Music');
    expect(platformLabel({ isSource: true })).toBe('貼上的來源');
  });

  it('uses only the source name for candidate badges', () => {
    expect(
      candidateSourceLabel({
        searchProvider: 'yt-music',
        playbackKind: 'yt-music-song',
      }),
    ).toBe('YT Music');
    expect(
      candidateSourceLabel({
        searchProvider: 'youtube',
        playbackKind: 'youtube-official-mv',
      }),
    ).toBe('YouTube');
    expect(
      candidateSourceLabel({
        searchProvider: 'youtube',
        availableProviders: ['yt-music', 'youtube'],
      }),
    ).toBe('YT Music');
    expect(
      candidateSourceLabel({
        isSource: true,
        searchProvider: 'youtube',
        availableProviders: ['yt-music', 'youtube'],
      }),
    ).toBe('貼上的來源');
  });

  it('formats track identity display for import rows', () => {
    const identity = {
      title: 'Parachute',
      artists: ['Sabrina Hu', 'Goatak'],
      confidence: 'medium',
    };

    expect(identityTitle(identity, 'Raw MV Title')).toBe('Parachute');
    expect(identityArtistLabel(identity, 'Raw Channel')).toBe(
      'Sabrina Hu, Goatak',
    );
    expect(identityStatusLabel(identity)).toBe('已辨識');
    expect(identityStatusClass(identity)).toBe('identified');
  });

  it('marks low-confidence identity as needing review', () => {
    expect(identityTitle(null, 'Raw Title')).toBe('Raw Title');
    expect(identityArtistLabel(null, 'Raw Channel')).toBe('Raw Channel');
    expect(identityStatusLabel({ confidence: 'low' })).toBe('需確認');
    expect(identityStatusClass({ confidence: 'low' })).toBe('review');
  });
});

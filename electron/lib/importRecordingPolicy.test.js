import { describe, expect, it } from 'vitest';
import {
  buildImportObservedTrack,
  compareImportRecordingIdentity,
  importDurationScore,
  importTextScore,
  scoreImportRecording,
} from './importRecordingPolicy.js';

describe('import recording policy', () => {
  it('adapts provider-selected canonical metadata into a shared observation', () => {
    expect(
      buildImportObservedTrack({
        title: 'Seven - Clean Ver.',
        artist: 'Jung Kook, Latto',
        artists: ['Jung Kook', 'Latto'],
        album: 'Golden',
        duration: 184,
        sourcePlatform: 'yt-music',
        sourceType: 'track',
        confidence: 'high',
      }),
    ).toMatchObject({
      title: 'Seven - Clean Ver.',
      artistCredit: 'Jung Kook, Latto',
      artistHints: ['Jung Kook', 'Latto'],
      album: 'Golden',
      duration: 184,
      source: { platform: 'yt-music', type: 'track' },
      confidence: { title: 'high', artist: 'high', album: 'high' },
    });
  });

  it('keeps legacy lexical scoring separate from raw version evidence', () => {
    const evidence = compareImportRecordingIdentity(
      { title: 'Song', artist: 'Artist', duration: 211 },
      { title: 'Song Live', artist: 'Artist', duration: 215 },
    );

    expect(evidence).toMatchObject({
      title: { exact: true },
      artist: { exact: true },
      duration: { delta: 4, signedDelta: 4 },
      version: { candidateIntroduces: true },
    });
    expect(evidence).not.toHaveProperty('score');
  });

  it('maps evidence to import-owned weights without choosing playback policy', () => {
    expect(importTextScore({ exact: true })).toBe(14);
    expect(importTextScore({ exact: false, contains: true })).toBe(8);
    expect(importTextScore({ exact: false, contains: false })).toBe(0);
    expect(importDurationScore(null)).toBe(0);
    expect(importDurationScore(4)).toBe(14);
    expect(importDurationScore(15)).toBe(10);
    expect(importDurationScore(45)).toBe(4);
    expect(importDurationScore(46)).toBe(-18);

    expect(
      scoreImportRecording(
        { title: 'Song', artist: 'Artist', duration: 211 },
        { title: 'Song Extended', artist: 'Artist', duration: 220 },
      ),
    ).toMatchObject({
      titleScore: 8,
      artistScore: 14,
      durationScore: 10,
      durationDelta: 9,
    });
    expect(
      scoreImportRecording(
        { title: 'Song', duration: 211 },
        { title: 'Song', duration: -1 },
      ),
    ).toMatchObject({ durationDelta: 212, durationScore: -18 });
    expect(
      scoreImportRecording(
        { title: '', artist: 'Artist' },
        { title: '', artist: 'Artist' },
      ),
    ).toMatchObject({ titleScore: 0, artistScore: 14 });
  });
});

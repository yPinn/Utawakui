import { describe, expect, it, vi } from 'vitest';
import {
  buildImportResolution,
  classifyPlaybackKind,
  resolveYoutubeImportSource,
} from './importResolver.js';

describe('classifyPlaybackKind', () => {
  it('classifies common YouTube music source shapes', () => {
    expect(classifyPlaybackKind({ title: 'Song (Official Music Video)' })).toBe(
      'youtube-official-mv',
    );
    expect(classifyPlaybackKind({ title: 'Song (Official Audio)' })).toBe(
      'youtube-official-audio',
    );
    expect(classifyPlaybackKind({ title: 'Song Lyric Video' })).toBe(
      'youtube-lyric-video',
    );
    expect(
      classifyPlaybackKind({ title: 'Song', artist: 'Artist - Topic' }),
    ).toBe('youtube-topic-audio');
    expect(
      classifyPlaybackKind(
        { title: 'Song' },
        'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
      ),
    ).toBe('yt-music-source');
  });

  it('classifies bare "Official Video" (no "music"/"mv") as an official MV', () => {
    // Regression test: this title shape used to fall through to
    // youtube-other because importResolver's own MV regex was narrower
    // than downloader.js's — now both share musicTitle.js's
    // OFFICIAL_MV_TITLE_RE.
    expect(classifyPlaybackKind({ title: 'Song (Official Video)' })).toBe(
      'youtube-official-mv',
    );
  });
});

describe('buildImportResolution', () => {
  it('recommends an audio candidate over the pasted official MV source', () => {
    const resolution = buildImportResolution({
      input: 'https://youtube.com/watch?v=mv000000000',
      sourceVideoId: 'mv000000000',
      sourceMetadata: {
        title: 'Actual Artist - Canonical Title (Official Music Video)',
        artist: 'Label Music',
        duration: 260,
        thumbnailUrl: 'https://example.test/mv.jpg',
      },
      playbackCandidates: [
        {
          id: 'aud12345678',
          title: 'Canonical Title',
          artist: 'Actual Artist',
          duration: 211,
          playbackKind: 'yt-music-song',
        },
      ],
      existingIds: new Set(),
    });

    expect(resolution.recommendedCandidate).toMatchObject({
      playbackVideoId: 'aud12345678',
      playbackKind: 'yt-music-song',
      confidence: 'high',
    });
    expect(resolution.source).toMatchObject({
      playbackVideoId: 'mv000000000',
      playbackKind: 'youtube-official-mv',
    });
    expect(resolution.downloadInput).toBe('aud12345678');
    expect(resolution.needsSourceReview).toBe(false);
  });

  it('keeps the pasted source first while ranking the remaining candidates', () => {
    const resolution = buildImportResolution({
      input: 'https://youtube.com/watch?v=mv000000000',
      sourceVideoId: 'mv000000000',
      sourceMetadata: {
        title: 'Actual Artist - Canonical Title (Official Music Video)',
        artist: 'Label Music',
        duration: 260,
      },
      playbackCandidates: [
        {
          id: 'live1234567',
          title: 'Canonical Title Live',
          artist: 'Actual Artist',
          duration: 260,
          playbackKind: 'youtube-live',
        },
        {
          id: 'aud12345678',
          title: 'Canonical Title',
          artist: 'Actual Artist',
          duration: 211,
          playbackKind: 'yt-music-song',
        },
      ],
    });

    expect(
      resolution.candidates.map((candidate) => candidate.playbackVideoId),
    ).toEqual(['mv000000000', 'aud12345678', 'live1234567']);
    expect(resolution.candidates[0]).toMatchObject({
      playbackVideoId: 'mv000000000',
      isSource: true,
    });
    expect(resolution.recommendedCandidate).toMatchObject({
      playbackVideoId: 'aud12345678',
      playbackKind: 'yt-music-song',
    });
  });

  it('falls back to the source when no better playback candidate exists', () => {
    const resolution = buildImportResolution({
      input: 'https://youtube.com/watch?v=mv000000000',
      sourceVideoId: 'mv000000000',
      sourceMetadata: {
        title: 'Canonical Title (Official Music Video)',
        artist: 'Actual Artist',
        duration: 260,
      },
      existingIds: new Set(['mv000000000']),
    });

    expect(resolution.recommendedCandidate).toMatchObject({
      playbackVideoId: 'mv000000000',
      alreadyDownloaded: true,
    });
    expect(resolution.needsSourceReview).toBe(false);
  });

  it('uses track identity as canonical metadata without dash-splitting track titles', () => {
    const resolution = buildImportResolution({
      input: 'https://music.youtube.com/watch?v=music000001',
      sourceVideoId: 'music000001',
      sourceMetadata: {
        title: 'Seven - Clean Ver. (合作演出：Latto)',
        artist: '정국 (Jung Kook) 和 Latto',
        duration: 184,
      },
      trackIdentity: {
        title: 'Seven - Clean Ver. (合作演出：Latto)',
        artists: ['정국 (Jung Kook)', 'Latto'],
        artist: '정국 (Jung Kook), Latto',
        duration: 184,
        sourcePlatform: 'yt-music',
        sourceType: 'track',
        confidence: 'high',
      },
      playbackCandidates: [
        {
          id: 'music000002',
          title: 'Clean Ver.',
          artist: 'Seven',
          duration: 184,
          playbackKind: 'yt-music-song',
        },
      ],
    });

    expect(resolution.canonical).toMatchObject({
      title: 'Seven - Clean Ver. (合作演出：Latto)',
      artist: '정국 (Jung Kook), Latto',
      duration: 184,
    });
    expect(resolution.source).toMatchObject({
      title: 'Seven - Clean Ver. (合作演出：Latto)',
      artist: '정국 (Jung Kook) 和 Latto',
    });
  });

  it('keeps one row when search returns the pasted source again', () => {
    const resolution = buildImportResolution({
      input: 'https://youtube.com/watch?v=mv000000000',
      sourceVideoId: 'mv000000000',
      sourceMetadata: {
        title: 'Canonical Title (Official Music Video)',
        artist: 'Actual Artist',
        duration: 260,
      },
      playbackCandidates: [
        {
          id: 'mv000000000',
          title: 'Canonical Title (Official Music Video)',
          artist: 'Actual Artist',
          duration: 260,
          playbackKind: 'youtube-official-mv',
        },
      ],
    });

    expect(
      resolution.candidates.filter(
        (candidate) => candidate.playbackVideoId === 'mv000000000',
      ),
    ).toHaveLength(1);
  });

  it('preserves cross-platform provider evidence for same-id candidates', () => {
    const resolution = buildImportResolution({
      input: 'https://youtube.com/watch?v=nR-LSk3LfEA',
      sourceVideoId: 'nR-LSk3LfEA',
      sourceMetadata: {
        title: 'Sabrina Hu - Parachute',
        artist: 'Sabrina Hu',
        duration: 250,
      },
      playbackCandidates: [
        {
          id: 'nR-LSk3LfEA',
          title: 'Parachute',
          artist: 'Sabrina Hu',
          duration: 250,
          playbackKind: 'yt-music-song',
          searchProvider: 'yt-music',
          availableProviders: ['yt-music', 'youtube'],
        },
      ],
    });

    expect(resolution.candidates).toHaveLength(1);
    expect(resolution.candidates[0]).toMatchObject({
      playbackVideoId: 'nR-LSk3LfEA',
      title: 'Sabrina Hu - Parachute',
      isSource: true,
      availableProviders: ['yt-music', 'youtube'],
    });
  });
});

describe('resolveYoutubeImportSource', () => {
  it('uses injected metadata and search providers to resolve a recommended playback id', async () => {
    const fetchMetadata = vi.fn().mockResolvedValue({
      title: 'Actual Artist - Canonical Title (Official Music Video)',
      artist: 'Label Music',
      duration: 260,
    });
    const searchPlaybackCandidates = vi.fn().mockResolvedValue([
      {
        id: 'aud12345678',
        title: 'Canonical Title',
        artist: 'Actual Artist',
        duration: 211,
        playbackKind: 'yt-music-song',
      },
    ]);

    await expect(
      resolveYoutubeImportSource('https://youtube.com/watch?v=mv000000000', {
        extractVideoId: () => 'mv000000000',
        fetchMetadata,
        searchPlaybackCandidates,
        existingIds: new Set(),
      }),
    ).resolves.toMatchObject({
      sourceVideoId: 'mv000000000',
      trackIdentity: {
        title: 'Canonical Title',
        artists: ['Actual Artist'],
        sourcePlatform: 'youtube',
      },
      downloadInput: 'aud12345678',
      recommendedCandidate: {
        playbackVideoId: 'aud12345678',
      },
    });
    expect(fetchMetadata).toHaveBeenCalledWith('mv000000000');
    expect(searchPlaybackCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Canonical Title',
        artists: ['Actual Artist'],
        artist: 'Actual Artist',
        duration: 260,
        sourcePlatform: 'youtube',
        sourceType: 'video',
      }),
      expect.objectContaining({ title: expect.any(String) }),
      { sourcePlatform: 'youtube' },
    );
  });

  it('passes YT Music source platform into playback candidate search', async () => {
    const fetchMetadata = vi.fn().mockResolvedValue({
      title: 'Canonical Title',
      artist: 'Actual Artist',
      duration: 211,
    });
    const searchPlaybackCandidates = vi.fn().mockResolvedValue([]);

    await resolveYoutubeImportSource(
      'https://music.youtube.com/watch?v=music000001',
      {
        extractVideoId: () => 'music000001',
        fetchMetadata,
        searchPlaybackCandidates,
        existingIds: new Set(),
      },
    );

    expect(searchPlaybackCandidates).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Canonical Title',
        artists: ['Actual Artist'],
        artist: 'Actual Artist',
        duration: 211,
        sourcePlatform: 'yt-music',
        sourceType: 'track',
      }),
      expect.objectContaining({ title: 'Canonical Title' }),
      { sourcePlatform: 'yt-music' },
    );
  });
});

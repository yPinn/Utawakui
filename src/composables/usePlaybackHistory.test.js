import { describe, expect, it, vi } from 'vitest';
import {
  PLAYBACK_HISTORY_QUALIFY_SECONDS,
  createPlaybackQualificationTracker,
} from '../utils/playbackHistoryQualification.js';

describe('playback history qualification', () => {
  it('records once after ten seconds of actual continuous playback', () => {
    const onQualified = vi.fn();
    const tracker = createPlaybackQualificationTracker({ onQualified });

    tracker.observeProgress({
      trackId: 'track-a',
      playbackRevision: 1,
      deltaSeconds: 5,
    });
    tracker.observeProgress({
      trackId: 'track-a',
      playbackRevision: 1,
      deltaSeconds: PLAYBACK_HISTORY_QUALIFY_SECONDS - 5.25,
    });
    expect(onQualified).not.toHaveBeenCalled();

    tracker.observeProgress({
      trackId: 'track-a',
      playbackRevision: 1,
      deltaSeconds: 0.25,
    });
    tracker.observeProgress({
      trackId: 'track-a',
      playbackRevision: 1,
      deltaSeconds: 5,
    });

    expect(onQualified).toHaveBeenCalledOnce();
    expect(onQualified).toHaveBeenCalledWith('track-a');
  });

  it('does not count seek-sized jumps or malformed progress', () => {
    const onQualified = vi.fn();
    const tracker = createPlaybackQualificationTracker({ onQualified });

    tracker.observeProgress({
      trackId: 'track-a',
      playbackRevision: 1,
      deltaSeconds: 45,
    });
    tracker.observeProgress({
      trackId: 'track-a',
      playbackRevision: 1,
      deltaSeconds: -2,
    });
    tracker.observeProgress({
      trackId: '',
      playbackRevision: 1,
      deltaSeconds: 5,
    });

    expect(onQualified).not.toHaveBeenCalled();
  });

  it('treats a new explicit play of the same track as a separate event', () => {
    const onQualified = vi.fn();
    const tracker = createPlaybackQualificationTracker({ onQualified });

    tracker.observeProgress({
      trackId: 'track-a',
      playbackRevision: 1,
      deltaSeconds: 5,
    });
    tracker.observeProgress({
      trackId: 'track-a',
      playbackRevision: 1,
      deltaSeconds: 5,
    });
    tracker.observeProgress({
      trackId: 'track-a',
      playbackRevision: 2,
      deltaSeconds: 5,
    });
    tracker.observeProgress({
      trackId: 'track-a',
      playbackRevision: 2,
      deltaSeconds: 5,
    });

    expect(onQualified).toHaveBeenCalledTimes(2);
  });

  it('records a normally ended short track even before a progress tick', () => {
    const onQualified = vi.fn();
    const tracker = createPlaybackQualificationTracker({ onQualified });

    tracker.observeEnded({
      trackId: 'track-short',
      playbackRevision: 3,
    });
    tracker.observeEnded({
      trackId: 'track-short',
      playbackRevision: 3,
    });

    expect(onQualified).toHaveBeenCalledWith('track-short');
    expect(onQualified).toHaveBeenCalledOnce();
  });
});

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlaybackPersistence } from '../../electron/lib/playbackPersistence.js';

const harness = vi.hoisted(() => ({
  queueState: {
    currentIsSource: true,
    sourceId: 'playlist-1',
    sourceName: '深夜練唱',
  },
  tracksById: new Map([
    [
      'track-a',
      {
        id: 'track-a',
        title: 'Song A',
        url: 'utawakui-media://track/track-a/audio.wav',
      },
    ],
  ]),
}));

vi.mock('./useLibrary.js', () => ({
  useLibrary: () => ({
    tracksById: { value: harness.tracksById },
    initialize: vi.fn(async () => {}),
  }),
}));

vi.mock('./usePlaybackQueue.js', () => ({
  usePlaybackQueue: () => ({ state: harness.queueState }),
}));

vi.mock('./player/usePlayerAudioGraph.js', () => ({
  GUIDE_VOCAL_LEVEL_RANGE: Object.freeze({ min: 0, max: 1 }),
  PITCH_CENTS_RANGE: Object.freeze({ min: -50, max: 50 }),
  TEMPO_RATE_RANGE: Object.freeze({ min: 0.5, max: 2 }),
  TRANSPOSE_SEMITONES_RANGE: Object.freeze({ min: -12, max: 12 }),
  PLAYER_AUDIO_DEFAULTS: Object.freeze({
    volume: 0.5,
    monitorGuideVocalLevel: 0.5,
    captureGuideVocalLevel: 0,
    transposeSemitones: 0,
    pitchCents: 0,
    tempoRate: 1,
  }),
  usePlayerAudioGraph: () => ({
    applyCaptureDevice: vi.fn(),
    prepareCaptureDevice: vi.fn(),
    resetPitchTempo: vi.fn(),
    resetTrackAudioControls: vi.fn(),
    restoreCaptureGuideVocalState: vi.fn(),
    restoreGuideVocalState: vi.fn(),
    routeAudioGraph: vi.fn(),
    setCaptureGuideVocalOn: vi.fn(),
    setCaptureGuideVocalValue: vi.fn(),
    setGuideVocalOn: vi.fn(),
    setGuideVocalValue: vi.fn(),
    setPitchCents: vi.fn(),
    setTempoRate: vi.fn(),
    setTransposeSemitones: vi.fn(),
    setVolume: vi.fn(),
    setMuted: vi.fn(),
    toggleCaptureGuideVocal: vi.fn(),
    toggleMute: vi.fn(),
    resume: vi.fn(async () => {}),
    cleanup: vi.fn(),
  }),
}));

class MockAudio {
  static latest = null;

  constructor() {
    this.currentTime = 0;
    this.duration = 180;
    this.listeners = new Map();
    this.play = vi.fn(async () => {
      this.dispatch('play');
      this.dispatch('playing');
    });
    this.pause = vi.fn(() => this.dispatch('pause'));
    this.load = vi.fn();
    MockAudio.latest = this;
  }

  addEventListener(type, listener) {
    this.listeners.set(type, listener);
  }

  removeEventListener(type) {
    this.listeners.delete(type);
  }

  dispatch(type) {
    this.listeners.get(type)?.();
  }

  removeAttribute(attribute) {
    if (attribute === 'src') this.src = '';
  }
}

describe('playback history runtime chain', () => {
  let userDataDir;

  beforeEach(() => {
    vi.resetModules();
    MockAudio.latest = null;
    vi.stubGlobal('Audio', MockAudio);
    userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'utawakui-playback-history-runtime-'),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  it('writes playback-history.json after ten seconds of real player progress events', async () => {
    const service = createPlaybackPersistence({
      userDataDir,
      now: () => new Date('2026-09-27T12:00:00.000Z'),
    });
    vi.stubGlobal('window', {
      Utawakui: {
        onLibraryUpdated: vi.fn(() => vi.fn()),
        getRecentPlaybackHistory: vi.fn(async () => service.getRecentHistory()),
        recordRecentPlayback: vi.fn(async (trackId, sourceContext) =>
          service.recordRecentPlayback(trackId, sourceContext),
        ),
        clearRecentPlaybackHistory: vi.fn(async () =>
          service.clearRecentHistory(),
        ),
      },
    });
    const { usePlayer } = await import('./usePlayer.js');
    const { usePlaybackHistory } = await import('./usePlaybackHistory.js');
    const player = usePlayer();
    const history = usePlaybackHistory();
    await history.initialize();

    await player.playTrack(harness.tracksById.get('track-a'));
    MockAudio.latest.currentTime = 5;
    MockAudio.latest.dispatch('timeupdate');
    MockAudio.latest.currentTime = 10;
    MockAudio.latest.dispatch('timeupdate');

    const historyPath = path.join(userDataDir, 'playback-history.json');
    await vi.waitFor(() => expect(fs.existsSync(historyPath)).toBe(true));
    expect(JSON.parse(fs.readFileSync(historyPath, 'utf8'))).toEqual({
      version: 1,
      entries: [
        {
          trackId: 'track-a',
          playedAt: '2026-09-27T12:00:00.000Z',
          sourceId: 'playlist-1',
          sourceName: '深夜練唱',
        },
      ],
    });
    expect(history.recentItems.value).toEqual([
      expect.objectContaining({
        trackId: 'track-a',
        track: harness.tracksById.get('track-a'),
      }),
    ]);

    history.dispose();
  });
});

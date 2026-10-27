import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createPlaybackPersistence } from '../../electron/lib/playbackPersistence.js';
import { createAbPracticePrototype } from '../../prototypes/ab-practice/runtime.mjs';
import { projectDynamicOutputState } from '../utils/outputStreamProjection.js';

// Windows AppContainer temp directories can allow file creation but reject
// rename. Keep real atomic writes inside the workspace's writable test area.
const testTmpRoot = fileURLToPath(new URL('../../.tmp/', import.meta.url));

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
  usePlaybackQueue: () => ({
    state: harness.queueState,
    onSourceStarted: () => () => {},
  }),
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
    isPlaybackReady: (result) => result?.ok === true,
    cancelAudioControlApplication: vi.fn(),
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
    resume: vi.fn(async () => ({ ok: true, status: 'applied' })),
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
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener);
    if (!this.listeners.get(type)?.size) this.listeners.delete(type);
  }

  dispatch(type) {
    this.listeners.get(type)?.forEach((listener) => listener({ type }));
  }

  removeAttribute(attribute) {
    if (attribute === 'src') this.src = '';
  }
}

describe('playback history runtime chain', () => {
  let userDataDir;
  let history;

  beforeEach(() => {
    vi.resetModules();
    MockAudio.latest = null;
    vi.stubGlobal('Audio', MockAudio);
    fs.mkdirSync(testTmpRoot, { recursive: true });
    userDataDir = fs.mkdtempSync(
      path.join(testTmpRoot, 'utawakui-playback-history-runtime-'),
    );
  });

  afterEach(() => {
    history?.dispose();
    history = null;
    vi.unstubAllGlobals();
    expect(path.dirname(userDataDir)).toBe(path.resolve(testTmpRoot));
    fs.rmSync(userDataDir, { recursive: true, force: true });
  });

  async function createRuntime() {
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
        getPlaybackPlayCounts: vi.fn(async () =>
          service.getPlayCountByTrackId(),
        ),
      },
    });
    const { usePlayer } = await import('./usePlayer.js');
    const { usePlaybackHistory } = await import('./usePlaybackHistory.js');
    const player = usePlayer();
    history = usePlaybackHistory();
    await history.initialize();
    return {
      player,
      service,
      audio: MockAudio.latest,
      record: window.Utawakui.recordRecentPlayback,
    };
  }

  function progress(audio, currentTime) {
    audio.currentTime = currentTime;
    audio.dispatch('timeupdate');
  }

  it.each(['sequence', 'repeat-one', 'repeat-list'])(
    'keeps %s practice EOF out of terminal consumers, qualifies actual progress once and projects paused A',
    async (mode) => {
      const { player, audio, record } = await createRuntime();
      await player.playTrack(harness.tracksById.get('track-a'));
      player.setPlaybackMode(mode);
      Object.assign(audio, {
        duration: 1,
        paused: true,
        seeking: false,
        ended: false,
        playbackRate: 1,
        seekable: { length: 1, start: () => 0, end: () => 1 },
      });
      audio.play.mockImplementation(async () => {
        audio.paused = false;
        audio.ended = false;
        audio.dispatch('play');
        audio.dispatch('playing');
      });
      audio.pause.mockImplementation(() => {
        audio.paused = true;
        audio.dispatch('pause');
      });
      const wrapped = {
        ...player,
        seek(time, token) {
          player.seek(time, token);
          audio.seeking = true;
          audio.dispatch('seeking');
          queueMicrotask(() => {
            audio.seeking = false;
            audio.ended = false;
            audio.dispatch('seeked');
          });
        },
      };
      const practice = createAbPracticePrototype({
        player: wrapped,
        acquireHold: () => ({ release: () => true }),
        visibility: null,
      });
      practice.setRange(0.5, 1);
      practice.setGap(1);
      await practice.enable();
      await player.play();
      expect(audio.loop).toBe(false);
      expect(player.state.playbackMode).toBe(mode);
      const revision = player.state.playbackRevision;
      try {
        for (let lap = 0; lap < 22; lap++) {
          progress(audio, 0.75);
          audio.currentTime = 1;
          audio.ended = true;
          audio.paused = true;
          audio.dispatch('pause');
          audio.dispatch('ended');
          await vi.waitFor(() => expect(practice.state.phase).toBe('gap'));
          const sample = player.samplePlaybackClock();
          const output = projectDynamicOutputState({
            player: {
              ...player.state,
              currentTime: sample.positionMs / 1000,
              playbackPhase: sample.phase,
            },
          });
          expect(output.playback.positionMs).toBe(500);
          expect(output.playback.status).toBe('paused');
          expect(sample.continuityRevision).toBeGreaterThan(lap);
          expect(player.state.playbackRevision).toBe(revision);
          if (lap < 19) expect(record).not.toHaveBeenCalled();
          await player.play();
        }
        expect(record).toHaveBeenCalledOnce();
        practice.disable();
        audio.dispatch('ended');
        expect(record).toHaveBeenCalledOnce();
      } finally {
        practice.dispose();
      }
    },
  );

  it('writes playback-history.json once after ten seconds of real player progress events', async () => {
    const { player, service, audio, record } = await createRuntime();

    expect(await player.playTrack(harness.tracksById.get('track-a'))).toBe(
      true,
    );
    expect(player.state.error).toBeNull();
    expect(player.state.isPlaying).toBe(true);
    progress(audio, 5);
    const historyPath = path.join(userDataDir, 'playback-history.json');
    expect(record).not.toHaveBeenCalled();
    expect(fs.existsSync(historyPath)).toBe(false);

    progress(audio, 10);
    expect(record).toHaveBeenCalledExactlyOnceWith('track-a', {
      sourceId: 'playlist-1',
      sourceName: '深夜練唱',
    });
    // Surface the original bridge/write rejection instead of timing out later
    // with the uninformative observation that the file was never created.
    await expect(record.mock.results[0].value).resolves.toHaveLength(1);

    expect(fs.existsSync(historyPath)).toBe(true);
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
      // Source order is recorded when playback starts, not on qualification.
      lastUsedAtBySourceId: {},
    });
    expect(history.state.sourceRecency).toEqual({});
    expect(history.recentItems.value).toEqual([
      expect.objectContaining({
        trackId: 'track-a',
        track: harness.tracksById.get('track-a'),
      }),
    ]);
    expect(history.playCountOf('track-a')).toBe(1);
    expect(service.getPlayCountByTrackId()).toEqual({ 'track-a': 1 });

    progress(audio, 15);
    audio.dispatch('ended');
    expect(record).toHaveBeenCalledOnce();
  });

  it('excludes seek movement while retaining actual playback accumulated before it', async () => {
    const { player, audio, record } = await createRuntime();
    expect(await player.playTrack(harness.tracksById.get('track-a'))).toBe(
      true,
    );
    progress(audio, 5);
    audio.currentTime = 60;
    audio.dispatch('seeking');
    audio.dispatch('timeupdate');
    audio.dispatch('seeked');
    progress(audio, 64);
    expect(record).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(userDataDir, 'playback-history.json'))).toBe(
      false,
    );
    progress(audio, 65);
    expect(record).toHaveBeenCalledOnce();
    await expect(record.mock.results[0].value).resolves.toHaveLength(1);
    expect(history.playCountOf('track-a')).toBe(1);
  });

  it('persists a normally ended short song without waiting for ten seconds', async () => {
    const { player, audio, record, service } = await createRuntime();
    expect(await player.playTrack(harness.tracksById.get('track-a'))).toBe(
      true,
    );
    progress(audio, 3);
    expect(record).not.toHaveBeenCalled();
    audio.dispatch('ended');
    expect(record).toHaveBeenCalledOnce();
    await expect(record.mock.results[0].value).resolves.toHaveLength(1);
    expect(service.getRecentHistory()).toHaveLength(1);
    expect(fs.existsSync(path.join(userDataDir, 'playback-history.json'))).toBe(
      true,
    );
  });

  it('does not persist a failed playback start', async () => {
    const { player, audio, record } = await createRuntime();
    audio.play.mockRejectedValueOnce(new Error('fixture playback failure'));
    expect(await player.playTrack(harness.tracksById.get('track-a'))).toBe(
      false,
    );
    progress(audio, 5);
    progress(audio, 10);
    expect(record).not.toHaveBeenCalled();
    expect(fs.existsSync(path.join(userDataDir, 'playback-history.json'))).toBe(
      false,
    );
  });
});

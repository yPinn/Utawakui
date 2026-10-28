import { expect, it, vi } from 'vitest';
import { useLyricsPlaybackNavigation } from './useLyricsPlaybackNavigation.js';

function setup() {
  const track = { id: 'track', url: 'utawakui-media://track/track/audio.wav' };
  const session = { id: 'source', timingRevision: 't1' };
  const state = { offsetSeconds: 0.5, offsetSave: {}, timingSave: {} };
  const player = {
    state: { track, duration: 20, isPlaying: false },
    samplePlaybackClock: vi.fn(() => ({ trackId: 'track' })),
    seek: vi.fn(),
    play: vi.fn(async () => true),
    playTrack: vi.fn(),
  };
  const arrangementBusy = { value: false };
  const lyricsTiming = { value: { sourceSession: session } };
  const setQueue = vi.fn();
  const navigation = useLyricsPlaybackNavigation({
    state,
    selectedTrack: { value: track },
    lyricsTiming,
    player,
    arrangementBusy,
    setQueue,
  });
  return {
    state,
    session,
    player,
    arrangementBusy,
    lyricsTiming,
    setQueue,
    navigation,
  };
}

it.each([
  'loading',
  'timing-save',
  'offset-save',
  'offset-error',
  'arrangement',
  'pending-start',
  'media',
  'clock',
  'duration',
  'source',
  'revision',
  'EOF',
])(
  'rechecks %s at action time after a valid target was displayed',
  async (kind) => {
    const s = setup();
    expect(
      s.navigation.timingPlaybackTarget(1500, s.session)?.positionSeconds,
    ).toBe(1);
    if (kind === 'loading') s.state.isLoadingLyrics = true;
    if (kind === 'timing-save') s.state.timingSave.isSaving = true;
    if (kind === 'offset-save') s.state.offsetSave.isSaving = true;
    if (kind === 'offset-error') s.state.offsetSave.error = 'failed';
    if (kind === 'arrangement') s.arrangementBusy.value = true;
    if (kind === 'pending-start') s.player.state.pendingStartTrackId = 'next';
    if (kind === 'media') s.player.state.track = { id: 'track', url: 'old' };
    if (kind === 'clock')
      s.player.samplePlaybackClock.mockReturnValue({ trackId: 'other' });
    if (kind === 'duration') s.player.state.duration = NaN;
    if (kind === 'source')
      s.lyricsTiming.value.sourceSession = { ...s.session, id: 'new' };
    if (kind === 'revision')
      s.lyricsTiming.value.sourceSession = {
        ...s.session,
        timingRevision: 't2',
      };
    if (kind === 'EOF') s.player.state.duration = 1;
    expect(await s.navigation.playTimingPosition(1500, s.session)).toBe(false);
    expect(s.player.seek).not.toHaveBeenCalled();
    expect(s.player.play).not.toHaveBeenCalled();
    expect(s.player.playTrack).not.toHaveBeenCalled();
    expect(s.setQueue).not.toHaveBeenCalled();
  },
);

it('keeps seek paused and preserves a failed explicit resume without a replacement start or timing write', async () => {
  const s = setup();
  expect(s.navigation.seekTimingPosition(1500, s.session)).toBe(true);
  expect(s.player.play).not.toHaveBeenCalled();
  s.player.play.mockResolvedValue(false);
  expect(await s.navigation.playTimingPosition(1500, s.session)).toBe(false);
  expect(s.player.seek).toHaveBeenCalledTimes(2);
  expect(s.player.state.isPlaying).toBe(false);
  expect(s.setQueue).not.toHaveBeenCalled();
});

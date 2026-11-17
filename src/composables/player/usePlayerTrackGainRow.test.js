import { effectScope, reactive } from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const player = vi.hoisted(() => ({}));
const gain = vi.hoisted(() => ({}));
vi.mock('../usePlayer.js', () => ({ usePlayer: () => player }));
vi.mock('../useTrackGain.js', () => ({ useTrackGain: () => gain }));

import { usePlayerTrackGainRow } from './usePlayerTrackGainRow.js';

beforeEach(() => {
  vi.useFakeTimers();
  player.state = reactive({ track: { id: 'one' }, trackGainDb: 0 });
  player.setTrackGainDb = vi.fn((value) => {
    player.state.trackGainDb = Math.max(-12, Math.min(6, value));
  });
  Object.assign(gain, {
    range: { min: -12, max: 6, step: 0.5, defaultValue: 0 },
    saveTrackGain: vi.fn(async () => ({ ok: true })),
    gainDbFor: vi.fn(async () => -2),
  });
});
afterEach(() => vi.useRealTimers());

function mountRow() {
  const scope = effectScope();
  const row = scope.run(() => usePlayerTrackGainRow());
  return { row, scope };
}

describe('track gain row', () => {
  it('formats signed dB values and bounds the step buttons', () => {
    const { row, scope } = mountRow();
    expect(row.value).toMatchObject({ key: 'track-gain', value: '0.0 dB' });
    player.state.trackGainDb = -12;
    expect(row.value.value).toBe('−12.0 dB');
    expect(row.value.minusDisabled).toBe(true);
    player.state.trackGainDb = 6;
    expect(row.value.value).toBe('+6.0 dB');
    expect(row.value.plusDisabled).toBe(true);
    scope.stop();
  });

  it('previews at once and saves only the last value after the drag', async () => {
    const { row, scope } = mountRow();
    row.value.onSliderInput(-1);
    row.value.onPlus();
    expect(player.state.trackGainDb).toBe(-0.5);
    expect(gain.saveTrackGain).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(gain.saveTrackGain).toHaveBeenCalledExactlyOnceWith('one', -0.5);
    scope.stop();
  });

  it('restores the saved value when saving fails', async () => {
    gain.saveTrackGain.mockResolvedValueOnce({ ok: false, status: 'stale' });
    const { row, scope } = mountRow();
    row.value.onMinus();
    await vi.advanceTimersByTimeAsync(400);
    expect(player.setTrackGainDb).toHaveBeenLastCalledWith(-2);
    scope.stop();
  });

  it('ignores input without a track and cancels a pending save on dispose', async () => {
    const { row, scope } = mountRow();
    row.value.onSliderInput(2);
    scope.stop();
    await vi.advanceTimersByTimeAsync(400);
    expect(gain.saveTrackGain).not.toHaveBeenCalled();
    player.state.track = null;
    const other = mountRow();
    other.row.value.onSliderInput(3);
    expect(player.setTrackGainDb).toHaveBeenCalledTimes(1);
    other.scope.stop();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import effectsModule from './outputFisheyeEffects.js';

const { createOutputFisheyeEffects } = effectsModule;

describe('Output Fisheye effects', () => {
  afterEach(() => vi.useRealTimers());

  it('validates manual events, limits overlaps and stops automatic events on template change', () => {
    vi.useFakeTimers();
    vi.setSystemTime(1000);
    const publish = vi.fn(() => true);
    let available = true;
    const effects = createOutputFisheyeEffects({
      isAvailable: () => available,
      publish,
    });

    expect(effects.control({ effect: 'glitch' }).state).toBe('invalid-action');
    expect(effects.control('auto-on')).toEqual({
      state: 'ready',
      automatic: true,
    });
    expect(effects.control('glitch')).toMatchObject({ sent: true });
    expect(publish).toHaveBeenCalledExactlyOnceWith({
      type: 'overlay.fisheye.effect',
      effect: 'glitch',
      startedAt: 1000,
      durationMs: 330,
    });
    expect(effects.control('grain').state).toBe('busy');
    vi.advanceTimersByTime(2700);
    expect(publish).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3200);
    expect(publish).toHaveBeenCalledTimes(2);

    available = false;
    effects.onAvailabilityChanged();
    vi.advanceTimersByTime(15_000);
    expect(publish).toHaveBeenCalledTimes(2);
    expect(effects.control('status')).toEqual({
      state: 'unavailable',
      automatic: false,
    });
  });
});

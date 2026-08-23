import { describe, expect, it, vi } from 'vitest';
import {
  recordRendererMilestone,
  scheduleFirstPaintMilestone,
} from './startupTrace.js';

describe('renderer startup trace', () => {
  it('does nothing in normal product runs', () => {
    const bridge = { recordStartupMilestone: vi.fn() };
    expect(
      recordRendererMilestone('interactive-shell', {
        bridge,
        performance: { timeOrigin: 1000, now: () => 50 },
      }),
    ).toBe(false);
    expect(bridge.recordStartupMilestone).not.toHaveBeenCalled();
  });

  it('reports correlated renderer time without application data', () => {
    const bridge = {
      startupTraceEnabled: true,
      recordStartupMilestone: vi.fn(),
    };
    expect(
      recordRendererMilestone('interactive-shell', {
        bridge,
        performance: { timeOrigin: 1000, now: () => 50.25 },
      }),
    ).toBe(true);
    expect(bridge.recordStartupMilestone).toHaveBeenCalledWith({
      name: 'interactive-shell',
      atUnixMs: 1050.25,
    });
  });

  it('uses the browser paint entry after two animation frames', () => {
    const callbacks = [];
    const bridge = {
      startupTraceEnabled: true,
      recordStartupMilestone: vi.fn(),
    };
    const performance = {
      timeOrigin: 1000,
      now: () => 90,
      getEntriesByName: vi.fn(() => [{ startTime: 42.5 }]),
    };

    expect(
      scheduleFirstPaintMilestone({
        bridge,
        performance,
        requestAnimationFrame: (callback) => callbacks.push(callback),
      }),
    ).toBe(true);
    callbacks.shift()();
    expect(bridge.recordStartupMilestone).not.toHaveBeenCalled();
    callbacks.shift()();
    expect(bridge.recordStartupMilestone).toHaveBeenCalledWith({
      name: 'first-paint',
      atUnixMs: 1042.5,
    });
  });
});

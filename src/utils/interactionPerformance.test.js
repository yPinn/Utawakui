import { describe, expect, it, vi } from 'vitest';
import { measureInteractionToNextPaint } from './interactionPerformance.js';

describe('measureInteractionToNextPaint', () => {
  it('measures a synchronous interaction after the next painted frame', () => {
    const frames = [];
    const performanceTarget = {
      mark: vi.fn(),
      measure: vi.fn(),
      clearMarks: vi.fn(),
    };
    const action = vi.fn(() => 'result');

    const result = measureInteractionToNextPaint('queue-open', action, {
      enabled: true,
      performanceTarget,
      requestFrame: (callback) => frames.push(callback),
    });

    expect(result).toBe('result');
    expect(action).toHaveBeenCalledOnce();
    expect(performanceTarget.measure).not.toHaveBeenCalled();

    frames.shift()();
    expect(performanceTarget.measure).not.toHaveBeenCalled();
    frames.shift()();

    expect(performanceTarget.measure).toHaveBeenCalledWith(
      'queue-open',
      expect.stringContaining(':start:'),
      expect.stringContaining(':end:'),
    );
    expect(performanceTarget.clearMarks).toHaveBeenCalledTimes(2);
  });

  it('runs the action without scheduling diagnostics when disabled', () => {
    const requestFrame = vi.fn();
    const action = vi.fn(() => 42);

    expect(
      measureInteractionToNextPaint('queue-open', action, {
        enabled: false,
        requestFrame,
      }),
    ).toBe(42);
    expect(requestFrame).not.toHaveBeenCalled();
  });
});

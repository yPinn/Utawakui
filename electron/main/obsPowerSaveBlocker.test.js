import { describe, expect, it, vi } from 'vitest';
import { createObsPowerSaveBlocker } from './obsPowerSaveBlocker.js';

function fakePowerSaveBlocker() {
  let nextId = 1;
  return {
    start: vi.fn(() => nextId++),
    stop: vi.fn(),
  };
}

function statusWith({ streaming = false, recording = false } = {}) {
  return {
    observed: {
      streaming: { active: streaming },
      recording: { active: recording },
    },
  };
}

describe('obsPowerSaveBlocker', () => {
  it('starts a blocker the moment streaming goes active, and only once', () => {
    const powerSaveBlocker = fakePowerSaveBlocker();
    const blocker = createObsPowerSaveBlocker({ powerSaveBlocker });

    blocker.sync(statusWith({ streaming: true }));
    blocker.sync(statusWith({ streaming: true }));

    expect(powerSaveBlocker.start).toHaveBeenCalledOnce();
    expect(powerSaveBlocker.start).toHaveBeenCalledWith(
      'prevent-display-sleep',
    );
    expect(blocker.isActive()).toBe(true);
  });

  it('starts for recording alone, without requiring streaming', () => {
    const powerSaveBlocker = fakePowerSaveBlocker();
    const blocker = createObsPowerSaveBlocker({ powerSaveBlocker });

    blocker.sync(statusWith({ recording: true }));

    expect(powerSaveBlocker.start).toHaveBeenCalledOnce();
    expect(blocker.isActive()).toBe(true);
  });

  it('stops only once both streaming and recording go inactive', () => {
    const powerSaveBlocker = fakePowerSaveBlocker();
    const blocker = createObsPowerSaveBlocker({ powerSaveBlocker });

    blocker.sync(statusWith({ streaming: true, recording: true }));
    blocker.sync(statusWith({ streaming: false, recording: true }));
    expect(powerSaveBlocker.stop).not.toHaveBeenCalled();

    blocker.sync(statusWith({ streaming: false, recording: false }));
    expect(powerSaveBlocker.stop).toHaveBeenCalledOnce();
    expect(blocker.isActive()).toBe(false);
  });

  it('re-arms with a fresh blocker after stopping and going live again', () => {
    const powerSaveBlocker = fakePowerSaveBlocker();
    const blocker = createObsPowerSaveBlocker({ powerSaveBlocker });

    blocker.sync(statusWith({ streaming: true }));
    blocker.sync(statusWith({ streaming: false }));
    blocker.sync(statusWith({ streaming: true }));

    expect(powerSaveBlocker.start).toHaveBeenCalledTimes(2);
    expect(powerSaveBlocker.stop).toHaveBeenCalledTimes(1);
  });

  it('tolerates a missing/malformed status without throwing', () => {
    const powerSaveBlocker = fakePowerSaveBlocker();
    const blocker = createObsPowerSaveBlocker({ powerSaveBlocker });

    expect(() => blocker.sync(null)).not.toThrow();
    expect(() => blocker.sync({})).not.toThrow();
    expect(powerSaveBlocker.start).not.toHaveBeenCalled();
  });

  it('accepts an override blocker type', () => {
    const powerSaveBlocker = fakePowerSaveBlocker();
    const blocker = createObsPowerSaveBlocker({
      powerSaveBlocker,
      blockerType: 'prevent-app-suspension',
    });

    blocker.sync(statusWith({ streaming: true }));

    expect(powerSaveBlocker.start).toHaveBeenCalledWith(
      'prevent-app-suspension',
    );
  });
});

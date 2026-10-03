import { describe, expect, it } from 'vitest';

import { createBgmSessionModeProjector } from './sessionMode.js';

function observed({
  lifecycle = 'ready',
  streaming = false,
  recording = false,
} = {}) {
  return {
    lifecycle,
    streaming: { active: streaming },
    recording: { active: recording },
  };
}

describe('BGM session mode projection', () => {
  it('uses live before record and falls back without rebuilding the session', () => {
    const projector = createBgmSessionModeProjector();

    expect(projector.update(observed({ recording: true }))).toBe('record');
    expect(
      projector.update(observed({ streaming: true, recording: true })),
    ).toBe('live');
    expect(projector.update(observed({ recording: true }))).toBe('record');
  });

  it('does not invent a reconnecting session at application startup', () => {
    const projector = createBgmSessionModeProjector();

    expect(projector.update(observed({ lifecycle: 'disconnected' }))).toBe(
      'inactive',
    );
    expect(projector.update(null)).toBe('inactive');
  });

  it('latches reconnecting only after a confirmed active session', () => {
    const projector = createBgmSessionModeProjector();

    expect(projector.update(observed({ streaming: true }))).toBe('live');
    expect(projector.update(observed({ lifecycle: 'connecting' }))).toBe(
      'reconnecting',
    );
    expect(projector.update(observed({ lifecycle: 'error' }))).toBe(
      'reconnecting',
    );
    expect(projector.update(observed())).toBe('inactive');
    expect(projector.update(observed({ lifecycle: 'disconnected' }))).toBe(
      'inactive',
    );
  });
});

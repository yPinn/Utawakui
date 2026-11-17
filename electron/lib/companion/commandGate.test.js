import { describe, expect, it } from 'vitest';
import {
  COMPANION_COMMANDS,
  createCommandAdmission,
  parseCompanionCommand,
} from './commandGate.js';

const valid = {
  command: 'player.next',
  sequence: 1,
  revision: 3,
  trackId: 'abc',
};

describe('companion command gate', () => {
  it('lists the contract command set', () => {
    expect(COMPANION_COMMANDS).toHaveLength(13);
    expect(COMPANION_COMMANDS).not.toContain('queue.clear');
  });

  it('accepts exactly the four bounded fields', () => {
    expect(parseCompanionCommand(valid)).toEqual(valid);
    for (const body of [
      null,
      [],
      { ...valid, extra: 1 },
      { ...valid, command: 'queue.clear' },
      { ...valid, sequence: -1 },
      { ...valid, sequence: 1.5 },
      { ...valid, revision: '3' },
      { ...valid, trackId: '' },
      { ...valid, trackId: 'x'.repeat(201) },
      { command: 'player.next', sequence: 1, revision: 3 },
    ])
      expect(parseCompanionCommand(body)).toBeNull();
  });

  it('rejects repeated or older sequences per device', () => {
    let time = 0;
    const admission = createCommandAdmission({ now: () => (time += 200) });
    expect(
      admission.admit('d1', { command: 'player.next', sequence: 5 }),
    ).toBeNull();
    expect(admission.admit('d1', { command: 'player.next', sequence: 5 })).toBe(
      'stale',
    );
    expect(admission.admit('d1', { command: 'player.next', sequence: 4 })).toBe(
      'stale',
    );
    expect(
      admission.admit('d2', { command: 'player.next', sequence: 1 }),
    ).toBeNull();
    admission.forget('d1');
    expect(
      admission.admit('d1', { command: 'player.next', sequence: 1 }),
    ).toBeNull();
  });

  it('limits a device to eight commands a second and one repeat per 100 ms', () => {
    let time = 0;
    const admission = createCommandAdmission({ now: () => time });
    expect(
      admission.admit('d1', { command: 'player.mute', sequence: 1 }),
    ).toBeNull();
    time = 50;
    expect(admission.admit('d1', { command: 'player.mute', sequence: 2 })).toBe(
      'rate-limited',
    );
    const commands = COMPANION_COMMANDS.filter(
      (command) => command !== 'player.mute',
    ).slice(0, 7);
    commands.forEach((command, index) => {
      time = 60 + index;
      expect(
        admission.admit('d1', { command, sequence: 10 + index }),
      ).toBeNull();
    });
    time = 70;
    expect(
      admission.admit('d1', { command: 'reading.off', sequence: 30 }),
    ).toBe('rate-limited');
    time = 1100;
    expect(
      admission.admit('d1', { command: 'reading.off', sequence: 31 }),
    ).toBeNull();
  });
});

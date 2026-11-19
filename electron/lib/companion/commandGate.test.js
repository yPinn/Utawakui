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
    expect(new Set(COMPANION_COMMANDS).size).toBe(COMPANION_COMMANDS.length);
    for (const command of [
      'player.tempo-75',
      'player.accompaniment',
      'player.transpose-original',
    ])
      expect(parseCompanionCommand({ ...valid, command })).toEqual({
        ...valid,
        command,
      });
    expect(COMPANION_COMMANDS).toContain('queue.clear');
  });

  it('accepts exactly the four bounded fields', () => {
    expect(parseCompanionCommand(valid)).toEqual(valid);
    for (const body of [
      null,
      [],
      { ...valid, extra: 1 },
      { ...valid, command: 'queue.edit' },
      { ...valid, command: 'lyrics.offset-up' },
      { ...valid, command: 'lyrics.offset-down' },
      { ...valid, command: 'player.tempo-77' },
      { ...valid, command: 'player.tempo-75', tempoRate: 4 },
      { ...valid, sequence: -1 },
      { ...valid, sequence: 1.5 },
      { ...valid, revision: '3' },
      { ...valid, trackId: '' },
      { ...valid, trackId: 'x'.repeat(201) },
      { command: 'player.next', sequence: 1, revision: 3 },
    ])
      expect(parseCompanionCommand(body)).toBeNull();
  });

  it('accepts an integer position only for seek', () => {
    const seek = { ...valid, command: 'player.seek', positionMs: 2500 };
    expect(parseCompanionCommand(seek)).toEqual(seek);
    for (const positionMs of [undefined, -1, 1.5, '2500'])
      expect(parseCompanionCommand({ ...seek, positionMs })).toBeNull();
    expect(parseCompanionCommand({ ...valid, positionMs: 2500 })).toBeNull();
  });

  it('accepts only a known layout option for a specific template', () => {
    const outputChange = {
      templateId: 'phantom-thieves',
      fieldKey: 'phantomMode',
      value: 'chat',
    };
    const change = {
      ...valid,
      command: 'output.set-option',
      trackId: '',
      outputChange,
    };
    expect(parseCompanionCommand(change)).toEqual(change);
    for (const invalid of [
      { templateId: 'art-card' },
      { fieldKey: 'phantomPortraitPhoto' },
      { value: 'file:///image' },
      { path: 'image.png' },
    ]) {
      expect(
        parseCompanionCommand({
          ...change,
          outputChange: { ...outputChange, ...invalid },
        }),
      ).toBeNull();
    }
  });

  it('accepts only a bounded published queue index for picking a track', () => {
    const pick = {
      ...valid,
      command: 'queue.play',
      queueIndex: 0,
      trackId: '',
    };
    expect(parseCompanionCommand(pick)).toEqual(pick);
    for (const queueIndex of [undefined, -1, 100, '0', 0.5])
      expect(parseCompanionCommand({ ...pick, queueIndex })).toBeNull();
    expect(parseCompanionCommand({ ...pick, url: 'file:///track' })).toBeNull();
    expect(parseCompanionCommand({ ...valid, trackId: '' })).toBeNull();
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

import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { createMicrophoneResearchAccess } from './microphoneResearchAccess.js';

function harness(enabled = true) {
  const sender = {
    getURL: () => 'http://localhost:5173/',
    isDestroyed: () => false,
  };
  let time = 0;
  let sequence = 0;
  const access = createMicrophoneResearchAccess({
    enabled,
    getAllowedSender: () => sender,
    now: () => time,
    createId: () => `lease-${++sequence}`,
  });
  return {
    access,
    sender,
    advance: (ms) => {
      time += ms;
    },
  };
}

describe('microphone research access', () => {
  it('defaults closed and revokes even same-URL reloads and renderer crashes', () => {
    expect(createMicrophoneResearchAccess().begin({})).toBeNull();
    const sender = Object.assign(new EventEmitter(), {
      getURL: () => 'file:///app/index.html',
    });
    const access = createMicrophoneResearchAccess({
      enabled: true,
      getAllowedSender: () => sender,
    });
    for (const event of [
      'did-start-navigation',
      'render-process-gone',
      'destroyed',
    ]) {
      access.begin(sender);
      expect(access.isAllowed(sender)).toBe(true);
      sender.emit(event);
      expect(access.isAllowed(sender)).toBe(false);
      expect(sender.listenerCount('did-start-navigation')).toBe(0);
    }
  });
  it('denies production and starts closed in development', () => {
    const { access, sender } = harness(false);
    expect(access.begin(sender)).toBeNull();
    expect(access.isAllowed(sender)).toBe(false);
    const dev = harness();
    expect(dev.access.isAllowed(dev.sender)).toBe(false);
  });
  it('binds a short lease to the current main document', () => {
    const { access, sender, advance } = harness();
    expect(access.begin({ getURL: sender.getURL })).toBeNull();
    const lease = access.begin(sender);
    expect(access.isAllowed(sender)).toBe(true);
    expect(access.isAllowed(null)).toBe(false);
    advance(30_001);
    expect(access.isAllowed(sender)).toBe(false);
    expect(access.end(sender, lease)).toBe(true);
  });
  it('does not let old cleanup revoke a newer lease', () => {
    const { access, sender } = harness();
    const first = access.begin(sender);
    const second = access.begin(sender);
    expect(access.end(sender, first)).toBe(false);
    expect(access.isAllowed(sender)).toBe(true);
    expect(access.end(sender, second)).toBe(true);
    expect(access.isAllowed(sender)).toBe(false);
  });
  it('rejects navigation and destroyed documents', () => {
    const { access, sender } = harness();
    access.begin(sender);
    sender.getURL = () => 'http://localhost:5173/other';
    expect(access.isAllowed(sender)).toBe(false);
    sender.isDestroyed = () => true;
    expect(access.begin(sender)).toBeNull();
  });
  it('registers fixed IPC intents with the same production gate', () => {
    const { access, sender } = harness();
    const handlers = new Map();
    access.register({
      handle: vi.fn((channel, fn) => handlers.set(channel, fn)),
    });
    const lease = handlers.get('microphone-research:begin')({ sender });
    expect(typeof lease).toBe('string');
    expect(handlers.get('microphone-research:end')({ sender }, { lease })).toBe(
      false,
    );
    expect(handlers.get('microphone-research:end')({ sender }, lease)).toBe(
      true,
    );
  });
});

import { EventEmitter } from 'node:events';

import { describe, expect, it, vi } from 'vitest';
import webContentsSecurityModule from './webContentsSecurity.js';

const { hardenWebContentsNavigation } = webContentsSecurityModule;

class FakeWebContents extends EventEmitter {
  setWindowOpenHandler = vi.fn();
}

describe('webContents navigation hardening', () => {
  it('denies child windows and permits only explicitly trusted navigation', () => {
    const webContents = new FakeWebContents();
    hardenWebContentsNavigation(webContents, {
      isAllowedNavigation: (url) => url === 'https://trusted.example/app',
    });

    expect(webContents.setWindowOpenHandler.mock.calls[0][0]()).toEqual({
      action: 'deny',
    });

    for (const eventName of ['will-navigate', 'will-redirect']) {
      const allowedEvent = { preventDefault: vi.fn() };
      webContents.emit(eventName, allowedEvent, 'https://trusted.example/app');
      expect(allowedEvent.preventDefault).not.toHaveBeenCalled();

      const blockedEvent = { preventDefault: vi.fn() };
      webContents.emit(eventName, blockedEvent, 'https://attacker.example/');
      expect(blockedEvent.preventDefault).toHaveBeenCalledOnce();
    }
  });

  it('fails closed when the allow predicate throws or is omitted', () => {
    for (const options of [
      {},
      {
        isAllowedNavigation() {
          throw new Error('private policy failure');
        },
      },
    ]) {
      const webContents = new FakeWebContents();
      hardenWebContentsNavigation(webContents, options);
      const event = { preventDefault: vi.fn() };

      webContents.emit('will-navigate', event, 'https://example.com/');

      expect(event.preventDefault).toHaveBeenCalledOnce();
    }
  });
});

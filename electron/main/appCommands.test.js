import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import appCommandsModule from './appCommands.js';

const { forwardHistoryAppCommands, historyDirectionForAppCommand } =
  appCommandsModule;

function createWindowDouble({ destroyed = false } = {}) {
  const win = new EventEmitter();
  win.isDestroyed = vi.fn(() => destroyed);
  win.webContents = { send: vi.fn(), isDestroyed: vi.fn(() => destroyed) };
  return win;
}

describe('historyDirectionForAppCommand', () => {
  it('maps only the browser back and forward commands', () => {
    expect(historyDirectionForAppCommand('browser-backward')).toBe('back');
    expect(historyDirectionForAppCommand('browser-forward')).toBe('forward');
    for (const command of [
      'browser-home',
      'browser-refresh',
      'media-play-pause',
      'media-nexttrack',
      '',
      undefined,
    ]) {
      expect(historyDirectionForAppCommand(command)).toBe(null);
    }
  });
});

describe('forwardHistoryAppCommands', () => {
  it('forwards browser back and forward to the renderer as fixed intents', () => {
    const win = createWindowDouble();
    forwardHistoryAppCommands(win);

    win.emit('app-command', {}, 'browser-backward');
    win.emit('app-command', {}, 'browser-forward');

    expect(win.webContents.send).toHaveBeenNthCalledWith(
      1,
      'app:history-command',
      'back',
    );
    expect(win.webContents.send).toHaveBeenNthCalledWith(
      2,
      'app:history-command',
      'forward',
    );
  });

  it('leaves every other app command untouched', () => {
    const win = createWindowDouble();
    forwardHistoryAppCommands(win);

    win.emit('app-command', {}, 'media-play-pause');
    win.emit('app-command', {}, 'browser-home');

    expect(win.webContents.send).not.toHaveBeenCalled();
  });

  it('does not message a destroyed window', () => {
    const win = createWindowDouble({ destroyed: true });
    forwardHistoryAppCommands(win);

    win.emit('app-command', {}, 'browser-backward');

    expect(win.webContents.send).not.toHaveBeenCalled();
  });
});

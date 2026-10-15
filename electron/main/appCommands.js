'use strict';

// Windows delivers the mouse back／forward buttons and the keyboard browser keys
// as app commands, sometimes in addition to DOM events. Only these two are mapped;
// the renderer deduplicates against its own DOM listeners (ADR 0025).
const HISTORY_DIRECTION_BY_APP_COMMAND = Object.freeze({
  'browser-backward': 'back',
  'browser-forward': 'forward',
});

function historyDirectionForAppCommand(command) {
  return HISTORY_DIRECTION_BY_APP_COMMAND[command] ?? null;
}

function forwardHistoryAppCommands(window) {
  window.on('app-command', (_event, command) => {
    const direction = historyDirectionForAppCommand(command);
    if (!direction) return;
    if (window.isDestroyed?.() || window.webContents?.isDestroyed?.()) return;
    window.webContents.send('app:history-command', direction);
  });
}

module.exports = { forwardHistoryAppCommands, historyDirectionForAppCommand };

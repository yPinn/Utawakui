'use strict';

const { isValidObsIntegration } = require('../lib/config');
const {
  maxPasswordLength: OBS_PASSWORD_MAX_LENGTH,
} = require('../../shared/obsConnectionValues.json');

const MAX_MARKER_LABEL_LENGTH = 200;
// A generated chapter list scales with setlist length, not a short label —
// generous relative to the renderer's own 8000-char UI cap (obsChapters.js
// consumers), just a sanity backstop against a malformed/rogue caller.
const MAX_COPY_TEXT_LENGTH = 20_000;

function registerObsHandlers({
  ipcMain,
  adapter,
  credentialStore,
  sessionHistoryService,
  requireFeatureGate,
  featureId,
  getConfig,
  updateConfig,
  writeClipboardText = null,
}) {
  ipcMain.handle('obs:get-status', async () => adapter.getStatus());

  ipcMain.handle('obs:get-settings', async () => ({
    ...getConfig().obsIntegration,
    hasPassword: credentialStore.hasPassword(),
  }));

  // password is write-only past this point — it never round-trips back to
  // the renderer through obs:get-settings (see ADR 0013: no vendor secret
  // in renderer state or exports).
  ipcMain.handle('obs:update-settings', async (_event, value) => {
    requireFeatureGate(featureId);
    const { password, ...connectionSettings } = value ?? {};
    if (!isValidObsIntegration(connectionSettings)) {
      throw new Error('invalid OBS integration settings');
    }
    const hasPasswordIntent = Object.hasOwn(value ?? {}, 'password');
    if (
      hasPasswordIntent &&
      (typeof password !== 'string' ||
        password.length === 0 ||
        password.length > OBS_PASSWORD_MAX_LENGTH)
    ) {
      throw new Error('invalid OBS password');
    }
    if (hasPasswordIntent && !credentialStore.savePassword(password)) {
      throw new Error('OBS credential storage unavailable');
    }
    updateConfig({ obsIntegration: connectionSettings });
    return adapter.configure(connectionSettings);
  });

  // Credential deletion is a recovery/privacy action like disconnect: it stays
  // available even when the feature gate is later disabled. The operation is
  // explicit instead of overloading an empty password in update-settings.
  ipcMain.handle('obs:clear-password', async () => {
    if (!credentialStore.clearPassword()) {
      throw new Error('OBS credential removal failed');
    }
    return { hasPassword: false };
  });

  ipcMain.handle('obs:connect', async () => {
    requireFeatureGate(featureId);
    return adapter.connect();
  });

  ipcMain.handle('obs:disconnect', async () => adapter.disconnect());

  // Resolves null when there's nothing to mark against (not currently
  // live/recording) — see sessionHistoryService.js's own addMarker() doc.
  ipcMain.handle('obs:add-marker', async (_event, label) => {
    requireFeatureGate(featureId);
    if (label !== undefined && label !== null && typeof label !== 'string') {
      throw new Error('invalid marker label');
    }
    if (typeof label === 'string' && label.length > MAX_MARKER_LABEL_LENGTH) {
      throw new Error(
        `marker label must be at most ${MAX_MARKER_LABEL_LENGTH} characters`,
      );
    }
    return sessionHistoryService.addMarker(label);
  });

  // The live session if one is running, otherwise the most recently
  // completed one — see sessionHistoryService.js's getLatestSession() doc.
  // Read-only, so not feature-gated beyond the adapter/session existing at
  // all (nothing here can affect OBS or the session itself).
  ipcMain.handle('obs:get-latest-session', async () =>
    sessionHistoryService.getLatestSession(),
  );

  // Same per-domain clipboard pattern as output:copy-url in
  // outputHandlers.js — text here is a renderer-computed YouTube chapter
  // list (obsChapters.js's projectYoutubeChapters), not a server-derived
  // value, so this takes the text directly instead of a `kind` to look up.
  ipcMain.handle('obs:copy-text', async (_event, value) => {
    if (typeof value !== 'string' || value.length === 0) {
      throw new Error('nothing to copy');
    }
    if (value.length > MAX_COPY_TEXT_LENGTH) {
      throw new Error(
        `text must be at most ${MAX_COPY_TEXT_LENGTH} characters`,
      );
    }
    if (typeof writeClipboardText !== 'function') {
      throw new Error('clipboard unavailable');
    }
    writeClipboardText(value);
    return true;
  });
}

module.exports = { registerObsHandlers };

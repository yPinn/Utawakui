'use strict';

const fs = require('fs');
const path = require('path');

// Machine-local, never a preset/export — same posture as config.json (see
// configState.js's own comment), but split into its own file because
// safeStorage ciphertext is binary, not JSON, and ADR 0013 requires the OBS
// WebSocket password to never enter config.json.
const CREDENTIAL_FILENAME = 'obs-credentials.bin';

function createObsCredentialStore({ app, safeStorage, logger = console }) {
  function credentialPath() {
    return path.join(app.getPath('userData'), CREDENTIAL_FILENAME);
  }

  // Windows backs safeStorage with DPAPI (per-user encryption), which is
  // always available once a user is logged in; this still degrades cleanly
  // on platforms/configurations (e.g. some Linux keyring setups) where it
  // isn't — no password is ever written unencrypted as a fallback.
  function isAvailable() {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch (error) {
      logger.error?.('[obs-credential-store] availability check failed', error);
      return false;
    }
  }

  function savePassword(password) {
    if (!isAvailable()) return false;
    try {
      const encrypted = safeStorage.encryptString(password ?? '');
      fs.writeFileSync(credentialPath(), encrypted);
      return true;
    } catch (error) {
      logger.error?.('[obs-credential-store] save failed', error);
      return false;
    }
  }

  function loadPassword() {
    if (!isAvailable()) return null;
    try {
      const encrypted = fs.readFileSync(credentialPath());
      return safeStorage.decryptString(encrypted);
    } catch (error) {
      if (error.code !== 'ENOENT') {
        logger.error?.('[obs-credential-store] load failed', error);
      }
      return null;
    }
  }

  function hasPassword() {
    try {
      return fs.existsSync(credentialPath());
    } catch {
      return false;
    }
  }

  function clearPassword() {
    try {
      fs.rmSync(credentialPath(), { force: true });
      return true;
    } catch (error) {
      logger.error?.('[obs-credential-store] clear failed', error);
      return false;
    }
  }

  return {
    isAvailable,
    savePassword,
    loadPassword,
    hasPassword,
    clearPassword,
  };
}

module.exports = { createObsCredentialStore, CREDENTIAL_FILENAME };

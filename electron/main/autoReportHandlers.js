'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { atomicWriteJson } = require('../lib/atomicWrite');

const AUTO_REPORT_STATE_FILENAME = 'auto-report.json';

// Throttle history and the one pending report (ADR 0029).
function createAutoReportStateStore(
  userDataDir,
  { readFile = fs.readFileSync, writeJson = atomicWriteJson } = {},
) {
  const filePath = path.join(userDataDir, AUTO_REPORT_STATE_FILENAME);
  return {
    read() {
      try {
        return JSON.parse(readFile(filePath, 'utf8'));
      } catch {
        return null;
      }
    },
    write(value) {
      writeJson(filePath, value);
    },
  };
}

function registerAutoReportHandlers({ ipcMain, monitor }) {
  // The renderer pulls on mount so a prompt raised while it was down or
  // reloading after a crash is still offered.
  ipcMain.handle('auto-report:get-pending', async () =>
    monitor.pendingPrompt(),
  );
  ipcMain.handle('auto-report:respond', async (event, input) => {
    const reportId = input?.reportId;
    const decision = input?.decision;
    if (typeof reportId !== 'string' || typeof decision !== 'string') {
      return { ok: false };
    }
    return monitor.respond(reportId, decision);
  });
}

module.exports = {
  AUTO_REPORT_STATE_FILENAME,
  createAutoReportStateStore,
  registerAutoReportHandlers,
};

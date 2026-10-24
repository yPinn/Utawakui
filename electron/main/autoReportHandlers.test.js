import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import handlersModule from './autoReportHandlers.js';

const {
  AUTO_REPORT_STATE_FILENAME,
  createAutoReportStateStore,
  registerAutoReportHandlers,
} = handlersModule;

const tempDirs = [];
afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe('auto report handlers', () => {
  it('persists state in userData and treats a damaged file as empty', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'utawakui-auto-'));
    tempDirs.push(dir);
    const store = createAutoReportStateStore(dir);

    expect(store.read()).toBeNull();
    store.write({ version: 1, pending: null });
    expect(store.read()).toEqual({ version: 1, pending: null });

    fs.writeFileSync(path.join(dir, AUTO_REPORT_STATE_FILENAME), '{broken');
    expect(store.read()).toBeNull();
  });

  it('exposes only the pending prompt and a validated response', async () => {
    const handlers = new Map();
    const monitor = {
      pendingPrompt: vi.fn(() => ({ reportId: 'r-1' })),
      respond: vi.fn(async () => ({ ok: true, sent: true })),
    };
    registerAutoReportHandlers({
      ipcMain: { handle: (channel, handler) => handlers.set(channel, handler) },
      monitor,
    });

    expect([...handlers.keys()]).toEqual([
      'auto-report:get-pending',
      'auto-report:respond',
    ]);
    await expect(handlers.get('auto-report:get-pending')()).resolves.toEqual({
      reportId: 'r-1',
    });
    await expect(
      handlers.get('auto-report:respond')(null, {
        reportId: 'r-1',
        decision: 'once',
      }),
    ).resolves.toEqual({ ok: true, sent: true });
    await expect(
      handlers.get('auto-report:respond')(null, { reportId: 1 }),
    ).resolves.toEqual({ ok: false });
    expect(monitor.respond).toHaveBeenCalledOnce();
  });
});

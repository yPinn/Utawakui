import { beforeEach, describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';
import { FEATURE_GATES } from '../lib/featureGates.js';
import { registerFeatureGateHandlers } from './featureGateHandlers.js';

const PROVIDER_ID = 'provider-flow';
const NOTICE_VERSION = FEATURE_GATES[PROVIDER_ID].noticeVersion;

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

function register(overrides = {}) {
  const ipcMain = createIpcMain();
  let config = {
    featureConfirmations: {},
  };
  const getConfig = vi.fn(() => config);
  const updateConfig = vi.fn((patch) => {
    config = { ...config, ...patch };
    return config;
  });
  const recordDiagnostic = vi.fn(() => ({ ok: true }));
  const dependencies = {
    ipcMain,
    getConfig,
    updateConfig,
    recordDiagnostic,
    ...overrides,
  };
  registerFeatureGateHandlers(dependencies);
  return { ...dependencies, ipcMain };
}

beforeEach(() => {
  vi.useRealTimers();
});

describe('registerFeatureGateHandlers', () => {
  it('registers only list and confirm intents', () => {
    const { ipcMain } = register();

    expect([...ipcMain.handlers.keys()]).toEqual([
      'feature-gates:list',
      'feature-gates:confirm',
    ]);
  });

  it('returns only normalized current confirmations', async () => {
    const getConfig = vi.fn(() => ({
      featureConfirmations: {
        [PROVIDER_ID]: {
          noticeVersion: NOTICE_VERSION,
          confirmedAt: '2026-08-25T12:00:00.000Z',
          enabled: true,
        },
        'lyrics-flow': {
          noticeVersion: 'stale-notice',
          confirmedAt: '2026-08-25T12:00:00.000Z',
          enabled: true,
        },
      },
    }));
    const { ipcMain } = register({ getConfig });

    await expect(ipcMain.handlers.get('feature-gates:list')()).resolves.toEqual(
      {
        [PROVIDER_ID]: {
          featureId: PROVIDER_ID,
          noticeVersion: NOTICE_VERSION,
          confirmedAt: '2026-08-25T12:00:00.000Z',
          enabled: true,
        },
      },
    );
  });

  it('persists a main-built confirmation for the current notice', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-25T12:00:00.000Z'));
    const { ipcMain, updateConfig } = register();

    await expect(
      ipcMain.handlers.get('feature-gates:confirm')(
        null,
        PROVIDER_ID,
        NOTICE_VERSION,
      ),
    ).resolves.toEqual({
      featureId: PROVIDER_ID,
      noticeVersion: NOTICE_VERSION,
      confirmedAt: '2026-08-25T12:00:00.000Z',
      enabled: true,
    });
    expect(updateConfig).toHaveBeenCalledWith({
      featureConfirmations: {
        [PROVIDER_ID]: expect.objectContaining({
          featureId: PROVIDER_ID,
          enabled: true,
        }),
      },
    });
  });

  it.each([
    [
      'unknown feature',
      '../private-feature',
      NOTICE_VERSION,
      'FEATURE_GATE_UNKNOWN',
    ],
    ['prototype-chain feature', '__proto__', undefined, 'FEATURE_GATE_UNKNOWN'],
    [
      'stale notice',
      PROVIDER_ID,
      'private-stale-version',
      'FEATURE_GATE_NOTICE_STALE',
    ],
  ])(
    'rejects %s without reflection or diagnostics',
    async (label, featureId, noticeVersion, code) => {
      const { ipcMain, recordDiagnostic, updateConfig } = register();

      const thrown = await ipcMain.handlers
        .get('feature-gates:confirm')(null, featureId, noticeVersion)
        .catch((error) => error);

      expect(thrown.message).toContain(APP_ERROR_PREFIX);
      expect(thrown.message).toContain(code);
      expect(thrown.message).not.toContain('../private-feature');
      expect(thrown.message).not.toContain('private-stale-version');
      expect(updateConfig).not.toHaveBeenCalled();
      expect(recordDiagnostic).not.toHaveBeenCalled();
    },
  );

  it('diagnoses persistence failure once and returns a bounded error', async () => {
    const privateError = new Error(
      'failed E:\\Users\\Singer\\private-config.json',
    );
    const updateConfig = vi.fn(() => {
      throw privateError;
    });
    const { ipcMain, recordDiagnostic } = register({ updateConfig });

    const thrown = await ipcMain.handlers
      .get('feature-gates:confirm')(null, PROVIDER_ID, NOTICE_VERSION)
      .catch((error) => error);

    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'feature-gates',
        operation: 'confirm',
        code: 'FEATURE_GATE_CONFIRM_FAILED',
        error: privateError,
        context: { featureId: PROVIDER_ID },
      }),
    );
    expect(thrown.message).toContain('FEATURE_GATE_CONFIRM_FAILED');
    expect(thrown.message).toContain('"diagnosticRecorded":true');
    expect(thrown.message).not.toContain('private-config');
  });
});

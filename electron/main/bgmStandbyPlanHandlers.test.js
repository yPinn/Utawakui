import { describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';
import { BgmStandbyPlanValidationError } from '../lib/bgmStandbyPlan.js';
import { registerBgmStandbyPlanHandlers } from './bgmStandbyPlanHandlers.js';

function createIpcMain() {
  const handlers = new Map();
  return {
    handlers,
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
}

function emptyPlan() {
  return {
    version: 3,
    updatedAt: null,
    trackIds: [],
    currentTrackId: null,
    positionSeconds: 0,
    settings: {
      volume: 0.25,
      isMuted: false,
      loop: true,
      fadeInSeconds: 1,
      fadeOutSeconds: 0.6,
      dimDb: -12,
      dimAttackMs: 100,
      dimReleaseMs: 600,
      preRollSeconds: 0.75,
      postRollSeconds: 1,
    },
    items: [],
  };
}

function createStore(overrides = {}) {
  return {
    getProjected: vi.fn(() => emptyPlan()),
    setTrack: vi.fn(() => emptyPlan()),
    updateSettings: vi.fn(() => emptyPlan()),
    updatePosition: vi.fn(() => emptyPlan()),
    ...overrides,
  };
}

function register(overrides = {}) {
  const ipcMain = createIpcMain();
  const store = overrides.store ?? createStore();
  const recordDiagnostic = overrides.recordDiagnostic ?? vi.fn();
  registerBgmStandbyPlanHandlers({
    ipcMain,
    getConfig: () => ({}),
    resolveDownloadDir: () => 'library-dir',
    recordDiagnostic,
    listLibraryTracks: vi.fn(() => [
      { id: 'track-1', title: 'One', url: 'utawakui-media:private' },
      { id: 'track-2', title: 'Two', filename: 'private.mp3' },
    ]),
    createStore: vi.fn(() => store),
    ...overrides,
  });
  return { handlers: ipcMain.handlers, store, recordDiagnostic };
}

function parseAppError(error) {
  const raw = String(error?.message || '');
  const index = raw.indexOf(APP_ERROR_PREFIX);
  expect(index).toBeGreaterThanOrEqual(0);
  return JSON.parse(raw.slice(index + APP_ERROR_PREFIX.length));
}

describe('registerBgmStandbyPlanHandlers', () => {
  it('registers only bounded BGM preparation intents', () => {
    const { handlers } = register();

    expect([...handlers.keys()]).toEqual([
      'bgm-standby:get',
      'bgm-standby:set-track',
      'bgm-standby:update-settings',
      'bgm-standby:update-position',
    ]);
  });

  it('derives tracks and metadata from main instead of renderer payloads', async () => {
    const { handlers, store } = register();

    await handlers.get('bgm-standby:set-track')(null, 'track-1');

    expect(store.setTrack).toHaveBeenCalledWith(
      'track-1',
      new Map([
        ['track-1', expect.objectContaining({ title: 'One' })],
        ['track-2', expect.objectContaining({ title: 'Two' })],
      ]),
    );
  });

  it('passes only operation intent plus main-derived tracks to mutations', async () => {
    const { handlers, store } = register();
    const cases = [
      ['bgm-standby:set-track', 'setTrack', 'track-2'],
      [
        'bgm-standby:update-settings',
        'updateSettings',
        { volume: 0.4, privatePath: 'E:\\private' },
      ],
      [
        'bgm-standby:update-position',
        'updatePosition',
        { trackId: 'track-2', positionSeconds: 4 },
      ],
    ];

    for (const [channel, method, intent] of cases) {
      await handlers.get(channel)(null, intent);
      expect(store[method]).toHaveBeenCalledWith(intent, expect.any(Map));
    }
  });

  it('returns bounded validation errors without diagnostics', async () => {
    const validation = new BgmStandbyPlanValidationError({
      code: 'BGM_SETTING_OUT_OF_RANGE',
      field: 'fadeOutSeconds',
      message: 'BGM 淡出時間超出允許範圍。',
    });
    const { handlers, recordDiagnostic } = register({
      store: createStore({
        updateSettings: vi.fn(() => {
          throw validation;
        }),
      }),
    });

    await expect(
      handlers.get('bgm-standby:update-settings')(null, {
        fadeOutSeconds: 9,
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'BGM_SETTING_OUT_OF_RANGE',
        field: 'fadeOutSeconds',
        message: 'BGM 淡出時間超出允許範圍。',
      },
    });
    expect(recordDiagnostic).not.toHaveBeenCalled();
  });

  it('records operational failures without exposing filesystem context', async () => {
    const recordDiagnostic = vi.fn().mockReturnValue({ ok: true });
    const { handlers } = register({
      recordDiagnostic,
      listLibraryTracks: vi.fn(() => {
        throw new Error('EACCES: E:/private/bgm-standby.json');
      }),
    });

    const error = await handlers
      .get('bgm-standby:get')()
      .catch((value) => value);
    const payload = parseAppError(error);

    expect(payload).toMatchObject({
      code: 'BGM_STANDBY_GET_FAILED',
      message: '目前無法讀取 BGM，請再試一次。',
      context: { diagnosticRecorded: true, retryable: true },
    });
    expect(JSON.stringify(payload)).not.toContain('E:/private');
    expect(recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({ source: 'bgm-standby', operation: 'get' }),
    );
  });
});

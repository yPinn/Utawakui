import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_GATES } from '../constants/featureGates.js';

const PROVIDER_ID = 'provider-flow';
const LYRICS_ID = 'lyrics-flow';
const PROVIDER_NOTICE_VERSION = FEATURE_GATES[PROVIDER_ID].noticeVersion;

let bridge;
let confirmFeatureGateMock;
let getFeatureConfirmationsMock;

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, reject, resolve };
}

function validConfirmation(featureId = PROVIDER_ID) {
  return {
    featureId,
    noticeVersion: FEATURE_GATES[featureId].noticeVersion,
    confirmedAt: '2026-08-25T12:00:00.000Z',
    enabled: true,
  };
}

beforeEach(() => {
  vi.resetModules();
  getFeatureConfirmationsMock = vi.fn().mockResolvedValue({});
  confirmFeatureGateMock = vi
    .fn()
    .mockResolvedValue(validConfirmation(PROVIDER_ID));
  bridge = {
    getFeatureConfirmations: getFeatureConfirmationsMock,
    confirmFeatureGate: confirmFeatureGateMock,
    recordDiagnostic: vi.fn().mockResolvedValue({ ok: true }),
  };
  vi.stubGlobal('window', { Utawakui: bridge });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadFeatureGates() {
  const { useFeatureGates } = await import('./useFeatureGates.js');
  return useFeatureGates();
}

describe('useFeatureGates', () => {
  it('exposes one readonly confirmation owner with explicit actions', async () => {
    const { isReadonly } = await import('vue');
    const gates = await loadFeatureGates();

    expect(Object.keys(gates).sort()).toEqual([
      'cancelPendingFeature',
      'confirmPendingFeature',
      'ensureFeatureGate',
      'isFeatureEnabled',
      'pendingFeature',
      'refreshConfirmations',
      'state',
    ]);
    expect(Object.keys(gates.state).sort()).toEqual([
      'confirmations',
      'error',
      'isLoading',
      'isSaving',
      'pendingFeatureId',
    ]);
    expect(isReadonly(gates.state)).toBe(true);
    expect(gates.pendingFeature.value).toBeNull();
  });

  it('keeps only current, enabled, known confirmation records', async () => {
    getFeatureConfirmationsMock.mockResolvedValue({
      [PROVIDER_ID]: validConfirmation(PROVIDER_ID),
      [LYRICS_ID]: {
        ...validConfirmation(LYRICS_ID),
        noticeVersion: 'stale-notice',
      },
      'audio-processing-flow': {
        ...validConfirmation('audio-processing-flow'),
        confirmedAt: 123,
      },
      'public-output-flow': {
        ...validConfirmation('public-output-flow'),
        enabled: false,
      },
      'unknown-flow': {
        featureId: 'unknown-flow',
        noticeVersion: PROVIDER_NOTICE_VERSION,
        confirmedAt: '2026-08-25T12:00:00.000Z',
        enabled: true,
      },
    });
    const gates = await loadFeatureGates();

    const result = await gates.refreshConfirmations();

    expect(result).toEqual({
      [PROVIDER_ID]: validConfirmation(PROVIDER_ID),
    });
    expect(gates.isFeatureEnabled(PROVIDER_ID)).toBe(true);
    expect(gates.isFeatureEnabled(LYRICS_ID)).toBe(false);
    expect(gates.isFeatureEnabled('unknown-flow')).toBe(false);
    expect(gates.state.error).toBe('');
  });

  it.each([null, [], 'invalid'])(
    'normalizes a non-record confirmation payload to empty state',
    async (payload) => {
      getFeatureConfirmationsMock.mockResolvedValue(payload);
      const gates = await loadFeatureGates();

      await gates.refreshConfirmations();

      expect(gates.state.confirmations).toEqual({});
    },
  );

  it('deduplicates concurrent refreshes and restores loading state', async () => {
    const deferred = createDeferred();
    getFeatureConfirmationsMock.mockReturnValue(deferred.promise);
    const gates = await loadFeatureGates();

    const firstRefresh = gates.refreshConfirmations();
    const secondRefresh = gates.refreshConfirmations();
    expect(gates.state.isLoading).toBe(true);
    expect(getFeatureConfirmationsMock).toHaveBeenCalledTimes(1);

    deferred.resolve({ [PROVIDER_ID]: validConfirmation(PROVIDER_ID) });
    await Promise.all([firstRefresh, secondRefresh]);

    expect(gates.state.isLoading).toBe(false);
    expect(gates.isFeatureEnabled(PROVIDER_ID)).toBe(true);
  });

  it('keeps prior truth and exposes a bounded refresh failure', async () => {
    getFeatureConfirmationsMock
      .mockResolvedValueOnce({ [PROVIDER_ID]: validConfirmation(PROVIDER_ID) })
      .mockRejectedValueOnce(
        new Error('failed C:\\Users\\Singer\\private-config.json'),
      );
    const gates = await loadFeatureGates();

    await gates.refreshConfirmations();
    const result = await gates.refreshConfirmations();

    expect(result).toEqual({
      [PROVIDER_ID]: validConfirmation(PROVIDER_ID),
    });
    expect(gates.state.isLoading).toBe(false);
    expect(gates.state.error).toBe('目前無法讀取功能狀態，請再試一次。');
    expect(gates.state.error).not.toContain('private-config');
  });

  it('returns current truth and an actionable error when the bridge is absent', async () => {
    vi.stubGlobal('window', { Utawakui: {} });
    const gates = await loadFeatureGates();

    await expect(gates.refreshConfirmations()).resolves.toEqual({});
    await expect(gates.ensureFeatureGate(PROVIDER_ID)).resolves.toBe(false);

    expect(gates.state.pendingFeatureId).toBeNull();
    expect(gates.state.error).toBe(
      '需要重新啟動應用程式才能使用新版功能啟用確認。',
    );
  });

  it('rejects unknown feature ids before calling the bridge', async () => {
    const gates = await loadFeatureGates();

    await expect(gates.ensureFeatureGate('../private-feature')).rejects.toThrow(
      'unknown feature gate',
    );
    expect(getFeatureConfirmationsMock).not.toHaveBeenCalled();
  });

  it('short-circuits an already enabled feature without another refresh', async () => {
    getFeatureConfirmationsMock.mockResolvedValue({
      [PROVIDER_ID]: validConfirmation(PROVIDER_ID),
    });
    const gates = await loadFeatureGates();
    await gates.refreshConfirmations();
    getFeatureConfirmationsMock.mockClear();

    await expect(gates.ensureFeatureGate(PROVIDER_ID)).resolves.toBe(true);
    expect(getFeatureConfirmationsMock).not.toHaveBeenCalled();
    expect(gates.state.pendingFeatureId).toBeNull();
  });

  it('opens one pending declaration and resolves false when cancelled', async () => {
    const gates = await loadFeatureGates();

    const resultPromise = gates.ensureFeatureGate(PROVIDER_ID);
    await vi.waitFor(() => {
      expect(gates.state.pendingFeatureId).toBe(PROVIDER_ID);
    });
    expect(gates.pendingFeature.value).toEqual(FEATURE_GATES[PROVIDER_ID]);

    gates.cancelPendingFeature();

    await expect(resultPromise).resolves.toBe(false);
    expect(gates.state.pendingFeatureId).toBeNull();
    expect(gates.pendingFeature.value).toBeNull();
    expect(gates.state.error).toBe('');
  });

  it('settles the previous request before replacing it with another feature', async () => {
    const gates = await loadFeatureGates();

    const providerPromise = gates.ensureFeatureGate(PROVIDER_ID);
    await vi.waitFor(() => {
      expect(gates.state.pendingFeatureId).toBe(PROVIDER_ID);
    });
    const lyricsPromise = gates.ensureFeatureGate(LYRICS_ID);
    await vi.waitFor(() => {
      expect(gates.state.pendingFeatureId).toBe(LYRICS_ID);
    });

    await expect(providerPromise).resolves.toBe(false);
    gates.cancelPendingFeature();
    await expect(lyricsPromise).resolves.toBe(false);
  });

  it('persists the current notice version and resolves the pending request', async () => {
    const gates = await loadFeatureGates();
    const resultPromise = gates.ensureFeatureGate(PROVIDER_ID);
    await vi.waitFor(() => {
      expect(gates.state.pendingFeatureId).toBe(PROVIDER_ID);
    });

    await expect(gates.confirmPendingFeature()).resolves.toBe(true);

    expect(confirmFeatureGateMock).toHaveBeenCalledWith(
      PROVIDER_ID,
      PROVIDER_NOTICE_VERSION,
    );
    await expect(resultPromise).resolves.toBe(true);
    expect(gates.isFeatureEnabled(PROVIDER_ID)).toBe(true);
    expect(gates.state.pendingFeatureId).toBeNull();
    expect(gates.state.isSaving).toBe(false);
  });

  it('keeps the declaration open for retry after a bounded confirmation failure', async () => {
    confirmFeatureGateMock
      .mockRejectedValueOnce(new Error('failed https://private.test/confirm'))
      .mockResolvedValueOnce(validConfirmation(PROVIDER_ID));
    const gates = await loadFeatureGates();
    const resultPromise = gates.ensureFeatureGate(PROVIDER_ID);
    await vi.waitFor(() => {
      expect(gates.state.pendingFeatureId).toBe(PROVIDER_ID);
    });

    await expect(gates.confirmPendingFeature()).resolves.toBe(false);
    expect(gates.state.error).toBe('目前無法啟用這項功能，請再試一次。');
    expect(gates.state.error).not.toContain('private.test');
    expect(gates.state.pendingFeatureId).toBe(PROVIDER_ID);
    expect(gates.state.isSaving).toBe(false);

    await expect(gates.confirmPendingFeature()).resolves.toBe(true);
    await expect(resultPromise).resolves.toBe(true);
  });

  it('settles safely when confirmation loses its bridge or pending gate', async () => {
    const gates = await loadFeatureGates();
    await expect(gates.confirmPendingFeature()).resolves.toBe(false);

    const resultPromise = gates.ensureFeatureGate(PROVIDER_ID);
    await vi.waitFor(() => {
      expect(gates.state.pendingFeatureId).toBe(PROVIDER_ID);
    });
    delete bridge.confirmFeatureGate;

    await expect(gates.confirmPendingFeature()).resolves.toBe(false);
    await expect(resultPromise).resolves.toBe(false);
    expect(gates.state.pendingFeatureId).toBeNull();
  });

  it('deduplicates confirmation submission while persistence is in flight', async () => {
    const deferred = createDeferred();
    confirmFeatureGateMock.mockReturnValue(deferred.promise);
    const gates = await loadFeatureGates();
    const resultPromise = gates.ensureFeatureGate(PROVIDER_ID);
    await vi.waitFor(() => {
      expect(gates.state.pendingFeatureId).toBe(PROVIDER_ID);
    });

    const firstConfirm = gates.confirmPendingFeature();
    const duplicateConfirm = gates.confirmPendingFeature();
    expect(confirmFeatureGateMock).toHaveBeenCalledTimes(1);
    expect(gates.state.isSaving).toBe(true);

    deferred.resolve(validConfirmation(PROVIDER_ID));
    await expect(firstConfirm).resolves.toBe(true);
    await expect(duplicateConfirm).resolves.toBe(true);
    await expect(resultPromise).resolves.toBe(true);
  });

  it('ignores cancellation while confirmation persistence is in flight', async () => {
    const deferred = createDeferred();
    confirmFeatureGateMock.mockReturnValue(deferred.promise);
    const gates = await loadFeatureGates();
    const resultPromise = gates.ensureFeatureGate(PROVIDER_ID);
    await vi.waitFor(() => {
      expect(gates.state.pendingFeatureId).toBe(PROVIDER_ID);
    });

    const confirmPromise = gates.confirmPendingFeature();
    gates.cancelPendingFeature();

    expect(gates.state.pendingFeatureId).toBe(PROVIDER_ID);
    deferred.resolve(validConfirmation(PROVIDER_ID));
    await expect(confirmPromise).resolves.toBe(true);
    await expect(resultPromise).resolves.toBe(true);
    expect(gates.isFeatureEnabled(PROVIDER_ID)).toBe(true);
  });

  it('rejects a malformed confirmation reply without enabling the feature', async () => {
    confirmFeatureGateMock.mockResolvedValue({
      featureId: PROVIDER_ID,
      enabled: true,
      noticeVersion: 'stale-notice',
    });
    const gates = await loadFeatureGates();
    const resultPromise = gates.ensureFeatureGate(PROVIDER_ID);
    await vi.waitFor(() => {
      expect(gates.state.pendingFeatureId).toBe(PROVIDER_ID);
    });

    await expect(gates.confirmPendingFeature()).resolves.toBe(false);

    expect(gates.isFeatureEnabled(PROVIDER_ID)).toBe(false);
    expect(gates.state.pendingFeatureId).toBe(PROVIDER_ID);
    expect(gates.state.error).toBe('目前無法啟用這項功能，請再試一次。');
    gates.cancelPendingFeature();
    await expect(resultPromise).resolves.toBe(false);
  });
});

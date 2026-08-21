import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const confirmedProviderFlow = {
  featureId: 'provider-flow',
  noticeVersion: 'feature-notice-v3',
  confirmedAt: '2026-08-20T00:00:00.000Z',
  enabled: true,
};

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function loadAccess() {
  const accessModule = await import('./useFeatureGateAccess.js');
  const viewModule = await import('./useAppView.js');
  return {
    access: accessModule.useFeatureGateAccess(),
    appView: viewModule.useAppView(),
  };
}

describe('useFeatureGateAccess', () => {
  it('allows an already-enabled feature without creating a Settings request', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        getFeatureConfirmations: vi.fn().mockResolvedValue({
          'provider-flow': confirmedProviderFlow,
        }),
        confirmFeatureGate: vi.fn(),
      },
    });
    const { access, appView } = await loadAccess();

    const allowed = await access.requireFeatureGate('provider-flow');

    expect(allowed).toBe(true);
    expect(access.state.request).toBe(null);
    expect(appView.activeView.value).toBe('setlist');
  });

  it('routes disabled feature requests to Settings with a user-facing notice', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        getFeatureConfirmations: vi.fn().mockResolvedValue({}),
        confirmFeatureGate: vi.fn(),
      },
    });
    const { access, appView } = await loadAccess();

    const allowed = await access.requireFeatureGate('provider-flow', {
      source: 'import',
      operation: 'resolve-source',
      message: '請先到設定啟用外部來源。',
    });

    expect(allowed).toBe(false);
    expect(appView.activeView.value).toBe('settings');
    expect(access.state.request).toMatchObject({
      featureId: 'provider-flow',
      title: '需要啟用外部來源匯入',
      message: '請先到設定啟用外部來源。',
      actionLabel: '啟用外部來源匯入',
      source: 'import',
      operation: 'resolve-source',
    });
  });

  it('routes enabled feature setup requests to Settings without requiring re-enable', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        getFeatureConfirmations: vi.fn().mockResolvedValue({
          'provider-flow': confirmedProviderFlow,
        }),
        confirmFeatureGate: vi.fn(),
      },
    });
    const { access, appView } = await loadAccess();

    access.requestFeatureSetup('provider-flow', {
      title: '需要準備外部來源工具',
      message: '請先到設定準備外部來源工具。',
      source: 'import',
      operation: 'provider-tool',
      context: { dependencyId: 'yt-dlp-provider-tool' },
    });

    expect(appView.activeView.value).toBe('settings');
    expect(access.state.request).toMatchObject({
      featureId: 'provider-flow',
      kind: 'setup',
      title: '需要準備外部來源工具',
      message: '請先到設定準備外部來源工具。',
      actionLabel: '查看準備項目',
      source: 'import',
      operation: 'provider-tool',
      context: { dependencyId: 'yt-dlp-provider-tool' },
    });
  });

  it('clears the current request by feature id', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        getFeatureConfirmations: vi.fn().mockResolvedValue({}),
        confirmFeatureGate: vi.fn(),
      },
    });
    const { access } = await loadAccess();

    await access.requireFeatureGate('provider-flow');
    access.clearFeatureGateRequest('lyrics-flow');
    expect(access.state.request?.featureId).toBe('provider-flow');

    access.clearFeatureGateRequest('provider-flow');
    expect(access.state.request).toBe(null);
  });
});

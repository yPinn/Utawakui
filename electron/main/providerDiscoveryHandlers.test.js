import { describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';
import providerDiscoveryHandlersModule from './providerDiscoveryHandlers.js';

const { registerProviderDiscoveryHandlers } = providerDiscoveryHandlersModule;

function register(overrides = {}) {
  const handlers = new Map();
  const ipcMain = {
    handle: vi.fn((channel, handler) => handlers.set(channel, handler)),
  };
  const dependencies = {
    ipcMain,
    openExternal: vi.fn().mockResolvedValue(undefined),
    requireFeatureGate: vi.fn(),
    featureIds: { PROVIDER_FLOW: 'provider-flow' },
    recordDiagnostic: vi.fn(() => ({ ok: true })),
    ...overrides,
  };
  registerProviderDiscoveryHandlers(dependencies);
  return { handlers, ...dependencies };
}

describe('registerProviderDiscoveryHandlers', () => {
  it('registers one bounded provider discovery intent', () => {
    const harness = register();

    expect([...harness.handlers.keys()]).toEqual([
      'provider-discovery:open-youtube-music-search',
    ]);
  });

  it('rechecks the provider gate and opens only the main-derived URL', async () => {
    const harness = register();

    await expect(
      harness.handlers.get('provider-discovery:open-youtube-music-search')(
        null,
        '宇多田ヒカル First Love',
      ),
    ).resolves.toBeUndefined();

    expect(harness.requireFeatureGate).toHaveBeenCalledWith('provider-flow');
    const openedUrl = new URL(harness.openExternal.mock.calls[0][0]);
    expect(openedUrl.origin).toBe('https://music.youtube.com');
    expect(openedUrl.pathname).toBe('/search');
    expect(openedUrl.searchParams.get('q')).toBe('宇多田ヒカル First Love');
  });

  it('does not open or reflect an invalid query', async () => {
    const harness = register();
    const privateInput = `private-${'x'.repeat(220)}`;

    const thrown = await harness.handlers
      .get('provider-discovery:open-youtube-music-search')(null, privateInput)
      .catch((error) => error);

    expect(thrown.message).toContain(APP_ERROR_PREFIX);
    expect(thrown.message).toContain('PROVIDER_DISCOVERY_QUERY_INVALID');
    expect(thrown.message).not.toContain('private-');
    expect(harness.openExternal).not.toHaveBeenCalled();
    expect(harness.recordDiagnostic).not.toHaveBeenCalled();
  });

  it('does not open a browser when the provider gate rejects the operation', async () => {
    const gateError = new Error('feature gate required');
    const harness = register({
      requireFeatureGate: vi.fn(() => {
        throw gateError;
      }),
    });

    await expect(
      harness.handlers.get('provider-discovery:open-youtube-music-search')(
        null,
        'Song',
      ),
    ).rejects.toBe(gateError);
    expect(harness.openExternal).not.toHaveBeenCalled();
  });

  it('records the private shell failure and returns a bounded public error', async () => {
    const privateError = new Error('private browser profile path');
    const harness = register({
      openExternal: vi.fn().mockRejectedValue(privateError),
    });

    const thrown = await harness.handlers
      .get('provider-discovery:open-youtube-music-search')(null, 'Song')
      .catch((error) => error);

    expect(harness.recordDiagnostic).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'provider-discovery',
        operation: 'open-youtube-music-search',
        code: 'PROVIDER_DISCOVERY_OPEN_FAILED',
        error: privateError,
        context: { provider: 'youtube-music' },
      }),
    );
    expect(thrown.message).toContain('PROVIDER_DISCOVERY_OPEN_FAILED');
    expect(thrown.message).not.toContain('private browser');
  });
});

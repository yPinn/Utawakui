import { afterEach, describe, expect, it, vi } from 'vitest';

const REQUEST_ID = '11111111-1111-4111-8111-111111111111';

function createBridge(overrides = {}) {
  let requestListener;
  let dismissListener;
  const bridge = {
    onWindowCloseRequest: vi.fn((listener) => {
      requestListener = listener;
      return vi.fn();
    }),
    onWindowCloseDismiss: vi.fn((listener) => {
      dismissListener = listener;
      return vi.fn();
    }),
    presentWindowCloseRequest: vi.fn().mockResolvedValue(true),
    respondWindowCloseRequest: vi.fn().mockResolvedValue(true),
    ...overrides,
  };
  return {
    bridge,
    dismiss(payload) {
      return dismissListener(payload);
    },
    request(payload) {
      return requestListener(payload);
    },
  };
}

async function loadDecisionController(bridge) {
  vi.resetModules();
  vi.stubGlobal('window', { Utawakui: bridge });
  const { useWindowCloseDecision } =
    await import('./useWindowCloseDecision.js');
  return useWindowCloseDecision();
}

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

describe('useWindowCloseDecision', () => {
  it('acknowledges one request before opening and submits a bounded choice', async () => {
    const harness = createBridge();
    const controller = await loadDecisionController(harness.bridge);

    await harness.request({ requestId: REQUEST_ID });

    expect(harness.bridge.presentWindowCloseRequest).toHaveBeenCalledWith(
      REQUEST_ID,
    );
    expect(controller.state).toMatchObject({
      open: true,
      remember: false,
      isResponding: false,
      error: '',
    });

    controller.setRemember(true);
    await expect(controller.respond('tray')).resolves.toBe(true);

    expect(harness.bridge.respondWindowCloseRequest).toHaveBeenCalledWith(
      REQUEST_ID,
      { action: 'tray', remember: true },
    );
    expect(controller.state.open).toBe(false);
    expect(controller.state.remember).toBe(false);
  });

  it('maps modal close to cancel without remembering it', async () => {
    const harness = createBridge();
    const controller = await loadDecisionController(harness.bridge);
    await harness.request({ requestId: REQUEST_ID });
    controller.setRemember(true);

    await controller.cancel();

    expect(harness.bridge.respondWindowCloseRequest).toHaveBeenCalledWith(
      REQUEST_ID,
      { action: 'cancel', remember: false },
    );
  });

  it('keeps the modal open with bounded recovery copy when response fails', async () => {
    const harness = createBridge({
      respondWindowCloseRequest: vi
        .fn()
        .mockRejectedValue(new Error('failed E:\\private\\config.json')),
    });
    const controller = await loadDecisionController(harness.bridge);
    await harness.request({ requestId: REQUEST_ID });

    await expect(controller.respond('quit')).resolves.toBe(false);

    expect(controller.state.open).toBe(true);
    expect(controller.state.error).toBe('目前無法完成關閉操作，請再試一次。');
    expect(controller.state.error).not.toContain('private');
    expect(controller.state.isResponding).toBe(false);
  });

  it('does not open a stale request rejected by main and honors dismissal', async () => {
    const harness = createBridge({
      presentWindowCloseRequest: vi.fn().mockResolvedValue(false),
    });
    const controller = await loadDecisionController(harness.bridge);
    await harness.request({ requestId: REQUEST_ID });
    expect(controller.state.open).toBe(false);

    harness.bridge.presentWindowCloseRequest.mockResolvedValue(true);
    await harness.request({ requestId: REQUEST_ID });
    expect(controller.state.open).toBe(true);

    harness.dismiss({ requestId: REQUEST_ID });
    expect(controller.state.open).toBe(false);
  });

  it('unsubscribes both fixed listeners on disposal', async () => {
    const unsubscribeRequest = vi.fn();
    const unsubscribeDismiss = vi.fn();
    const harness = createBridge({
      onWindowCloseRequest: vi.fn((listener) => {
        harness.request = listener;
        return unsubscribeRequest;
      }),
      onWindowCloseDismiss: vi.fn((listener) => {
        harness.dismiss = listener;
        return unsubscribeDismiss;
      }),
    });
    const controller = await loadDecisionController(harness.bridge);

    controller.dispose();
    controller.dispose();

    expect(unsubscribeRequest).toHaveBeenCalledOnce();
    expect(unsubscribeDismiss).toHaveBeenCalledOnce();
  });
});

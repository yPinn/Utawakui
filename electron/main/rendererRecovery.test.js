import { describe, expect, it, vi } from 'vitest';
import rendererRecoveryModule from './rendererRecovery.js';

const { createRendererRecoveryController } = rendererRecoveryModule;

describe('renderer recovery controller', () => {
  it('offers one restart-or-quit prompt and restarts on the primary action', async () => {
    const window = { isDestroyed: vi.fn(() => false) };
    const dialog = { showMessageBox: vi.fn(async () => ({ response: 0 })) };
    const restartApp = vi.fn();
    const quitApp = vi.fn();
    const controller = createRendererRecoveryController({
      dialog,
      getMainWindow: () => window,
      restartApp,
      quitApp,
      recordDiagnostic: vi.fn(),
    });

    const first = controller.requestRecovery('renderer-crashed');
    const second = controller.requestRecovery('renderer-unresponsive');

    expect(first).toBe(second);
    await expect(first).resolves.toBe('restart');
    expect(dialog.showMessageBox).toHaveBeenCalledOnce();
    expect(dialog.showMessageBox).toHaveBeenCalledWith(
      window,
      expect.objectContaining({
        type: 'error',
        buttons: ['重新啟動 Utawakui', '退出'],
        defaultId: 0,
        cancelId: 1,
        noLink: true,
      }),
    );
    expect(restartApp).toHaveBeenCalledOnce();
    expect(quitApp).not.toHaveBeenCalled();
  });

  it('quits on the secondary action and never opens a second prompt', async () => {
    const dialog = { showMessageBox: vi.fn(async () => ({ response: 1 })) };
    const quitApp = vi.fn();
    const controller = createRendererRecoveryController({
      dialog,
      getMainWindow: () => null,
      restartApp: vi.fn(),
      quitApp,
      recordDiagnostic: vi.fn(),
    });

    await expect(
      controller.requestRecovery('renderer-unresponsive'),
    ).resolves.toBe('quit');
    await controller.requestRecovery('renderer-crashed');

    expect(dialog.showMessageBox).toHaveBeenCalledOnce();
    expect(quitApp).toHaveBeenCalledOnce();
  });

  it('records a bounded failure and quits if the native prompt fails', async () => {
    const recordDiagnostic = vi.fn();
    const quitApp = vi.fn();
    const controller = createRendererRecoveryController({
      dialog: {
        showMessageBox: vi.fn(async () => {
          throw new Error('private native dialog failure');
        }),
      },
      getMainWindow: () => null,
      restartApp: vi.fn(),
      quitApp,
      recordDiagnostic,
    });

    await expect(
      controller.requestRecovery('renderer-load-failed'),
    ).resolves.toBe('quit');

    expect(recordDiagnostic).toHaveBeenCalledWith({
      level: 'error',
      source: 'electron',
      operation: 'renderer-recovery-dialog',
      code: 'RENDERER_RECOVERY_DIALOG_FAILED',
      message: 'Renderer recovery dialog failed',
    });
    expect(JSON.stringify(recordDiagnostic.mock.calls)).not.toContain(
      'private',
    );
    expect(quitApp).toHaveBeenCalledOnce();
  });
});

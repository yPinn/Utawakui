import { describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';
import { runDiagnosticIpcOperation } from './ipcErrorBoundary.js';

describe('runDiagnosticIpcOperation', () => {
  it('records the original private error in main and throws a safe public error', async () => {
    const recordDiagnostic = vi.fn(() => ({ ok: true }));
    const privateError = new Error(
      'ENOENT C:\\Users\\Singer\\secret.zip https://provider.test/private',
    );

    const thrown = await runDiagnosticIpcOperation(
      {
        recordDiagnostic,
        diagnostic: {
          source: 'feature-dependencies',
          operation: 'prepare',
          code: 'FEATURE_DEPENDENCY_PREPARE_FAILED',
          message: 'Feature dependency preparation failed',
          context: { dependencyId: 'ffmpeg-gyan-essentials' },
        },
        publicError: {
          code: 'FEATURE_DEPENDENCY_PREPARE_FAILED',
          title: '準備失敗',
          message: '無法準備這個項目，請稍後再試。',
          context: { dependencyId: 'ffmpeg-gyan-essentials' },
        },
      },
      async () => {
        throw privateError;
      },
    ).catch((error) => error);

    expect(recordDiagnostic).toHaveBeenCalledWith({
      process: 'main',
      level: 'error',
      source: 'feature-dependencies',
      operation: 'prepare',
      code: 'FEATURE_DEPENDENCY_PREPARE_FAILED',
      message: 'Feature dependency preparation failed',
      error: privateError,
      context: { dependencyId: 'ffmpeg-gyan-essentials' },
    });
    expect(thrown.message).toContain(APP_ERROR_PREFIX);
    expect(thrown.message).toContain('無法準備這個項目');
    expect(thrown.message).toContain('"diagnosticRecorded":true');
    expect(thrown.message).not.toContain('secret.zip');
    expect(thrown.message).not.toContain('provider.test');
  });

  it('lets the renderer persist the safe fallback when main recording fails', async () => {
    const thrown = await runDiagnosticIpcOperation(
      {
        recordDiagnostic: vi.fn(() => ({ ok: false })),
        diagnostic: {
          source: 'feature-dependencies',
          operation: 'remove',
          code: 'FEATURE_DEPENDENCY_REMOVE_FAILED',
          message: 'Feature dependency removal failed',
        },
        publicError: {
          code: 'FEATURE_DEPENDENCY_REMOVE_FAILED',
          message: '無法移除這個項目，請稍後再試。',
        },
      },
      () => Promise.reject(new Error('private failure')),
    ).catch((error) => error);

    expect(thrown.message).not.toContain('diagnosticRecorded');
    expect(thrown.message).not.toContain('private failure');
  });
});

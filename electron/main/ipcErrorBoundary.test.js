import { describe, expect, it, vi } from 'vitest';
import { APP_ERROR_PREFIX } from '../lib/appError.js';
import {
  createPlanIpcRunner,
  runDiagnosticIpcOperation,
} from './ipcErrorBoundary.js';

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
      correlationId: expect.stringMatching(/^[0-9a-f-]{36}$/),
      error: privateError,
      context: {
        dependencyId: 'ffmpeg-gyan-essentials',
        durationMs: expect.any(Number),
      },
    });
    const event = recordDiagnostic.mock.calls[0][0];
    expect(event.context.durationMs).toBeGreaterThanOrEqual(0);
    expect(thrown.context.correlationId).toBe(event.correlationId);
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
    expect(thrown.context.correlationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('issues no id and records nothing when the operation succeeds', async () => {
    const recordDiagnostic = vi.fn();
    await expect(
      runDiagnosticIpcOperation(
        {
          recordDiagnostic,
          diagnostic: { source: 'separation', operation: 'run', code: 'X' },
          publicError: { code: 'X', message: '公開訊息' },
        },
        async () => 'done',
      ),
    ).resolves.toBe('done');
    expect(recordDiagnostic).not.toHaveBeenCalled();
  });

  it('keeps an internal classification of the cause without serializing it', async () => {
    const thrown = await runDiagnosticIpcOperation(
      {
        recordDiagnostic: vi.fn(() => ({ ok: true })),
        diagnostic: { source: 'separation', operation: 'run', code: 'X' },
        publicError: { code: 'X', message: '公開訊息' },
        classifyError: (error) =>
          error.code === 'SOURCE'
            ? { failureReason: 'source-unavailable' }
            : undefined,
      },
      () =>
        Promise.reject(Object.assign(new Error('private'), { code: 'SOURCE' })),
    ).catch((error) => error);

    expect(thrown.failureReason).toBe('source-unavailable');
    expect(thrown.message).not.toContain('source-unavailable');
    expect(thrown.message).not.toContain('private');
  });

  it('returns validation results through the plan runner without diagnostics', async () => {
    const recordDiagnostic = vi.fn();
    const run = createPlanIpcRunner({
      source: 'plan',
      operationErrors: {
        get: { code: 'PLAN_GET_FAILED', title: 't', message: 'm' },
      },
      isValidationError: (error) => error.name === 'Validation',
      validationContextKeys: ['itemCount'],
      recordDiagnostic,
    });

    await expect(run('get', () => ({ items: [] }))).resolves.toEqual({
      ok: true,
      plan: { items: [] },
    });
    await expect(
      run('get', () => {
        throw Object.assign(new Error('bad'), {
          name: 'Validation',
          code: 'BAD',
          field: 'x',
          context: { itemCount: 3, privatePath: 'private' },
        });
      }),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: 'BAD',
        field: 'x',
        message: 'bad',
        context: { itemCount: 3 },
      },
    });
    expect(recordDiagnostic).not.toHaveBeenCalled();
  });
});

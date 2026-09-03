import { describe, expect, it, vi } from 'vitest';
import {
  APP_ERROR_PREFIX,
  appErrorMessage,
  appErrorTone,
  normalizeAppError,
} from './appErrors.js';

describe('normalizeAppError', () => {
  it('does not expose a plain Error message in a user-facing record', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T00:00:00.000Z'));

    const normalized = normalizeAppError(new Error('boom'), {
      id: 'fixed-id',
      source: 'settings',
      operation: 'prepare',
    });

    expect(normalized).toEqual({
      id: 'fixed-id',
      code: 'UNKNOWN_ERROR',
      severity: 'error',
      title: '發生錯誤',
      message: '操作未完成，請稍後再試。',
      actionLabel: '',
      source: 'settings',
      operation: 'prepare',
      context: {},
      createdAt: '2026-08-20T00:00:00.000Z',
    });

    vi.useRealTimers();
  });

  it('uses concise explicit copy without carrying raw technical context', () => {
    const normalized = normalizeAppError(
      new Error('ENOENT: C:\\Users\\Singer\\Music\\secret.wav'),
      {
        id: 'fixed-id',
        source: 'library',
        operation: 'list',
        title: '曲庫讀取失敗',
        message: '目前無法讀取曲庫，請再試一次。',
        actionLabel: '重試',
        context: {
          retryable: true,
          reason: 'network-error',
          trackId: 'private-track-id',
          technicalMessage: 'private-message',
        },
        createdAt: '2026-08-20T00:00:00.000Z',
      },
    );

    expect(normalized).toMatchObject({
      title: '曲庫讀取失敗',
      message: '目前無法讀取曲庫，請再試一次。',
      actionLabel: '重試',
      context: { retryable: true, reason: 'network-error' },
    });
    expect(JSON.stringify(normalized)).not.toContain('secret.wav');
    expect(JSON.stringify(normalized)).not.toContain('private-track-id');
    expect(JSON.stringify(normalized)).not.toContain('private-message');
  });

  it('parses a structured app error embedded in an IPC message', () => {
    const payload = {
      code: 'FEATURE_DEPENDENCY_MISSING',
      severity: 'warning',
      title: '需要先準備音訊處理項目',
      message: '請先到設定頁準備「人聲分離模型」。',
      actionLabel: '前往設定',
      context: { dependencyId: 'model-a' },
    };
    const normalized = normalizeAppError(
      new Error(
        `Error invoking remote method: ${APP_ERROR_PREFIX}${JSON.stringify(payload)}`,
      ),
      {
        id: 'fixed-id',
        source: 'separation',
        createdAt: '2026-08-20T00:00:00.000Z',
      },
    );

    expect(normalized).toMatchObject({
      id: 'fixed-id',
      code: 'FEATURE_DEPENDENCY_MISSING',
      severity: 'warning',
      title: '需要先準備音訊處理項目',
      message: '請先到設定頁準備「人聲分離模型」。',
      actionLabel: '前往設定',
      source: 'separation',
      context: { dependencyId: 'model-a' },
    });
  });
});

describe('appError helpers', () => {
  it('maps severities to existing UI tones', () => {
    expect(appErrorTone({ severity: 'error' })).toBe('danger');
    expect(appErrorTone({ severity: 'warning' })).toBe('warning');
    expect(appErrorTone(null)).toBe('muted');
  });

  it('returns the cleaned user message', () => {
    expect(appErrorMessage(new Error('plain'))).toBe(
      '操作未完成，請稍後再試。',
    );
  });
});

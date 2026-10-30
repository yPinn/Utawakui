import { describe, expect, it } from 'vitest';
import {
  APP_ERROR_PREFIX,
  createAppError,
  serializeAppErrorPayload,
} from './appError.js';

describe('serializeAppErrorPayload', () => {
  it('prefixes JSON payloads for IPC-safe app errors', () => {
    const message = serializeAppErrorPayload({
      code: 'FEATURE_DEPENDENCY_MISSING',
      message: 'setup required',
    });

    expect(message).toBe(
      `${APP_ERROR_PREFIX}{"code":"FEATURE_DEPENDENCY_MISSING","message":"setup required"}`,
    );
  });
});

describe('createAppError', () => {
  it('stores structured fields on the thrown Error object and message', () => {
    const error = createAppError({
      code: 'FEATURE_DEPENDENCY_MISSING',
      severity: 'warning',
      title: '需要先準備',
      message: '請先到設定頁準備。',
      actionLabel: '前往設定',
      context: { dependencyId: 'ffmpeg' },
    });

    expect(error).toBeInstanceOf(Error);
    expect(error.code).toBe('FEATURE_DEPENDENCY_MISSING');
    expect(error.severity).toBe('warning');
    expect(error.title).toBe('需要先準備');
    expect(error.publicMessage).toBe('請先到設定頁準備。');
    expect(error.actionLabel).toBe('前往設定');
    expect(error.context).toEqual({ dependencyId: 'ffmpeg' });
    expect(JSON.parse(error.message.slice(APP_ERROR_PREFIX.length))).toEqual({
      code: 'FEATURE_DEPENDENCY_MISSING',
      severity: 'warning',
      title: '需要先準備',
      message: '請先到設定頁準備。',
      actionLabel: '前往設定',
      context: { dependencyId: 'ffmpeg' },
    });
  });

  it('defaults severity to error', () => {
    const error = createAppError({
      code: 'UNKNOWN',
      message: 'boom',
    });

    expect(error.severity).toBe('error');
    expect(JSON.parse(error.message.slice(APP_ERROR_PREFIX.length))).toEqual({
      code: 'UNKNOWN',
      severity: 'error',
      message: 'boom',
    });
  });
});

describe('createAppError catalog copy', () => {
  it('reads errors.<CODE> when neither title nor message is given', () => {
    const error = createAppError({ code: 'UI_THEME_READ_FAILED' });
    expect(error.title).toBe('無法讀取介面主題');
    expect(error.publicMessage).toBe('目前無法讀取介面主題。');
  });

  it('keeps explicit copy from callers that pass either field', () => {
    const error = createAppError({
      code: 'UI_THEME_READ_FAILED',
      message: '自訂',
    });
    expect(error.title).toBeUndefined();
    expect(error.publicMessage).toBe('自訂');
  });

  it('fails tests when a code has no catalog entry', () => {
    expect(() => createAppError({ code: 'NOT_IN_CATALOG' })).toThrow(
      'Missing UI catalog entry: errors.NOT_IN_CATALOG.title',
    );
  });
});

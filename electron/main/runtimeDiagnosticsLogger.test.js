import { describe, expect, it, vi } from 'vitest';
import runtimeDiagnosticsLoggerModule from './runtimeDiagnosticsLogger.js';

const { createRuntimeDiagnosticsLogger } = runtimeDiagnosticsLoggerModule;

describe('runtime diagnostics logger', () => {
  it('records a categorical diagnostic while preserving the technical error', () => {
    const failure = new Error('listen EADDRINUSE at C:\\Users\\name');
    const service = { record: vi.fn(() => ({ ok: true })) };
    const consoleTarget = { warn: vi.fn(), error: vi.fn() };
    const logger = createRuntimeDiagnosticsLogger({
      service,
      consoleTarget,
    });

    logger.warn('[output] Automatic startup failed', failure);

    expect(consoleTarget.warn).toHaveBeenCalledWith(
      '[output] Automatic startup failed',
      failure,
    );
    expect(service.record).toHaveBeenCalledWith({
      process: 'main',
      level: 'warning',
      source: 'output',
      operation: 'automatic-start',
      code: 'OUTPUT_AUTOMATIC_START_FAILED',
      message: 'Output runtime operation failed',
      error: failure,
      context: { retryable: true },
    });
  });

  it('maps LRCLIB failures with bounded typed context', () => {
    const failure = new Error('LRCLIB search failed: http-error');
    const service = { record: vi.fn(() => ({ ok: true })) };
    const consoleTarget = { warn: vi.fn(), error: vi.fn() };
    const logger = createRuntimeDiagnosticsLogger({ service, consoleTarget });

    logger.warn('[lyrics] LRCLIB search failed', failure, {
      reason: 'http-error',
      httpStatus: 503,
      retryable: true,
      query: 'must-not-pass-through',
    });

    expect(consoleTarget.warn).toHaveBeenCalledWith(
      '[lyrics] LRCLIB search failed',
      failure,
    );
    expect(service.record).toHaveBeenCalledWith({
      process: 'main',
      level: 'warning',
      source: 'lyrics',
      operation: 'lrclib-search',
      code: 'LYRICS_LRCLIB_SEARCH_FAILED',
      message: 'LRCLIB search failed',
      error: failure,
      context: { reason: 'http-error', httpStatus: 503, retryable: true },
    });
  });

  it.each([
    [
      'error',
      '[output] Failed to stop output runtime',
      'shutdown',
      'OUTPUT_SHUTDOWN_FAILED',
    ],
    [
      'error',
      '[output] Failed to restore previous output settings',
      'settings-rollback',
      'OUTPUT_SETTINGS_ROLLBACK_FAILED',
    ],
    [
      'error',
      '[output] Failed to read artwork asset',
      'artwork-read',
      'OUTPUT_ARTWORK_READ_FAILED',
    ],
    [
      'error',
      '[output] Failed to read overlay asset',
      'overlay-asset-read',
      'OUTPUT_OVERLAY_ASSET_READ_FAILED',
    ],
    [
      'error',
      '[output] HTTP request failed',
      'http-request',
      'OUTPUT_HTTP_REQUEST_FAILED',
    ],
    [
      'error',
      '[output] WebSocket server error',
      'websocket-server',
      'OUTPUT_WEBSOCKET_SERVER_FAILED',
    ],
    [
      'warn',
      '[output] WebSocket client error',
      'websocket-client',
      'OUTPUT_WEBSOCKET_CLIENT_FAILED',
    ],
  ])(
    'maps %s %s to a bounded persistent event',
    (method, message, operation, code) => {
      const service = { record: vi.fn(() => ({ ok: true })) };
      const logger = createRuntimeDiagnosticsLogger({
        service,
        consoleTarget: { warn: vi.fn(), error: vi.fn() },
      });

      logger[method](message, new Error('technical detail'));

      expect(service.record).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'output',
          operation,
          code,
          message: expect.stringMatching(/^Output /),
        }),
      );
    },
  );

  it('rate-limits repeated records by operation without suppressing console output', () => {
    let currentTime = 1_000;
    const service = { record: vi.fn(() => ({ ok: true })) };
    const consoleTarget = { warn: vi.fn(), error: vi.fn() };
    const logger = createRuntimeDiagnosticsLogger({
      service,
      consoleTarget,
      now: () => currentTime,
      cooldownMs: 60_000,
    });
    const failure = new Error('socket closed');

    logger.warn('[output] WebSocket client error', failure);
    logger.warn('[output] WebSocket client error', failure);
    logger.error('[output] HTTP request failed', failure);

    expect(consoleTarget.warn).toHaveBeenCalledTimes(2);
    expect(service.record).toHaveBeenCalledTimes(2);

    currentTime += 60_000;
    logger.warn('[output] WebSocket client error', failure);
    expect(service.record).toHaveBeenCalledTimes(3);
  });

  it('never turns a diagnostics failure into a runtime failure', () => {
    const service = {
      record: vi.fn(() => {
        throw new Error('logs unavailable');
      }),
    };
    const logger = createRuntimeDiagnosticsLogger({
      service,
      consoleTarget: { warn: vi.fn(), error: vi.fn() },
    });

    expect(() =>
      logger.error(
        '[output] Failed to stop output runtime',
        new Error('close failed'),
      ),
    ).not.toThrow();
  });
});

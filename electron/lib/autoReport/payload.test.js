import { describe, expect, it } from 'vitest';
import payloadModule from './payload.js';
import { validateAutoReport } from '../../../services/feedback-relay/src/validate.js';

const { buildAutoReport } = payloadModule;

function event(overrides = {}) {
  return {
    level: 'error',
    process: 'renderer',
    source: 'electron',
    operation: 'render-process-gone',
    code: 'RENDER_PROCESS_GONE',
    message: 'Renderer process terminated unexpectedly',
    stack: [
      'Error: gone',
      '    at onGone (app:electron/main/diagnosticsLifecycle.js:40:5)',
      '    at emit ([path])',
    ].join('\n'),
    ...overrides,
  };
}

describe('buildAutoReport', () => {
  it('produces a report the relay accepts in its fixed shape', () => {
    const report = buildAutoReport({
      event: event(),
      severity: 'S1',
      occurrences: 2,
      environment: {
        appVersion: '0.4.0',
        electronVersion: '43.8.3',
        platform: 'win32',
        locale: 'zh-TW',
      },
      reportId: 'f2b3d676-2c4d-42a7-a7a7-600144a03bb9',
      createdAt: '2026-10-24T03:00:00.000Z',
    });

    expect(validateAutoReport(report)).toEqual({ ok: true });
    expect(report.appFrames).toEqual([
      'at onGone (app:electron/main/diagnosticsLifecycle.js:40:5)',
    ]);
    expect(report.summary).toBe(
      '畫面程序異常結束（RENDER_PROCESS_GONE）；App 0.4.0／win32；24 小時內第 2 次。',
    );
  });

  it('bounds the message and stays valid without any app frame', () => {
    const report = buildAutoReport({
      event: event({ message: 'x'.repeat(1000), stack: undefined }),
      severity: 'S2',
      escalated: true,
      occurrences: 3,
      reportId: 'r-1',
      createdAt: '2026-10-24T03:00:00.000Z',
    });

    expect(report.message).toHaveLength(300);
    expect(report.appFrames).toEqual([]);
    expect(report.summary).toContain('1 小時內第 3 次');
    expect(validateAutoReport(report)).toEqual({ ok: true });
  });
});

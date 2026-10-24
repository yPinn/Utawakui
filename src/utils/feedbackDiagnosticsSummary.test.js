import { describe, expect, it } from 'vitest';
import { summarizeFeedbackDiagnostics } from './feedbackDiagnosticsSummary.js';

describe('summarizeFeedbackDiagnostics', () => {
  it('lists time, level and message without codes or stacks', () => {
    const [row] = summarizeFeedbackDiagnostics({
      events: [
        {
          id: 'e-1',
          timestamp: new Date(2026, 9, 24, 9, 5).toISOString(),
          level: 'warning',
          code: 'OUTPUT_AUTOMATIC_START_FAILED',
          message: 'Output runtime operation failed',
          stack: 'Error\n    at app:electron/main.js:1:2',
        },
      ],
    });

    expect(row).toEqual({
      key: 'e-1',
      time: '10/24 09:05',
      level: '警告',
      message: 'Output runtime operation failed',
    });
  });

  it('tolerates a missing bundle and incomplete events', () => {
    expect(summarizeFeedbackDiagnostics(undefined)).toEqual([]);
    expect(summarizeFeedbackDiagnostics({ events: [{}] })).toEqual([
      { key: 'event-0', time: '', level: '錯誤', message: '' },
    ]);
  });
});

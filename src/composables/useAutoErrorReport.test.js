import { afterEach, describe, expect, it, vi } from 'vitest';

async function load(bridge) {
  vi.resetModules();
  vi.stubGlobal('window', { Utawakui: bridge });
  const notify = vi.fn();
  const openReport = vi.fn();
  vi.doMock('./useAppNotifications.js', () => ({
    useAppNotifications: () => ({ notify }),
  }));
  vi.doMock('./useFeedbackReport.js', () => ({
    useFeedbackReport: () => ({ openReport }),
  }));
  const module = await import('./useAutoErrorReport.js');
  return { ...module.useAutoErrorReport(), notify, openReport };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock('./useAppNotifications.js');
  vi.doUnmock('./useFeedbackReport.js');
});

const prompt = {
  reportId: 'f2b3d676-2c4d-42a7-a7a7-600144a03bb9',
  title: '主程序未捕捉的例外',
  occurrences: 1,
  message: 'TypeError: boom',
};

describe('useAutoErrorReport', () => {
  it('offers a prompt raised before the renderer mounted', async () => {
    const report = await load({
      getPendingAutoReport: vi.fn(async () => prompt),
      onAutoReportPrompt: vi.fn(),
      onAutoReportSent: vi.fn(),
    });
    await report.initialize();
    expect(report.state.prompt).toEqual(prompt);
  });

  it('answers the prompt and confirms a sent report', async () => {
    const respondAutoReport = vi.fn(async () => ({ ok: true, sent: true }));
    const report = await load({
      getPendingAutoReport: vi.fn(async () => prompt),
      respondAutoReport,
    });
    await report.initialize();

    await expect(report.respond('always')).resolves.toBe(true);

    expect(respondAutoReport).toHaveBeenCalledWith(prompt.reportId, 'always');
    expect(report.state.prompt).toBeNull();
    expect(report.notify).toHaveBeenCalledWith(
      expect.objectContaining({ title: '已自動回報錯誤' }),
    );
  });

  it('shows the sent notice for automatic sends pushed by main', async () => {
    let onSent;
    const report = await load({
      getPendingAutoReport: vi.fn(async () => null),
      onAutoReportSent: (callback) => {
        onSent = callback;
      },
    });
    await report.initialize();
    onSent({ reportId: prompt.reportId });
    expect(report.notify).toHaveBeenCalledOnce();
    expect(report.state.prompt).toBeNull();
  });

  it('lets the user follow up a sent report with their own description', async () => {
    let onSent;
    const report = await load({
      getPendingAutoReport: vi.fn(async () => null),
      onAutoReportSent: (callback) => {
        onSent = callback;
      },
    });
    await report.initialize();
    onSent({ reportId: prompt.reportId });

    const notice = report.notify.mock.calls[0][0];
    expect(notice.actionLabel).toBe('補充說明');
    expect(notice.lifecycle).toBe('persistent');
    notice.action();
    expect(report.openReport).toHaveBeenCalledWith({
      kind: 'bug',
      description: expect.stringContaining(
        notice.message.replace('回報碼 ', ''),
      ),
    });
  });
});

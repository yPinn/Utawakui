import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

async function loadFeedbackReport() {
  const { useFeedbackReport } = await import('./useFeedbackReport.js');
  return useFeedbackReport();
}

function stubBridge(methods) {
  vi.stubGlobal('window', { Utawakui: methods });
}

describe('useFeedbackReport', () => {
  it('opens with a fresh bug draft by default', async () => {
    stubBridge({});
    const feedback = await loadFeedbackReport();

    feedback.openReport();

    expect(feedback.state).toMatchObject({
      open: true,
      kind: 'bug',
      description: '',
      includeDiagnostics: true,
      step: 'compose',
    });
  });

  it('pre-fills the description from an error record', async () => {
    stubBridge({});
    const feedback = await loadFeedbackReport();

    feedback.openReport({
      errorRecord: { title: '播放失敗', message: '找不到檔案' },
    });

    expect(feedback.state.description).toContain('播放失敗');
    expect(feedback.state.description).toContain('找不到檔案');
  });

  it('defaults includeDiagnostics to false for a non-bug kind', async () => {
    stubBridge({});
    const feedback = await loadFeedbackReport();

    feedback.openReport({ kind: 'feature' });

    expect(feedback.state.kind).toBe('feature');
    expect(feedback.state.includeDiagnostics).toBe(false);
  });

  it('resets includeDiagnostics to the new kind default when the draft kind changes', async () => {
    stubBridge({});
    const feedback = await loadFeedbackReport();
    feedback.openReport({ kind: 'bug' });
    expect(feedback.state.includeDiagnostics).toBe(true);

    feedback.updateDraft({ kind: 'experience' });

    expect(feedback.state.includeDiagnostics).toBe(false);
  });

  it('refuses to preview an empty description without calling the bridge', async () => {
    const buildFeedbackPreview = vi.fn();
    stubBridge({ buildFeedbackPreview });
    const feedback = await loadFeedbackReport();
    feedback.openReport();

    const ok = await feedback.goToPreview();

    expect(ok).toBe(false);
    expect(feedback.state.notice).toMatchObject({
      code: 'FEEDBACK_DESCRIPTION_REQUIRED',
    });
    expect(buildFeedbackPreview).not.toHaveBeenCalled();
  });

  it('builds a preview and advances to the preview step on success', async () => {
    const buildFeedbackPreview = vi.fn().mockResolvedValue({
      ok: true,
      payload: { reportId: 'r-1', kind: 'bug', description: '整首歌卡住' },
    });
    stubBridge({ buildFeedbackPreview });
    const feedback = await loadFeedbackReport();
    feedback.openReport();
    feedback.updateDraft({ description: '整首歌卡住' });

    const ok = await feedback.goToPreview();

    expect(ok).toBe(true);
    expect(feedback.state.step).toBe('preview');
    expect(feedback.state.previewPayload).toMatchObject({ reportId: 'r-1' });
  });

  it('surfaces a failure notice when the preview bridge call fails', async () => {
    const buildFeedbackPreview = vi.fn().mockResolvedValue({ ok: false });
    stubBridge({ buildFeedbackPreview });
    const feedback = await loadFeedbackReport();
    feedback.openReport();
    feedback.updateDraft({ description: '整首歌卡住' });

    const ok = await feedback.goToPreview();

    expect(ok).toBe(false);
    expect(feedback.state.step).toBe('compose');
    expect(feedback.state.notice.title).toBe('無法建立預覽');
  });

  it('returns to the compose step and clears the notice', async () => {
    stubBridge({});
    const feedback = await loadFeedbackReport();
    feedback.openReport();
    await feedback.goToPreview(); // empty description -> sets a notice

    feedback.backToCompose();

    expect(feedback.state.step).toBe('compose');
    expect(feedback.state.notice).toBeNull();
  });

  it('submits successfully and advances to the result step', async () => {
    const submitFeedback = vi
      .fn()
      .mockResolvedValue({ ok: true, reportId: 'r-42' });
    stubBridge({ submitFeedback });
    const feedback = await loadFeedbackReport();
    feedback.openReport();
    feedback.updateDraft({ description: '整首歌卡住' });

    const ok = await feedback.submitReport();

    expect(ok).toBe(true);
    expect(feedback.state.step).toBe('result');
    expect(feedback.state.reportId).toBe('r-42');
  });

  it('shows a rate-limit specific message when submission is throttled', async () => {
    const submitFeedback = vi
      .fn()
      .mockResolvedValue({ ok: false, errorCode: 'FEEDBACK_RATE_LIMITED' });
    stubBridge({ submitFeedback });
    const feedback = await loadFeedbackReport();
    feedback.openReport();
    feedback.updateDraft({ description: '整首歌卡住' });

    await feedback.submitReport();

    expect(feedback.state.notice.message).toContain('送出太多次');
    expect(feedback.state.notice.actionLabel).toBe('另存檔案');
  });

  it('treats a cancelled export-fallback dialog as success with no notice', async () => {
    const exportFeedbackFallback = vi
      .fn()
      .mockResolvedValue({ ok: true, cancelled: true });
    stubBridge({ exportFeedbackFallback });
    const feedback = await loadFeedbackReport();
    feedback.openReport();

    const ok = await feedback.exportFallback();

    expect(ok).toBe(true);
    expect(feedback.state.notice).toBeNull();
  });

  it('shows a success notice after a successful export-fallback', async () => {
    const exportFeedbackFallback = vi
      .fn()
      .mockResolvedValue({ ok: true, cancelled: false });
    stubBridge({ exportFeedbackFallback });
    const feedback = await loadFeedbackReport();
    feedback.openReport();

    const ok = await feedback.exportFallback();

    expect(ok).toBe(true);
    expect(feedback.state.notice).toMatchObject({ code: 'FEEDBACK_EXPORTED' });
  });

  it('closes the report without clearing the draft', async () => {
    stubBridge({});
    const feedback = await loadFeedbackReport();
    feedback.openReport();
    feedback.updateDraft({ description: '整首歌卡住' });

    feedback.closeReport();

    expect(feedback.state.open).toBe(false);
    expect(feedback.state.description).toBe('整首歌卡住');
  });
});

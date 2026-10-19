import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildLyricsIssueReport } from '../utils/lyricsIssueReport.js';
import { buildFeedbackPayload } from '../../electron/lib/feedback/payload.js';
import { validateFeedbackPayload } from '../../services/feedback-relay/src/validate.js';

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
  it('keeps a lyrics case compatible with main/relay preview and offline fallback', async () => {
    const build = (input) =>
      buildFeedbackPayload({
        ...input,
        reportId: 'f2b3d676-2c4d-42a7-a7a7-600144a03bb9',
        createdAt: '2026-10-19T00:00:00.000Z',
        environment: { appVersion: '0.4.0', platform: 'win32' },
      });
    let exported;
    const buildFeedbackPreview = vi.fn(async (input) => ({
      ok: true,
      payload: build(input).payload,
    }));
    const submitFeedback = vi.fn(async () => ({ ok: false }));
    const exportFeedbackFallback = vi.fn(async (input) => {
      exported = JSON.parse(JSON.stringify(build(input).payload));
      return { ok: true, cancelled: false };
    });
    stubBridge({
      buildFeedbackPreview,
      submitFeedback,
      exportFeedbackFallback,
    });
    const context = {
      track: { title: 'Song', artist: 'Artist' },
      source: {
        kind: 'lrclib',
        provider: { recordId: 42 },
        filename: 'private.lrc',
      },
      tier: 'T2',
      offsetMs: 700,
    };
    const original = JSON.stringify(context);
    const feedback = await loadFeedbackReport();
    feedback.openReport(buildLyricsIssueReport(context));
    expect(buildFeedbackPreview).not.toHaveBeenCalled();
    feedback.updateDraft({
      description: feedback.state.description + '\n副歌開始約 50 秒時提早。',
    });
    await feedback.goToPreview();
    expect(validateFeedbackPayload(feedback.state.previewPayload)).toEqual({
      ok: true,
    });
    expect(feedback.state.previewPayload).not.toHaveProperty('diagnostics');
    await feedback.submitReport();
    expect(feedback.state.notice.actionLabel).toBe('另存檔案');
    await feedback.exportFallback();
    expect(validateFeedbackPayload(exported)).toEqual({ ok: true });
    expect(exported.description).toContain('+700 ms');
    expect(exported.description).toContain('50 秒');
    expect(JSON.stringify(exported)).not.toContain('private.lrc');
    expect(JSON.stringify(context)).toBe(original);
  });
  it('opens a bounded editable prefill without preview, sending, exporting or stale fields', async () => {
    const methods = {
      buildFeedbackPreview: vi.fn(),
      submitFeedback: vi.fn(),
      exportFeedbackFallback: vi.fn(),
    };
    stubBridge(methods);
    const feedback = await loadFeedbackReport();
    feedback.openReport();
    feedback.updateDraft({
      description: 'old',
      contact: 'old contact',
      trackLabel: 'old track',
    });
    feedback.openReport({
      kind: 'content',
      description: 'Draft\u0000' + 'x'.repeat(2100),
      trackLabel: 'Song' + 'y'.repeat(220),
    });
    expect(feedback.state.description).toHaveLength(2000);
    expect(feedback.state.description).not.toContain('\u0000');
    expect(feedback.state.trackLabel).toHaveLength(200);
    expect(feedback.state.contact).toBe('');
    expect(feedback.state).toMatchObject({
      kind: 'content',
      includeDiagnostics: false,
      previewPayload: null,
      step: 'compose',
    });
    for (const method of Object.values(methods))
      expect(method).not.toHaveBeenCalled();
    feedback.updateDraft({ description: 'My observation' });
    expect(feedback.state.description).toBe('My observation');
    feedback.closeReport();
    feedback.openReport({ kind: 'feature' });
    expect(feedback.state.description).toBe('');
    expect(feedback.state.trackLabel).toBe('');
  });
  it('keeps description validation on the field and clears it when corrected', async () => {
    stubBridge({});
    const feedback = await loadFeedbackReport();
    feedback.openReport();
    await feedback.goToPreview();
    expect(feedback.state.descriptionError).toContain('描述');
    expect(feedback.state.notice).toBeNull();
    feedback.updateDraft({ description: '播放時出現雜音' });
    expect(feedback.state.descriptionError).toBe('');
  });

  it('ignores a late preview after closing and opening a different report', async () => {
    let finish;
    const buildFeedbackPreview = vi.fn(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    stubBridge({ buildFeedbackPreview });
    const feedback = await loadFeedbackReport();
    feedback.openReport();
    feedback.updateDraft({ description: '舊草稿' });
    const pending = feedback.goToPreview();
    expect(await feedback.goToPreview()).toBe(false);
    feedback.closeReport();
    feedback.openReport();
    feedback.updateDraft({ description: '新草稿' });
    finish({ ok: true, payload: { description: '舊草稿' } });
    await pending;
    expect(feedback.state.step).toBe('compose');
    expect(feedback.state.description).toBe('新草稿');
    expect(feedback.state.previewPayload).toBeNull();
  });
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
    expect(feedback.state.notice).toBeNull();
    expect(feedback.state.descriptionError).toContain('描述');
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

  it('preserves a submission failure when the fallback save dialog is cancelled', async () => {
    stubBridge({
      submitFeedback: vi.fn().mockResolvedValue({ ok: false }),
      exportFeedbackFallback: vi.fn().mockResolvedValue({ cancelled: true }),
    });
    const feedback = await loadFeedbackReport();
    feedback.openReport();
    feedback.updateDraft({ description: '播放中斷' });
    await feedback.submitReport();
    const notice = feedback.state.notice;
    await feedback.exportFallback();
    expect(feedback.state.notice).toEqual(notice);
    expect(feedback.state.description).toBe('播放中斷');
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

import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import FeedbackReportModal from './FeedbackReportModal.vue';
import { useFeedbackReport } from '../../composables/useFeedbackReport.js';

async function renderModal() {
  return renderToString(createSSRApp(FeedbackReportModal));
}

afterEach(() => {
  vi.unstubAllGlobals();
  useFeedbackReport().closeReport();
});

describe('FeedbackReportModal', () => {
  it('associates required description feedback with the textarea', async () => {
    const feedback = useFeedbackReport();
    feedback.openReport();
    await feedback.goToPreview();
    const html = await renderModal();
    expect(html).toContain('aria-describedby="feedback-description-error"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('簡短描述');
    expect(html).not.toContain('ui-notice--warning');
  });
  it('renders nothing when the report is closed', async () => {
    useFeedbackReport().closeReport();
    const html = await renderModal();
    expect(html).not.toContain('回報與建議');
  });

  it('shows the diagnostics checkbox but not the track label field for a bug report', async () => {
    useFeedbackReport().openReport({ kind: 'bug' });
    const html = await renderModal();

    expect(html).toContain('回報與建議');
    expect(html).toContain('附上最近的錯誤紀錄');
    expect(html).not.toContain('歌曲資訊');
    const toolbar = html.slice(
      html.indexOf('class="ui-modal__header-actions"'),
      html.indexOf('class="ui-modal__body'),
    );
    expect(toolbar).toContain('預覽');
    expect(html).not.toContain('feedback-report__actions');
  });

  it('uses the notice modal size for its multi-step compose/preview flow', async () => {
    useFeedbackReport().openReport({ kind: 'bug' });
    const html = await renderModal();

    expect(html).toContain('ui-modal--notice');
  });

  it('shows the track label field but not the diagnostics checkbox for a content report', async () => {
    useFeedbackReport().openReport({ kind: 'content' });
    const html = await renderModal();

    expect(html).toContain('歌曲資訊');
    expect(html).not.toContain('附上最近的錯誤紀錄');
  });

  it('pre-fills the description from an error record', async () => {
    useFeedbackReport().openReport({
      errorRecord: { title: '播放失敗', message: '找不到檔案' },
    });
    const html = await renderModal();

    expect(html).toContain('播放失敗');
    expect(html).toContain('找不到檔案');
  });

  it('renders a human-readable preview summary rather than raw JSON', async () => {
    const feedback = useFeedbackReport();
    feedback.openReport({ kind: 'bug' });
    feedback.updateDraft({ description: '整首歌卡住' });
    vi.stubGlobal('window', {
      Utawakui: {
        buildFeedbackPreview: vi.fn().mockResolvedValue({
          ok: true,
          payload: {
            kind: 'bug',
            description: '整首歌卡住',
            environment: { appVersion: '1.0.0', platform: 'win32' },
            diagnostics: { eventCount: 3 },
          },
        }),
      },
    });

    await feedback.goToPreview();
    const html = await renderModal();

    expect(html).toContain('整首歌卡住');
    expect(html).toContain('已附上最近');
    expect(html).toContain('3');
    expect(html).not.toContain('schemaVersion');
    expect(html).not.toContain('{');
    const toolbar = html.slice(
      html.indexOf('class="ui-modal__header-actions"'),
      html.indexOf('class="ui-modal__body'),
    );
    expect(toolbar).toContain('返回編輯');
    expect(toolbar).toContain('另存檔案');
    expect(toolbar.indexOf('返回編輯')).toBeLessThan(
      toolbar.indexOf('另存檔案'),
    );
    expect(toolbar.indexOf('另存檔案')).toBeLessThan(
      toolbar.indexOf('送出回饋'),
    );
  });

  it('lets the user inspect attached events without codes or stacks', async () => {
    const feedback = useFeedbackReport();
    feedback.openReport({ kind: 'bug' });
    feedback.updateDraft({ description: '整首歌卡住' });
    vi.stubGlobal('window', {
      Utawakui: {
        buildFeedbackPreview: vi.fn().mockResolvedValue({
          ok: true,
          payload: {
            kind: 'bug',
            description: '整首歌卡住',
            environment: { appVersion: '1.0.0', platform: 'win32' },
            diagnostics: {
              eventCount: 1,
              events: [
                {
                  id: 'e-1',
                  timestamp: '2026-10-24T01:05:00.000Z',
                  level: 'error',
                  code: 'RENDER_PROCESS_GONE',
                  message: 'Renderer process terminated unexpectedly',
                  stack: 'at app:electron/main.js:1:2',
                },
              ],
            },
          },
        }),
      },
    });

    await feedback.goToPreview();
    const html = await renderModal();

    expect(html).toContain('查看內容');
    expect(html).toContain('Renderer process terminated unexpectedly');
    expect(html).not.toContain('RENDER_PROCESS_GONE');
    expect(html).not.toContain('app:electron');
  });

  it('renders a compact report reference while retaining the full submitted id', async () => {
    const reportId = 'aeb6ab26-f40b-4671-a3bc-996fd802503f';
    const feedback = useFeedbackReport();
    feedback.openReport({ kind: 'bug' });
    feedback.updateDraft({ description: '整首歌卡住' });
    vi.stubGlobal('window', {
      Utawakui: {
        submitFeedback: vi.fn().mockResolvedValue({ ok: true, reportId }),
      },
    });

    await feedback.submitReport();
    const html = await renderModal();

    expect(html).toContain('回饋已送出');
    expect(html).toContain('回報碼：AEB6-AB26-F40B');
    expect(html).not.toContain(reportId);
    expect(feedback.state.reportId).toBe(reportId);
  });
});

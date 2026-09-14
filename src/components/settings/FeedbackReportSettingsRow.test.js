import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import FeedbackReportSettingsRow from './FeedbackReportSettingsRow.vue';

async function renderRow() {
  return renderToString(
    createSSRApp({ render: () => h(FeedbackReportSettingsRow) }),
  );
}

describe('FeedbackReportSettingsRow', () => {
  it('shows a single entry point for feedback', async () => {
    const html = await renderRow();

    expect(html).toContain('回報問題');
  });
});

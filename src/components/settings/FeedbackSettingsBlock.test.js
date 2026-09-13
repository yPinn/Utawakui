import { describe, expect, it } from 'vitest';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import FeedbackSettingsBlock from './FeedbackSettingsBlock.vue';

async function renderBlock() {
  return renderToString(
    createSSRApp({ render: () => h(FeedbackSettingsBlock) }),
  );
}

describe('FeedbackSettingsBlock', () => {
  it('shows a single entry point for feedback', async () => {
    const html = await renderBlock();

    expect(html).toContain('意見回饋');
    expect(html).toContain('回報問題');
  });
});

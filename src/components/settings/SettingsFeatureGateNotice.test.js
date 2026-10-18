import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import { FEATURE_GATES } from '../../constants/featureGates.js';
import SettingsFeatureGateRow from './SettingsFeatureGateRow.vue';

// Inspect the closed modal's composition; Electron verifies opening/dismissal.
vi.mock('../ui/UiModal.vue', () => ({
  default: {
    props: ['title', 'presentation'],
    setup:
      (props, { slots }) =>
      () =>
        h('section', { 'data-presentation': props.presentation }, [
          h('h2', props.title),
          slots.default?.(),
          slots.footer ? h('footer', slots.footer()) : null,
        ]),
  },
}));

describe('Settings feature gate reading document', () => {
  it.each(Object.values(FEATURE_GATES))(
    'reuses canonical $id disclosures without confirmation actions after enabling',
    async (feature) => {
      const html = await renderToString(
        createSSRApp({
          render: () =>
            h(SettingsFeatureGateRow, {
              gate: {
                id: feature.id,
                title: '設定列標題',
                description: '設定列摘要',
                enabled: true,
              },
              actionLabel: '查看並啟用',
            }),
        }),
      );
      expect(html).toContain('data-presentation="document"');
      expect(html).toContain(feature.documentTitle);
      expect(html).toContain(feature.summary);
      for (const [index, line] of feature.body.entries()) {
        expect(html).toContain(feature.bodyTitles[index]);
        expect(html).toContain(line);
      }
      expect(html).toContain('feature-notice__list');
      expect(html).not.toContain('<footer');
      expect(html).not.toContain('確認並啟用');
      expect(html).not.toContain('暫不啟用');
      expect(html).not.toContain('查看並啟用');
    },
  );
});

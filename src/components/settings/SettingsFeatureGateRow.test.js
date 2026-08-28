import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import SettingsFeatureGateRow from './SettingsFeatureGateRow.vue';

function renderRow(enabled) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(
          SettingsFeatureGateRow,
          {
            gate: {
              id: 'audio-processing-flow',
              title: '啟用音訊處理',
              description: '在本機分析與處理音訊。',
              enabled,
              body: [],
            },
            actionLabel: '啟用處理',
          },
          { items: () => h('div', 'BPM 分析') },
        ),
    }),
  );
}

describe('SettingsFeatureGateRow', () => {
  it('groups optional feature-specific controls under an enabled gate', async () => {
    const html = await renderRow(true);

    expect(html).toContain('settings-feature-gate-row__items');
    expect(html).toContain('BPM 分析');
  });

  it('hides feature-specific controls while the gate is disabled', async () => {
    const html = await renderRow(false);

    expect(html).not.toContain('settings-feature-gate-row__items');
    expect(html).not.toContain('BPM 分析');
  });
});

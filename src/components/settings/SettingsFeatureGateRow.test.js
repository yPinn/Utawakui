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

  it('keeps dependency rows single-line and exposes detail as a tooltip', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(SettingsFeatureGateRow, {
            gate: {
              id: 'audio-processing-flow',
              title: '啟用音訊處理',
              description: '在本機分析與處理音訊。',
              enabled: true,
              body: [],
            },
            items: [
              {
                id: 'separation-model-quick',
                title: '人聲分離模型（快速）',
                value: '產生人聲分離結果時使用',
                description: '供本機人聲分離使用。',
                status: '已準備',
                statusTone: 'success',
                advancedActions: [],
              },
            ],
            actionLabel: '啟用處理',
          }),
      }),
    );

    expect(html).toContain('人聲分離模型（快速）');
    expect(html).toContain('供本機人聲分離使用。');
    expect(html).not.toContain('title="供本機人聲分離使用。"');
    expect(html).not.toContain('settings-action-row__value');
    expect(html).not.toContain('產生人聲分離結果時使用');
  });
});

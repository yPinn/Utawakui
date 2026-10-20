import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { expect, it } from 'vitest';
import SettingsDependencyList from './SettingsDependencyList.vue';

const render = (props) =>
  renderToString(
    createSSRApp({
      render: () =>
        h(SettingsDependencyList, props, () => h('div', 'BPM 分析元件')),
    }),
  );
it('counts the BPM component alongside the dependency models and stays collapsed when ready', async () => {
  const html = await render({
    items: [{ id: 'tool', title: '轉換工具', advancedActions: [] }],
    additionalCount: 1,
  });
  expect(html).toContain('工具與模型 · 2 項 · 已就緒');
  expect(html).toMatch(/<details\b(?![^>]*\bopen)[^>]*>/);
});
it('does not label an unread component as ready', async () => {
  expect(
    await render({ additionalCount: 1, additionalLoaded: false }),
  ).toContain('讀取中');
});
it('separates unavailable capabilities from readiness without opening a recovery flow', async () => {
  const html = await render({ additionalCount: 2, additionalUnavailable: 1 });
  expect(html).toContain('1 項未開放');
  expect(html).not.toContain('已就緒');
  expect(html).not.toContain('待處理');
  expect(html).toMatch(/<details\b(?![^>]*\bopen)[^>]*>/);
});
it('reveals a failed component and keeps the summary actionable', async () => {
  const html = await render({ additionalCount: 1, additionalAttention: true });
  expect(html).toContain('1 項待處理');
  expect(html).toMatch(/<details\b[^>]*\bopen/);
});
it('reveals active work so its progress and controls remain visible', async () => {
  const html = await render({ additionalCount: 1, additionalBusy: true });
  expect(html).toContain('1 項處理中');
  expect(html).toMatch(/<details\b[^>]*\bopen/);
});
it('counts both optional capabilities without collapsing their busy or attention totals', async () => {
  const html = await render({
    additionalCount: 2,
    additionalBusy: 2,
    additionalAttention: 2,
  });
  expect(html).toContain('工具與模型 · 2 項 · 2 項處理中 · 2 項待處理');
});

import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { expect, it } from 'vitest';
import { Download, Trash2 } from '../../icons/index.js';
import SettingsDependencyActions from './SettingsDependencyActions.vue';

it('keeps the overflow menu last after the primary tool action', async () => {
  const html = await renderToString(
    createSSRApp({
      render: () =>
        h(SettingsDependencyActions, {
          item: {
            id: 'tool',
            title: '分析工具',
            actionIcon: Download,
            actionLabel: '下載分析工具',
            actionDisabled: true,
            advancedActions: [
              { id: 'remove', label: '移除', icon: Trash2, intent: 'danger' },
            ],
          },
        }),
    }),
  );
  const buttons = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/gu);
  expect(buttons).toHaveLength(2);
  expect(buttons[0]).toContain('下載分析工具');
  expect(buttons[0]).toContain('ui-icon-btn--accent');
  expect(buttons[0]).toContain('disabled');
  expect(buttons[1]).toContain('分析工具選項');
  expect(buttons[1]).toContain('aria-haspopup="menu"');
});

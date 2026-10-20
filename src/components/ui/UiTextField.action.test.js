import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { expect, it } from 'vitest';
import UiTextField from './UiTextField.vue';

it('keeps a field action with its input while validation stays outside the control row', async () => {
  const html = await renderToString(
    createSSRApp({
      render: () =>
        h(
          UiTextField,
          { id: 'password', label: '密碼', error: '密碼過長' },
          { action: () => h('button', { type: 'button' }, '移除密碼') },
        ),
    }),
  );
  expect(html).toContain('ui-text-field__control-row');
  expect(html).toContain('移除密碼');
  expect(html).toMatch(
    /ui-text-field__control-row[^>]*>[\s\S]*?<input[\s\S]*?<button[^>]*>移除密碼<\/button>[\s\S]*?<\/div>[\s\S]*?id="password-error"/u,
  );
  expect(html).toContain('aria-describedby="password-error"');
});

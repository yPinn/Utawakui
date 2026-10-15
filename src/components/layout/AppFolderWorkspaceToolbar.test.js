import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import AppFolderWorkspaceToolbar from './AppFolderWorkspaceToolbar.vue';

const source = readFileSync(
  new URL('./AppFolderWorkspaceToolbar.vue', import.meta.url),
  'utf8',
);

function render(props, slots = {}) {
  return renderToString(
    createSSRApp({
      render: () => h(AppFolderWorkspaceToolbar, props, slots),
    }),
  );
}

describe('AppFolderWorkspaceToolbar', () => {
  it('shows context without repeating the tool name as a heading', async () => {
    const html = await render(
      { context: '夜空ノムコウ', contextLang: 'ja', meta: 'SMAP' },
      {
        status: () => h('span', '3 首'),
        actions: () => h('button', { type: 'button' }, '清除'),
      },
    );

    expect(html).not.toMatch(/<h[1-6]/u);
    expect(html).toMatch(/lang="ja"[^>]*>\s*夜空ノムコウ/u);
    expect(html).toContain('SMAP');
    expect(html).toContain('app-folder-workspace-toolbar__status');
    expect(html).toContain('app-folder-workspace-toolbar__actions');
  });

  it('omits empty meta, status and actions', async () => {
    const html = await render({ context: '臨時場次' });

    expect(html).not.toContain('app-folder-workspace-toolbar__meta');
    expect(html).not.toContain('app-folder-workspace-toolbar__status');
    expect(html).not.toContain('app-folder-workspace-toolbar__actions');
  });

  it('draws a Folder ledger rule instead of a card frame', () => {
    expect(source).toContain('var(--ui-folder-ledger-rule-strong');
    expect(source).toContain('font-family: var(--ui-font-family-display);');
    expect(source).not.toMatch(/border-radius|background:/u);
  });
});

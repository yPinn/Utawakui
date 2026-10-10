import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import AppFolderCompactBar from './AppFolderCompactBar.vue';

const source = readFileSync(
  new URL('./AppFolderCompactBar.vue', import.meta.url),
  'utf8',
);

function render(props) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(
          AppFolderCompactBar,
          { title: '演.说.家', ...props },
          {
            action: () => h('button', { type: 'button' }, 'Play'),
          },
        ),
    }),
  );
}

describe('AppFolderCompactBar', () => {
  it('stays inert and hidden until the dossier scrolls away', async () => {
    const hidden = await render({ visible: false });
    const shown = await render({ visible: true, titleLang: 'zh-Hans' });

    expect(hidden).toMatch(/class="app-folder-compact-bar"[^>]*inert/u);
    expect(hidden).toContain('aria-hidden="true"');
    expect(shown).not.toMatch(/class="app-folder-compact-bar"[^>]*inert/u);
    expect(shown).toContain('app-folder-compact-bar__surface--visible');
    expect(shown).toMatch(/lang="zh-Hans"[^>]*>\s*演\.说\.家/u);
  });

  it('overlays content from a zero-height sticky anchor', () => {
    expect(source).toMatch(
      /\.app-folder-compact-bar \{[^}]*position: sticky;[^}]*top: 0;[^}]*z-index: var\(--ui-layer-overlay\);[^}]*block-size: 0;/su,
    );
    expect(source).toMatch(
      /\.app-folder-compact-bar__surface \{[^}]*position: absolute;[^}]*block-size: var\(--ui-folder-compact-bar-block-size\);/su,
    );
    expect(source).toContain('font-family: var(--ui-font-family-display);');
  });
});

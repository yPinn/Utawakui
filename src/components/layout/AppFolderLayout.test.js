import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import AppFolderLayout from './AppFolderLayout.vue';

const source = readFileSync(
  new URL('./AppFolderLayout.vue', import.meta.url),
  'utf8',
);

async function renderLayout(activeDestination = 'setlist') {
  return renderToString(
    createSSRApp({
      render: () =>
        h(
          AppFolderLayout,
          { activeDestination },
          { default: () => h('p', 'Feature body') },
        ),
    }),
  );
}

describe('AppFolderLayout', () => {
  it('owns the four workflow destinations and global navigation semantics', async () => {
    const html = await renderLayout();

    expect(html).toContain('aria-label="Folder 頁面"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tab"');
    expect(html.indexOf('Setlist')).toBeLessThan(html.indexOf('Lyrics'));
    expect(html.indexOf('Lyrics')).toBeLessThan(html.indexOf('Output'));
    expect(html.indexOf('Output')).toBeLessThan(html.indexOf('Import'));
    expect(html).toContain('Feature body');
  });

  it('keeps Folder material and tab motion inside the formal layout owner', () => {
    expect(source).toContain('background: var(--ui-folder-layout-background)');
    expect(source).toContain('block-size: var(--ui-folder-tab-height-active)');
    expect(source).toContain(
      'transform: translateY(var(--ui-folder-tab-rest-offset))',
    );
    expect(source).toContain('transform: translateY(0)');
    expect(source).toContain('clip-path: var(--ui-folder-tab-shape)');
    expect(source).toContain('container-name: app-folder-layout');
    expect(source).toMatch(
      /\.app-folder-layout__shape-definition\s*\{[^}]*position:\s*absolute;/su,
    );
    expect(source).toContain('@container app-folder-layout (max-width: 36rem)');
    expect(source).toContain('@media (forced-colors: active)');
    expect(source).toContain('@media (prefers-reduced-motion: reduce)');
    expect(source).not.toContain('candidateView');
    expect(source).not.toContain('data-ui-candidate-view');
    expect(source).not.toContain('Archive');
  });
});

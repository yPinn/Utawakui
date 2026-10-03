import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import AppFolderPage from './AppFolderPage.vue';

const source = readFileSync(
  new URL('./AppFolderPage.vue', import.meta.url),
  'utf8',
);

async function renderPage(mode) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(
          AppFolderPage,
          {
            mode,
            bodyLabel: `${mode} body`,
            'aria-label': `${mode} page`,
          },
          {
            header: () => h('h1', 'Fixed heading'),
            default: () => h('p', 'Feature body'),
          },
        ),
    }),
  );
}

describe('AppFolderPage', () => {
  it('keeps the header outside the single document scroll owner', async () => {
    const html = await renderPage('document');
    const headerPosition = html.indexOf('app-folder-page__header');
    const scrollPosition = html.indexOf('app-folder-page__scroll');

    expect(headerPosition).toBeGreaterThan(-1);
    expect(scrollPosition).toBeGreaterThan(headerPosition);
    expect(html).toContain('data-page-mode="document"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="document body"');
    expect(html).toContain('tabindex="0"');
    expect(source).toContain(
      "import UiScrollLayout from '../ui/UiScrollLayout.vue'",
    );
    expect(source).toContain('background: var(--ui-folder-page-background)');
  });

  it('uses a bounded non-scrolling body for workspace mode', async () => {
    const html = await renderPage('workspace');

    expect(html).toContain('data-page-mode="workspace"');
    expect(html).toContain('app-folder-page__body--workspace');
    expect(html).not.toContain('app-folder-page__scroll');
    expect(html).not.toContain('role="region"');
    expect(html).not.toContain('aria-label="workspace body"');
    expect(source).toMatch(
      /\.app-folder-page__body--workspace\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/su,
    );
  });
});

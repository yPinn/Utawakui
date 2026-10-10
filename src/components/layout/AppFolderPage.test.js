import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import AppFolderPage from './AppFolderPage.vue';

const source = readFileSync(
  new URL('./AppFolderPage.vue', import.meta.url),
  'utf8',
);

async function renderPage(
  mode,
  { withExtension = false, withFloating = false, withFolderTools = false } = {},
) {
  return renderToString(
    createSSRApp({
      render: () => {
        const slots = {
          header: () => h('h1', 'Fixed heading'),
          default: () => h('p', 'Feature body'),
        };
        if (withExtension) {
          slots.extension = () => h('aside', 'Folder extension');
        }
        if (withFloating) {
          slots.floating = () => h('aside', 'Floating artifact');
        }
        if (withFolderTools) {
          slots['folder-tools'] = () => h('button', 'Add Folder asset');
        }
        return h(
          AppFolderPage,
          {
            mode,
            bodyLabel: `${mode} body`,
            'aria-label': `${mode} page`,
          },
          slots,
        );
      },
    }),
  );
}

describe('AppFolderPage', () => {
  it('lets the Folder frame scroll one bounded paper sheet', async () => {
    const html = await renderPage('document');
    const scrollPosition = html.indexOf('app-folder-page__scroll');
    const sheetPosition = html.indexOf('app-folder-page__sheet');
    const decorationPosition = html.indexOf('app-loose-leaf-edge');
    const headerPosition = html.indexOf('app-folder-page__header');
    const bodyPosition = html.indexOf('app-folder-page__body--document');

    expect(scrollPosition).toBeGreaterThan(-1);
    expect(sheetPosition).toBeGreaterThan(scrollPosition);
    expect(decorationPosition).toBeGreaterThan(sheetPosition);
    expect(headerPosition).toBeGreaterThan(decorationPosition);
    expect(bodyPosition).toBeGreaterThan(headerPosition);
    expect(html).toContain('data-page-mode="document"');
    expect(html).toContain('tabindex="-1"');
    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="document body"');
    expect(html).toContain('tabindex="0"');
    expect(source).toContain(
      "import UiScrollLayout from '../ui/UiScrollLayout.vue'",
    );
    expect(source).toContain(
      "import AppLooseLeafEdge from './AppLooseLeafEdge.vue'",
    );
    expect(source).toContain('content-class="app-folder-page__document"');
    expect(source).toMatch(
      /\.app-folder-page\s*\{[^}]*background:\s*transparent;/su,
    );
    const scrollRule = source.match(
      /\.app-folder-page__scroll\s*\{(?<body>[^}]*)\}/su,
    )?.groups?.body;

    expect(scrollRule).toContain('height: 100%;');
    expect(scrollRule).toContain(
      '--ui-scroll-layout-padding-block-end: var(\n    --ui-folder-sheet-frame-block-end-gap\n  );',
    );
    expect(scrollRule).toContain(
      '--ui-scroll-layout-padding-inline-end: var(--ui-folder-sheet-scrollbar-gap);',
    );
    expect(source).toMatch(
      /\.app-folder-page__sheet\s*\{[^}]*inline-size:\s*100%;[^}]*max-inline-size:\s*var\(--ui-folder-sheet-max-inline-size\);[^}]*min-block-size:\s*max\(100%, var\(--ui-folder-sheet-min-block-size\)\);[^}]*background:\s*var\(--ui-folder-page-background\);/su,
    );
  });

  it('adds a content-driven Folder extension after the paper only when supplied', async () => {
    const withoutExtension = await renderPage('document');
    const withExtension = await renderPage('document', { withExtension: true });
    const sheetPosition = withExtension.indexOf('app-folder-page__sheet');
    const extensionPosition = withExtension.indexOf(
      'app-folder-page__extension',
    );

    expect(withoutExtension).not.toContain('app-folder-page__extension');
    expect(extensionPosition).toBeGreaterThan(sheetPosition);
    expect(withExtension).toContain('Folder extension');
    expect(source).toContain(
      'v-if="$slots.extension || $slots.floating || $slots[\'folder-tools\']"',
    );
    expect(source).toMatch(
      /\.app-folder-page__extension\s*\{[^}]*position:\s*relative;[^}]*grid-row:\s*2;[^}]*z-index:\s*0;/su,
    );
    expect(source).not.toMatch(
      /\.app-folder-page__extension\s*\{[^}]*overflow:\s*(?:clip|hidden);/su,
    );
    expect(source).not.toMatch(
      /\.app-folder-page__extension\s*\{[^}]*padding-block:/su,
    );
  });

  it('spans one floating plane across the paper and Folder extension without seam clipping', async () => {
    const html = await renderPage('document', { withFloating: true });
    const sheetPosition = html.indexOf('app-folder-page__sheet');
    const extensionPosition = html.indexOf(
      'app-folder-page__extension--floating',
    );
    const floatingPosition = html.indexOf('app-folder-page__floating');

    expect(sheetPosition).toBeGreaterThan(-1);
    expect(extensionPosition).toBeGreaterThan(sheetPosition);
    expect(floatingPosition).toBeGreaterThan(extensionPosition);
    expect(html).toContain('Floating artifact');
    expect(source).toContain('$slots.extension || $slots.floating');
    expect(source).toContain('<slot name="floating" />');
    expect(source).toMatch(
      /:deep\(\.app-folder-page__document\)\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*max-content max-content;[^}]*isolation:\s*isolate;/su,
    );
    expect(source).toMatch(
      /\.app-folder-page__floating\s*\{[^}]*grid-row:\s*1 \/ 3;[^}]*z-index:\s*1;[^}]*overflow:\s*visible;[^}]*pointer-events:\s*none;/su,
    );
    expect(source).toMatch(
      /\.app-folder-page__extension--floating\s*\{[^}]*min-block-size:\s*var\(--ui-folder-artifact-folder-min-height\);/su,
    );
  });

  it('keeps Folder tools on the extension material below floating artifacts', async () => {
    const html = await renderPage('document', {
      withFloating: true,
      withFolderTools: true,
    });
    const sheetPosition = html.indexOf('app-folder-page__sheet');
    const extensionPosition = html.indexOf('app-folder-page__extension');
    const floatingPosition = html.indexOf('app-folder-page__floating');
    const toolsPosition = html.indexOf('app-folder-page__tools');

    expect(extensionPosition).toBeGreaterThan(sheetPosition);
    expect(floatingPosition).toBeGreaterThan(extensionPosition);
    expect(toolsPosition).toBeGreaterThan(extensionPosition);
    expect(toolsPosition).toBeLessThan(floatingPosition);
    expect(html).toContain('Add Folder asset');
    expect(source).toContain(
      "$slots.extension || $slots.floating || $slots['folder-tools']",
    );
    expect(source).toContain('<slot name="folder-tools" />');
    expect(source).not.toContain('app-folder-page__extension--pocket');
    expect(source).toMatch(
      /:deep\(\.app-folder-page__document\)\s*\{[^}]*grid-template-rows:\s*max-content max-content;/su,
    );
    expect(source).toMatch(
      /\.app-folder-page__tools\s*\{[^}]*position:\s*relative;[^}]*z-index:\s*0;[^}]*justify-content:\s*flex-end;[^}]*margin-block-start:\s*var\(--ui-space-2\);[^}]*padding-inline-end:\s*var\(--ui-folder-document-inset\);/su,
    );
    expect(source).toMatch(
      /\.app-folder-page__floating\s*\{[^}]*z-index:\s*1;/su,
    );
    const toolsRule =
      source.match(/\.app-folder-page__tools\s*\{[^}]*\}/su)?.[0] ?? '';
    expect(toolsRule).not.toContain('background:');
    expect(toolsRule).not.toMatch(/padding:(?!-)/u);
    expect(toolsRule).not.toContain('border-radius:');
    expect(source).not.toMatch(/grid-row:\s*3/u);
    expect(source).not.toContain('--ui-folder-pocket-surface');
    expect(source).not.toContain('--ui-folder-pocket-edge');
  });

  it('uses a bounded non-scrolling body for workspace mode', async () => {
    const html = await renderPage('workspace', { withFolderTools: true });

    expect(html).toContain('data-page-mode="workspace"');
    expect(html).toContain('app-folder-page__body--workspace');
    expect(html).not.toContain('app-folder-page__scroll');
    expect(html).not.toContain('app-folder-page__sheet');
    expect(html).not.toContain('app-folder-page__extension');
    expect(html).not.toContain('app-folder-page__tools');
    expect(html).not.toContain('Add Folder asset');
    expect(html).not.toContain('app-loose-leaf-edge');
    expect(html).not.toContain('role="region"');
    expect(html).not.toContain('aria-label="workspace body"');
    expect(source).toMatch(
      /\.app-folder-page__body--workspace\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/su,
    );
    expect(source).toMatch(
      /\.app-folder-page\[data-page-mode='workspace'\]\s*\{[^}]*background:\s*var\(--ui-folder-page-background\);/su,
    );
  });

  it('returns a document to its start when its identity changes', () => {
    expect(source).toContain('documentKey: { type: [String, Number]');
    expect(source).toContain(
      "const scrollLayout = useTemplateRef('scrollLayout')",
    );
    expect(source).toMatch(/watch\(\s*\(\) => props\.documentKey/u);
    expect(source).toContain(
      "scrollLayout.value?.scrollTo({ top: 0, behavior: 'auto' })",
    );
    expect(source).toContain('ref="scrollLayout"');
  });
});

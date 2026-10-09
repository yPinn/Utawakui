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
    for (const destination of ['setlist', 'lyrics', 'output', 'import']) {
      expect(html).toContain(`data-folder-destination="${destination}"`);
    }
  });

  it('gives every Folder tab its destination material and contrast foreground', () => {
    for (const [destination, material] of [
      ['setlist', 'primary'],
      ['lyrics', 'secondary'],
      ['output', 'tertiary'],
      ['import', 'neutral'],
    ]) {
      expect(source).toMatch(
        new RegExp(
          `\\.app-folder-layout__destination\\[data-folder-destination='${destination}'\\]\\s*\\{[^}]*--ui-folder-tab-material:\\s*var\\(--ui-color-folder-${material}\\);[^}]*--ui-folder-tab-foreground:\\s*var\\(--ui-color-folder-${material}-foreground\\);`,
          'su',
        ),
      );
    }

    expect(source).toMatch(
      /\.app-folder-layout__destination\s*\{[^}]*color:\s*var\(--ui-folder-tab-foreground\);/su,
    );
    expect(source).toMatch(
      /\.app-folder-layout__destination::before\s*\{[^}]*background:\s*var\(--ui-folder-tab-material\);/su,
    );
    expect(source).toMatch(
      /\.app-folder-layout__destination--active\s*\{[^}]*color:\s*var\(--ui-folder-tab-foreground\);/su,
    );
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

  it('maps destination color only to the Folder exterior', () => {
    expect(source).toMatch(
      /\.app-folder-layout\s*\{[^}]*--ui-folder-layout-background:\s*var\(--ui-color-folder-primary\);[^}]*--ui-folder-page-background:\s*var\(\s*--ui-folder-sheet-background\s*\);[^}]*--ui-folder-content-background:\s*transparent;/su,
    );

    for (const [destination, material] of [
      ['lyrics', 'secondary'],
      ['output', 'tertiary'],
      ['import', 'neutral'],
    ]) {
      expect(source).toMatch(
        new RegExp(
          `\\.app-folder-layout\\[data-active-destination='${destination}'\\]\\s*\\{[^}]*--ui-folder-layout-background:\\s*var\\(--ui-color-folder-${material}\\);[^}]*\\}`,
          'su',
        ),
      );
    }

    expect(source).not.toContain('--ui-folder-interior-background');
    expect(source).not.toContain('--ui-color-canvas:');
    expect(source).not.toContain('--ui-color-accent:');
  });

  it('defines one continuous paper with printed ledger rules', () => {
    const layoutRule = source.match(
      /\.app-folder-layout\s*\{(?<body>[\s\S]*?)\n\}/u,
    )?.groups?.body;

    expect(layoutRule).toContain(
      '--ui-folder-page-background: var(--ui-folder-sheet-background);',
    );
    expect(layoutRule).toContain(
      '--ui-folder-dossier-background: transparent;',
    );
    expect(layoutRule).toContain('--ui-folder-ledger-background: transparent;');
    expect(layoutRule).toContain(
      '--ui-folder-content-background: transparent;',
    );
    expect(layoutRule).not.toContain('--ui-folder-dossier-border');
    expect(layoutRule).toContain('--ui-folder-ledger-rule: color-mix(');
    expect(layoutRule).toContain('--ui-folder-ledger-rule-strong: color-mix(');
    expect(layoutRule).not.toContain('background-image');
  });

  it('uses the shared large-surface radius for every visible exterior corner', () => {
    expect(source).toMatch(
      /\.app-folder-layout__navigation::after\s*\{[^}]*border-radius:\s*var\(--ui-radius-lg\) var\(--ui-radius-lg\) 0 0;/su,
    );
    expect(source).toMatch(
      /\.app-folder-layout__perimeter\s*\{[^}]*border-radius:\s*var\(--ui-radius-lg\);/su,
    );
    expect(source).not.toContain(
      'border-radius: 0 var(--ui-radius-sm) var(--ui-radius-sm);',
    );
  });
});

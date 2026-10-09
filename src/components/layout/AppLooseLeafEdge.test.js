import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import AppLooseLeafEdge from './AppLooseLeafEdge.vue';

const source = readFileSync(
  new URL('./AppLooseLeafEdge.vue', import.meta.url),
  'utf8',
);

describe('AppLooseLeafEdge', () => {
  it('renders three decorative binding holes outside the accessibility tree', async () => {
    const html = await renderToString(
      createSSRApp({ render: () => h(AppLooseLeafEdge) }),
    );

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain('app-loose-leaf-edge__binding-field');
    expect(html).toContain('app-loose-leaf-edge__holes');
    expect(html.match(/class="app-loose-leaf-edge__hole"/gu)).toHaveLength(3);
    expect(html).not.toContain('tabindex');
    expect(html).not.toContain('role=');
  });

  it('centers a bounded hole rail inside a capped first-sheet binding field', () => {
    const edgeRule = source.match(
      /\.app-loose-leaf-edge\s*\{(?<body>[^}]*)\}/su,
    )?.groups?.body;
    const bindingFieldRule = source.match(
      /\.app-loose-leaf-edge__binding-field\s*\{(?<body>[^}]*)\}/su,
    )?.groups?.body;
    const holesRule = source.match(
      /\.app-loose-leaf-edge__holes\s*\{(?<body>[^}]*)\}/su,
    )?.groups?.body;

    expect(edgeRule).toContain('pointer-events: none;');
    expect(edgeRule).toContain('border-inline-end:');
    expect(edgeRule).not.toContain('justify-content: space-around;');
    expect(bindingFieldRule).toMatch(
      /block-size:\s*min\(\s*100%,\s*var\(--ui-folder-sheet-binding-field-max-block-size\)\s*\);/u,
    );
    expect(bindingFieldRule).toContain('display: grid;');
    expect(bindingFieldRule).toContain('align-items: center;');
    expect(holesRule).toContain(
      'block-size: min(\n    var(--ui-folder-sheet-hole-rail-block-size),',
    );
    expect(holesRule).toContain('justify-content: space-between;');
    expect(holesRule).not.toContain('inset-block-start:');
    expect(source).not.toContain('--ui-folder-sheet-hole-rail-offset');
    expect(source).toMatch(
      /\.app-loose-leaf-edge__hole\s*\{[^}]*inline-size:\s*var\(--ui-folder-sheet-hole-size\);[^}]*background:\s*var\(--ui-folder-layout-background\);/su,
    );
    expect(source).not.toContain('background-image');
  });
});

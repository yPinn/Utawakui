import { readFileSync } from 'node:fs';
import { compileStyle, parse } from '@vue/compiler-sfc';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiArtworkLoading from './UiArtworkLoading.vue';
import UiArtworkReveal from './UiArtworkReveal.vue';

function compiledCss(filename) {
  const source = readFileSync(new URL(filename, import.meta.url), 'utf8');
  const { descriptor } = parse(source, { filename });
  return descriptor.styles
    .map(
      (style) =>
        compileStyle({
          filename,
          id: 'data-v-artwork-test',
          scoped: style.scoped,
          source: style.content,
        }).code,
    )
    .join('\n');
}

describe('UiArtworkReveal', () => {
  const css = compiledCss('./UiArtworkReveal.vue');

  it('wraps caller content and starts hidden with a token-timed fade', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(UiArtworkReveal, null, { default: () => h('button', 'Play') }),
      }),
    );
    expect(html).toMatch(
      /^<span class="ui-artwork-reveal"[^>]*>(<!--\[-->)?<button/u,
    );
    expect(css).toMatch(
      /\.ui-artwork-reveal\[data-v-artwork-test\]\s*\{[^}]*opacity:\s*0;[^}]*transition:\s*opacity var\(--ui-motion-duration-fast\)/su,
    );
  });

  it('reveals on its own hover and on keyboard focus inside it', () => {
    expect(css).toMatch(/\.ui-artwork-reveal\[data-v-artwork-test\]:hover/u);
    expect(css).toMatch(
      /\.ui-artwork-reveal\[data-v-artwork-test\]:has\(:focus-visible\)/u,
    );
  });

  it('keeps both caller scopes targeting the reveal after compilation', () => {
    expect(css).toMatch(
      /\[data-artwork-reveal-scope\]:hover\s+\.ui-artwork-reveal\s*,/u,
    );
    expect(css).toMatch(
      /\[data-artwork-reveal-scope='focus-within'\]:focus-within\s+\.ui-artwork-reveal\s*\{/u,
    );
    // A bare scope selector would reveal the whole row instead of the content.
    expect(css).not.toMatch(/\[data-artwork-reveal-scope\]:hover\s*[,{]/u);
  });
});

describe('UiArtworkLoading', () => {
  const css = compiledCss('./UiArtworkLoading.vue');

  it('announces loading with a status role and a visually hidden label', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () => h(UiArtworkLoading, { label: '候選封面載入中' }),
      }),
    );
    expect(html).toContain('role="status"');
    expect(html).toMatch(/ui-visually-hidden[^>]*>候選封面載入中</u);
  });

  it('stops the literal-duration shimmer for manual and OS reduced motion', () => {
    expect(css).toMatch(
      /:root\[data-ui-motion='reduced'\] \.ui-artwork-loading\s*\{\s*animation:\s*none;/u,
    );
    expect(css).not.toMatch(/:root\[data-ui-motion='reduced'\]\s*\{/u);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: reduce\)\s*\{\s*\.ui-artwork-loading\[data-v-artwork-test\]\s*\{\s*animation:\s*none;/u,
    );
  });
});

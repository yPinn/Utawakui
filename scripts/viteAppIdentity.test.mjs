import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import pluginModule from './viteAppIdentity.js';

const { createAppIdentityPlugin } = pluginModule;

describe('HTML brand identity', () => {
  it.each([
    ['index.html', 'Utawakui'],
    ['src/entries/prompter/index.html', 'Utawakui 提詞器'],
  ])(
    'resolves %s branding without changing its CSP or bootstrap',
    (file, title) => {
      const source = readFileSync(
        new URL(`../${file}`, import.meta.url),
        'utf8',
      );
      const hook = createAppIdentityPlugin().transformIndexHtml;
      const result = hook.handler(source, { path: `/${file}` });
      expect(result).toContain(`<title>${title}</title>`);
      expect(result).toContain('href="/assets/icons/app-icon.png"');
      expect(
        result.match(/<meta[\s\S]*?Content-Security-Policy[\s\S]*?\/>/)[0],
      ).toBe(
        source.match(/<meta[\s\S]*?Content-Security-Policy[\s\S]*?\/>/)[0],
      );
      expect(result.match(/<script[^>]+>/)[0]).toBe(
        source.match(/<script[^>]+>/)[0],
      );
      expect(result).not.toContain('%UTAWAKUI_');
      expect(hook.order).toBe('pre');
    },
  );

  it('does not transform unrelated HTML', () => {
    const html = '<title>Other</title>';
    expect(
      createAppIdentityPlugin().transformIndexHtml.handler(html, {
        path: '/other.html',
      }),
    ).toBe(html);
  });
});

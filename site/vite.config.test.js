import { readFileSync } from 'node:fs';
import { URL } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { SITE_LINKS } from './src/content/links.js';
import config from './vite.config.js';

const plugin = config.plugins.find(
  ({ name }) => name === 'utawakui-download-entry',
);

it.each(['index.html', 'privacy/index.html'])(
  'serves the favicon from the same public URL for %s',
  (page) => {
    const url = '/assets/icons/app-icon.ico';
    const html = readFileSync(new URL(page, import.meta.url), 'utf8');
    expect(html).toContain(`<link rel="icon" href="${url}"`);
    expect(readFileSync(new URL(`./public${url}`, import.meta.url))).toEqual(
      readFileSync(new URL(`../public${url}`, import.meta.url)),
    );
  },
);

describe('product site download entry', () => {
  it.each(['configureServer', 'configurePreviewServer'])(
    'redirects only downloads through %s',
    (hook) => {
      const use = vi.fn();
      plugin[hook]({ middlewares: { use } });
      const [handle] = use.mock.calls[0];

      for (const method of ['GET', 'HEAD']) {
        const writeHead = vi.fn();
        const end = vi.fn();
        const next = vi.fn();
        handle(
          { method, url: '/download?from=home' },
          { writeHead, end },
          next,
        );
        expect(writeHead).toHaveBeenCalledExactlyOnceWith(302, {
          Location: SITE_LINKS.releases,
        });
        expect(end).toHaveBeenCalledTimes(1);
        expect(next).not.toHaveBeenCalled();
      }

      const next = vi.fn();
      handle({ method: 'GET', url: '/downloads' }, {}, next);
      handle({ method: 'POST', url: '/download' }, {}, next);
      expect(next).toHaveBeenCalledTimes(2);
    },
  );

  it('emits the same release destination for the static host', () => {
    const emitFile = vi.fn();
    plugin.generateBundle.call({ emitFile });
    expect(emitFile).toHaveBeenCalledExactlyOnceWith({
      type: 'asset',
      fileName: '_redirects',
      source: `/download ${SITE_LINKS.releases} 302\n`,
    });
  });
});

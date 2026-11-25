import { fileURLToPath, URL } from 'node:url';

import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

import { SITE_LINKS } from './src/content/links.js';
import { PUBLIC_THUMBNAILS } from './src/content/templates.js';

const fromHere = (relative) =>
  fileURLToPath(new URL(relative, import.meta.url));

const THUMBNAILS = '../src/assets/output-template-thumbnails/';

const SCROLL_REGION = '../src/components/ui/UiScrollRegion.vue';

// Only these app files can be served outside site/ during development.
const APP_FILES = [
  '../src/styles/tokens.css',
  SCROLL_REGION,
  '../src/components/ui/scrollRegionGeometry.js',
  '../public/assets/icons/app-icon.png',
  ...PUBLIC_THUMBNAILS.map((file) => THUMBNAILS + file),
];

function downloadEntry() {
  function addRedirect(server) {
    server.middlewares.use((request, response, next) => {
      if (
        !['GET', 'HEAD'].includes(request.method) ||
        request.url?.split('?')[0] !== SITE_LINKS.download
      ) {
        next();
        return;
      }
      response.writeHead(302, { Location: SITE_LINKS.releases });
      response.end();
    });
  }

  return {
    name: 'utawakui-download-entry',
    configureServer: addRedirect,
    configurePreviewServer: addRedirect,
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: '_redirects',
        source: `${SITE_LINKS.download} ${SITE_LINKS.releases} 302\n`,
      });
    },
  };
}

export default defineConfig({
  root: fromHere('.'),
  plugins: [vue(), downloadEntry()],
  resolve: {
    dedupe: ['vue'],
    alias: {
      '@app-tokens': fromHere('../src/styles/tokens.css'),
      '@app-scroll-region': fromHere(SCROLL_REGION),
      '@icons': fromHere('../public/assets/icons'),
      '@thumbnails': fromHere(THUMBNAILS),
    },
  },
  server: {
    port: 5180,
    strictPort: true,
    fs: { allow: [fromHere('.'), ...APP_FILES.map(fromHere)] },
  },
  // Separate port so a preview can run beside the dev server.
  preview: { port: 5181, strictPort: true },
  build: {
    rolldownOptions: {
      input: {
        home: fromHere('index.html'),
        privacy: fromHere('privacy/index.html'),
      },
    },
    outDir: fromHere('dist'),
    emptyOutDir: true,
    // Hundreds of font slices make gzip reporting slow and noisy.
    reportCompressedSize: false,
  },
});

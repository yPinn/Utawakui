import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoPageLayoutAppearance from './DemoPageLayoutAppearance.vue';

const source = readFileSync(
  new URL('./DemoPageLayoutAppearance.vue', import.meta.url),
  'utf8',
);
const activeTokens = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);
const v2Tokens = readFileSync(
  new URL('../../styles/tokens-v2.css', import.meta.url),
  'utf8',
);

describe('DemoPageLayoutAppearance', () => {
  it('renders the main content as a folder shell with fixed chrome before the scroll body', async () => {
    const html = await renderToString(createSSRApp(DemoPageLayoutAppearance));
    const tabPosition = html.indexOf('demo-page-layout__folder-tabs');
    const shellPosition = html.indexOf('demo-page-layout__folder-shell');
    const headerPosition = html.indexOf('demo-page-layout__header');
    const scrollPosition = html.indexOf('demo-page-layout__body-scroll');

    expect(tabPosition).toBeGreaterThan(-1);
    expect(shellPosition).toBeGreaterThan(tabPosition);
    expect(headerPosition).toBeGreaterThan(-1);
    expect(scrollPosition).toBeGreaterThan(headerPosition);
    expect(html).toContain('aria-label="Folder 頁面"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('夏季 Cover 工作集');
    expect(html).toContain('工作集概覽');
    expect(html).toContain('素材狀態');
    expect(html).toContain('demo-page-layout__body');
  });

  it('demonstrates bounded photo, note, and stack artifacts with an explicit reset', async () => {
    const html = await renderToString(createSSRApp(DemoPageLayoutAppearance));

    expect(source).toContain(
      "import UiFolderArtifact from '../ui/UiFolderArtifact.vue';",
    );
    expect(source).toContain(
      "import UiFolderArtifactCanvas from '../ui/UiFolderArtifactCanvas.vue';",
    );
    expect(html).toContain('aria-label="工作集可移動物件"');
    expect(html).toContain('重設物件位置');
    expect(html).toContain('半透明便條');
    expect(html).toContain('不透明照片');
    expect(html).toContain('重疊照片');
    expect(source).toContain('artifactCanvas.value?.reset()');
  });

  it('navigates the photo stack in both directions as session-only page state', async () => {
    const html = await renderToString(createSSRApp(DemoPageLayoutAppearance));

    expect(source).toContain('const stackImageIndex = shallowRef(0);');
    expect(source).toContain('nextFolderArtifactStackIndex');
    expect(source).toContain('previousFolderArtifactStackIndex');
    expect(source).toContain('function activateArtifact(artifactId, intent)');
    expect(source).toContain("if (intent === 'previous')");
    expect(source).toContain('function showPreviousStackImage()');
    expect(source).toContain('function showNextStackImage()');
    expect(source).toContain('@activate="activateArtifact"');
    expect(source).toContain('@previous="showPreviousStackImage"');
    expect(source).toContain('@next="showNextStackImage"');
    expect(source).toContain(':active-index="stackImageIndex"');
    expect(source).not.toContain('localStorage');
    expect(html).toContain('1 / 3');
  });

  it('lets artifact kind own material without exposing appearance state', async () => {
    const html = await renderToString(createSSRApp(DemoPageLayoutAppearance));

    expect(source).not.toContain('appearance:');
    expect(source).not.toContain(':appearance=');
    expect(source).not.toContain('@appearance-change');
    expect(source).not.toContain('changeArtifactAppearance');
    expect(html).not.toContain('更多操作');
    expect(source).not.toContain('localStorage');
  });

  it('keeps every specimen landmark id unique when embedded in the catalogue', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h('div', [h(DemoPageLayoutAppearance), h(DemoPageLayoutAppearance)]),
      }),
    );
    const ids = [...html.matchAll(/\sid="([^"]+)"/gu)].map((match) => match[1]);

    expect(new Set(ids).size).toBe(ids.length);
    expect(
      ids.some((id) => id.startsWith('demo-page-layout-specimen-title-')),
    ).toBe(true);
    expect(source).toContain('useId');
    expect(source).toContain('--demo-folder-tab-shape');
  });

  it('offers explicit wide and narrow previews without coupling to window density', async () => {
    const html = await renderToString(createSSRApp(DemoPageLayoutAppearance));

    expect(html).toContain('aria-label="頁面版型預覽寬度"');
    expect(html).toContain('寬版');
    expect(html).toContain('窄版');
    expect(source).toContain("shallowRef('wide')");
    expect(source).toContain("'demo-page-layout__preview--narrow'");
    expect(source).not.toContain('data-ui-density');
  });

  it('lets the reviewer compare overflow and non-overflow body states', async () => {
    const html = await renderToString(createSSRApp(DemoPageLayoutAppearance));

    expect(html).toContain('aria-label="頁面版型內容量"');
    expect(html).toContain('短內容');
    expect(html).toContain('長內容');
    expect(source).toContain("shallowRef('overflow')");
    expect(source.match(/contentMode === 'overflow'/gu)).toHaveLength(3);
  });

  it('uses one bounded document scroll owner and content-driven section collapse', () => {
    expect(source).toMatch(
      /\.demo-page-layout__document\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);[^}]*overflow:\s*hidden;/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__body-scroll\s*\{[^}]*min-height:\s*0;[^}]*height:\s*100%;/su,
    );
    expect(source).toContain('container-type: inline-size');
    expect(source).toContain('container-name: demo-page-layout');
    expect(source).toMatch(
      /class="demo-page-layout__body-scroll"[\s\S]*?role="region"[\s\S]*?tabindex="0"/u,
    );
  });

  it('treats folder choices as global page navigation instead of local tabpanels', async () => {
    const html = await renderToString(createSSRApp(DemoPageLayoutAppearance));

    expect(source).toMatch(
      /class="demo-page-layout__folder-tabs"[\s\S]*?viewport-tag="nav"/u,
    );
    expect(html).toContain('<nav aria-label="Folder 頁面"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tab"');
    expect(html).not.toContain('role="tabpanel"');
  });

  it('keeps the folder material colored while the document stays neutral', async () => {
    await renderToString(createSSRApp(DemoPageLayoutAppearance));
    const previewRule =
      source.match(/\.demo-page-layout__preview\s*\{[^}]*\}/su)?.[0] ?? '';
    const shellRule =
      source.match(/\.demo-page-layout__folder-shell\s*\{[^}]*\}/su)?.[0] ?? '';
    const documentRule =
      source.match(/\.demo-page-layout__document\s*\{[^}]*\}/su)?.[0] ?? '';

    expect(previewRule).toContain('--demo-folder-color: var(--ui-folder-bg);');
    expect(shellRule).toContain('var(--demo-folder-color)');
    expect(documentRule).toContain('var(--ui-color-surface)');
    expect(documentRule).not.toContain('--demo-folder-color');
    expect(source).not.toContain('demo-page-layout__folders');
  });

  it('uses one restrained indigo material for every workflow tab instead of indexed reference colors', () => {
    const previewRule =
      source.match(/\.demo-page-layout__preview\s*\{[^}]*\}/su)?.[0] ?? '';
    const light =
      v2Tokens.match(
        /:root\[data-ui-system='v2'\]\[data-ui-theme='light'\]\s*\{[\s\S]*?\n\}/u,
      )?.[0] ?? '';

    expect(source).not.toContain('FOLDER_REFERENCE_SWATCHES');
    expect(source).not.toContain('FOLDER_REFERENCE_SWATCHES[index]');
    expect(previewRule).toContain('--demo-folder-color: var(--ui-folder-bg);');
    expect(previewRule).toContain('--demo-folder-ink: var(--ui-color-text);');
    expect(v2Tokens).toContain(
      '--ui-color-folder-primary: var(--ui-palette-indigo-700);',
    );
    expect(light).toContain(
      '--ui-color-folder-primary: var(--ui-palette-indigo-400);',
    );
  });

  it('keeps the selected folder tab motion inside a fixed token-sized envelope', () => {
    const tabSurfaceRule =
      source.match(
        /\.demo-page-layout__folder-tab::before\s*\{[^}]*\}/su,
      )?.[0] ?? '';

    expect(source).toMatch(
      /\.demo-page-layout__folder-tabs\s*\{[^}]*block-size:\s*var\(--ui-folder-tab-height-active\);/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__folder-tab\s*\{[^}]*block-size:\s*var\(--ui-folder-tab-height-active\);[^}]*overflow:\s*hidden;/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__folder-tab::before\s*\{[^}]*transform:\s*translateY\(var\(--ui-folder-tab-rest-offset\)\);/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__folder-tab--active::before[^{]*\{[^}]*transform:\s*translateY\(0\);/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__folder-tab-label\s*\{[^}]*block-size:\s*var\(--ui-folder-tab-label-block-size\);[^}]*transform:\s*translateY\(var\(--ui-folder-tab-label-rest-offset\)\);[^}]*transition:\s*transform\s+var\(--ui-motion-duration-fast\)\s+var\(--ui-motion-easing-standard\);/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__folder-tab--active\s+\.demo-page-layout__folder-tab-label[^{]*\{[^}]*transform:\s*translateY\(var\(--ui-folder-tab-label-optical-offset\)\);/su,
    );
    expect(source).toMatch(
      /transition:\s*transform\s+var\(--ui-motion-duration-fast\)\s+var\(--ui-motion-easing-standard\)/u,
    );
    expect(tabSurfaceRule).not.toContain('background-color');
    expect(source).not.toMatch(/transition:\s*(?:[^;]*,\s*)?height/u);
    expect(source).toMatch(
      /\.demo-page-layout__folder-tab:focus-visible\s*\{[^}]*outline-offset:\s*var\(--ui-focus-offset-inset\);/su,
    );
  });

  it('keeps active and resting labels one optical pixel below the visible surface center', () => {
    const activeHeight = 44;
    const restingHeight = 40;
    const coverSize = 8;
    const opticalOffset = 1;
    const restOffset = activeHeight - restingHeight;
    const labelBlockSize = activeHeight - coverSize;
    const activeVisibleCenter = labelBlockSize / 2;
    const restingVisibleCenter = (restOffset + activeHeight - coverSize) / 2;

    expect(activeVisibleCenter).toBe(18);
    expect(restingVisibleCenter).toBe(20);
    expect(labelBlockSize / 2 + opticalOffset).toBe(19);
    expect(labelBlockSize / 2 + restOffset / 2 + opticalOffset).toBe(21);
    expect(source).toContain('--ui-folder-tab-label-optical-offset');
    expect(source).toContain(
      'block-size: var(--ui-folder-tab-label-block-size);',
    );
    expect(source).toContain(
      'transform: translateY(var(--ui-folder-tab-label-rest-offset));',
    );
  });

  it('keeps equal folder-perimeter inset before the first tab and after the last tab', async () => {
    const html = await renderToString(createSSRApp(DemoPageLayoutAppearance));

    expect(html).toContain('demo-page-layout__folder-tab-label');
    expect(source).toMatch(
      /\.demo-page-layout__folder-tabs\s+:deep\(\.demo-page-layout__folder-tabs-viewport\)\s*\{[^}]*box-sizing:\s*border-box;[^}]*padding-inline:\s*var\(--ui-folder-perimeter\);[^}]*scroll-padding-inline:\s*var\(--ui-folder-perimeter\);/su,
    );
  });

  it('compresses narrow tabs before exposing a partially clipped inactive tab', () => {
    expect(source).toMatch(
      /\.demo-page-layout__folder-tab\s*\{[^}]*min-width:\s*var\(--ui-folder-tab-min-inline-size\);/su,
    );
    expect(source).toMatch(
      /@container demo-page-layout \(max-width: 36rem\)[\s\S]*\.demo-page-layout__folder-tabs\s+:deep\(\.demo-page-layout__folder-tabs-viewport\)\s*\{[^}]*gap:\s*var\(--ui-space-1\);/u,
    );
    expect(source).toMatch(
      /@container demo-page-layout \(max-width: 36rem\)[\s\S]*\.demo-page-layout__folder-tab\s*\{[^}]*min-width:\s*var\(--ui-folder-tab-min-inline-size-narrow\);[^}]*flex:\s*1 1 var\(--ui-folder-tab-min-inline-size-narrow\);/u,
    );
    expect(source).toMatch(
      /\.demo-page-layout__folder-tab-label\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/su,
    );
    expect(source).toContain('@focus="revealFolderTab"');
    expect(source).toContain('@click="selectFolder(page.id, $event)"');
    expect(source).toMatch(
      /scrollIntoView\(\{\s*block:\s*'nearest',\s*inline:\s*'nearest',\s*\}\)/u,
    );

    for (const tokens of [activeTokens, v2Tokens]) {
      expect(tokens).toContain('--ui-folder-tab-min-inline-size: 8rem;');
      expect(tokens).toContain('--ui-folder-tab-min-inline-size-narrow: 5rem;');
    }
  });

  it('uses scalable curved shoulders instead of a sharp polygon approximation', async () => {
    const html = await renderToString(createSSRApp(DemoPageLayoutAppearance));

    expect(html).toMatch(/id="demo-folder-tab-shape-[^"]+"/u);
    expect(html).toMatch(
      /<clipPath[^>]*id="demo-folder-tab-shape-[^"]+"[^>]*clipPathUnits="objectBoundingBox"/u,
    );
    expect(html).toMatch(/<path[^>]*d="[^"]*C[^"]*L1,1 L0,1[^"]*"/u);
    expect(source).toContain('clip-path: var(--demo-folder-tab-shape);');
    expect(source).not.toContain('clip-path: polygon(');
  });

  it('keeps the active folder identifiable when forced colors replace material fills', () => {
    expect(source).toMatch(
      /@media \(forced-colors: active\)[\s\S]*\.demo-page-layout__folder-tab--active::before[\s\S]*border:\s*var\(--ui-border-width\) solid Highlight;/u,
    );
    expect(source).toMatch(
      /@media \(forced-colors: active\)[\s\S]*\.demo-page-layout__folder-tab--active\s*\{[^}]*color:\s*HighlightText;/u,
    );
  });

  it('layers inactive tabs behind a folder-colored cover rail and the active tab', () => {
    expect(source).toMatch(
      /\.demo-page-layout__folder-tabs::after\s*\{[^}]*z-index:\s*2;[^}]*block-size:\s*var\(--ui-folder-tab-cover-size\);[^}]*background:\s*var\(--demo-folder-color\);/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__folder-tab\s*\{[^}]*z-index:\s*1;/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__folder-tab--active\s*\{[^}]*z-index:\s*3;/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__folder-tab:focus-visible\s*\{[^}]*z-index:\s*4;/su,
    );
  });

  it('defines the folder tab boundary tokens in active and v2 scopes', () => {
    for (const tokens of [activeTokens, v2Tokens]) {
      expect(tokens).toContain('--ui-folder-tab-height: 2.5rem;');
      expect(tokens).toContain('--ui-folder-tab-height-active: 2.75rem;');
      expect(tokens).toContain('--ui-folder-tab-min-inline-size: 8rem;');
      expect(tokens).toContain('--ui-folder-tab-min-inline-size-narrow: 5rem;');
      expect(tokens).toContain(
        '--ui-folder-tab-rest-offset: calc(\n    (var(--ui-folder-tab-height-active) - var(--ui-folder-tab-height))\n  );',
      );
      expect(tokens).toContain(
        '--ui-folder-tab-cover-size: var(--ui-space-2);',
      );
      expect(tokens).toContain(
        '--ui-folder-tab-label-block-size: calc(\n    var(--ui-folder-tab-height-active) - var(--ui-folder-tab-cover-size)\n  );',
      );
      expect(tokens).toContain('--ui-folder-tab-label-optical-offset: 1px;');
      expect(tokens).toContain(
        '--ui-folder-tab-label-rest-offset: calc(\n    var(--ui-folder-tab-rest-offset) / 2 +\n      var(--ui-folder-tab-label-optical-offset)\n  );',
      );
      expect(tokens).toContain('--ui-folder-perimeter: var(--ui-space-4);');
    }
  });

  it('maps reusable folder spacing to component tokens without raw spacing values', () => {
    const spacingDeclarations = [
      ...source.matchAll(
        /\b(?:gap|margin(?:-(?:block|inline)(?:-(?:start|end))?)?|padding(?:-(?:block|inline)(?:-(?:start|end))?)?)\s*:\s*([^;]+);/gu,
      ),
    ].map((match) => match[1]);

    expect(spacingDeclarations).not.toEqual([]);
    expect(
      spacingDeclarations.every(
        (value) => !/\b\d+(?:\.\d+)?(?:px|rem|em)\b/u.test(value),
      ),
    ).toBe(true);
    expect(source).toMatch(
      /\.demo-page-layout__header\s*\{[^}]*padding:\s*var\(--ui-folder-document-inset\);/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__section\s*\{[^}]*gap:\s*var\(--ui-folder-section-gap\);[^}]*padding:\s*var\(--ui-folder-document-inset\) 0;/su,
    );

    for (const tokens of [activeTokens, v2Tokens]) {
      expect(tokens).toContain(
        '--ui-folder-document-inset: var(--ui-space-5);',
      );
      expect(tokens).toContain(
        '--ui-folder-document-block-end-inset: var(--ui-space-6);',
      );
      expect(tokens).toContain('--ui-folder-section-gap: var(--ui-space-4);');
      expect(tokens).toContain('--ui-folder-heading-gap: var(--ui-space-1);');
    }
  });

  it('uses the shared typography hierarchy for tabs, headings, body copy, and metadata', () => {
    expect(source).toMatch(
      /\.demo-page-layout__tools-copy strong\s*\{[^}]*font-size:\s*var\(--ui-font-size-sm\);[^}]*font-weight:\s*var\(--ui-font-weight-semibold\);[^}]*line-height:\s*var\(--ui-line-height-label\);/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__folder-tab\s*\{[^}]*font-size:\s*var\(--ui-font-size-sm\);[^}]*font-weight:\s*var\(--ui-font-weight-semibold\);[^}]*line-height:\s*var\(--ui-line-height-label\);/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__section-heading h3\s*\{[^}]*font-size:\s*var\(--ui-font-size-lg\);[^}]*font-weight:\s*var\(--ui-font-weight-semibold\);[^}]*line-height:\s*var\(--ui-line-height-title\);/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__section-heading p\s*\{[^}]*font-size:\s*var\(--ui-font-size-md\);[^}]*line-height:\s*var\(--ui-line-height-body\);/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__facts dt\s*\{[^}]*font-size:\s*var\(--ui-font-size-sm\);[^}]*line-height:\s*var\(--ui-line-height-caption\);/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__facts dd\s*\{[^}]*font-size:\s*var\(--ui-font-size-md\);[^}]*font-weight:\s*var\(--ui-font-weight-semibold\);/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__material-copy strong\s*\{[^}]*font-size:\s*var\(--ui-font-size-md\);[^}]*font-weight:\s*var\(--ui-font-weight-semibold\);[^}]*line-height:\s*var\(--ui-line-height-label\);/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__steps\s*\{[^}]*font-size:\s*var\(--ui-font-size-md\);[^}]*line-height:\s*var\(--ui-line-height-body\);/su,
    );
  });
});

import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoPageLayoutAppearance from './DemoPageLayoutAppearance.vue';

const source = readFileSync(
  new URL('./DemoPageLayoutAppearance.vue', import.meta.url),
  'utf8',
);
const folderLayoutSource = readFileSync(
  new URL('../layout/AppFolderLayout.vue', import.meta.url),
  'utf8',
);
const folderPageSource = readFileSync(
  new URL('../layout/AppFolderPage.vue', import.meta.url),
  'utf8',
);
const contentFieldSource = readFileSync(
  new URL('../layout/AppFolderContentField.vue', import.meta.url),
  'utf8',
);
const v2Tokens = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);

describe('DemoPageLayoutAppearance', () => {
  it('renders the main content as a folder shell with fixed chrome before the scroll body', async () => {
    const html = await renderToString(createSSRApp(DemoPageLayoutAppearance));
    const tabPosition = html.indexOf('app-folder-layout__navigation');
    const shellPosition = html.indexOf('app-folder-layout__perimeter');
    const scrollPosition = html.indexOf('app-folder-page__scroll');
    const collectionTitlePosition = html.indexOf(
      'class="app-folder-dossier__title"',
    );

    expect(tabPosition).toBeGreaterThan(-1);
    expect(shellPosition).toBeGreaterThan(tabPosition);
    expect(scrollPosition).toBeGreaterThan(shellPosition);
    expect(collectionTitlePosition).toBeGreaterThan(scrollPosition);
    expect(html).toContain('aria-label="Folder 頁面"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('夏季 Cover 工作集');
    expect(html).toMatch(
      /class="app-folder-dossier__marker"[^>]*>\s*專輯\s*</u,
    );
    expect(html).toContain('專輯曲目');
    expect(html).toContain('app-folder-page__body--document');
    expect(source).toContain(
      "import AppFolderLayout from '../layout/AppFolderLayout.vue'",
    );
    expect(source).toContain(
      "import AppFolderPage from '../layout/AppFolderPage.vue'",
    );
  });

  it('keeps the layout evidence concise while reusing one Folder summary artifact', async () => {
    const html = await renderToString(createSSRApp(DemoPageLayoutAppearance));

    expect(source).toContain(
      "import UiFolderArtifact from '../ui/UiFolderArtifact.vue'",
    );
    expect(source).toContain(
      "import UiFolderArtifactCanvas from '../ui/UiFolderArtifactCanvas.vue'",
    );
    expect(source).not.toContain('folderArtifactStack');
    expect(source).toContain('const demoFolderArtifacts = [');
    expect(html).toContain('aria-label="Folder 延伸摘要"');
    expect(html).toContain('藝人曲庫摘要');
    expect(html).toContain('38 首曲目 · 4 張專輯 · 2018–2024');
    expect(html).not.toContain('重設物件位置');
    expect(source).toContain('工作集摘要');
    expect(html).toContain('Folder 外觀色屬於元件，內容保持中性。');
    expect(source).toContain('曲目');
    expect(source).toContain('待確認');
    expect(source).toContain('已完成');
    expect(html).not.toContain('ownership');
    expect(html).not.toContain('AppArchiveFrame');
    expect(html).not.toContain('UiPageHeader');
    expect(html).not.toContain('Feature content');
  });

  it('moves the artist summary onto the Folder-wide floating plane without duplicating it', () => {
    expect(source).not.toContain(':summary="demoArtistSummary"');
    expect(source).toContain(
      '<template v-if="activeFolder.id === \'library\'" #floating>',
    );
    expect(source).toContain('<UiFolderArtifactCanvas');
    expect(source).toContain('material="folder"');
    expect(source).toContain('<UiFolderArtifact');
    expect(source.indexOf('#floating')).toBeGreaterThan(
      source.indexOf('<SetlistAlbumSupportingContent'),
    );
    expect(source).not.toContain('#extension');
  });

  it('removes migration status from the visible layout preview', async () => {
    const html = await renderToString(createSSRApp(DemoPageLayoutAppearance));

    expect(source).not.toContain('demo-page-layout__review-status');
    expect(html).not.toContain('Candidate review');
    expect(html).not.toContain('Layout contract');
    expect(html).not.toContain('Production adoption');
    expect(html).not.toContain('待 owner 拍板');
    expect(html).not.toContain('尚未遷移');
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
    expect(ids.some((id) => id.startsWith('app-folder-tab-shape-'))).toBe(true);
    expect(source).toContain('useId');
    expect(source).not.toContain('--demo-folder-tab-shape');
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

  it('uses one bounded paper sheet inside the Folder scroll owner', () => {
    expect(folderPageSource).toMatch(
      /\.app-folder-page--with-header\[data-page-mode='workspace'\]\s*\{[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\);/su,
    );
    expect(folderPageSource).toMatch(
      /\.app-folder-page__scroll\s*\{[^}]*min-height:\s*0;[^}]*height:\s*100%;/su,
    );
    expect(folderPageSource).toContain(
      'class="app-folder-page__sheet" data-folder-artifact-region="paper"',
    );
    expect(folderPageSource).toContain('<AppLooseLeafEdge />');
    expect(folderLayoutSource).toContain('container-type: inline-size');
    expect(folderLayoutSource).toContain('container-name: app-folder-layout');
    expect(source).toContain('<AppFolderPage');
    expect(source).toContain(
      "import AppFolderContentField from '../layout/AppFolderContentField.vue'",
    );
    expect(source).toContain('<AppFolderContentField');
    expect(source).toContain('<SetlistCollectionHeader');
    expect(source).toContain('<SetlistPlaylistTable');
    expect(source).toContain('<SetlistAlbumSupportingContent');
    expect(source).toContain('@select-album="selectDemoAlbum"');
    expect(source).toContain('const demoSelectedAlbumId = shallowRef(');
    expect(source).toContain('const demoRelatedAlbums = computed(');
    expect(source.indexOf('</AppFolderContentField>')).toBeLessThan(
      source.indexOf('<SetlistAlbumSupportingContent'),
    );
    expect(contentFieldSource).toContain(
      'background: var(--ui-folder-content-background)',
    );
    expect(source).not.toContain('<UiScrollRegion');
  });

  it('keeps supporting-card playback visible and independent in the production specimen', () => {
    expect(source).toContain(
      "const demoSupportingAlbumPlayingId = shallowRef('');",
    );
    expect(source).toContain(
      'function toggleDemoSupportingAlbumPlayback(albumId)',
    );
    expect(source).toContain(
      ':playing-album-id="demoSupportingAlbumPlayingId"',
    );
    expect(source).toContain('@play-album="toggleDemoSupportingAlbumPlayback"');
  });

  it('reuses the production collection header and track table for the Setlist specimen', () => {
    expect(source).toContain(
      "import SetlistCollectionHeader from '../playlists/SetlistCollectionHeader.vue'",
    );
    expect(source).toContain(
      "import SetlistPlaylistTable from '../playlists/SetlistPlaylistTable.vue'",
    );
    expect(source).toContain('v-if="activeFolder.id === \'library\'"');
    expect(source).toContain(':title-id="specimenTitleId"');
    expect(source).toContain(':entries="visibleDemoAlbumEntries"');
    expect(source).toContain(':is-album="true"');
    expect(source).toContain(':playing="demoCollectionPlaying"');
    expect(source).toContain(':shuffle-active="demoCollectionShuffle"');
    expect(source).toContain('@toggle-playback="toggleDemoCollectionPlayback"');
    expect(source).toContain('@toggle-shuffle="toggleDemoCollectionShuffle"');
    expect(source).not.toContain('useCollectionPlayback');
    expect(source).toContain(
      '<template v-if="activeFolder.id !== \'library\'" #header>',
    );
    expect(source).toContain('工作集摘要');
    expect(source).toContain('演唱工作區');
    expect(source).toContain('直播輸出工作區');
  });

  it('keeps primary specimen sections at the page heading level', () => {
    for (const id of [
      'overviewTitleId',
      'materialsTitleId',
      'nextTitleId',
      'notesTitleId',
    ]) {
      expect(source).toContain(`<h2 :id="${id}">`);
      expect(source).not.toContain(`<h3 :id="${id}">`);
    }
  });

  it('treats folder choices as global page navigation instead of local tabpanels', async () => {
    const html = await renderToString(createSSRApp(DemoPageLayoutAppearance));

    expect(folderLayoutSource).toContain('viewport-tag="nav"');
    expect(html).toContain('<nav aria-label="Folder 頁面"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('role="tablist"');
    expect(html).not.toContain('role="tab"');
    expect(html).not.toContain('role="tabpanel"');
  });

  it('keeps the folder material colored while the document stays neutral', async () => {
    await renderToString(createSSRApp(DemoPageLayoutAppearance));
    expect(folderLayoutSource).toContain(
      'background: var(--ui-folder-layout-background)',
    );
    expect(folderPageSource).toContain(
      'background: var(--ui-folder-page-background)',
    );
    expect(source).not.toContain('--demo-folder-color');
    expect(source).not.toContain('demo-page-layout__folders');
  });

  it('uses one restrained indigo material for every workflow tab instead of indexed reference colors', () => {
    const light =
      v2Tokens.match(
        /:root\[data-ui-theme='light'\]\s+\[data-ui-system='v2'\]\[data-ui-surface-root='true'\]\s*\{[\s\S]*?\n\}/u,
      )?.[0] ?? '';

    expect(source).not.toContain('FOLDER_REFERENCE_SWATCHES');
    expect(source).not.toContain('FOLDER_REFERENCE_SWATCHES[index]');
    expect(v2Tokens).toContain(
      '--ui-folder-layout-background: var(--ui-color-folder-primary);',
    );
    expect(v2Tokens).toContain(
      '--ui-folder-page-background: var(--ui-color-surface);',
    );
    expect(v2Tokens).toContain(
      '--ui-folder-content-background: var(--ui-color-canvas);',
    );
    expect(v2Tokens).toContain(
      '--ui-color-folder-primary: var(--ui-palette-indigo-700);',
    );
    expect(light).toContain(
      '--ui-color-folder-primary: var(--ui-palette-indigo-600);',
    );
  });

  it('keeps the selected folder tab motion inside a fixed token-sized envelope', () => {
    const tabSurfaceRule =
      folderLayoutSource.match(
        /\.app-folder-layout__destination::before\s*\{[^}]*\}/su,
      )?.[0] ?? '';

    expect(folderLayoutSource).toMatch(
      /\.app-folder-layout__navigation\s*\{[^}]*block-size:\s*var\(--ui-folder-tab-height-active\);/su,
    );
    expect(folderLayoutSource).toMatch(
      /\.app-folder-layout__destination\s*\{[^}]*block-size:\s*var\(--ui-folder-tab-height-active\);[^}]*overflow:\s*hidden;/su,
    );
    expect(folderLayoutSource).toMatch(
      /\.app-folder-layout__destination::before\s*\{[^}]*transform:\s*translateY\(var\(--ui-folder-tab-rest-offset\)\);/su,
    );
    expect(folderLayoutSource).toMatch(
      /\.app-folder-layout__destination--active::before[^{]*\{[^}]*transform:\s*translateY\(0\);/su,
    );
    expect(folderLayoutSource).toMatch(
      /\.app-folder-layout__destination-label\s*\{[^}]*block-size:\s*var\(--ui-folder-tab-label-block-size\);[^}]*transform:\s*translateY\(var\(--ui-folder-tab-label-rest-offset\)\);[^}]*transition:\s*transform\s+var\(--ui-motion-duration-fast\)\s+var\(--ui-motion-easing-standard\);/su,
    );
    expect(folderLayoutSource).toMatch(
      /\.app-folder-layout__destination--active\s+\.app-folder-layout__destination-label[^{]*\{[^}]*transform:\s*translateY\(var\(--ui-folder-tab-label-optical-offset\)\);/su,
    );
    expect(folderLayoutSource).toMatch(
      /transition:\s*transform\s+var\(--ui-motion-duration-fast\)\s+var\(--ui-motion-easing-standard\)/u,
    );
    expect(tabSurfaceRule).toContain('background-color');
    expect(folderLayoutSource).not.toMatch(
      /transition:\s*(?:[^;]*,\s*)?height/u,
    );
    expect(folderLayoutSource).toMatch(
      /\.app-folder-layout__destination:focus-visible\s*\{[^}]*outline-offset:\s*var\(--ui-focus-offset-inset\);/su,
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
    expect(folderLayoutSource).toContain(
      '--ui-folder-tab-label-optical-offset',
    );
    expect(folderLayoutSource).toContain(
      'block-size: var(--ui-folder-tab-label-block-size);',
    );
    expect(folderLayoutSource).toContain(
      'transform: translateY(var(--ui-folder-tab-label-rest-offset));',
    );
  });

  it('keeps equal folder-perimeter inset before the first tab and after the last tab', async () => {
    const html = await renderToString(createSSRApp(DemoPageLayoutAppearance));

    expect(html).toContain('app-folder-layout__destination-label');
    expect(folderLayoutSource).toMatch(
      /\.app-folder-layout__navigation\s+:deep\(\.app-folder-layout__navigation-viewport\)\s*\{[^}]*box-sizing:\s*border-box;[^}]*padding-inline:\s*var\(--ui-folder-perimeter\);[^}]*scroll-padding-inline:\s*var\(--ui-folder-perimeter\);/su,
    );
  });

  it('compresses narrow tabs before exposing a partially clipped inactive tab', () => {
    expect(folderLayoutSource).toMatch(
      /\.app-folder-layout__destination\s*\{[^}]*min-width:\s*var\(--ui-folder-tab-min-inline-size\);/su,
    );
    expect(folderLayoutSource).toMatch(
      /@container app-folder-layout \(max-width: 36rem\)[\s\S]*\.app-folder-layout__navigation\s+:deep\(\.app-folder-layout__navigation-viewport\)\s*\{[^}]*gap:\s*var\(--ui-space-1\);/u,
    );
    expect(folderLayoutSource).toMatch(
      /@container app-folder-layout \(max-width: 36rem\)[\s\S]*\.app-folder-layout__destination\s*\{[^}]*min-width:\s*var\(--ui-folder-tab-min-inline-size-narrow\);[^}]*flex:\s*1 1 var\(--ui-folder-tab-min-inline-size-narrow\);/u,
    );
    expect(folderLayoutSource).toMatch(
      /\.app-folder-layout__destination-label\s*\{[^}]*min-width:\s*0;[^}]*max-width:\s*100%;[^}]*overflow:\s*hidden;[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/su,
    );
    expect(folderLayoutSource).toContain('@focus="revealDestination"');
    expect(folderLayoutSource).toContain(
      '@click="navigate(destination.id, $event)"',
    );
    expect(folderLayoutSource).toMatch(
      /scrollIntoView\(\{\s*block:\s*'nearest',\s*inline:\s*'nearest',\s*\}\)/u,
    );

    for (const tokens of [v2Tokens]) {
      expect(tokens).toContain('--ui-folder-tab-min-inline-size: 8rem;');
      expect(tokens).toContain('--ui-folder-tab-min-inline-size-narrow: 5rem;');
    }
  });

  it('uses scalable curved shoulders instead of a sharp polygon approximation', async () => {
    const html = await renderToString(createSSRApp(DemoPageLayoutAppearance));

    expect(html).toMatch(/id="app-folder-tab-shape-[^"]+"/u);
    expect(html).toMatch(
      /<clipPath[^>]*id="app-folder-tab-shape-[^"]+"[^>]*clipPathUnits="objectBoundingBox"/u,
    );
    expect(html).toMatch(/<path[^>]*d="[^"]*C[^"]*L1,1 L0,1[^"]*"/u);
    expect(folderLayoutSource).toContain(
      'clip-path: var(--ui-folder-tab-shape);',
    );
    expect(folderLayoutSource).not.toContain('clip-path: polygon(');
  });

  it('keeps the active folder identifiable when forced colors replace material fills', () => {
    expect(folderLayoutSource).toMatch(
      /@media \(forced-colors: active\)[\s\S]*\.app-folder-layout__destination--active::before[\s\S]*border:\s*var\(--ui-border-width\) solid Highlight;/u,
    );
    expect(folderLayoutSource).toMatch(
      /@media \(forced-colors: active\)[\s\S]*\.app-folder-layout__destination--active\s*\{[^}]*color:\s*HighlightText;/u,
    );
  });

  it('layers inactive tabs behind a folder-colored cover rail and the active tab', () => {
    expect(folderLayoutSource).toMatch(
      /\.app-folder-layout__navigation::after\s*\{[^}]*z-index:\s*var\(--ui-layer-overlay\);[^}]*block-size:\s*var\(--ui-folder-tab-cover-size\);[^}]*background:\s*var\(--ui-folder-layout-background\);/su,
    );
    expect(folderLayoutSource).toMatch(
      /\.app-folder-layout__destination\s*\{[^}]*z-index:\s*var\(--ui-layer-raised\);/su,
    );
    expect(folderLayoutSource).toMatch(
      /\.app-folder-layout__destination--active\s*\{[^}]*z-index:\s*var\(--ui-layer-indicator\);/su,
    );
    expect(folderLayoutSource).toMatch(
      /\.app-folder-layout__destination:focus-visible\s*\{[^}]*z-index:\s*var\(--ui-layer-focus\);/su,
    );
  });

  it('defines the folder tab boundary tokens in the v2 scope', () => {
    for (const tokens of [v2Tokens]) {
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
      ...`${source}\n${folderLayoutSource}\n${folderPageSource}`.matchAll(
        /\b(?:gap|margin(?:-(?:block|inline)(?:-(?:start|end))?)?|padding(?:-(?:block|inline)(?:-(?:start|end))?)?)\s*:\s*([^;]+);/gu,
      ),
    ].map((match) => match[1]);

    expect(spacingDeclarations).not.toEqual([]);
    expect(
      spacingDeclarations.every(
        (value) => !/\b\d+(?:\.\d+)?(?:px|rem|em)\b/u.test(value),
      ),
    ).toBe(true);
    expect(folderPageSource).toMatch(
      /\.app-folder-page__header\s*\{[^}]*padding:\s*var\(--ui-folder-document-inset\);/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__section\s*\{[^}]*gap:\s*var\(--ui-folder-section-gap\);[^}]*padding:\s*var\(--ui-folder-document-inset\) 0;/su,
    );

    for (const tokens of [v2Tokens]) {
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
    expect(folderLayoutSource).toMatch(
      /\.app-folder-layout__destination\s*\{[^}]*font-size:\s*var\(--ui-font-size-sm\);[^}]*font-weight:\s*var\(--ui-font-weight-semibold\);[^}]*line-height:\s*var\(--ui-line-height-label\);/su,
    );
    expect(source).toMatch(
      /\.demo-page-layout__section-heading h2\s*\{[^}]*font-size:\s*var\(--ui-font-size-lg\);[^}]*font-weight:\s*var\(--ui-font-weight-semibold\);[^}]*line-height:\s*var\(--ui-line-height-title\);/su,
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

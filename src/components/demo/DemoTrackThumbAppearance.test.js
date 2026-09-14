import { existsSync, readFileSync } from 'node:fs';
import { createSSRApp, nextTick } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoCandidateArtworkEmpty from './DemoCandidateArtworkEmpty.vue';
import DemoCandidateTrackArtwork from './DemoCandidateTrackArtwork.vue';
import DemoCandidateTrackThumb from './DemoCandidateTrackThumb.vue';
import DemoTrackThumbAppearance from './DemoTrackThumbAppearance.vue';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

attachClientRender(
  DemoCandidateTrackThumb,
  './DemoCandidateTrackThumb.vue',
  import.meta.url,
);
attachClientRender(
  DemoCandidateTrackArtwork,
  './DemoCandidateTrackArtwork.vue',
  import.meta.url,
);
attachClientRender(
  DemoCandidateArtworkEmpty,
  './DemoCandidateArtworkEmpty.vue',
  import.meta.url,
);

const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8');

const contentSource = readSource('./DemoContent.vue');
const appearanceSource = readSource('./DemoTrackThumbAppearance.vue');
const primitiveSource = readSource('./DemoTrackThumbPrimitive.vue');
const candidateSource = readSource('./DemoCandidateTrackThumb.vue');
const trackArtworkSource = readSource('./DemoCandidateTrackArtwork.vue');
const artworkEmptySource = readSource('./DemoCandidateArtworkEmpty.vue');
const fallbackSource = readSource('./trackThumbFallback.js');
const artworkReadme = readSource('../../assets/demo/track-thumb/README.md');
const currentSource = readSource('../ui/UiTrackThumb.vue');
const tokenSource = readSource('../../styles/tokens-v2.css');
const activeTokenSource = readSource('../../styles/tokens.css');
const uiConstantsSource = readSource('../../constants/ui.js');
const importCandidateSource = readSource('../import/ImportCandidateOption.vue');
const trackRowSource = readSource('../ui/UiTrackRow.vue');
const queueTrackSource = readSource('../queue/QueueTrackButton.vue');
const playerArtworkSource = readSource('../playback/PlayerBarArtwork.vue');
const playerBarSource = readSource('../playback/PlayerBar.vue');
const metadataSource = readSource('../library/TrackMetadataModal.vue');
const reviewContract = readSource(
  '../../../docs/contracts/token-v2-component-review.md',
);

const ASSET_FILES = [
  'track-thumb-fallback-blue.png',
  'track-thumb-fallback-pink.png',
  'track-thumb-fallback-red.png',
  'track-thumb-fallback-yellow.png',
  'track-thumb-crop-wide.jpg',
  'track-thumb-crop-square.jpg',
];

function visibleText(html) {
  return html.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ');
}

describe('DemoTrackThumbAppearance', () => {
  it('replaces only the track thumbnail sample with the staged review', () => {
    expect(contentSource).toContain(
      "import DemoTrackThumbAppearance from './DemoTrackThumbAppearance.vue';",
    );
    expect(contentSource).toMatch(
      /<DemoTrackThumbAppearance\s+v-else-if="section\.key === 'track-thumb'"\s*\/>/u,
    );
    expect(contentSource).not.toContain(
      "import UiTrackThumb from '../ui/UiTrackThumb.vue';",
    );
    expect(contentSource).toContain("'track-thumb'");
    expect(contentSource).toContain("section.key === 'collage-thumb'");
    expect(contentSource).toContain("section.key === 'track-rows'");
  });

  it('orders Candidate and Current through the thumbnail contract', async () => {
    const html = await renderToString(createSSRApp(DemoTrackThumbAppearance));
    const candidateIndex = html.indexOf('data-track-thumb-source="candidate"');
    const currentIndex = html.indexOf('data-track-thumb-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);

    const sequence = [
      '使用時機',
      '尺寸與裁切',
      '內容與失敗回退',
      '實際使用情境',
      '輔助技術與公開介面',
    ];
    for (const source of ['candidate', 'current']) {
      const layer = html.match(
        new RegExp(
          `<section[^>]*data-track-thumb-source="${source}"[\\s\\S]*?(?=<section[^>]*data-track-thumb-source=|$)`,
          'u',
        ),
      )?.[0];
      let previousIndex = -1;
      for (const label of sequence) {
        const index = layer.indexOf(label);
        expect(index).toBeGreaterThan(previousIndex);
        previousIndex = index;
      }
    }
  });

  it('keeps single-track identity separate from collection and row ownership', async () => {
    const html = await renderToString(createSSRApp(DemoTrackThumbAppearance));

    expect(html).toContain('UiTrackThumb 表示單一曲目的方形封面');
    expect(html).toContain('集合封面與拼貼由 UiCollageThumb 負責');
    expect(html).toContain('操作、播放狀態與資料列排版由所在區域負責');
    expect(primitiveSource).not.toMatch(/import\s+UiCollageThumb/u);
    expect(primitiveSource).not.toMatch(/import\s+UiTrackRow/u);
    expect(candidateSource).not.toMatch(/playlist|queue|player|album/iu);
    expect(html).not.toMatch(/UiThumbnail|UiArtwork|UiAvatar/u);
  });

  it('keeps the four default images separate from the two crop sources', async () => {
    const html = await renderToString(createSSRApp(DemoTrackThumbAppearance));

    for (const file of ASSET_FILES) {
      const assetUrl = new URL(
        `../../assets/demo/track-thumb/${file}`,
        import.meta.url,
      );
      expect(existsSync(assetUrl)).toBe(true);
      const ownerSource = file.includes('fallback')
        ? fallbackSource
        : primitiveSource;
      expect(ownerSource).toContain(`track-thumb/${file}`);
      if (file.includes('fallback')) {
        const image = readFileSync(assetUrl);
        expect(image.subarray(1, 4).toString('ascii')).toBe('PNG');
        expect(image[25]).toBe(6);
      }
    }
    for (const artwork of ['blue', 'pink', 'red', 'yellow']) {
      expect(
        html.match(new RegExp(`data-track-thumb-fallback="${artwork}"`, 'gu')),
      ).toHaveLength(2);
    }
    for (const artwork of ['crop-wide', 'crop-square']) {
      expect(
        html.match(new RegExp(`data-track-thumb-artwork="${artwork}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(trackArtworkSource).toContain('getTrackThumbFallbackArtwork');
    expect(currentSource).not.toContain('track-thumb-fallback');
    expect(primitiveSource).not.toContain('Math.random');
    expect(fallbackSource).not.toMatch(/track-thumb-fallback-[^']+\.jpg/u);
    expect(artworkReadme).toContain('transparent outside the circular artwork');
    for (const artwork of ['blue', 'pink', 'red', 'yellow']) {
      expect(
        existsSync(
          new URL(
            `../../assets/demo/track-thumb/track-thumb-fallback-${artwork}.jpg`,
            import.meta.url,
          ),
        ),
      ).toBe(false);
    }
  });

  it('labels the Current fallback comparison without claiming active adoption', async () => {
    const html = await renderToString(createSSRApp(DemoTrackThumbAppearance));
    const candidate = html.match(
      /<section[^>]*data-track-thumb-source="candidate"[\s\S]*?(?=<section[^>]*data-track-thumb-source=)/u,
    )?.[0];
    const current = html.match(
      /<section[^>]*data-track-thumb-source="current"[\s\S]*$/u,
    )?.[0];

    expect(candidate).toContain('預設封面組');
    expect(candidate).toContain('系統會固定選用其中一張');
    expect(current).toContain('相同缺圖曲目');
    expect(current).toContain('現行版仍顯示曲名首字');
    expect(current).not.toContain('系統會固定選用其中一張');
  });

  it('maps density to caller-owned square sizes and the artwork radius', async () => {
    const html = await renderToString(createSSRApp(DemoTrackThumbAppearance));

    expect(html).toContain('Standard · 40 CSS px');
    expect(html).toContain('Compact · 36 CSS px');
    expect(html).toContain('Current · 40 CSS px');
    for (const density of ['standard', 'compact', 'active']) {
      expect(html).toContain(`data-track-thumb-density="${density}"`);
    }
    for (const declaration of [
      '--ui-track-artwork-size-dense: 2.25rem;',
      '--ui-track-artwork-size-standard: 2.5rem;',
      '--ui-track-artwork-size-prominent: 3rem;',
      '--ui-track-artwork-size-preview: 4rem;',
      '--ui-track-artwork-size: var(--ui-track-artwork-size-standard);',
    ]) {
      expect(tokenSource).toContain(declaration);
    }
    expect(tokenSource).toMatch(
      /data-ui-density='compact'[\s\S]*--ui-track-artwork-size:\s*var\(--ui-track-artwork-size-dense\);/u,
    );
    expect(appearanceSource).toMatch(
      /id: 'standard',[^}]*?label: 'Standard · 40 CSS px',[^}]*?size: 'var\(--ui-track-artwork-size-standard\)'/u,
    );
    expect(appearanceSource).toMatch(
      /id: 'compact',[^}]*?label: 'Compact · 36 CSS px',[^}]*?size: 'var\(--ui-track-artwork-size-dense\)'/u,
    );
    expect(candidateSource).toContain('width: toCssLength(size)');
    expect(candidateSource).toContain('height: toCssLength(size)');
    expect(candidateSource).toContain(
      'border-radius: var(--ui-track-thumb-radius, var(--ui-radius-sm));',
    );
    expect(trackArtworkSource).toContain('object-fit: cover;');
    expect(candidateSource).not.toMatch(/minWidth|maxWidth|density/u);
  });

  it('uses a stable default image when a track has no custom cover', () => {
    const tracks = Array.from({ length: 4 }, (_, index) => ({
      id: `fallback-example-${index}`,
      title: `預設封面 ${index + 1}`,
    }));
    const sources = tracks.map((track) => {
      const mounted = mount(DemoCandidateTrackThumb, { track, size: 40 });
      const image = findAll(mounted.root, (node) => node.type === 'img')[0];
      expect(image).toBeDefined();
      expect(image.props.alt).toBe('');
      expect(String(image.props.draggable)).toBe('false');
      mounted.app.unmount();
      return image.props.src;
    });

    const repeated = mount(DemoCandidateTrackThumb, {
      track: tracks[0],
      size: 64,
    });
    const repeatedImage = findAll(
      repeated.root,
      (node) => node.type === 'img',
    )[0];

    expect(new Set(sources).size).toBe(4);
    expect(repeatedImage.props.src).toBe(sources[0]);
    repeated.app.unmount();
  });

  it('falls from a failed custom cover to a default image, then to the initial', async () => {
    const track = {
      id: 'broken-cover',
      title: '錯誤封面範例',
      thumbnailUrl: '/missing-track-cover.jpg',
    };
    const { app, root } = mount(DemoCandidateTrackThumb, {
      track,
      size: 40,
      'data-test-root': 'thumb',
    });
    const thumb = findAll(
      root,
      (node) => node.props?.['data-test-root'] === 'thumb',
    )[0];
    const image = findAll(thumb, (node) => node.type === 'img')[0];

    expect(thumb.props.style.width).toBe('40px');
    expect(thumb.props.style.height).toBe('40px');
    expect(thumb.props['aria-hidden']).toBe('true');
    expect(image.props.src).toBe('/missing-track-cover.jpg');
    expect(image.props.alt).toBe('');
    expect(String(image.props.draggable)).toBe('false');

    trigger(image, 'onError');
    await nextTick();

    const fallbackImage = findAll(thumb, (node) => node.type === 'img')[0];
    expect(fallbackImage).toBeDefined();
    expect(fallbackImage.props.src).not.toBe('/missing-track-cover.jpg');
    expect(textContent(thumb)).not.toContain('錯');

    trigger(fallbackImage, 'onError');
    await nextTick();

    expect(findAll(thumb, (node) => node.type === 'img')).toHaveLength(0);
    expect(textContent(thumb)).toContain('錯');
    app.unmount();
  });

  it('uses a shared same-origin decode-failure fixture without violating the renderer CSP', async () => {
    const fixtureUrl = new URL('./demoImageFixtures.js', import.meta.url);

    expect(existsSync(fixtureUrl)).toBe(true);
    const fixtureSource = existsSync(fixtureUrl)
      ? readFileSync(fixtureUrl, 'utf8')
      : '';
    expect(fixtureSource).toContain(
      "export const BROKEN_IMAGE_FIXTURE_URL = './index.html';",
    );
    expect(primitiveSource).toContain(
      "import { BROKEN_IMAGE_FIXTURE_URL } from './demoImageFixtures.js';",
    );
    expect(primitiveSource).toContain('thumbnailUrl: BROKEN_IMAGE_FIXTURE_URL');
    expect(primitiveSource).not.toContain('data:image/');

    const html = await renderToString(createSSRApp(DemoTrackThumbAppearance));
    expect(html.match(/src="\.\/index\.html"/gu)).toHaveLength(2);
  });

  it('covers image, initial, failed image, empty slot, and multilingual identity states', async () => {
    const html = await renderToString(createSSRApp(DemoTrackThumbAppearance));

    for (const state of ['image', 'missing', 'broken', 'empty']) {
      expect(
        html.match(new RegExp(`data-track-thumb-state="${state}"`, 'gu')),
      ).toHaveLength(2);
    }
    for (const content of [
      'long-cjk',
      'long-latin',
      'multilingual',
      'unbroken',
    ]) {
      expect(
        html.match(new RegExp(`data-track-thumb-content="${content}"`, 'gu')),
      ).toHaveLength(2);
    }
    expect(html).toContain('夏');
    expect(html).toContain('S');
    expect(html).toContain('夜');
    expect(html).toContain('沒有曲目');
    expect(trackArtworkSource).toContain('@error="handleImageError"');
    expect(artworkEmptySource).toContain(
      'data-artwork-placeholder="no-identity"',
    );
  });

  it('keeps thumbnails non-interactive, non-selectable, and non-draggable', () => {
    expect(candidateSource).toMatch(
      /\.demo-candidate-track-thumb\s*\{[\s\S]*?-webkit-user-select:\s*none;[\s\S]*?user-select:\s*none;/u,
    );
    expect(candidateSource).toContain('-webkit-user-drag: none;');
    expect(trackArtworkSource).toContain('draggable="false"');
    expect(candidateSource).not.toMatch(
      /tabindex|@click|@keydown|cursor:\s*pointer/u,
    );
  });

  it('defaults to decorative artwork and names the explicit semantic example', async () => {
    const decorative = mount(DemoCandidateTrackThumb, {
      track: { id: '1', title: '封面', thumbnailUrl: '/cover.jpg' },
      size: 40,
    });
    const decorativeRoot = findAll(
      decorative.root,
      (node) => node.type === 'span' && node.props?.class,
    )[0];
    expect(decorativeRoot.props['aria-hidden']).toBe('true');
    expect(decorativeRoot.props.role).toBeUndefined();
    decorative.app.unmount();

    const semantic = mount(DemoCandidateTrackThumb, {
      track: { id: '2', title: '目前封面', thumbnailUrl: '/cover.jpg' },
      size: 64,
      decorative: false,
      'aria-label': '目前封面',
    });
    const semanticRoot = findAll(
      semantic.root,
      (node) => node.props?.['aria-label'] === '目前封面',
    )[0];
    expect(semanticRoot.props.role).toBe('img');
    expect(semanticRoot.props['aria-hidden']).toBeUndefined();
    semantic.app.unmount();

    const html = await renderToString(createSSRApp(DemoTrackThumbAppearance));
    const candidate = html.match(
      /<section[^>]*data-track-thumb-source="candidate"[\s\S]*?(?=<section[^>]*data-track-thumb-source=)/u,
    )?.[0];
    const namedSample = candidate.match(
      /data-track-thumb-aria="named"[\s\S]*?<\/article>/u,
    )?.[0];

    expect(namedSample).toContain('role="img"');
    expect(namedSample).toContain('aria-label="目前封面"');
    expect(candidateSource).not.toMatch(/aria-live|role="status"/u);
    expect(currentSource).not.toContain(':role="decorative');
  });

  it('preserves compatibility overrides and slots without promoting overlay actions', async () => {
    const html = await renderToString(createSSRApp(DemoTrackThumbAppearance));

    for (const prop of [
      'track',
      'size',
      'radius',
      'background',
      'color',
      'fontSize',
      'uppercase',
      'decorative',
    ]) {
      expect(candidateSource).toContain(`${prop}:`);
    }
    expect(candidateSource).toContain('<slot v-else>');
    expect(candidateSource).toContain('<DemoCandidateArtworkEmpty />');
    expect(candidateSource).toContain('<DemoCandidateTrackArtwork');
    expect(candidateSource).toContain('<slot name="overlay" />');
    expect(html).toContain('未使用的外觀覆寫與 overlay slot 保留相容');
    expect(html).toContain('互動操作應由外層控制項提供');
    expect(primitiveSource).not.toMatch(
      /#overlay|v-slot:overlay|<template\s+#overlay/u,
    );
  });

  it('separates the converged Candidate recipes from the five Current consumer snapshots', async () => {
    const html = await renderToString(createSSRApp(DemoTrackThumbAppearance));
    const candidate = html.match(
      /<section[^>]*data-track-thumb-source="candidate"[\s\S]*?(?=<section[^>]*data-track-thumb-source=)/u,
    )?.[0];
    const current = html.match(
      /<section[^>]*data-track-thumb-source="current"[\s\S]*$/u,
    )?.[0];

    for (const recipe of [
      ['dense-selection-36', '密集選擇 · 36px'],
      ['track-row-40', '標準曲目列 · 40px'],
      ['playback-48', '播放操作 · 48px'],
      ['metadata-64', '封面檢查 · 64px'],
    ]) {
      expect(candidate).toContain(`data-track-thumb-recipe="${recipe[0]}"`);
      expect(candidate).toContain(recipe[1]);
    }
    for (const recipe of [
      ['import-current-32', '匯入候選 · 32px'],
      ['track-row-current-40', '曲目列 · 40px'],
      ['queue-current-48', '佇列 · 48px'],
      ['player-current-52', '播放器 · 52px'],
      ['metadata-current-64', '封面編輯 · 64px'],
    ]) {
      expect(current).toContain(`data-track-thumb-recipe="${recipe[0]}"`);
      expect(current).toContain(recipe[1]);
    }
    expect(candidate).toContain('佇列與播放器共用');
    expect(current).toContain('目前仍有五個尺寸');
    expect(current).not.toContain('--ui-track-artwork-size-dense');
    expect(candidateSource).not.toMatch(/recipe|variant|context/u);
  });

  it('anchors each Current size to its real container and keeps production unchanged', () => {
    expect(importCandidateSource).toContain(
      'size="calc(var(--ui-space-5) + var(--ui-space-2))"',
    );
    expect(importCandidateSource).toContain(
      'min-height: calc(var(--ui-space-5) + var(--ui-space-5) + var(--ui-space-2))',
    );
    expect(trackRowSource).toContain('size="var(--ui-track-row-thumb-size)"');
    expect(activeTokenSource).toContain('--ui-track-row-min-height: 3.25rem;');
    expect(activeTokenSource).toContain('--ui-track-row-thumb-size: 2.5rem;');
    expect(queueTrackSource).toContain(':size="QUEUE_TRACK_THUMB_SIZE"');
    expect(uiConstantsSource).toContain(
      'export const QUEUE_TRACK_THUMB_SIZE = 48;',
    );
    expect(activeTokenSource).toContain('--ui-queue-track-thumb-size: 3rem;');
    expect(playerArtworkSource).toContain(':size="PLAYER_BAR_ARTWORK_SIZE"');
    expect(uiConstantsSource).toContain(
      'export const PLAYER_BAR_ARTWORK_SIZE = 52;',
    );
    expect(playerBarSource).toContain('height: var(--ui-player-bar-height);');
    expect(activeTokenSource).toContain('--ui-player-bar-height: calc(');
    expect(metadataSource).toContain('size="var(--ui-space-8)"');
    expect(metadataSource).toContain(
      'grid-template-columns: var(--ui-space-8) minmax(0, 1fr);',
    );
  });

  it('keeps visible specimen copy concise and free of background implementation terms', async () => {
    const text = visibleText(
      await renderToString(createSSRApp(DemoTrackThumbAppearance)),
    );

    expect(text).toContain('有封面時顯示圖片');
    expect(text).toContain('沒有可用封面時顯示預設圖片');
    expect(text).toContain('封面無法顯示時改用預設圖片');
    expect(text).toContain('封面本身不能操作');
    expect(text).not.toMatch(
      /runtime|sidecar|adapter|consumer count|hydration|Math\.random|\bhost\b|\bparent\b|\bcaller\b|\bprimitive\b|\bproduction\b|\blifecycle\b|\banatomy\b|\bwrapper\b/iu,
    );
  });

  it('isolates the active-token Current snapshot from Candidate styles', () => {
    expect(appearanceSource).toContain(
      ':class="`demo-track-thumb-layer--${layer.key}`"',
    );
    expect(appearanceSource).toContain('.demo-track-thumb-layer--current');
    expect(appearanceSource).toContain('--ui-radius-sm: 0.25rem;');
    expect(appearanceSource).toContain('--ui-color-surface-hover: #344046;');
    expect(appearanceSource).toContain('--ui-color-text: #f7f1e7;');
    expect(appearanceSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-track-thumb-layer--current)",
    );
    expect(currentSource).not.toContain('demo-candidate-track-thumb');
    expect(candidateSource).not.toMatch(/#344046|#f7f1e7/u);
  });

  it('records the completed Track Thumb checkpoint and stops before Collage Thumb', () => {
    expect(reviewContract).toContain(
      '## 已完成階段：UiMarqueeText Candidate／Current 檢查',
    );
    expect(reviewContract).toContain(
      '## 已完成階段：UiTrackThumb Candidate／Current 檢查',
    );
    expect(reviewContract).toContain(
      '`UiTrackThumb` 表示單一曲目的方形封面或 identity fallback',
    );
    expect(reviewContract).toContain(
      'Public contract 維持 optional `track`、required caller-owned `size`',
    );
    expect(reviewContract).toContain(
      'Current consumer 快照為 32／40／48／52／64px',
    );
    expect(reviewContract).toContain(
      'Candidate 收斂為密集選擇 36px、標準曲目列 40px、播放操作 48px、封面檢查 64px',
    );
    expect(reviewContract).toContain(
      '四張同系列方形圖是歌曲沒有可用封面時的預設 fallback 圖池',
    );
    expect(reviewContract).toContain('下一個可處理的元件只有 `UiCollageThumb`');
    expect(reviewContract).toContain(
      '本次總結與提交不開始該元件，也不進入 `UiTrackRow`、Overlay 或 F7 View',
    );
  });
});

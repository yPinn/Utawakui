import { readFileSync } from 'node:fs';
import { createSSRApp, h, nextTick } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoCandidateArtworkEmpty from './DemoCandidateArtworkEmpty.vue';
import DemoCandidateCollageThumb from './DemoCandidateCollageThumb.vue';
import DemoCandidateTrackArtwork from './DemoCandidateTrackArtwork.vue';
import DemoCandidateTrackThumb from './DemoCandidateTrackThumb.vue';
import DemoCollageThumbAppearance from './DemoCollageThumbAppearance.vue';
import { getTrackThumbFallbackArtwork } from './trackThumbFallback.js';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';

attachClientRender(
  DemoCandidateCollageThumb,
  './DemoCandidateCollageThumb.vue',
  import.meta.url,
);
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
const appearanceSource = readSource('./DemoCollageThumbAppearance.vue');
const primitiveSource = readSource('./DemoCollageThumbPrimitive.vue');
const candidateSource = readSource('./DemoCandidateCollageThumb.vue');
const trackArtworkSource = readSource('./DemoCandidateTrackArtwork.vue');
const artworkEmptySource = readSource('./DemoCandidateArtworkEmpty.vue');
const currentSource = readSource('../ui/UiCollageThumb.vue');
const trackCandidateSource = readSource('./DemoCandidateTrackThumb.vue');
const trackFallbackSource = readSource('./trackThumbFallback.js');
const activeTokenSource = readSource('../../styles/tokens.css');
const dossierSource = readSource('../playlists/StudioLibraryDossierHeader.vue');
const inspectorSource = readSource('../playlists/TrackContextPanel.vue');
const setlistHeaderSource = readSource(
  '../playlists/SetlistPlaylistHeader.vue',
);
const sidebarRowSource = readSource('../playlists/PlaylistSidebarRow.vue');
const detailsModalSource = readSource('../playlists/PlaylistDetailsModal.vue');
const uiConstantsSource = readSource('../../constants/ui.js');
const reviewContract = readSource(
  '../../../docs/contracts/token-v2-component-review.md',
);

const TRACKS = [
  { id: 'one', title: '雨愛', thumbnailUrl: '/cover-one.jpg' },
  { id: 'two', title: 'アイドル' },
  { id: 'three', title: '밤편지', thumbnailUrl: '/cover-repeat.jpg' },
  {
    id: 'four',
    title: 'Summer Live Session',
    thumbnailUrl: '/cover-repeat.jpg',
  },
  { id: 'five', title: '第五首', thumbnailUrl: '/cover-five.jpg' },
];

const rootOf = (root) =>
  findAll(root, (node) => node.props?.['data-test-root'] === 'collage')[0];

function visibleText(html) {
  return html.replace(/<[^>]*>/gu, ' ').replace(/\s+/gu, ' ');
}

describe('DemoCollageThumbAppearance', () => {
  it('replaces only the collage sample with a Candidate／Current comparison', async () => {
    const html = await renderToString(createSSRApp(DemoCollageThumbAppearance));

    expect(contentSource).toContain(
      "import DemoCollageThumbAppearance from './DemoCollageThumbAppearance.vue';",
    );
    expect(contentSource).toMatch(
      /<DemoCollageThumbAppearance\s+v-else-if="section\.key === 'collage-thumb'"\s*\/>/u,
    );
    expect(contentSource).not.toContain(
      "import UiCollageThumb from '../ui/UiCollageThumb.vue';",
    );
    expect(contentSource).toContain("section.key === 'track-rows'");

    const candidateIndex = html.indexOf(
      'data-collage-thumb-source="candidate"',
    );
    const currentIndex = html.indexOf('data-collage-thumb-source="current"');
    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);
  });

  it('states collection ownership without absorbing single-track or row behavior', async () => {
    const html = await renderToString(createSSRApp(DemoCollageThumbAppearance));

    expect(html).toContain('UiCollageThumb 表示一個集合的封面位置');
    expect(html).toContain('缺圖與壞圖共用相同的預設封面選擇');
    expect(html).toContain('選取、播放與導覽由所在區域負責');
    expect(primitiveSource).not.toMatch(/import\s+UiTrackThumb/u);
    expect(primitiveSource).not.toMatch(/import\s+UiTrackRow/u);
    expect(candidateSource).toContain(
      "import DemoCandidateTrackArtwork from './DemoCandidateTrackArtwork.vue';",
    );
    expect(trackCandidateSource).toContain(
      "import DemoCandidateTrackArtwork from './DemoCandidateTrackArtwork.vue';",
    );
    expect(candidateSource).not.toContain('DemoCandidateTrackThumb');
    expect(candidateSource).not.toMatch(
      /playlistType|isAlbum|responsive|density/u,
    );
  });

  it('falls from a failed collection cover to the ordered member representation', async () => {
    const { app, root } = mount(DemoCandidateCollageThumb, {
      coverUrl: '/collection-cover.jpg',
      tracks: TRACKS,
      size: 88,
      'data-test-root': 'collage',
    });
    const collage = rootOf(root);
    const cover = findAll(collage, (node) => node.type === 'img')[0];

    expect(collage.props['data-collage-presentation']).toBe('cover');
    expect(collage.props.style.width).toBe('88px');
    expect(collage.props.style.height).toBe('88px');
    expect(cover.props.src).toBe('/collection-cover.jpg');
    expect(cover.props.alt).toBe('');
    expect(String(cover.props.draggable)).toBe('false');

    trigger(cover, 'onError');
    await nextTick();

    const slots = findAll(collage, (node) => node.props?.['data-collage-slot']);
    expect(collage.props['data-collage-presentation']).toBe('collage');
    expect(slots).toHaveLength(4);
    expect(slots.map((slot) => slot.props['data-collage-slot-state'])).toEqual([
      'occupied',
      'occupied',
      'occupied',
      'occupied',
    ]);
    expect(
      findAll(collage, (node) => node.type === 'img').map(
        (image) => image.props.src,
      ),
    ).toEqual([
      '/cover-one.jpg',
      getTrackThumbFallbackArtwork(TRACKS[1]).url,
      '/cover-repeat.jpg',
      '/cover-repeat.jpg',
    ]);
    app.unmount();
  });

  it('uses one shared empty identity, a full-size single track, and a four-slot grammar from two tracks', () => {
    for (let count = 0; count <= 5; count += 1) {
      const mounted = mount(DemoCandidateCollageThumb, {
        tracks: TRACKS.slice(0, count),
        size: 72,
        'data-test-root': 'collage',
      });
      const collage = rootOf(mounted.root);
      const slots = findAll(
        collage,
        (node) => node.props?.['data-collage-slot'],
      );

      expect(collage.props['data-collage-presentation']).toBe(
        count === 0 ? 'empty' : count === 1 ? 'single' : 'collage',
      );
      expect(slots).toHaveLength(count >= 2 ? 4 : 0);
      if (count >= 2) {
        expect(
          slots.filter(
            (slot) => slot.props['data-collage-slot-state'] === 'vacant',
          ),
        ).toHaveLength(Math.max(0, 4 - count));
      }
      expect(
        findAll(
          collage,
          (node) => node.props?.['data-artwork-placeholder'] === 'no-identity',
        ),
      ).toHaveLength(count === 0 ? 1 : 0);
      mounted.app.unmount();
    }
  });

  it('uses the shared provided fallback per member slot and preserves repeated artwork positions', async () => {
    const { app, root } = mount(DemoCandidateCollageThumb, {
      tracks: TRACKS,
      size: 72,
      'data-test-root': 'collage',
    });
    const collage = rootOf(root);
    const firstImage = findAll(
      collage,
      (node) => node.type === 'img' && node.props.src === '/cover-one.jpg',
    )[0];

    trigger(firstImage, 'onError');
    await nextTick();

    const slots = findAll(collage, (node) => node.props?.['data-collage-slot']);
    expect(slots[0].props['data-collage-slot-state']).toBe('occupied');
    expect(
      findAll(collage, (node) => node.type === 'img').map(
        (image) => image.props.src,
      ),
    ).toEqual([
      getTrackThumbFallbackArtwork(TRACKS[0]).url,
      getTrackThumbFallbackArtwork(TRACKS[1]).url,
      '/cover-repeat.jpg',
      '/cover-repeat.jpg',
    ]);
    app.unmount();
  });

  it('uses the CSP-safe shared decode-failure fixture for the broken member specimen', async () => {
    expect(primitiveSource).toContain(
      "import { BROKEN_IMAGE_FIXTURE_URL } from './demoImageFixtures.js';",
    );
    expect(primitiveSource).toContain('thumbnailUrl: BROKEN_IMAGE_FIXTURE_URL');
    expect(primitiveSource).not.toContain('data:image/');

    const html = await renderToString(createSSRApp(DemoCollageThumbAppearance));
    expect(html.match(/src="\.\/index\.html"/gu)).toHaveLength(2);
  });

  it('keeps the non-collage fallback to one member image, provided fallback, or empty state', async () => {
    const mounted = mount(DemoCandidateCollageThumb, {
      tracks: [TRACKS[0], TRACKS[1]],
      canCollage: false,
      size: 120,
      'data-test-root': 'collage',
    });
    const collage = rootOf(mounted.root);
    const image = findAll(collage, (node) => node.type === 'img')[0];

    expect(collage.props['data-collage-presentation']).toBe('single');
    expect(image.props.src).toBe('/cover-one.jpg');
    trigger(image, 'onError');
    await nextTick();
    const fallbackImage = findAll(collage, (node) => node.type === 'img')[0];
    expect(fallbackImage.props.src).toBe(
      getTrackThumbFallbackArtwork(TRACKS[0]).url,
    );
    expect(textContent(collage)).not.toContain('雨');
    mounted.app.unmount();

    const empty = mount(DemoCandidateCollageThumb, {
      tracks: [],
      canCollage: false,
      size: 120,
      'data-test-root': 'collage',
    });
    expect(rootOf(empty.root).props['data-collage-presentation']).toBe('empty');
    empty.app.unmount();
  });

  it('shares the no-identity placeholder with Track Thumb and bounds its optical size', () => {
    const trackEmpty = mount(DemoCandidateTrackThumb, {
      size: 48,
      'data-test-root': 'track',
    });
    const collectionEmpty = mount(DemoCandidateCollageThumb, {
      tracks: [],
      size: 280,
      'data-test-root': 'collage',
    });

    for (const mounted of [trackEmpty, collectionEmpty]) {
      expect(
        findAll(
          mounted.root,
          (node) => node.props?.['data-artwork-placeholder'] === 'no-identity',
        ),
      ).toHaveLength(1);
    }
    expect(artworkEmptySource).toContain(
      'inline-size: clamp(1rem, 33%, 2rem);',
    );
    expect(artworkEmptySource).toContain('aria-hidden="true"');
    expect(candidateSource).not.toMatch(/cellIconSize|singleIconSize/u);
    expect(candidateSource).toContain('grid-area: 1 / 1 / -1 / -1;');
    expect(primitiveSource).toContain('一首使用完整方形');
    expect(primitiveSource).toContain('空格不重複顯示音符');

    trackEmpty.app.unmount();
    collectionEmpty.app.unmount();
  });

  it('keeps an explicit Track Thumb fallback slot while providing the shared default', () => {
    const mounted = mount(
      DemoCandidateTrackThumb,
      { size: 48, 'data-test-root': 'track' },
      { default: () => h('span', { 'data-custom-empty': '' }, '自訂空白') },
    );

    expect(
      findAll(
        mounted.root,
        (node) => node.props?.['data-custom-empty'] !== undefined,
      ),
    ).toHaveLength(1);
    expect(
      findAll(
        mounted.root,
        (node) => node.props?.['data-artwork-placeholder'] === 'no-identity',
      ),
    ).toHaveLength(0);
    mounted.app.unmount();
  });

  it('keeps artwork non-selectable and non-draggable while callers own names and controls', () => {
    const decorative = mount(DemoCandidateCollageThumb, {
      tracks: TRACKS,
      size: 44,
      'data-test-root': 'collage',
    });
    expect(rootOf(decorative.root).props['aria-hidden']).toBe('true');
    expect(rootOf(decorative.root).props.role).toBeUndefined();
    decorative.app.unmount();

    const named = mount(DemoCandidateCollageThumb, {
      tracks: TRACKS,
      size: 88,
      decorative: false,
      role: 'img',
      'aria-label': '夏夜歌單封面',
      'data-test-root': 'collage',
    });
    expect(rootOf(named.root).props.role).toBe('img');
    expect(rootOf(named.root).props['aria-label']).toBe('夏夜歌單封面');
    named.app.unmount();

    const overlay = mount(
      DemoCandidateCollageThumb,
      {
        tracks: TRACKS,
        size: 44,
        decorative: false,
        'data-test-root': 'collage',
      },
      {
        overlay: () =>
          h('button', { type: 'button', 'aria-label': '播放集合' }, '播放'),
      },
    );
    const overlayRoot = rootOf(overlay.root);
    const button = findAll(overlayRoot, (node) => node.type === 'button')[0];
    expect(overlayRoot.props.role).toBeUndefined();
    expect(overlayRoot.props['aria-hidden']).toBeUndefined();
    expect(button.props['aria-label']).toBe('播放集合');
    overlay.app.unmount();

    expect(candidateSource).toMatch(
      /\.demo-candidate-collage-thumb\s*\{[\s\S]*?-webkit-user-select:\s*none;[\s\S]*?user-select:\s*none;/u,
    );
    expect(candidateSource).toContain('-webkit-user-drag: none;');
    expect(candidateSource).toContain('draggable="false"');
    expect(trackArtworkSource).toContain('draggable="false"');
    expect(candidateSource).not.toMatch(/tabindex|@click|@keydown/u);
  });

  it('shows caller-owned density contexts and the approved current size snapshot', async () => {
    const html = await renderToString(createSSRApp(DemoCollageThumbAppearance));

    for (const density of ['standard', 'compact']) {
      expect(html).toContain(`data-collage-density="${density}"`);
    }
    for (const recipe of ['40', '88', '120', '136', '280']) {
      expect(html).toContain(`data-collage-size="${recipe}"`);
    }
    expect(candidateSource).not.toMatch(/minWidth|maxWidth|density/u);
    expect(uiConstantsSource).toContain(
      'export const PLAYLIST_ROW_THUMB_SIZE = 40;',
    );
    expect(sidebarRowSource).toContain(':size="PLAYLIST_ROW_THUMB_SIZE"');
    expect(dossierSource).toContain(':size="88"');
    expect(detailsModalSource).toContain(':size="120"');
    expect(setlistHeaderSource).toContain(':size="136"');
    // F8 retains the reviewed 280px comparison specimen. The playback-context
    // panel uses the established details-modal cover size; shell resizing no
    // longer changes child component recipes.
    expect(inspectorSource).toContain('UiCollageThumb');
    expect(inspectorSource).toContain(':size="COLLECTION_COVER_SIZE"');
    expect(inspectorSource).toContain('COLLECTION_COVER_SIZE = 120;');
    expect(inspectorSource).not.toContain('useStudioLibraryInspectorWidth');
    expect(inspectorSource).toContain('UiTrackRow');
    expect(activeTokenSource).toContain('--ui-playlist-row-thumb-size: var(');
    expect(activeTokenSource).toContain('--ui-track-row-thumb-size');
  });

  it('separates square output geometry from source aspect ratio and future crop selection', async () => {
    const html = await renderToString(createSSRApp(DemoCollageThumbAppearance));
    const text = visibleText(html);

    expect(html).toContain('data-collage-crop-source="wide"');
    expect(html).toContain('data-collage-crop-source="square"');
    expect(text).toContain('外部封面位置一律顯示正方形');
    expect(text).toContain('目前固定使用置中裁切');
    expect(text).toContain('不拉伸，也不保留空白邊');
    expect(text).toContain('封面焦點／裁切區域選擇');
    expect(text).toContain('不屬於 UiCollageThumb');
    expect(candidateSource).toContain('object-fit: cover;');
    expect(trackArtworkSource).toContain('object-fit: cover;');
    expect(candidateSource).not.toMatch(/objectPosition|cropX|cropY|focal/u);
    expect(reviewContract).toContain(
      '來源圖片比例不改變 square output geometry',
    );
    expect(reviewContract).toContain(
      '未來的封面焦點／裁切區域選擇器屬獨立編輯流程',
    );
  });

  it('keeps every Candidate 2x2 member slot square', async () => {
    const html = await renderToString(createSSRApp(DemoCollageThumbAppearance));
    const text = visibleText(html);

    expect(text).toContain('四個格位各自保持正方形');
    expect(candidateSource).toContain(
      'grid-template-columns: repeat(2, minmax(0, 1fr));',
    );
    expect(candidateSource).toContain(
      'grid-template-rows: repeat(2, minmax(0, 1fr));',
    );
    expect(primitiveSource).toContain('class="demo-collage-thumb-count-meta"');
    expect(primitiveSource).not.toContain(
      '.demo-collage-thumb-count-list article > span',
    );
    expect(reviewContract).toContain('每個 2×2 member cell 都是外框邊長的一半');
  });

  it('shares the track artwork layer without absorbing the Track Thumb component contract', () => {
    for (const prop of [
      'coverUrl',
      'tracks',
      'canCollage',
      'size',
      'radius',
      'background',
      'color',
      'uppercase',
      'decorative',
    ]) {
      expect(candidateSource).toContain(`${prop}:`);
    }
    expect(candidateSource).toContain('<slot name="overlay" />');
    expect(candidateSource).toContain('DemoCandidateTrackArtwork');
    expect(trackCandidateSource).toContain('DemoCandidateTrackArtwork');
    expect(trackArtworkSource).toContain('getTrackThumbFallbackArtwork');
    expect(trackArtworkSource).toContain("from './trackThumbFallback.js'");
    expect(candidateSource).not.toContain('DemoCandidateTrackThumb');
    expect(trackCandidateSource).not.toContain('DemoCandidateCollageThumb');
    expect(trackFallbackSource).toContain(
      'export function getTrackThumbFallbackArtwork(track)',
    );
    expect(currentSource).not.toContain('demo-candidate-collage-thumb');
    expect(currentSource).not.toContain('DemoCandidateTrackArtwork');
  });

  it('isolates the active-token Current snapshot and keeps image opacity out of the checkerboard', () => {
    expect(appearanceSource).toContain(
      ':class="`demo-collage-thumb-layer--${layer.key}`"',
    );
    expect(appearanceSource).toContain('.demo-collage-thumb-layer--current');
    for (const declaration of [
      '--ui-color-canvas: #1f2328;',
      '--ui-color-surface: #292f35;',
      '--ui-color-surface-raised: #30383e;',
      '--ui-color-surface-hover: #344046;',
      '--ui-color-text: #f7f1e7;',
      '--ui-color-border: #3c4749;',
      '--ui-color-border-strong: #586568;',
      '--ui-color-focus: #dd7a64;',
      '--ui-opacity-muted: 0.72;',
      '--ui-font-size-lg: 1.125rem;',
      '--ui-line-height-title: 1.3;',
    ]) {
      expect(appearanceSource).toContain(declaration);
    }
    expect(appearanceSource).toContain(
      "'Segoe UI', 'Microsoft JhengHei UI', 'Microsoft JhengHei'",
    );
    expect(appearanceSource).toContain(
      ":global(:root[data-ui-theme='light'] .demo-collage-thumb-layer--current)",
    );
    expect(appearanceSource).toContain('--ui-color-border-strong: #b9c4c0;');
    expect(appearanceSource).toContain('--ui-color-focus: #d26a45;');
    expect(candidateSource).not.toMatch(/#344046|#f7f1e7/u);
    expect(candidateSource).not.toMatch(
      /__cell:nth-child\([^)]*\)[^{]*\{[^}]*opacity:/su,
    );
  });

  it('keeps visible copy concise and covers count, language, image, and ARIA cases', async () => {
    const html = await renderToString(createSSRApp(DemoCollageThumbAppearance));
    const text = visibleText(html);

    for (const count of ['0', '1', '2', '3', '4', '5']) {
      expect(html).toContain(`data-collage-count="${count}"`);
    }
    for (const state of ['custom', 'single', 'repeated', 'missing', 'broken']) {
      expect(html).toContain(`data-collage-image-state="${state}"`);
    }
    for (const aria of ['decorative', 'named', 'overlay']) {
      expect(html).toContain(`data-collage-aria="${aria}"`);
    }
    expect(text).toContain('繁體中文、Latin、日本語與 한국어');
    expect(text).toContain('0 首 與無曲目縮圖共用空位置');
    expect(text).toContain('0 首 現行四個空格圖示');
    expect(text).toContain('1 首 現行一格圖片與三格空位置');
    expect(text).toContain('現行空格仍重複顯示音符');
    expect(text).toContain('缺圖使用預設封面');
    expect(text).toContain('成員圖片失敗使用預設封面');
    expect(text).not.toMatch(
      /runtime|sidecar|adapter|consumer count|hydration|Math\.random|\bhost\b|\bproduction\b/iu,
    );
  });

  it('records the completed Collage Thumb checkpoint before Track Row review', () => {
    expect(reviewContract).toContain(
      '## 已完成階段：UiCollageThumb Candidate／Current 檢查',
    );
    expect(reviewContract).toContain(
      '`UiCollageThumb` 表示一個集合的封面位置與 optional 2×2 collage',
    );
    expect(reviewContract).toContain(
      'Current consumer 尺寸為 40／88／120／136／280px',
    );
    expect(reviewContract).toContain(
      '共用同一個 track-identity fallback artwork resolver',
    );
    expect(reviewContract).toContain(
      '零首集合與無 track 共用 no-identity placeholder',
    );
    expect(reviewContract).toContain(
      '一首使用 full-size artwork；二至四首才進入 2×2',
    );
    expect(reviewContract).toContain(
      '外框、member cell 與 empty glyph 分屬三層 size ownership',
    );
    expect(reviewContract).toContain(
      '本階段已完成 Collage Thumb owner checkpoint',
    );
    expect(reviewContract).toContain(
      '## 已完成階段：UiTrackRow Candidate／Current 檢查',
    );
  });
});

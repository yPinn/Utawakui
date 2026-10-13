import { readFileSync } from 'node:fs';
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
const primitiveSource = readSource('./DemoTrackThumbPrimitive.vue');
const candidateSource = readSource('./DemoCandidateTrackThumb.vue');
const trackArtworkSource = readSource('./DemoCandidateTrackArtwork.vue');
const tokenSource = readSource('../../styles/tokens.css');
const uiConstantsSource = readSource('../../constants/ui.js');
const importCandidateSource = readSource('../import/ImportCandidateOption.vue');
const trackRowSource = readSource('../ui/UiTrackRow.vue');
const queueTrackSource = readSource('../queue/QueueTrackButton.vue');
const playerArtworkSource = readSource('../playback/PlayerBarArtwork.vue');
const playerBarSource = readSource('../playback/PlayerBar.vue');
const metadataSource = readSource('../library/TrackMetadataModal.vue');
const metadataPreviewSource = readSource('../library/ArtworkPreviewPane.vue');
const reviewContract = readSource(
  '../../../docs/contracts/token-v2-component-review.md',
);
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
  it('uses a stable default image when a track has no custom cover', () => {
    const tracks = Array.from(
      {
        length: 4,
      },
      (_, index) => ({
        id: `fallback-example-${index}`,
        title: `預設封面 ${index + 1}`,
      }),
    );
    const sources = tracks.map((track) => {
      const mounted = mount(DemoCandidateTrackThumb, {
        track,
        size: 40,
      });
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
  it('anchors each Current size to its real container and keeps production unchanged', () => {
    expect(importCandidateSource).toContain(
      'size="calc(var(--ui-space-5) + var(--ui-space-2))"',
    );
    expect(importCandidateSource).toContain(
      'min-height: calc(var(--ui-space-5) + var(--ui-space-5) + var(--ui-space-2))',
    );
    expect(trackRowSource).toContain('size="var(--ui-track-row-thumb-size)"');
    expect(tokenSource).toContain('--ui-track-row-min-height: 3.25rem;');
    expect(tokenSource).toContain(
      '--ui-track-row-thumb-size: var(--ui-track-artwork-size);',
    );
    expect(queueTrackSource).toContain('import UiTrackRow');
    expect(queueTrackSource).toContain('<UiTrackRow');
    expect(queueTrackSource).not.toContain('QUEUE_TRACK_THUMB_SIZE');
    expect(uiConstantsSource).not.toContain('QUEUE_TRACK_THUMB_SIZE');
    expect(tokenSource).not.toContain('--ui-queue-track-thumb-size');
    expect(playerArtworkSource).toContain(':size="PLAYER_BAR_ARTWORK_SIZE"');
    expect(uiConstantsSource).toContain(
      'export const PLAYER_BAR_ARTWORK_SIZE = 48;',
    );
    expect(tokenSource).toContain('--ui-track-artwork-size-prominent: 3rem;');
    expect(playerBarSource).toContain('height: var(--ui-player-bar-height);');
    expect(tokenSource).toContain('--ui-player-bar-height: 4.75rem;');
    expect(metadataPreviewSource).toContain(
      'size="var(--track-metadata-preview-size)"',
    );
    expect(metadataPreviewSource).toContain(
      '--track-metadata-preview-size: 13rem;',
    );
    expect(metadataSource).toContain(
      'grid-template-columns: minmax(13rem, 15rem) minmax(0, 1fr);',
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
      'Current consumer 快照收斂為 32／40／48／64px',
    );
    expect(reviewContract).toContain(
      'Candidate 收斂為密集選擇 36px、標準曲目列 40px、播放操作 48px、封面檢查 64px',
    );
    expect(reviewContract).toContain(
      '四張同系列方形圖是歌曲沒有可用封面時的預設 fallback 圖池',
    );
    expect(reviewContract).toContain('下一個可處理的元件只有 `UiCollageThumb`');
    expect(reviewContract).toContain(
      'Queue 已採用正式 `UiTrackRow` 的 Standard 52／40px recipe',
    );
  });
});

import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import TrackPreviewOverlay from './TrackPreviewOverlay.vue';

const source = readFileSync(
  new URL('./TrackPreviewOverlay.vue', import.meta.url),
  'utf8',
);
const modalSource = readFileSync(
  new URL('../ui/UiModal.vue', import.meta.url),
  'utf8',
);
const setlistSource = readFileSync(
  new URL('../../views/SetlistView.vue', import.meta.url),
  'utf8',
);

const tracks = [
  { id: 'a', title: '夜に駆ける', artist: 'YOASOBI', url: 'a' },
  { id: 'b', title: '群青', artist: 'YOASOBI', url: 'b' },
  { id: 'c', title: 'アイドル', artist: 'YOASOBI', url: 'c' },
];

function renderOverlay(overrides = {}) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(TrackPreviewOverlay, {
          open: true,
          title: 'THE BOOK',
          tracks,
          index: 1,
          status: 'playing',
          segment: { start: 48, end: 78, source: 'chorus' },
          currentTime: 60,
          ...overrides,
        }),
    }),
  );
}

describe('TrackPreviewOverlay', () => {
  it('renders the current track, its neighbours and segment progress', async () => {
    const html = await renderOverlay();

    expect(html).toContain('role="dialog"');
    expect(html).toContain('THE BOOK');
    expect(html).toContain('2 / 3');
    expect(html).toContain('群青');
    expect(html).toContain('上一首：夜に駆ける');
    expect(html).toContain('下一首：アイドル');
    expect(html).toContain('副歌片段');
    expect(html).toContain('0:12 / 0:30');
    expect(html).toContain('暫停試聽：群青');
  });

  it('labels an estimated window and hides missing neighbours', async () => {
    const html = await renderOverlay({
      index: 0,
      status: 'paused',
      segment: { start: 60, end: 90, source: 'estimated' },
    });

    expect(html).toContain('預估片段');
    expect(html).toContain('試聽：夜に駆ける');
    expect(html).not.toContain('上一首：');
  });

  it('explains why the preview is silent', async () => {
    expect(
      await renderOverlay({
        status: 'blocked',
        blockedReason: 'session-active',
      }),
    ).toContain('錄影或直播中無法試聽');
    expect(
      await renderOverlay({ status: 'paused', blockedReason: 'preempted' }),
    ).toContain('其他播放器開始播放');
    expect(await renderOverlay({ status: 'error' })).toContain(
      '這些曲目目前都無法試聽',
    );
  });

  it('marks queue and session actions already done for the track', async () => {
    const fresh = await renderOverlay();
    expect(fresh).toContain('加入佇列');
    expect(fresh).toContain('加入場次草稿');

    const done = await renderOverlay({
      queuedTrackIds: ['b'],
      sessionTrackIds: ['b'],
    });
    expect(done).toContain('已在佇列');
    expect(done).toContain('已在場次草稿');
  });

  it('renders nothing while closed', async () => {
    expect(await renderOverlay({ open: false })).not.toContain('role="dialog"');
  });

  it('uses the shared modal and nests a host so its menu stays above it', () => {
    expect(source).toContain('<UiModal');
    expect(source).toContain('surface-id="track-preview"');
    // Its Teleport target only exists once the dialog is in the document.
    expect(source).toMatch(/<TrackActionMenu\s+v-if="menuAnchorEl"/u);
    // A modal in SetlistView mounts before the setlist host is attached.
    expect(modalSource).toContain('<Teleport defer');
  });

  it('leaves window-level stacking to the shared modal', () => {
    // UiModal now mounts on the renderer root; no per-dialog host override.
    expect(source).not.toContain("provideUiOverlayHost('app-shell')");
    expect(modalSource).toContain('rendererRootSurfaceId(surfaceHost)');
  });

  it('maps icons to the same functions used elsewhere in the app', () => {
    // PlayerBar skips tracks; the Titlebar and session panel use ListOrdered.
    expect(source).toContain(':icon="SkipBack"');
    expect(source).toContain(':icon="SkipForward"');
    expect(source).toContain(':icon="ListOrdered"');
    expect(source).not.toMatch(/ChevronUp|ChevronDown|ListChecks/u);
    // Only the preview toggle shows Play; the formal start is text-only.
    expect(source).toContain('<UiButton variant="accent"');
  });

  it('reuses shared transport, notice and footer primitives', () => {
    expect(source).toContain('<PlaybackPrimaryButton');
    expect(source).toContain('<UiNotice');
    expect(source).toContain('#footer');
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
  });

  it('animates track switches by direction with reduced-motion-aware tokens', () => {
    expect(source).toContain('<Transition :name="switchTransition">');
    expect(source).toContain("current < previous ? 'previous' : 'next'");
    // Cover, identity and both neighbour slices share the same switch.
    expect(
      source.match(/<Transition :name="switchTransition">/gu),
    ).toHaveLength(4);
    expect(source).toContain(':key="previousTrack.id"');
    expect(source).toContain(':key="nextTrack.id"');
    // fast／standard／slow are zeroed for reduced motion; feedback is not.
    const switchRules = source.slice(
      source.indexOf('.track-preview-next-enter-active'),
    );
    expect(switchRules).toContain('var(--ui-motion-duration-standard)');
    expect(switchRules).not.toContain('--ui-motion-duration-feedback');
    expect(switchRules).not.toMatch(/\b\d+m?s\b/u);
  });

  it('isolates preview keys from global shortcuts before they bubble', () => {
    expect(source).toContain(
      "window.addEventListener('keydown', handleKeydown, true)",
    );
  });

  it('is wired from the collection header without touching the performance player', () => {
    expect(setlistSource).toContain('@preview="openTrackPreview"');
    expect(setlistSource).toContain('<TrackPreviewOverlay');
    expect(setlistSource).toContain(
      'trackPreview.close();\n  activateTrack(track);',
    );
    expect(source).not.toContain('usePlayer');
  });
});

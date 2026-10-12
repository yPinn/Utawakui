import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';

const albums = new Map([['b', { id: 'album-book', name: 'THE BOOK' }]]);
vi.mock('../../composables/useAlbumNavigation.js', () => ({
  useAlbumNavigation: () => ({
    albumForTrack: (track) => albums.get(track?.id) ?? null,
    jumpToAlbum: vi.fn(),
    jumpToArtist: vi.fn(),
  }),
}));

const { default: TrackPreviewOverlay } =
  await import('./TrackPreviewOverlay.vue');

const source = readFileSync(
  new URL('./TrackPreviewOverlay.vue', import.meta.url),
  'utf8',
);
const modalSource = readFileSync(
  new URL('../ui/UiModal.vue', import.meta.url),
  'utf8',
);
const libraryBrowseSource = readFileSync(
  new URL('../library/LibraryBrowseContent.vue', import.meta.url),
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
    expect(html).toMatch(
      /<h2[^>]*class="ui-modal__title"[^>]*>THE BOOK<\/h2>/u,
    );
    expect(html).not.toContain('試聽：THE BOOK');
    expect(html).not.toContain('2 / 3');
    expect(html).toContain('群青');
    expect(html).toContain('上一首：夜に駆ける');
    expect(html).toContain('下一首：アイドル');
    expect(html).toMatch(
      /<progress[^>]*value="12"[^>]*max="30"[^>]*aria-label="試聽進度"/u,
    );
    expect(html).not.toMatch(/暫停試聽|試聽：群青/u);
  });

  it('links the title to its album and leaves an album-less title plain', async () => {
    const withAlbum = await renderOverlay();
    expect(withAlbum).toMatch(
      /<button[^>]*class="ui-text-btn track-preview__title-link"[^>]*aria-label="群青，前往專輯：THE BOOK"[\s\S]*?ui-text-btn__text--clamp/u,
    );
    expect(source).toContain('gap: var(--ui-modal-section-gap);');
    // The title link keeps UiTextButton's own hover／focus treatment.
    expect(source).not.toMatch(
      /text-underline-offset|track-preview__title-link[^{]*:(?:hover|focus)/u,
    );

    const withoutAlbum = await renderOverlay({ index: 0 });
    expect(withoutAlbum).not.toContain('track-preview__title-link');
    expect(withoutAlbum).toContain('夜に駆ける');
  });

  it('dismisses itself before either page jump', () => {
    expect(source).toContain("emit('navigate');\n  jumpToAlbum(selected);");
    expect(source).toMatch(
      /<TrackArtistCredits\s+:track="track"\s+@navigate="emit\('navigate'\)"/u,
    );
    expect(libraryBrowseSource).toContain('@navigate="trackPreview.close"');
  });

  it('keeps how the window was chosen and its times off screen', async () => {
    for (const source of ['chorus', 'estimated']) {
      const html = await renderOverlay({
        segment: { start: 48, end: 78, source },
      });
      expect(html).not.toMatch(/副歌|預估|0:12|0:30/u);
      expect(html).not.toContain('ui-progress__copy');
    }
  });

  it('hides missing neighbours', async () => {
    const html = await renderOverlay({
      index: 0,
      status: 'paused',
      segment: { start: 60, end: 90, source: 'estimated' },
    });

    expect(html).toContain('夜に駆ける');
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

  it('offers only track actions the row right-click menu also has', async () => {
    const fresh = await renderOverlay();
    expect(fresh).toContain('加入佇列');
    expect(fresh).not.toContain('場次草稿');

    const done = await renderOverlay({ queuedTrackIds: ['b'] });
    expect(done).toContain('已在佇列');
    // The menu gets the same per-track options as the row right-click.
    expect(source).toContain(
      ':remove-from-playlist-id="menuOptions.removeFromPlaylistId"',
    );
    expect(source).toContain(':can-go-to-album="menuOptions.canGoToAlbum"');
    expect(libraryBrowseSource).toContain(
      'const addMenuOptions = computed(() => trackMenuOptions(addMenu.value?.track));',
    );
    expect(libraryBrowseSource).toMatch(
      /trackMenuOptions\(trackPreview\.state\.tracks\[trackPreview\.state\.index\]\)/u,
    );
  });

  it('renders nothing while closed', async () => {
    expect(await renderOverlay({ open: false })).not.toContain('role="dialog"');
  });

  it('uses the shared modal and nests a host so its menu stays above it', () => {
    expect(source).toContain('<UiModal');
    expect(source).toContain('surface-id="track-preview"');
    // Its Teleport target only exists once the dialog is in the document.
    expect(source).toMatch(/<TrackActionMenu\s+v-if="menu"/u);
    // A modal in LibraryBrowseContent mounts before the host is attached.
    expect(modalSource).toContain('<Teleport defer');
  });

  it('leaves window-level stacking to the shared modal', () => {
    // UiModal now mounts on the renderer root; no per-dialog host override.
    expect(source).not.toContain("provideUiOverlayHost('app-shell')");
    expect(modalSource).toContain('rendererRootSurfaceId(surfaceHost)');
  });

  it('maps icons to the same functions used elsewhere in the app', () => {
    // Owner decision 2026-10-07: the vertical feed steps up／down like its
    // peeks and ↑／↓ keys, so it uses chevrons rather than PlayerBar's
    // horizontal Skip glyphs.
    expect(source).toContain(':icon="ChevronUp"');
    expect(source).toContain(':icon="ChevronDown"');
    expect(source).not.toMatch(/SkipBack|SkipForward|ListChecks|ListOrdered/u);
    // Track actions reuse the menu's own glyphs.
    expect(source).toContain(':icon="Ellipsis"');
    expect(source).toContain(':icon="ListEnd"');
    // The only Play glyph starts real playback, reusing the app's primary
    // play button on the cover corner like a feed card.
    expect(source).toMatch(
      /<UiArtworkReveal class="track-preview__play">\s*<PlaybackPrimaryButton\s+play-label="從這首開始播放"\s+@click="emit\('playTrack', track\)"\s*\/>\s*<\/UiArtworkReveal>/u,
    );
    expect(source).not.toMatch(/<UiButton[\s>]/u);
  });

  it('tints the whole dialog surface with the cover colour, controls untouched', () => {
    expect(source).toContain('loadArtworkTone(url)');
    // The modal owns the surface tint; the preview only hands it the tone.
    expect(source).toMatch(/<UiModal[\s\S]*?:tint="tone"/u);
    expect(source).not.toContain('--track-preview-tone');
    expect(source).not.toMatch(/__stage::before/u);
  });

  it('opens the row menu from the more button and from a cover right-click', () => {
    // The opening click must not reach the menu's own outside-click listener,
    // which is attached while that same click is still bubbling.
    expect(source).toMatch(
      /function openMenu\(event\) \{\s*event\.stopPropagation\(\);/u,
    );
    expect(source).toMatch(
      /<span\s+class="track-preview__artwork"\s+data-artwork-reveal-scope\s+@contextmenu="openMenuAtPointer"\s*>/u,
    );
    expect(source).toMatch(
      /function openMenuAtPointer\(event\) \{\s*event\.preventDefault\(\);\s*event\.stopPropagation\(\);/u,
    );
    expect(source).toMatch(
      /:anchor-el="menu\.anchorEl"\s+:x="menu\.x"\s+:y="menu\.y"/u,
    );
  });

  it('groups controls by work zone instead of a modal footer', () => {
    // A preview only follows window focus: nothing toggles its play／pause.
    // The cover's play button never binds a playing state.
    expect(source).not.toMatch(
      /:icon="(?:Play|Pause)"|emit\('toggle'\)|:playing=/u,
    );
    expect(source).toMatch(
      /<span\s+class="track-preview__artwork"(?![^>]*@click)/u,
    );
    expect(source).toContain('<UiNotice');
    expect(source).not.toContain('#footer');
    // Conventional order: now-playing, media, then one edge column.
    const at = (name) => source.indexOf(`class="track-preview__${name}"`);
    expect(at('content')).toBeLessThan(at('stage'));
    expect(at('stage')).toBeLessThan(at('rail'));
    expect(at('rail')).toBeLessThan(at('skips'));
    expect(source.slice(at('content'), at('stage'))).toContain('<UiProgress');
    // Real playback starts from the cover's corner.
    const cover = source.slice(
      source.indexOf('class="track-preview__artwork"'),
      at('peek-slot track-preview__peek-slot--next'),
    );
    expect(cover).toContain('class="track-preview__play"');
    // A corner vignette (shared overlay plane, scrim token) is revealed with
    // the button; corner controls stack above that plane.
    expect(cover).toMatch(
      /<UiArtworkOverlay>\s*<UiArtworkReveal>\s*<span\s+class="track-preview__play-scrim"/u,
    );
    expect(source).toMatch(
      /\.track-preview__play-scrim \{\s*background: radial-gradient\(\s*circle at 100% 100%,\s*var\(--ui-color-overlay-scrim\)/u,
    );
    expect(source).toMatch(
      /\.track-preview__play \{[^}]*z-index: var\(--ui-layer-indicator\);/u,
    );
    // It appears only on hover or keyboard focus, through the shared reveal.
    expect(cover).toMatch(
      /^class="track-preview__artwork"\s+data-artwork-reveal-scope\b/u,
    );
    expect(source).toMatch(
      /\.track-preview__play\s*\{[^}]*position:\s*absolute;[^}]*inset-block-end:\s*var\(--ui-space-2\);[^}]*inset-inline-end:\s*var\(--ui-space-2\);/u,
    );
    expect(source.slice(at('rail'), at('skips'))).toMatch(
      /更多操作[\s\S]*加入佇列/u,
    );
    // Feed stepping is its own corner zone at the live control size.
    expect(source.slice(at('skips'))).toMatch(
      /:icon="ChevronUp"[^>]*size="lg"[\s\S]*:icon="ChevronDown"[^>]*size="lg"/u,
    );
    // No wrapper splits copy and media from the edge; one grid places all.
    expect(source).not.toContain('track-preview__group');
    // Mute is a session-wide tool in the modal's header tool area.
    expect(source).toMatch(
      /#header-actions>[\s\S]*?試聽靜音[\s\S]*?<\/template>/u,
    );
    // Previous／next stack vertically, like the feed they move through.
    expect(source).toMatch(
      /\.track-preview__skips\s*\{[^}]*flex-direction:\s*column;/u,
    );
    // The bar decides its own easing; no caller-side state override.
    expect(source).not.toContain('--ui-progress-fill-duration');
    expect(source).not.toMatch(/#[0-9a-f]{3,8}\b/iu);
  });

  it('slides only the title on a switch; the artist line just updates', () => {
    expect(source).toMatch(
      /<Transition :name="switchTransition">\s*<h3 :key="track\.id" class="track-preview__title">/u,
    );
    const identity = source.slice(
      source.indexOf('class="track-preview__identity"'),
      source.indexOf('</section>'),
    );
    const afterSwitch = identity.slice(identity.indexOf('</Transition>'));
    expect(afterSwitch).toContain('<TrackArtistCredits');
  });

  it('keeps feed chrome unselectable but the notice selectable', () => {
    const styles = source.slice(source.indexOf('<style scoped>'));
    expect(styles).toMatch(
      /\.track-preview__stage,\s*\.track-preview__identity\s*\{\s*-webkit-user-select:\s*none;\s*user-select:\s*none;/u,
    );
    expect(styles).not.toMatch(
      /\.track-preview(?:__now|__content)?\s*\{[^}]*user-select/u,
    );
  });

  it('bounds the bar by the info lane, not by restyling it', () => {
    const styles = source.slice(source.indexOf('<style scoped>'));
    // A fixed info lane narrower than the cover leaves spare width for the
    // equal spaces, so the copy sits inset from the dialog edge.
    expect(styles).toContain('--track-preview-info-size: 15rem;');
    expect(styles).toMatch(
      /grid-template-areas:\s*'\. info \. media \. edge';/u,
    );
    expect(styles).toMatch(
      /\.track-preview__progress\s*\{\s*justify-self:\s*stretch;\s*\}/u,
    );
    expect(styles).not.toContain('--ui-progress-track-size');
  });

  it('keeps one edge column with two units instead of extra columns', () => {
    const styles = source.slice(source.indexOf('<style scoped>'));
    // The cover sits evenly: equal flexible spaces before the copy, between
    // copy and cover, and between cover and edge, never under the section gap.
    expect(styles).toMatch(
      /grid-template-columns:\s*minmax\(var\(--ui-modal-section-gap\), 1fr\) var\(--track-preview-info-size\)\s*minmax\(var\(--ui-modal-section-gap\), 1fr\) max-content\s*minmax\(var\(--ui-modal-section-gap\), 1fr\) max-content;/u,
    );
    const edge = source.slice(source.indexOf('class="track-preview__edge"'));
    expect(edge.indexOf('track-preview__rail')).toBeLessThan(
      edge.indexOf('track-preview__skips'),
    );
    // Actions centre on the cover; stepping keeps the foot.
    expect(styles).toMatch(
      /\.track-preview__rail\s*\{\s*grid-row:\s*1 \/ -1;\s*align-self:\s*center;/u,
    );
    expect(styles).toMatch(
      /\.track-preview__skips\s*\{\s*grid-row:\s*2;\s*align-self:\s*end;/u,
    );
  });

  it('shades and lifts the neighbours with shared overlay tokens', () => {
    const styles = source.slice(source.indexOf('<style scoped>'));
    // A scrim in the thumb's overlay plane, deepest at each outer edge.
    expect(source).toMatch(
      /<template #overlay>\s*<span\s+class="track-preview__peek-shade track-preview__peek-shade--previous"/u,
    );
    expect(source).toMatch(
      /<template #overlay>\s*<span\s+class="track-preview__peek-shade track-preview__peek-shade--next"/u,
    );
    expect(styles).toMatch(
      /\.track-preview__peek-shade--previous \{\s*background: linear-gradient\(\s*to bottom,\s*var\(--ui-color-overlay-scrim-active\),\s*var\(--ui-color-overlay-scrim\)/u,
    );
    expect(styles).toMatch(
      /\.track-preview__peek-shade--next \{\s*background: linear-gradient\(\s*to top,/u,
    );
    // No more opacity dimming of the whole neighbour.
    expect(styles).not.toContain('--track-preview-peek-opacity');
    // Covers lift with the overlay shadow; the stage clips only vertically
    // so those shadows stay whole at its sides.
    expect(styles).toMatch(
      /\.track-preview__artwork,\s*\.track-preview__peek \{[^}]*box-shadow: var\(--ui-shadow-overlay\);/u,
    );
    // Each frame isolates its stack, so overlay (2) and corner control (3)
    // z-indexes stay local to the cover.
    expect(styles).toMatch(
      /\.track-preview__artwork,\s*\.track-preview__peek \{\s*isolation: isolate;/u,
    );
    expect(styles).toMatch(/overflow-x: visible;\s*overflow-y: clip;/u);
  });

  it('tiers cover, display title and a small artist line', () => {
    const styles = source.slice(source.indexOf('<style scoped>'));
    expect(styles).toMatch(
      /\.track-preview__title\s*\{[^}]*font-size:\s*var\(--ui-font-size-2xl\);/u,
    );
    expect(styles).toMatch(
      /\.track-preview__meta\s*\{[^}]*font-size:\s*var\(--ui-font-size-sm\);/u,
    );
    // Display leading clips the clamped title's last-line hover underline.
    expect(styles).toMatch(
      /\.track-preview__title\s*\{[^}]*line-height:\s*var\(--ui-line-height-title\);/u,
    );
    expect(styles).not.toContain('--ui-line-height-display');
    // Neighbours sit one named tier below the current cover.
    expect(styles).toContain('--track-preview-peek-scale: 0.7;');
    expect(styles).toMatch(
      /\.track-preview__peek\s*\{[^}]*var\(--track-preview-artwork-size\)\s*\*\s*var\(--track-preview-peek-scale\)/u,
    );
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
    expect(libraryBrowseSource).toContain('@preview="openTrackPreview"');
    expect(libraryBrowseSource).toContain('<TrackPreviewOverlay');
    expect(libraryBrowseSource).toContain(
      'trackPreview.close();\n  activateTrack(track);',
    );
    expect(source).not.toContain('usePlayer');
  });

  it('shuffles only artist previews, keeping the selection first', () => {
    expect(libraryBrowseSource).toMatch(
      /isArtistSelected\.value\s*\?\s*shufflePreviewTracks\(visibleTracks, \{ pinnedId: selectedTrackId\.value \}\)\s*:\s*visibleTracks/u,
    );
  });
});

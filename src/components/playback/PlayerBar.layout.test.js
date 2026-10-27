import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  new URL('./PlayerBar.vue', import.meta.url),
  'utf8',
);
const panelSource = readFileSync(
  new URL('../ui/UiPopover.vue', import.meta.url),
  'utf8',
);
const tokenSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);
const identitySource = readFileSync(
  new URL('../track/PlaybackTrackIdentity.vue', import.meta.url),
  'utf8',
);

function cssRule(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 's'))?.[1] ??
    ''
  );
}

function iconButtonSource(iconName) {
  const iconIndex = componentSource.indexOf(`:icon="${iconName}"`);
  const start = componentSource.lastIndexOf('<UiIconButton', iconIndex);
  const end = componentSource.indexOf('/>', iconIndex);
  return componentSource.slice(start, end);
}

describe('PlayerBar responsive metadata layout', () => {
  it('keeps the album action as the only tooltip owner for its nested marquee', () => {
    const albumActionStart = identitySource.indexOf(
      '<UiTooltip v-if="currentTrackAlbum"',
    );
    const albumActionEnd = identitySource.indexOf(
      '</UiTooltip>',
      albumActionStart,
    );
    const albumActionSource = identitySource.slice(
      albumActionStart,
      albumActionEnd,
    );

    expect(albumActionStart).toBeGreaterThan(-1);
    expect(albumActionSource).toContain(':tooltip-enabled="false"');
    expect(albumActionSource).toContain(':text="track.title"');
    expect(componentSource).toContain('<PlaybackTrackIdentity');
  });

  // The title button inherits font-family, so lang belongs on the wrapper.
  it('tags the title and artist wrapper with the track content language', () => {
    expect(identitySource).toMatch(
      /class="playback-track-copy"\s*:lang="trackContentLang\(track\)"/u,
    );
  });

  it('shares the Shell substrate without a divider while the floating panel keeps its surface', () => {
    const playerBarRule = cssRule(componentSource, '.player-bar');
    const toolsMarkerRule = cssRule(
      componentSource,
      '.player-bar__tools-marker',
    );
    const panelRule = cssRule(panelSource, '.ui-popover');

    expect(playerBarRule).toContain('background: transparent');
    expect(playerBarRule).not.toContain('border-top:');
    expect(toolsMarkerRule).toContain(
      'border: var(--ui-border-width) solid var(--ui-color-canvas)',
    );
    expect(panelRule).toContain('background: var(--ui-color-surface-raised)');
  });

  it('orders right-side tools by conditional guide output, playback context, tools, then volume', () => {
    const extrasStart = componentSource.indexOf('class="player-bar__extras"');
    const extrasEnd = componentSource.indexOf(
      '</template>',
      componentSource.indexOf('class="player-bar__volume"', extrasStart),
    );
    const extrasSource = componentSource.slice(extrasStart, extrasEnd);
    const guideOutputIndex = extrasSource.indexOf(':icon="Cable"');
    const lyricsIndex = extrasSource.indexOf(':icon="MicVocal"');
    const queueIndex = extrasSource.indexOf(':icon="ListMusic"');
    const playerToolsIndex = extrasSource.indexOf(':icon="SlidersHorizontal"');
    const volumeIndex = extrasSource.indexOf(
      ':icon="state.isMuted || state.volume === 0 ? VolumeX : Volume2"',
    );

    expect(extrasStart).toBeGreaterThan(-1);
    expect(guideOutputIndex).toBeGreaterThan(-1);
    expect(lyricsIndex).toBeGreaterThan(guideOutputIndex);
    expect(queueIndex).toBeGreaterThan(lyricsIndex);
    expect(playerToolsIndex).toBeGreaterThan(queueIndex);
    expect(volumeIndex).toBeGreaterThan(playerToolsIndex);
    expect(extrasSource).toContain('class="player-bar__context-actions"');
    expect(extrasSource).toContain('class="player-bar__performance-actions"');
  });

  it('uses the formal icon button contract for every right-side action', () => {
    const extrasStart = componentSource.indexOf('class="player-bar__extras"');
    const extrasEnd = componentSource.indexOf(
      '</template>',
      componentSource.indexOf('class="player-bar__volume"', extrasStart),
    );
    const extrasSource = componentSource.slice(extrasStart, extrasEnd);

    expect(extrasSource).toContain('<UiIconButton');
    expect(extrasSource).not.toContain('<UiButton');
    expect(extrasSource.match(/<UiIconButton/gu)).toHaveLength(5);
    expect(extrasSource).toContain('title="導唱輸出"');
    expect(extrasSource).toContain('tooltip-suffix=" (G)"');
    expect(extrasSource).toContain('title="歌詞"');
    expect(extrasSource).toContain('title="播放佇列"');
    expect(extrasSource).toContain(':title="playerToolsTitle"');
    expect(extrasSource).toContain('tooltip-suffix=" (M)"');
  });

  it('reuses the shared primary playback control instead of restating its recipe', () => {
    expect(componentSource).toContain(
      "import PlaybackPrimaryButton from './PlaybackPrimaryButton.vue'",
    );
    expect(componentSource).toContain(
      '<PlaybackPrimaryButton\n          :playing="state.isPlaying"',
    );
    expect(componentSource).not.toMatch(
      /<UiIconButton[\s\S]*?:icon="state\.isPlaying \? Pause : Play"/u,
    );
  });

  it('keeps the four leading actions on one equivalent visual primitive', () => {
    for (const iconName of [
      'Cable',
      'MicVocal',
      'ListMusic',
      'SlidersHorizontal',
    ]) {
      const buttonSource = iconButtonSource(iconName);

      expect(buttonSource).toContain('<UiIconButton');
      expect(buttonSource).not.toMatch(/\bsize=/u);
      expect(buttonSource).not.toMatch(/\bvariant=/u);
      expect(buttonSource).not.toMatch(/\bshape=/u);
    }
  });

  it('opens Live Lyrics as a Performance tool with current-page state', () => {
    expect(componentSource).toContain(
      'const { activeView, performanceTool, openLiveLyrics } = useAppView();',
    );
    expect(componentSource).toContain('openLiveLyrics();');
    expect(componentSource).toContain(':icon="MicVocal"');
    expect(componentSource).not.toContain(':icon="Captions"');
    expect(componentSource).toMatch(
      /:active="\s*activeView === 'performance' && performanceTool === 'live-lyrics'\s*"/u,
    );
    expect(componentSource).toMatch(
      /:aria-current="\s*activeView === 'performance' && performanceTool === 'live-lyrics'\s*\? 'page'\s*: undefined\s*"/u,
    );
    expect(componentSource).toContain('label="查看目前歌曲歌詞"');
  });

  it('sizes now-playing independently from the collapsible playlist sidebar', () => {
    const trackRule = cssRule(componentSource, '.player-bar__track');

    expect(tokenSource).toMatch(/--ui-player-track-inline-size:\s*[^;]+;/);
    expect(tokenSource).toMatch(/--ui-player-track-min-inline-size:\s*[^;]+;/);
    expect(trackRule).toContain('var(--ui-player-track-inline-size)');
    expect(trackRule).toContain('var(--ui-player-track-min-inline-size)');
    expect(trackRule).not.toContain('--ui-playlist-sidebar-width');
  });

  it('uses balanced grid side reserves to keep playback at the viewport midpoint', () => {
    const playerBarRule = cssRule(componentSource, '.player-bar');
    const trackRule = cssRule(componentSource, '.player-bar__track');
    const centerRule = cssRule(componentSource, '.player-bar__center');
    const extrasRule = cssRule(componentSource, '.player-bar__extras');

    expect(playerBarRule).toContain('display: grid');
    expect(playerBarRule).toMatch(
      /grid-template-columns:\s*minmax\(\s*var\(--ui-player-side-reserve-inline-size\),\s*1fr\s*\)\s*minmax\(\s*0,\s*var\(--ui-player-center-max-inline-size\)\s*\)\s*minmax\(\s*var\(--ui-player-side-reserve-inline-size\),\s*1fr\s*\)/u,
    );
    expect(playerBarRule).toContain(
      'padding-inline: var(--ui-player-padding-inline)',
    );
    expect(playerBarRule).toContain('align-content: center');
    expect(playerBarRule).not.toContain('justify-content: space-between');

    expect(trackRule).toContain('grid-column: 1');
    expect(trackRule).toContain('justify-self: start');
    expect(trackRule).toContain('width: var(--ui-player-track-inline-size)');
    expect(trackRule).toContain('margin-inline-start: calc(');
    expect(trackRule).toContain('var(--ui-player-leading-padding-inline)');
    expect(trackRule).toContain('var(--ui-player-padding-inline)');

    expect(centerRule).toContain('grid-column: 2');
    expect(centerRule).toContain('width: 100%');
    expect(centerRule).not.toMatch(/position:\s*absolute/u);
    expect(centerRule).not.toContain('transform:');

    expect(extrasRule).toContain('grid-column: 3');
    expect(extrasRule).toContain('justify-self: end');
    expect(extrasRule).toContain('width: var(--ui-player-extras-inline-size)');

    const extrasToken = tokenSource.match(
      /--ui-player-extras-inline-size:\s*calc\([\s\S]*?var\(--ui-player-volume-inline-size\)[\s\S]*?var\(--ui-player-action-size\)[\s\S]*?var\(--ui-player-action-gap\)[\s\S]*?var\(--ui-player-group-gap\)[\s\S]*?\);/u,
    )?.[0];
    expect(extrasToken).toBeDefined();
    expect(extrasToken?.match(/var\(--ui-player-action-size\)/gu)).toHaveLength(
      5,
    );
    expect(extrasToken?.match(/var\(--ui-player-action-gap\)/gu)).toHaveLength(
      2,
    );
    expect(extrasToken?.match(/var\(--ui-player-group-gap\)/gu)).toHaveLength(
      3,
    );
    expect(tokenSource).toMatch(
      /--ui-player-side-reserve-inline-size:\s*max\([\s\S]*?var\(--ui-player-track-inline-size\)[\s\S]*?var\(--ui-player-extras-inline-size\)[\s\S]*?\);/u,
    );
    expect(tokenSource).toMatch(
      /:root\[data-ui-density='compact'\][\s\S]*?--ui-player-volume-inline-size:\s*6rem/u,
    );
  });

  it('keeps the persistent bar tall enough for the transport stack in both densities', () => {
    const compactBlock = tokenSource.match(
      /:root\[data-ui-density='compact'\]\s+\[data-ui-system='v2'\]\[data-ui-surface-root='true'\]\s*\{([^}]*)\}/su,
    )?.[1];
    const playerBarRule = cssRule(componentSource, '.player-bar');

    expect(tokenSource).toContain('--ui-player-bar-height: 4.75rem');
    expect(compactBlock).toBeDefined();
    expect(compactBlock).not.toContain('--ui-player-bar-height');
    expect(tokenSource).toContain(
      '--ui-player-padding-block-end: var(--ui-shell-content-inset-block);',
    );
    expect(tokenSource).not.toContain('--ui-player-padding-block:');
    expect(playerBarRule).toMatch(
      /padding-block:\s*0\s+var\(--ui-player-padding-block-end\)/u,
    );
  });

  it('aligns artwork to a shell-owned axis without consuming Playlist geometry', () => {
    expect(tokenSource).toContain('--ui-shell-leading-artwork-centerline:');
    expect(tokenSource).toMatch(
      /--ui-player-leading-padding-inline:\s*calc\([\s\S]*?var\(--ui-shell-leading-artwork-centerline\)[\s\S]*?\);/u,
    );
    expect(tokenSource).not.toMatch(
      /--ui-player-(?:leading-)?padding-inline:\s*[^;]*--ui-playlist-row/u,
    );
  });

  it('keeps secondary metadata on one clipped line', () => {
    const copyRule = cssRule(identitySource, '.playback-track-copy');
    const artistRule = cssRule(identitySource, '.playback-track-artist');

    expect(copyRule).toMatch(/overflow:\s*hidden/);
    expect(artistRule).toMatch(/overflow:\s*hidden/);
    expect(artistRule).toMatch(/text-overflow:\s*ellipsis/);
    expect(artistRule).toMatch(/white-space:\s*nowrap/);
  });

  it('links the now-playing artists through the shared credits inside the clipped line', () => {
    expect(identitySource).toMatch(
      /<span v-if="track\.artist" class="playback-track-artist">\s*<TrackArtistCredits :track="track" \/>\s*<\/span>/u,
    );
    expect(componentSource).not.toMatch(
      /<TrackArtistCredits[^>]*current-artist-id/u,
    );
  });

  it('delegates only playback Queue visibility to the shell-owned right Dock', () => {
    expect(componentSource).toContain(
      "const emit = defineEmits(['artworkActivate', 'queueActivate']);",
    );
    expect(componentSource).toContain(
      'queueExpanded: { type: Boolean, default: false }',
    );
    expect(componentSource).toContain(':active="queueExpanded"');
    expect(componentSource).not.toContain(':aria-pressed="queueExpanded"');
    expect(componentSource).toContain(':aria-expanded="queueExpanded"');
    expect(componentSource).toContain(':aria-controls="queueControls"');
    expect(componentSource).toContain("emit('queueActivate')");
    expect(componentSource).not.toContain('isQueueOpen');
    expect(componentSource).not.toContain('<QueuePanel');
  });

  it('keeps accompaniment background work out of playback controls', () => {
    expect(componentSource).not.toContain('useSeparationQueue');
    expect(componentSource).not.toContain('separationQueueIndicator');
    expect(componentSource).not.toContain('ListChecks');
    expect(componentSource).not.toContain('separationExpanded');
    expect(componentSource).not.toContain('separationControls');
    expect(componentSource).not.toContain('separationActivate');
    expect(componentSource).not.toContain('player-bar__separation-entry');
  });

  it('uses density-aware action geometry and resets the native volume input box model', () => {
    const extrasRule = cssRule(componentSource, '.player-bar__extras');
    const volumeRule = cssRule(componentSource, '.player-bar__volume');
    const volumeRangeRule = cssRule(
      componentSource,
      '.player-bar__volume-range',
    );

    expect(extrasRule).toContain(
      '--ui-icon-button-size-override: var(--ui-player-action-size)',
    );
    expect(extrasRule).toContain('gap: var(--ui-player-group-gap)');
    expect(componentSource).toMatch(
      /\.player-bar__context-actions,[\s\S]*?gap:\s*var\(--ui-player-action-gap\)/u,
    );
    expect(volumeRule).toContain('gap: var(--ui-player-action-gap)');
    expect(volumeRangeRule).toContain(
      'width: var(--ui-player-volume-inline-size)',
    );
    expect(tokenSource).toContain('--ui-player-volume-inline-size: 7rem');
    expect(componentSource).toContain('UiRangeControl');
    expect(tokenSource).toContain('--ui-player-action-size:');
    expect(tokenSource).toContain('--ui-player-action-gap:');
    expect(tokenSource).toContain('--ui-player-group-gap:');
    expect(tokenSource).toMatch(
      /--ui-player-group-gap:\s*var\(\s*--ui-space-1\s*\)/u,
    );
  });

  it('keeps the exact volume accessible without a persistent percentage label', () => {
    expect(componentSource).toContain(':value-text="`${volumePercent}%`"');
    expect(componentSource).not.toContain('{{ volumePercent }}%');
    expect(componentSource).not.toContain('class="player-bar__volume-value"');
    expect(componentSource).not.toContain('.player-bar__volume-value');
  });

  it('separates Player Tools disclosure state from its passive engaged marker', () => {
    const queueStart = componentSource.indexOf(':icon="ListMusic"');
    const queueEnd = componentSource.indexOf('/>', queueStart);
    const queueSource = componentSource.slice(queueStart, queueEnd);
    const toolsStart = componentSource.lastIndexOf(
      '<UiIconButton',
      componentSource.indexOf(':icon="SlidersHorizontal"'),
    );
    const toolsEnd = componentSource.indexOf('/>', toolsStart);
    const toolsSource = componentSource.slice(toolsStart, toolsEnd);

    expect(componentSource).toContain('const playerToolsEngaged = computed(');
    expect(componentSource).not.toContain('playerToolsActive');
    expect(queueSource).not.toContain('aria-pressed');
    expect(queueSource).toContain(':aria-expanded="queueExpanded"');
    expect(toolsSource).toContain(':active="isPlayerToolsOpen"');
    expect(toolsSource).toContain(':label="playerToolsLabel"');
    expect(toolsSource).toContain(':title="playerToolsTitle"');
    expect(toolsSource).not.toContain('aria-pressed');
    expect(toolsSource).toContain('v-bind="triggerProps"');
    expect(componentSource).toContain(
      'v-if="playerToolsEngaged && !isPlayerToolsOpen"',
    );
    expect(componentSource).toContain('class="player-bar__tools-marker"');
    expect(componentSource).toContain('演出工具 · 啟用中');
    expect(componentSource).toContain('v-model:open="isPlayerToolsOpen"');
  });
});

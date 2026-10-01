import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  new URL('./PlayerBar.vue', import.meta.url),
  'utf8',
);
const tokenSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
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
  it('orders right-side tools by conditional guide output, playback context, tools, then volume', () => {
    const extrasStart = componentSource.indexOf('class="player-bar__extras"');
    const extrasEnd = componentSource.indexOf('<PlayerToolsPanel', extrasStart);
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
    const extrasEnd = componentSource.indexOf('<PlayerToolsPanel', extrasStart);
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

  it('keeps Lyrics as a Spotify-style playback destination with current-page state', () => {
    expect(componentSource).toContain(
      'const { activeView, setActiveView } = useAppView();',
    );
    expect(componentSource).toContain(':icon="MicVocal"');
    expect(componentSource).not.toContain(':icon="Captions"');
    expect(componentSource).toContain(':active="activeView === \'lyrics\'"');
    expect(componentSource).toContain(
      ":aria-current=\"activeView === 'lyrics' ? 'page' : undefined\"",
    );
    expect(componentSource).toContain('label="查看目前歌曲歌詞"');
  });

  it('sizes now-playing independently from the collapsible playlist sidebar', () => {
    const trackRule = cssRule(componentSource, '.player-bar__track');

    expect(tokenSource).toMatch(/--ui-player-bar-track-width:\s*[^;]+;/);
    expect(tokenSource).toMatch(/--ui-player-bar-track-width-min:\s*[^;]+;/);
    expect(trackRule).toContain('var(--ui-player-bar-track-width)');
    expect(trackRule).toContain('var(--ui-player-bar-track-width-min)');
    expect(trackRule).not.toContain('--ui-playlist-sidebar-width');
  });

  it('aligns artwork to a shell-owned axis without consuming Playlist geometry', () => {
    expect(tokenSource).toContain('--ui-shell-leading-artwork-centerline:');
    expect(tokenSource).toMatch(
      /--ui-player-bar-padding-inline-start:\s*calc\([\s\S]*?var\(--ui-shell-leading-artwork-centerline\)[\s\S]*?\);/u,
    );
    expect(tokenSource).not.toMatch(
      /--ui-player-bar-padding-inline(?:-start)?:\s*[^;]*--ui-playlist-row/u,
    );
  });

  it('keeps secondary metadata on one clipped line', () => {
    const copyRule = cssRule(componentSource, '.player-bar__track-copy');
    const artistRule = cssRule(componentSource, '.player-bar__track-artist');

    expect(copyRule).toMatch(/overflow:\s*hidden/);
    expect(artistRule).toMatch(/overflow:\s*hidden/);
    expect(artistRule).toMatch(/text-overflow:\s*ellipsis/);
    expect(artistRule).toMatch(/white-space:\s*nowrap/);
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
    const volumeInputRule = cssRule(
      componentSource,
      '.player-bar__volume input',
    );

    expect(extrasRule).toContain(
      '--ui-icon-button-size-override: var(--ui-player-bar-action-size)',
    );
    expect(extrasRule).toContain('gap: var(--ui-player-bar-group-gap)');
    expect(componentSource).toMatch(
      /\.player-bar__context-actions,[\s\S]*?gap:\s*var\(--ui-player-bar-action-gap\)/u,
    );
    expect(volumeRule).toContain('gap: var(--ui-player-bar-action-gap)');
    expect(volumeInputRule).toContain(
      'width: var(--ui-player-bar-volume-slider-width)',
    );
    expect(volumeInputRule).toContain('margin: 0');
    expect(tokenSource).toContain('--ui-player-bar-action-size:');
    expect(tokenSource).toContain('--ui-player-bar-action-gap:');
    expect(tokenSource).toContain('--ui-player-bar-group-gap:');
    expect(tokenSource).toMatch(
      /--ui-player-bar-group-gap:\s*var\(\s*--ui-space-1\s*\)/u,
    );
  });

  it('keeps the exact volume accessible without a persistent percentage label', () => {
    expect(componentSource).toContain(':aria-valuetext="`${volumePercent}%`"');
    expect(componentSource).not.toContain('{{ volumePercent }}%');
    expect(componentSource).not.toContain('class="player-bar__volume-value"');
    expect(componentSource).not.toContain('.player-bar__volume-value');
  });

  it('separates Player Tools disclosure state from its passive engaged marker', () => {
    const queueStart = componentSource.indexOf(':icon="ListMusic"');
    const queueEnd = componentSource.indexOf('/>', queueStart);
    const queueSource = componentSource.slice(queueStart, queueEnd);
    const toolsStart = componentSource.indexOf(':icon="SlidersHorizontal"');
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
    expect(toolsSource).toContain(':aria-expanded="isPlayerToolsOpen"');
    expect(toolsSource).toContain('aria-controls="player-tools-panel"');
    expect(componentSource).toContain(
      'v-if="playerToolsEngaged && !isPlayerToolsOpen"',
    );
    expect(componentSource).toContain('class="player-bar__tools-marker"');
    expect(componentSource).toContain('演出工具 · 啟用中');
    expect(componentSource).toContain(
      '<PlayerToolsPanel\n      id="player-tools-panel"',
    );
  });
});

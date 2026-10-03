import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readSource = (path) =>
  readFileSync(new URL(path, import.meta.url), 'utf8');

const shellSources = [
  '../App.vue',
  '../components/layout/AppAnnouncementModal.vue',
  '../components/layout/AppPlaylistSidebar.vue',
  '../components/layout/AppTitleBar.vue',
  '../components/playback/PlayerBar.vue',
  '../components/playback/PlayerBarPanel.vue',
  '../components/playback/PlayerToolsPanel.vue',
  '../components/playlists/PlaylistDetailsModal.vue',
  '../components/playlists/PlaylistSidebar.vue',
  '../components/playlists/PlaylistSidebarRow.vue',
];

const retiredShellTokens = [
  '--ui-font-weight-strong',
  '--ui-motion-ease',
  '--ui-motion-fast',
  '--ui-playlist-row-compact-hit-size',
  '--ui-playlist-row-gap',
  '--ui-playlist-row-min-height',
  '--ui-playlist-row-padding-block',
  '--ui-playlist-row-padding-inline',
  '--ui-playlist-row-selected-background',
  '--ui-playlist-row-thumb-size',
  '--ui-playlist-search-icon-slot-size',
  '--ui-playlist-search-input-padding-inline-end',
  '--ui-playlist-search-padding-block',
  '--ui-playlist-search-padding-inline',
  '--ui-playlist-search-separator-inset-block',
  '--ui-playlist-sidebar-width',
  '--ui-playlist-sidebar-width-max',
  '--ui-playlist-sidebar-width-min',
  '--ui-playlist-toolbar-control-size',
  '--ui-playlist-toolbar-gap',
  '--ui-playlist-toolbar-height',
  '--ui-playlist-toolbar-padding-block',
  '--ui-playlist-toolbar-padding-inline',
  '--ui-player-bar-action-gap',
  '--ui-player-bar-action-size',
  '--ui-player-bar-center-max-width',
  '--ui-player-bar-group-gap',
  '--ui-player-bar-padding-block',
  '--ui-player-bar-padding-inline',
  '--ui-player-bar-padding-inline-start',
  '--ui-player-bar-panel-edge-offset',
  '--ui-player-bar-panel-max-height',
  '--ui-player-bar-panel-padding',
  '--ui-player-bar-panel-viewport-offset',
  '--ui-player-bar-panel-width',
  '--ui-player-bar-track-width',
  '--ui-player-bar-track-width-min',
  '--ui-player-bar-volume-slider-width',
  '--ui-player-tools-beat-height',
  '--ui-player-tools-meter-control-height',
  '--ui-shell-panel-inset-block',
  '--ui-titlebar-height',
  '--ui-z-context-menu',
  '--ui-z-dropdown',
];

describe('Persistent App Shell Token v2 cutover', () => {
  it('provides conventional shell, Sidebar, and Player component tokens', () => {
    const tokens = readSource('./tokens-v2.css');
    for (const token of [
      '--ui-shell-titlebar-block-size',
      '--ui-shell-content-inset-block',
      '--ui-shell-navigation-inline-size',
      '--ui-shell-navigation-inline-size-min',
      '--ui-shell-navigation-inline-size-max',
      '--ui-sidebar-compact-threshold',
      '--ui-sidebar-row-gap',
      '--ui-sidebar-artwork-centerline',
      '--ui-sidebar-toolbar-block-size',
      '--ui-sidebar-search-icon-inline-size',
      '--ui-player-action-size',
      '--ui-player-center-max-inline-size',
      '--ui-player-track-inline-size',
      '--ui-player-panel-inline-size',
      '--ui-player-tools-beat-block-size',
    ]) {
      expect(tokens).toContain(`${token}:`);
    }
  });

  it('removes every T1-only reference from the persistent shell slice', () => {
    for (const path of shellSources) {
      const source = readSource(path);
      for (const token of retiredShellTokens) {
        expect(source, `${path} still consumes ${token}`).not.toContain(token);
      }
      expect(source, `${path} still consumes --ui-radius`).not.toMatch(
        /var\(--ui-radius\)/u,
      );
    }
  });
});

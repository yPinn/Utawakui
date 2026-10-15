import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');

describe('App shell right Dock', () => {
  it('uses a dedicated dark substrate around the light Folder surface', () => {
    expect(source).toMatch(
      /\.shell\s*\{[^}]*background:\s*var\(--ui-color-shell-substrate\);/su,
    );
    expect(source).not.toMatch(
      /\.shell\s*\{[^}]*background:\s*var\(--ui-color-canvas\);/su,
    );
  });

  it('projects the configured Right Dock width into the reserved desktop bay', () => {
    expect(source).toContain('useAppRightDockWidth');
    expect(source).toContain("'--ui-right-dock-width':");
    expect(source).toMatch(
      /\.shell__main--with-dock\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--ui-right-dock-width\);[^}]*gap:\s*var\(--ui-space-3\);/su,
    );
  });

  it('routes shell navigation through the app-view action API', () => {
    expect(source).toMatch(
      /const\s*\{[\s\S]*?activeView,[\s\S]*?setActiveView,[\s\S]*?\}\s*=\s*useAppView\(\);/u,
    );
    expect(source).toContain(':active-destination="activeView"');
    expect(source).not.toContain('folderActiveDestination');
    expect(source).toContain('@navigate="setActiveView"');
    expect(source).toContain(
      'useKeyboardShortcuts({ internalViewShortcuts });',
    );
    expect(source).not.toContain('v-model:active-view="activeView"');
  });

  it('starts navigation history and leaves Settings through it', () => {
    expect(source).toContain(
      "import { useNavigationHistory } from './composables/useNavigationHistory.js';",
    );
    expect(source).toContain(
      'const navigationHistory = useNavigationHistory();',
    );
    expect(source).toMatch(
      /function leaveSettings\(\)\s*\{\s*if \(!navigationHistory\.leaveSettings\(\)\) returnFromSettings\(\);/u,
    );
  });

  it('renders Settings in a mutually exclusive shell utility page', () => {
    expect(source).toContain(
      "import AppUtilityPage from './components/layout/AppUtilityPage.vue';",
    );
    expect(source).toContain(':settings-active="isSettingsView"');
    expect(source).toContain(':update-available="appUpdateReady"');
    expect(source).toContain('@toggle-settings="toggleSettings"');
    expect(source).toMatch(
      /function toggleSettings\(\)\s*\{[\s\S]*?if \(isSettingsView\.value\) leaveSettings\(\);[\s\S]*?else openSettings\(\);/u,
    );
    expect(source).toMatch(/<AppUtilityPage\s+v-if="isSettingsView"/u);
    expect(source).not.toContain('AppUtilityFrame');
    expect(source).toContain('@back="leaveSettings"');
    expect(source).toContain('<SettingsPage />');
    expect(source).toContain("() => import('./pages/SettingsPage.vue')");
    expect(source).toMatch(
      /<AppSurfaceBoundary v-else surface-id="app-folder">/u,
    );
    expect(source).toContain('<AppFolderLayout');
    expect(source).toContain('v-if="activeViewOwnsFolderPage"');
    expect(source).toContain('<AppFolderPage v-else mode="workspace">');
    expect(source).not.toContain('settings: SettingsView');
  });

  it('routes the controlled Performer toggle through the shell owner', () => {
    expect(source).toContain(':performer-active="performerView.state.open"');
    expect(source).toContain(':performer-busy="performerView.state.isOpening"');
    expect(source).toContain('@toggle-performer="performerView.toggle"');
    expect(source).toContain('@action="performerView.toggle"');
  });

  it('routes product destinations through Page composition owners', () => {
    expect(source).toContain(
      "import LibraryPage from './pages/LibraryPage.vue';",
    );
    expect(source).toContain("() => import('./pages/DisplayPage.vue')");
    expect(source).toContain("() => import('./pages/PerformancePage.vue')");
    expect(source).toContain('library: LibraryPage');
    expect(source).toContain('performance: PerformancePage');
    expect(source).toContain('display: DisplayPage');
    expect(source).not.toContain(
      "import SetlistPage from './components/playlists/SetlistPage.vue';",
    );
    expect(source).not.toContain(
      "() => import('./components/output/OutputPage.vue')",
    );
  });

  it('owns preparation, playback, and metadata surfaces beside the primary archive workspace', () => {
    expect(source).toContain('class="shell__main shell__main--with-dock"');
    expect(source).toContain('class="shell__workspace"');
    expect(source).toContain('class="shell__dock"');
    expect(source).toContain("'shell__dock--collapsed': !rightDockExpanded");
    expect(source).toContain('<AppRightDock');
    expect(source).toContain('<QueuePanel');
    expect(source).toContain('<PreparationDockPanel');
    expect(source).toContain('RIGHT_DOCK_SURFACE_METADATA');
    expect(source).toContain('RIGHT_DOCK_SURFACE_QUEUE');
    expect(source).toContain('RIGHT_DOCK_SURFACE_PREPARATION');
    expect(source).not.toContain('RIGHT_DOCK_SURFACE_IMPORT');
    expect(source).not.toContain('<PerformanceSessionPanel');
    expect(source).not.toContain('RIGHT_DOCK_SURFACE_SESSION');
    expect(source).not.toContain('<SeparationQueuePanel');
    expect(source).not.toContain('RIGHT_DOCK_SURFACE_SEPARATION');
    expect(source).not.toContain('#context');
  });

  it('keeps playback info production-available and gates its PlayerBar entry by track data', () => {
    expect(source).toContain(
      'const PlaybackInfoContextView = defineAsyncComponent(',
    );
    expect(source).toContain(
      "() => import('./views/StudioLibraryContextView.vue')",
    );
    expect(source).toContain(
      "import { usePlayer } from './composables/usePlayer.js';",
    );
    expect(source).toContain(
      "import { usePlaybackQueue } from './composables/usePlaybackQueue.js';",
    );
    expect(source).toContain('const playbackInfoAvailable = computed(');
    expect(source).toContain(
      'Boolean(playerState.track ?? queueCurrentTrack.value)',
    );
    expect(source).toContain(':is="PlaybackInfoContextView"');
    expect(source).toContain(':artwork-expandable="playbackInfoAvailable"');
    expect(source).toContain('if (!playbackInfoAvailable.value) return;');
    expect(source).toContain('watch(\n  playbackInfoAvailable,');
    expect(source).not.toContain('internalContextDefinitions');
  });

  it('places one standalone BGM player outside PlayerBar and Right Dock presentation ownership', () => {
    expect(source).toContain(
      "import BgmPlayer from './components/bgm/BgmPlayer.vue';",
    );
    expect(source).toContain('<BgmPlayer');
    expect(source).toContain('class="shell__bgm-player"');
    expect(source).toContain(':open="bgmPlayerOpen"');
    expect(source).toContain('@request-close="closeBgmPlayer"');
    expect(source).not.toContain('useBgmSession');
    expect(source).not.toContain('LiveSessionCard');

    const cardIndex = source.indexOf('<BgmPlayer');
    const dockIndex = source.indexOf('<AppRightDock');
    const playerIndex = source.indexOf('<PlayerBar');
    expect(cardIndex).toBeLessThan(dockIndex);
    expect(cardIndex).toBeLessThan(playerIndex);
    expect(source).not.toContain('RIGHT_DOCK_SURFACE_BGM');
  });

  it('keeps the mini player and workspace disclosure independently mounted', () => {
    const dockTriggerHandlers = source.slice(
      source.indexOf('function toggleMetadataSurface'),
      source.indexOf('function openBgmPlayer'),
    );
    const bgmHandlers = source.slice(
      source.indexOf('function openBgmPlayer'),
      source.indexOf('function closeDockSurface'),
    );
    const dockExpandHandler = source.slice(
      source.indexOf('function expandRightDock'),
      source.indexOf('function handleRightDockKeydown'),
    );

    expect(dockTriggerHandlers).not.toContain('bgmPlayerOpen.value = false');
    expect(bgmHandlers).not.toContain('rightDock.setExpanded(false)');
    expect(dockExpandHandler).not.toContain('bgmPlayerOpen.value = false');
    expect(source).not.toContain('shell__bgm-boundary--beside-dock');
  });

  it('lets the movable BGM player overlap the reserved Dock bay within one stable shell boundary', () => {
    expect(source).toContain('class="shell__bgm-boundary"');
    expect(source).not.toContain('shell__bgm-boundary--beside-dock');
    expect(source).toMatch(
      /<div[^>]*class="shell__bgm-boundary"[\s\S]*?<BgmPlayer[\s\S]*?<\/div>/u,
    );
    expect(source).toMatch(
      /<main[\s\S]*?class="shell__main shell__main--with-dock"[\s\S]*?class="shell__bgm-boundary"[\s\S]*?class="shell__dock"[\s\S]*?<\/main>/u,
    );
    expect(source).toMatch(
      /\.shell__main\s*\{[^}]*position:\s*relative;[^}]*min-width:\s*0;[^}]*min-height:\s*0;/su,
    );
    expect(source).toMatch(
      /\.shell__bgm-boundary\s*\{[^}]*position:\s*absolute;[^}]*inset-block-start:\s*var\(--ui-shell-content-inset-block\);[^}]*inset-block-end:\s*var\(--ui-shell-content-inset-block\);[^}]*pointer-events:\s*none;/su,
    );
    expect(source).not.toMatch(
      /\.shell__bgm-boundary\s*\{[^}]*inset-block-end:\s*calc\(/su,
    );
    expect(source).toMatch(
      /\.shell__bgm-boundary\s*\{[^}]*z-index:\s*var\(--ui-z-floating\);[^}]*inset-inline-end:\s*var\(--ui-shell-edge-inset-inline\);/su,
    );
    expect(source).toMatch(
      /\.shell__bgm-boundary\s*\{[^}]*inset-inline-start:\s*var\(--ui-shell-workspace-inline-start\);/su,
    );
    expect(source).toMatch(
      /\.shell__main\s*\{[^}]*padding-left:\s*var\(--ui-shell-workspace-inline-start\);/su,
    );
    expect(source).not.toMatch(
      /\.shell__bgm-boundary\s*\{[^}]*inset-inline-start:\s*var\(--ui-shell-edge-inset-inline\);/su,
    );
    expect(source).not.toMatch(
      /\.shell__bgm-boundary\s*\{[^}]*inset-inline-end:\s*calc\([^}]*var\(--ui-right-dock-width\)/su,
    );
    expect(source).not.toMatch(
      /@media[^{}]*\{[\s\S]*?\.shell__bgm-boundary(?:--beside-dock)?\s*\{/u,
    );
    expect(source).toMatch(
      /\.shell__bgm-player\s*\{[^}]*position:\s*absolute;[^}]*inset-inline-end:\s*0;[^}]*inset-block-end:\s*0;[^}]*pointer-events:\s*auto;/su,
    );
    expect(source).not.toContain('--ui-bgm-player-inline-size:');
    expect(source).not.toContain('--ui-bgm-player-min-inline-size:');
  });

  it('keeps the collapsed Dock bay reserved while reducing its visible control to a local restore action', () => {
    expect(source).toContain('<div class="shell__workspace">');
    expect(source).toMatch(
      /\.shell__main--with-dock\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--ui-right-dock-width\);[^}]*gap:\s*var\(--ui-space-3\);[^}]*\}/su,
    );
    expect(source).toMatch(
      /\.shell__dock\s*\{[^}]*padding-top:\s*var\(--ui-shell-content-inset-block\);[^}]*pointer-events:\s*none;[^}]*\}/su,
    );
    expect(source).toMatch(
      /\.shell__dock--collapsed\s*\{[^}]*align-items:\s*flex-end;[^}]*\}/su,
    );
    const desktopCollapsedDockBlock = source.match(
      /\.shell__dock--collapsed\s*\{[^}]*\}/su,
    )?.[0];
    expect(desktopCollapsedDockBlock).not.toContain('position: absolute');
    expect(source).toMatch(
      /\.shell__sidebar\s*\{[^}]*padding-block:\s*var\(--ui-shell-content-inset-block\);[^}]*\}/su,
    );
    expect(source).toMatch(
      /\.shell__main\s*\{[^}]*padding-bottom:\s*var\(--ui-shell-content-inset-block\);[^}]*\}/su,
    );
    expect(source).toMatch(
      /\.shell__workspace\s*\{[^}]*padding-top:\s*var\(--ui-shell-content-inset-block\);[^}]*\}/su,
    );
    expect(source).not.toContain('shell__workspace--utility');
  });

  it('routes playback and preparation triggers to the Dock', () => {
    expect(source).toContain('@toggle-preparation="togglePreparationSurface"');
    expect(source).toContain(
      'rightDock.toggleSurface(RIGHT_DOCK_SURFACE_PREPARATION)',
    );
    expect(source).toContain(':preparation-active="preparationExpanded"');
    expect(source).toContain(':preparation-controls="RIGHT_DOCK_CONTENT_ID"');
    expect(source).not.toContain(':session-active=');
    expect(source).not.toContain('@toggle-session=');
    expect(source).toContain(':bgm-active="bgmPlayerOpen"');
    expect(source).toContain(':bgm-controls="BGM_PLAYER_ID"');
    expect(source).toContain('@toggle-bgm="toggleBgmPlayer"');
    expect(source).toContain(':artwork-controls="RIGHT_DOCK_CONTENT_ID"');
    expect(source).toContain(':queue-controls="RIGHT_DOCK_CONTENT_ID"');
    expect(source).toContain('@artwork-activate="toggleMetadataSurface"');
    expect(source).toContain('@queue-activate="toggleQueueSurface"');
    expect(source).toContain('@open-queue="toggleQueueSurface"');
    expect(source).not.toContain(':separation-expanded');
    expect(source).not.toContain('@open-separation');
    expect(source).not.toContain('openSeparationSurface');
    expect(source).not.toContain(':separation-controls=');
    expect(source).not.toContain('@separation-activate=');
    expect(source.match(/@collapse="collapseRightDock"/gu)).toHaveLength(3);
    expect(source).toContain(
      '@close="closeDockSurface(RIGHT_DOCK_SURFACE_QUEUE)"',
    );
    expect(source).toMatch(
      /function collapseRightDock\(\)\s*\{[^}]*rightDock\.setExpanded\(false\);/su,
    );
    expect(source).toContain("requestedTarget.closest?.('[inert]')");
    expect(source).toContain(
      '\'.app-right-dock__expand[aria-expanded="false"]\'',
    );
  });

  it('toggles preparation directly from the titlebar without switching the current destination', () => {
    const handler = source.slice(
      source.indexOf('function togglePreparationSurface'),
      source.indexOf('function openBgmPlayer'),
    );
    expect(handler).toContain('rememberRightDockTrigger');
    expect(handler).toContain(
      'rightDock.toggleSurface(RIGHT_DOCK_SURFACE_PREPARATION)',
    );
    expect(handler).not.toContain('setActiveView');
    expect(source).toContain('@toggle-preparation="togglePreparationSurface"');
    expect(source).not.toContain('<AppPlaylistSidebar @open-import');
  });

  it('retains an opened Queue and switches Dock surfaces without display-none remounts', () => {
    expect(source).toContain(
      'v-if="rightDock.mountedSurfaces[RIGHT_DOCK_SURFACE_QUEUE]"',
    );
    expect(source).toContain(':active="queueExpanded"');
    expect(source).toContain(
      "'shell__dock-surface--active': queueSurfaceActive",
    );
    expect(source).not.toMatch(/<QueuePanel[\s\S]*?v-show=/u);
    expect(source).toMatch(
      /\.shell__dock-surface\s*\{[^}]*position:\s*absolute;[^}]*opacity:\s*0;[^}]*transform:\s*translateX/su,
    );
    expect(source).toMatch(
      /\.shell__dock-surface--active\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*translateX\(0\)/su,
    );
  });

  it('records Queue trigger-to-paint timing in development diagnostics', () => {
    expect(source).toContain('measureInteractionToNextPaint');
    expect(source).toContain('utawakui:right-dock:queue-toggle');
  });

  it('keeps the expanded Dock as an overlay at the compact breakpoint', () => {
    expect(source).toMatch(
      /@media \(max-width: 70rem\)[\s\S]*\.shell__main--with-dock\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);[^}]*gap:\s*0;[^}]*\}/u,
    );
    expect(source).toMatch(
      /@media \(max-width: 70rem\)[\s\S]*\.shell__main--dock-expanded\s+\.shell__dock\s*\{[^}]*position:\s*absolute;[^}]*inset-inline-end:\s*var\(--ui-shell-edge-inset-inline\);[^}]*\}/u,
    );
  });
  it('keeps Escape with an open modal or menu instead of also closing the dock', () => {
    const handler = source.slice(
      source.indexOf('function handleRightDockKeydown'),
      source.indexOf('onMounted(() => document.addEventListener'),
    );
    expect(handler).toContain('hasOpenTransientOverlay()');
    expect(handler).not.toContain('dialog[open]');
  });
});

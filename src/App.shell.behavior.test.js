import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./App.vue', import.meta.url), 'utf8');

describe('App shell right Dock', () => {
  it('owns one instance of each singleton report modal outside Settings', () => {
    expect(source.match(/<FeedbackReportModal\s*\/>/gu)).toHaveLength(1);
    expect(source.match(/<ObsSessionExportModal\s*\/>/gu)).toHaveLength(1);
    for (const [file, component] of [
      [
        './components/settings/SettingsSupportSection.vue',
        'FeedbackReportModal',
      ],
      [
        './components/settings/SettingsCapabilitiesSection.vue',
        'ObsSessionExportModal',
      ],
    ])
      expect(
        readFileSync(new URL(file, import.meta.url), 'utf8'),
      ).not.toContain(`<${component}`);
  });
  it('owns one notification host outside the switched page content', () => {
    expect(source.match(/<AppNotificationHost\s*\/>/gu)).toHaveLength(1);
    expect(source).toContain(
      "import AppNotificationHost from './components/layout/AppNotificationHost.vue'",
    );
    expect(source).not.toContain('shell__notice');
  });
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
      /\.shell__main--with-dock\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--ui-shell-dock-inline-size\);[^}]*gap:\s*var\(--ui-space-3\);/su,
    );
  });

  it('connects the actual Dock disclosure state before creating its layout allocator', () => {
    expect(source.indexOf('const rightDockExpanded = computed(')).toBeLessThan(
      source.indexOf('useShellLayout(shellRef, rightDockExpanded)'),
    );
    expect(source).toContain("'--ui-shell-dock-inline-size':");
  });

  it('routes shell navigation through the app-view action API', () => {
    expect(source).toMatch(
      /const\s*\{[\s\S]*?activeView,[\s\S]*?setActiveView,[\s\S]*?\}\s*=\s*useAppView\(\);/u,
    );
    expect(source).toContain(':active-destination="activeView"');
    expect(source).not.toContain('folderActiveDestination');
    expect(source).toContain('@navigate="setActiveView"');
    expect(source).toContain(
      'shortcutConfiguration: keyboardShortcutSettings.configuration',
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
    expect(source).toContain('useNavigationInput();');
    expect(source).toMatch(
      /function leaveSettings\(\)\s*\{\s*if \(!navigationHistory\.leaveSettings\(\)\) returnFromSettings\(\);/u,
    );
  });

  it('renders Settings as the neutral fourth Folder destination', () => {
    expect(source).not.toContain('AppUtilityPage');
    expect(source).toContain(':settings-active="isSettingsView"');
    expect(source).toContain(':update-available="appUpdateReady"');
    expect(source).toContain('@toggle-settings="toggleSettings"');
    expect(source).toMatch(
      /function toggleSettings\(\)\s*\{[\s\S]*?if \(isSettingsView\.value\)\s*\{[\s\S]*?leaveSettings\(\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?openSettings\(\);[\s\S]*?focusAppDestinationTrigger\('settings'\)/u,
    );
    expect(source).not.toContain('AppUtilityFrame');
    expect(source).toContain("() => import('./pages/SettingsPage.vue')");
    expect(source).toContain('settings: SettingsPage');
    expect(source).toContain('<AppSurfaceBoundary surface-id="app-folder">');
    expect(source).toContain('<AppFolderLayout');
    expect(source).toContain('v-if="activeViewOwnsFolderPage"');
    expect(source).toContain('<AppFolderPage v-else mode="workspace">');
    expect(source).toMatch(
      /const pageComposedFolderViews = new Set\(\[[\s\S]*?'settings'/u,
    );
    expect(source).toContain("focusAppDestinationTrigger('settings')");
    expect(source).toContain(
      "document.querySelector('[data-app-settings-trigger]')?.focus?.()",
    );
  });

  it('routes the controlled Performer toggle through the shell owner', () => {
    expect(source).toContain(':performer-active="performerView.state.open"');
    expect(source).toContain(':performer-busy="performerView.state.isOpening"');
    expect(source).toContain('@toggle-performer="performerView.toggle"');
    const owner = readFileSync(
      new URL('./composables/usePerformerSelfView.js', import.meta.url),
      'utf8',
    );
    expect(owner).toContain('action: toggle');
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

  it('initializes the shared BGM controller at App lifetime without mounting a floating player', () => {
    expect(source).toContain('const bgmSession = useBgmSession();');
    expect(source).toContain('onMounted(bgmSession.initialize);');
    expect(source).not.toContain('<BgmPlayer');
    expect(source).not.toContain('shell__bgm-boundary');
    expect(source).not.toContain('toggleBgmPlayer');
    expect(source).not.toContain('RIGHT_DOCK_SURFACE_BGM');
  });

  it('keeps the collapsed restore action in flow while the allocator reclaims its bay', () => {
    expect(source).toMatch(/<div\s[^>]*class="shell__workspace"[^>]*>/u);
    expect(source).toMatch(
      /\.shell__main--with-dock\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+var\(--ui-shell-dock-inline-size\);[^}]*gap:\s*var\(--ui-space-3\);[^}]*\}/su,
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
    expect(source).toContain('rightDock.cyclePreparation()');
    expect(source).toContain(':preparation-active="preparationExpanded"');
    expect(source).toContain(
      ':preparation-action-label="rightDock.preparationActionLabel.value"',
    );
    expect(source).toContain(
      ':active-preparation-tab="rightDock.preparationTab.value"',
    );
    expect(source).toContain(
      '@update:active-preparation-tab="rightDock.selectPreparationTab"',
    );
    expect(source).toContain(':preparation-controls="RIGHT_DOCK_CONTENT_ID"');
    expect(source).not.toContain(':session-active=');
    expect(source).not.toContain('@toggle-session=');
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
      source.indexOf('function closeDockSurface'),
    );
    expect(handler).toContain('rememberRightDockTrigger');
    expect(handler).toContain('rightDock.cyclePreparation()');
    expect(handler).not.toContain('setActiveView');
    expect(source).toContain('@toggle-preparation="togglePreparationSurface"');
    expect(source).not.toContain('<AppPlaylistSidebar @open-import');
  });

  it('retains an opened Queue and switches Dock surfaces without display-none remounts', () => {
    expect(source).toContain(
      'v-if="rightDock.mountedSurfaces[RIGHT_DOCK_SURFACE_QUEUE]"',
    );
    expect(source).toContain(':active="queueExpanded"');
    expect(source).toContain("'shell__dock-surface--active': queueExpanded");
    expect(source).not.toMatch(/<QueuePanel[\s\S]*?v-show=/u);
    expect(source).toMatch(
      /\.shell__dock-surface\s*\{[^}]*position:\s*absolute;[^}]*opacity:\s*0;[^}]*transform:\s*translateX/su,
    );
    expect(source).toMatch(
      /\.shell__dock-surface--active\s*\{[^}]*opacity:\s*1;[^}]*transform:\s*translateX\(0\)/su,
    );
  });

  it('gives the PlayerBar Queue a single bottom-origin motion owner', () => {
    expect(source).toContain(':motion-origin="');
    expect(source).toMatch(
      /restorableDockSurface === RIGHT_DOCK_SURFACE_QUEUE\s*\? 'bottom'\s*: 'end'/u,
    );
    expect(source).toContain(
      'class="shell__dock-surface shell__dock-surface--queue"',
    );
    expect(source).toMatch(
      /\.shell__dock-surface--queue\s*\{[^}]*transform:\s*translateY\(var\(--ui-space-3\)\)/su,
    );
    expect(source).toMatch(
      /\.shell__dock-surface--queue\.shell__dock-surface--active\s*\{[^}]*transform:\s*translateY\(0\)/su,
    );
  });

  it('records Queue trigger-to-paint timing in development diagnostics', () => {
    expect(source).toContain('measureInteractionToNextPaint');
    expect(source).toContain('utawakui:right-dock:queue-toggle');
  });

  it('never turns either side panel into a floating layout or blocks the workspace', () => {
    expect(source).not.toContain('shell--dock-overlay');
    expect(source).not.toContain('shell__sidebar--overlay');
    expect(source).not.toContain('temporarySidebar');
    expect(source).not.toContain('shell__sidebar-backdrop');
    expect(source).not.toMatch(/\.shell__dock\s*\{[^}]*position:\s*absolute/su);
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

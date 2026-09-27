import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./StudioLibraryPrototypeView.vue', import.meta.url),
  'utf8',
);
const contextViewUrl = new URL(
  './StudioLibraryContextView.vue',
  import.meta.url,
);
const contextSource = existsSync(fileURLToPath(contextViewUrl))
  ? readFileSync(contextViewUrl, 'utf8')
  : '';
const visualSystemSource = readFileSync(
  new URL('./VisualSystemView.vue', import.meta.url),
  'utf8',
);
const setlistSource = readFileSync(
  new URL('./SetlistView.vue', import.meta.url),
  'utf8',
);
const appSource = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
const archiveFrameSource = readFileSync(
  new URL('../components/layout/AppArchiveFrame.vue', import.meta.url),
  'utf8',
);
const sidebarSource = readFileSync(
  new URL('../components/layout/AppPlaylistSidebar.vue', import.meta.url),
  'utf8',
);
const dossierSource = readFileSync(
  new URL('../components/playlists/StudioLibraryDossier.vue', import.meta.url),
  'utf8',
);
const playerBarSource = readFileSync(
  new URL('../components/playback/PlayerBar.vue', import.meta.url),
  'utf8',
);
const rightDockSource = readFileSync(
  new URL('../components/layout/AppRightDock.vue', import.meta.url),
  'utf8',
);
const topTabsSource = readFileSync(
  new URL('../components/layout/AppTopTabs.vue', import.meta.url),
  'utf8',
);

describe('StudioLibraryPrototypeView development integration', () => {
  it('projects the real library into a native dossier without an iframe', () => {
    expect(source).toContain('import { useLibrary }');
    expect(source).toContain('import { usePlaylists }');
    expect(source).toContain('import { usePlayer }');
    expect(source).toContain('createStudioLibraryPresentation');
    expect(source).toContain('<StudioLibraryDossier');
    expect(source).not.toContain('<iframe');
    expect(source).not.toContain('postMessage');
  });

  it('owns Candidate selection separately from queue and playback wiring', () => {
    expect(source).toContain('import { usePlaybackQueue }');
    expect(source).toContain('import { toPlayableTrack }');
    expect(source).toContain('const { state: playerState, playTrack }');
    expect(source).toContain('const { setQueue } = usePlaybackQueue()');
    expect(source).toContain('const selectedTrackId = shallowRef(null)');
    expect(source).toContain('function selectTrackFromDossier(track)');
    expect(source).toContain('function playTrackFromDossier(track, tracks)');
    expect(source).toContain('setQueue(tracks, track.id');
    expect(source).toContain('sourceName: presentation.value.title');
    expect(source).toContain('sourceId: selectedPlaylist.value?.id ?? null');
    expect(source).toContain('playTrack(toPlayableTrack(track))');
    expect(source).toContain(':selected-track-id="selectedTrackId"');
    expect(source).toContain('@select-track="selectTrackFromDossier"');
    expect(source).toContain('@activate-track="playTrackFromDossier"');
  });

  it('activates candidate tokens only for the development view lifetime', () => {
    const candidateTokenFile = ['tokens', 'v2.css'].join('-');
    expect(source).toContain(`import '../styles/${candidateTokenFile}';`);
    expect(source).toContain("root.dataset.uiSystem = 'v2'");
    expect(source).toContain("root.dataset.uiCandidateView = 'studio-library'");
    expect(source).toContain('delete root.dataset.uiSystem');
    expect(source).toContain('delete root.dataset.uiCandidateView');
    expect(source).toContain('onUnmounted');
    expect(setlistSource).not.toContain('tokens-v2.css');
  });

  it('keeps Candidate and Current as mutually exclusive live View panels', () => {
    expect(visualSystemSource).toContain("id: 'studio-library'");
    expect(visualSystemSource).toContain("id: 'setlist-current'");
    expect(visualSystemSource).toContain('Studio Library Candidate');
    expect(visualSystemSource).toContain('Setlist Current');
    expect(visualSystemSource).toContain('v-for="panel in PANELS"');
    expect(visualSystemSource).toContain(':hidden="mode !== panel.id"');
    expect(visualSystemSource).toContain('v-if="mode === panel.id"');
    expect(visualSystemSource).toContain(':is="panel.component"');
    expect(visualSystemSource).toContain('panel-id-prefix="visual-system"');
    expect(visualSystemSource).toContain('role="tabpanel"');
    expect(visualSystemSource).toContain(
      ':aria-labelledby="`visual-system-${panel.id}-tab`"',
    );
    expect(visualSystemSource).toMatch(
      /\.visual-system-view__body\[hidden\]\s*\{[^}]*display:\s*none;/su,
    );
  });

  it('lets the shell own the Candidate folder material without View CSS penetration', () => {
    expect(source).not.toContain('.app-tabs__folder--active');
    expect(source).not.toContain('.app-tabs__row::after');
    expect(topTabsSource).toContain(
      ":root[data-ui-system='v2'][data-ui-candidate-view='studio-library']",
    );
    expect(topTabsSource).toContain(
      'background: var(--ui-color-folder-primary)',
    );
  });

  it('lets internal content keep the Setlist workflow tab visibly selected', () => {
    expect(archiveFrameSource).toContain('tabActiveView');
    expect(archiveFrameSource).toContain(
      ':active-view="tabActiveView || activeView"',
    );
    expect(appSource).toContain('isStudioLibraryComparisonMode');
  });

  it('keeps real Sidebar collection changes inside the Visual System comparison view', () => {
    expect(sidebarSource).toContain("activeView.value === 'visual-system'");
    expect(sidebarSource).toContain('isStudioLibraryComparisonMode');
    expect(sidebarSource).toContain("setActiveView('setlist')");
  });

  it('keeps the primary page playlist-owned and projects playback context as a shell-main sibling', () => {
    expect(source).not.toContain('useStudioLibraryInspector');
    expect(source).not.toContain('StudioLibraryContextInspector');
    expect(contextSource).not.toContain('useStudioLibraryInspector');
    expect(contextSource).toContain('usePlaybackQueue');
    expect(contextSource).toContain('<StudioLibraryContextInspector');
    expect(contextSource).toContain("const emit = defineEmits(['close'])");
    expect(contextSource).toContain('@close="emit(\'close\')"');
    expect(contextSource).toContain(':current-track="currentTrack"');
    expect(contextSource).toContain(':queue-source-name="queueSourceName"');
    expect(contextSource).toContain(':upcoming-tracks="upcomingTracks"');
    expect(contextSource).not.toContain('createStudioLibraryPresentation');
    expect(contextSource).not.toContain('selectedPlaylist');
    expect(contextSource).not.toMatch(
      /collection-title|cover-url|can-collage|:facts=/u,
    );
    expect(appSource).toContain('internalContextDefinitions');
    expect(appSource).toContain('class="shell__workspace"');
    expect(appSource).toContain('class="shell__dock"');
    expect(appSource).toContain('<AppRightDock');
    expect(appSource).toContain(':is="activeContextView"');
    expect(appSource).toContain(
      '@close="closeDockSurface(RIGHT_DOCK_SURFACE_METADATA)"',
    );
    expect(appSource).not.toContain('#context');
    expect(archiveFrameSource).not.toContain('<slot name="context" />');
    expect(archiveFrameSource).not.toContain('app-archive-frame__context');
    expect(dossierSource).not.toContain('StudioLibraryMetadataRail');
  });

  it('keeps the compact context plane temporary while preserving a full-height collapsed rail', () => {
    expect(appSource).toContain('position: absolute');
    expect(appSource).toContain('@media (max-width: 70rem)');
    expect(archiveFrameSource).not.toContain('@media (max-width: 70rem)');
    expect(contextSource).toContain('StudioLibraryContextInspector');
    const inspectorSource = readFileSync(
      new URL(
        '../components/playlists/StudioLibraryContextInspector.vue',
        import.meta.url,
      ),
      'utf8',
    );
    expect(rightDockSource).toContain('.app-right-dock--collapsed');
    expect(rightDockSource).toContain('var(--ui-right-dock-rail-width)');
    expect(inspectorSource).not.toContain(
      '.studio-context-inspector--collapsed',
    );
    expect(inspectorSource).not.toContain('margin-block: auto');
  });

  it('toggles the external context from PlayerBar artwork only while that context exists', () => {
    expect(playerBarSource).toContain('PlayerBarArtwork');
    expect(playerBarSource).toContain("'artworkActivate'");
    expect(appSource).toContain(':artwork-expandable="activeContextAvailable"');
    expect(appSource).toContain(':artwork-expanded="metadataExpanded"');
    expect(appSource).toContain(':artwork-controls="RIGHT_DOCK_CONTENT_ID"');
    expect(appSource).toContain('@artwork-activate="toggleMetadataSurface"');
    expect(appSource).toContain('useAppRightDock');
    expect(appSource).not.toContain(
      "import { useStudioLibraryInspector } from './composables/useStudioLibraryInspector.js';",
    );
    expect(contextSource).not.toContain('defineExpose');
  });

  it('dismisses the temporary Inspector with Escape and returns focus to its opener', () => {
    expect(appSource).toContain("event.key !== 'Escape'");
    expect(appSource).toContain('document.activeElement');
    expect(appSource).toContain('returnFocusTarget');
    expect(appSource).toContain('closeTopDockSurface()');
    expect(appSource).toContain('nextTick');
    expect(appSource).toContain(
      "removeEventListener('keydown', handleRightDockKeydown)",
    );
    expect(contextSource).not.toContain("event.key !== 'Escape'");
  });

  it('keeps View selection protection narrow and leaves image fallback to reviewed components', () => {
    expect(visualSystemSource).toMatch(
      /\.visual-system-view__switch\s*\{[^}]*-webkit-user-select:\s*none;[^}]*user-select:\s*none;/su,
    );
    expect(source).not.toMatch(
      /\.studio-library-view\s*\{[^}]*user-select:\s*none;/su,
    );
    expect(source).not.toMatch(/@error|fetch\(|remote|retry-image/iu);
  });

  it('keeps short high-zoom viewports reachable through the existing page scroll owner', () => {
    expect(visualSystemSource).toMatch(
      /@media\s*\(max-height:\s*30rem\)[\s\S]*?\.visual-system-view\s*\{[^}]*min-height:\s*30rem;/u,
    );
    expect(visualSystemSource).not.toMatch(
      /\.visual-system-view__body\s*\{[^}]*overflow-y:\s*(?:auto|scroll)/su,
    );
  });
});

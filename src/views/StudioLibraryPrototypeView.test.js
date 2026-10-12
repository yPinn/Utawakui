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
const libraryBrowseSource = readFileSync(
  new URL('../components/library/LibraryBrowseContent.vue', import.meta.url),
  'utf8',
);
const appSource = readFileSync(new URL('../App.vue', import.meta.url), 'utf8');
const folderLayoutSource = readFileSync(
  new URL('../components/layout/AppFolderLayout.vue', import.meta.url),
  'utf8',
);
const sidebarSource = readFileSync(
  new URL('../components/layout/AppPlaylistSidebar.vue', import.meta.url),
  'utf8',
);
const dossierSource = readFileSync(
  new URL(
    '../components/demo/studio-library/StudioLibraryDossier.vue',
    import.meta.url,
  ),
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
describe('StudioLibraryPrototypeView development integration', () => {
  it('keeps Studio Library specimens under the development-only demo owner', () => {
    for (const filename of [
      'StudioLibraryDossier.vue',
      'StudioLibraryDossierHeader.vue',
      'StudioLibraryTrackTable.vue',
    ]) {
      expect(
        existsSync(
          fileURLToPath(
            new URL(
              `../components/demo/studio-library/${filename}`,
              import.meta.url,
            ),
          ),
        ),
      ).toBe(true);
      expect(
        existsSync(
          fileURLToPath(
            new URL(`../components/playlists/${filename}`, import.meta.url),
          ),
        ),
      ).toBe(false);
    }
  });

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

  it('inherits candidate tokens from the registered Visual Review surface', () => {
    expect(source).not.toContain('tokens-v2.css');
    expect(source).not.toContain('dataset.uiSystem');
    expect(source).not.toContain('dataset.uiCandidateView');
    expect(visualSystemSource).toContain(
      "registeredSurfaceAttributes('visual-review')",
    );
    expect(appSource).toContain('<AppFolderLayout');
    expect(appSource).not.toContain('visualReviewCandidateView');
    expect(libraryBrowseSource).not.toContain('tokens-v2.css');
  });

  it('separates the final board, live Candidate, and regression catalogue', () => {
    expect(visualSystemSource).toContain(
      "import DemoFinalDecisionBoard from '../components/demo/DemoFinalDecisionBoard.vue';",
    );
    expect(visualSystemSource).toContain("id: 'final-board'");
    expect(visualSystemSource).toContain('最終決策板');
    expect(visualSystemSource).toContain("id: 'studio-library'");
    expect(visualSystemSource).toContain('Studio Library Candidate');
    expect(visualSystemSource).toContain('元件回歸目錄');
    expect(visualSystemSource).not.toContain('import SetlistView');
    expect(visualSystemSource).not.toContain("id: 'setlist-current'");
    expect(visualSystemSource).not.toContain('Setlist Current');
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
    expect(folderLayoutSource).toContain(
      'background: var(--ui-folder-layout-background)',
    );
    expect(folderLayoutSource).not.toContain('data-ui-candidate-view');
  });

  it('lets internal content keep the Setlist workflow tab visibly selected', () => {
    expect(appSource).toContain('const folderActiveDestination');
    expect(appSource).toContain(
      ':active-destination="folderActiveDestination"',
    );
    expect(appSource).toContain('isStudioLibraryMode');
  });

  it('keeps real Sidebar collection changes inside the Visual System comparison view', () => {
    expect(sidebarSource).toContain("activeView.value === 'visual-system'");
    expect(sidebarSource).toContain('isStudioLibraryMode');
    expect(sidebarSource).toContain('openLibraryContent()');
  });

  it('keeps the primary page playlist-owned and projects playback context as a shell-main sibling', () => {
    expect(source).not.toContain('useStudioLibraryInspector');
    expect(source).not.toContain('StudioLibraryContextInspector');
    expect(contextSource).not.toContain('useStudioLibraryInspector');
    expect(contextSource).toContain('usePlaybackQueue');
    expect(contextSource).toContain('<TrackContextPanel');
    expect(contextSource).toContain(
      "const emit = defineEmits(['collapse', 'openQueue']);",
    );
    expect(contextSource).toContain('@collapse="emit(\'collapse\')"');
    expect(contextSource).toContain(':current-track="currentTrack"');
    expect(contextSource).toContain(':queue-source-name="queueSourceName"');
    expect(contextSource).toContain('const queueSourceDestination = computed');
    expect(contextSource).toContain('const queueSourceLinkLabel = computed');
    expect(contextSource).toContain('function navigateToQueueSource()');
    expect(contextSource).toContain(
      ':source-navigable="Boolean(queueSourceDestination)"',
    );
    expect(contextSource).toContain(
      ':source-link-label="queueSourceLinkLabel"',
    );
    expect(contextSource).toContain('@navigate-source="navigateToQueueSource"');
    expect(contextSource).not.toContain('activeCollection');
    expect(contextSource).not.toContain(':collection="');
    expect(contextSource).toContain(
      "import { useAppView } from '../composables/useAppView.js';",
    );
    expect(contextSource).toContain('openLyricsAuthoring()');
    expect(contextSource).toContain('@open-lyrics="openLyrics"');
    expect(contextSource).toContain(
      "import { useCurrentTrackLyricsPreview } from '../composables/useCurrentTrackLyricsPreview.js';",
    );
    expect(contextSource).toContain('useCurrentTrackLyricsPreview({');
    expect(contextSource).toContain('document: lyricsDocument');
    expect(contextSource).toContain('isLoading: lyricsLoading');
    expect(contextSource).toContain('error: lyricsError');
    expect(contextSource).toContain('currentTrack: currentLyricsTrack');
    expect(contextSource).not.toContain('selectedLyricsTrack');
    expect(contextSource).not.toContain('selectedLyricsSource');
    expect(contextSource).toContain(
      "import { useArtistIndex } from '../composables/useArtistIndex.js';",
    );
    expect(contextSource).toContain('ensureArtistIndex();');
    expect(contextSource).toContain('@open-artist="openArtist"');
    expect(contextSource).toContain(
      'jumpToArtist(artistSummary.value.artistId)',
    );
    expect(contextSource).toContain(
      "const emit = defineEmits(['collapse', 'openQueue']);",
    );
    expect(contextSource).toContain('@open-queue="emit(\'openQueue\')"');
    expect(contextSource).toContain(':upcoming-tracks="upcomingTracks"');
    expect(contextSource).toContain(
      "import { toPlayableTrack } from '../utils/playableTrack.js';",
    );
    expect(contextSource).toContain('queuedTracks');
    expect(contextSource).toContain('setCurrentTrack');
    expect(contextSource).toContain('playTrack');
    expect(contextSource).toContain('toggle: togglePlayerPlayback');
    expect(contextSource).toContain('const queuedTrackIds = computed');
    expect(contextSource).toContain(
      'function toggleUpcomingTrackPlayback(track)',
    );
    expect(contextSource).toContain('playerState.track?.id === track.id');
    expect(contextSource).toContain('setCurrentTrack(track.id, { source })');
    expect(contextSource).toContain('playTrack(toPlayableTrack(track))');
    expect(contextSource).toContain(':queued-track-ids="queuedTrackIds"');
    expect(contextSource).toContain(
      ':playing-track-id="playerState.track?.id ?? \'\'"',
    );
    expect(contextSource).toContain(':player-playing="playerState.isPlaying"');
    expect(contextSource).toContain(
      '@toggle-queue-track-playback="toggleUpcomingTrackPlayback"',
    );
    expect(contextSource).not.toContain('createStudioLibraryPresentation');
    expect(contextSource).not.toContain('selectedPlaylist');
    expect(contextSource).not.toMatch(
      /collection-title|cover-url|can-collage|:facts=/u,
    );
    expect(appSource).toContain('PlaybackInfoContextView');
    expect(appSource).not.toContain('internalContextDefinitions');
    expect(appSource).toContain('class="shell__workspace"');
    expect(appSource).toContain('class="shell__dock"');
    expect(appSource).toContain('<AppRightDock');
    expect(appSource).toContain(':is="PlaybackInfoContextView"');
    expect(appSource).toContain('@collapse="collapseRightDock"');
    expect(appSource).not.toContain('#context');
    expect(folderLayoutSource).not.toContain('<slot name="context" />');
    expect(folderLayoutSource).not.toContain('app-archive-frame__context');
    expect(dossierSource).not.toContain('StudioLibraryMetadataRail');
  });

  it('keeps the compact context plane temporary without a full-height collapsed rail', () => {
    expect(appSource).toContain('position: absolute');
    expect(appSource).toContain('@media (max-width: 70rem)');
    expect(folderLayoutSource).not.toContain('@media (max-width: 70rem)');
    expect(contextSource).toContain('TrackContextPanel');
    const inspectorSource = readFileSync(
      new URL(
        '../components/playback/context/TrackContextPanel.vue',
        import.meta.url,
      ),
      'utf8',
    );
    expect(rightDockSource).toContain('.app-right-dock--collapsed');
    expect(rightDockSource).toContain('var(--ui-right-dock-rail-width)');
    expect(rightDockSource).toMatch(
      /\.app-right-dock--collapsed\s*\{[^}]*height:\s*calc\(var\(--ui-right-dock-rail-width\) \+ var\(--ui-space-1\)\);/su,
    );
    expect(rightDockSource).not.toMatch(
      /\.app-right-dock\s*\{[^}]*height:\s*100%;/su,
    );
    expect(appSource).toContain("'shell__dock--collapsed': !rightDockExpanded");
    expect(inspectorSource).not.toContain(
      '.studio-context-inspector--collapsed',
    );
    expect(inspectorSource).not.toContain('margin-block: auto');
  });

  it('toggles playback info from PlayerBar artwork only while track data exists', () => {
    expect(playerBarSource).toContain('PlayerBarArtwork');
    expect(playerBarSource).toContain("'artworkActivate'");
    expect(appSource).toContain(':artwork-expandable="playbackInfoAvailable"');
    expect(appSource).toContain(':artwork-expanded="metadataExpanded"');
    expect(appSource).toContain(':artwork-controls="RIGHT_DOCK_CONTENT_ID"');
    expect(appSource).toContain('@artwork-activate="toggleMetadataSurface"');
    expect(appSource).toContain('if (!playbackInfoAvailable.value) return;');
    expect(appSource).toContain('useAppRightDock');
    expect(appSource).not.toContain(
      "import { useStudioLibraryInspector } from './composables/useStudioLibraryInspector.js';",
    );
    expect(contextSource).not.toContain('defineExpose');
  });

  it('folds the temporary Inspector with Escape and returns focus to its disclosure', () => {
    expect(appSource).toContain("event.key !== 'Escape'");
    expect(appSource).toContain('document.activeElement');
    expect(appSource).toContain('returnFocusTarget');
    expect(appSource).toContain('collapseRightDock()');
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

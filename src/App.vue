<script setup>
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUnmounted,
  provide,
  useTemplateRef,
  watch,
} from 'vue';
import AppFolderLayout from './components/layout/AppFolderLayout.vue';
import AppFolderPage from './components/layout/AppFolderPage.vue';
import { INTERNAL_TOOL_ROUTES } from './constants/internalTools.js';
import AppPlaylistSidebar from './components/layout/AppPlaylistSidebar.vue';
import AppRightDock from './components/layout/AppRightDock.vue';
import AppSurfaceBoundary from './components/layout/AppSurfaceBoundary.vue';
import AppTitleBar from './components/layout/AppTitleBar.vue';
import AppFeatureNoticeModal from './components/layout/AppFeatureNoticeModal.vue';
import AppAnnouncementModal from './components/layout/AppAnnouncementModal.vue';
import AppNotificationHost from './components/layout/AppNotificationHost.vue';
import AutoErrorReportModal from './components/settings/AutoErrorReportModal.vue';
import FeedbackReportModal from './components/settings/FeedbackReportModal.vue';
import ObsSessionExportModal from './components/settings/ObsSessionExportModal.vue';
import AppConfirmationModal from './components/layout/AppConfirmationModal.vue';
import WindowCloseDecisionModal from './components/layout/WindowCloseDecisionModal.vue';
import WorkVersionEditor from './components/library/WorkVersionEditor.vue';
import ReleaseInfoEditor from './components/library/ReleaseInfoEditor.vue';
import ReleaseCatalogModal from './components/library/ReleaseCatalogModal.vue';
import { useBgmSession } from './composables/useBgmSession.js';
import { usePlayerPractice } from './composables/usePlayerPractice.js';
import { usePerformanceHistoryObserver } from './composables/usePerformanceHistoryObserver.js';
import PlayerBar from './components/playback/PlayerBar.vue';
import QueuePanel from './components/queue/QueuePanel.vue';
import LibraryPage from './pages/LibraryPage.vue';
import { useAppView } from './composables/useAppView.js';
import { usePlaybackQueue } from './composables/usePlaybackQueue.js';
import { usePlayer } from './composables/usePlayer.js';
import { useTrackPreview } from './composables/useTrackPreview.js';
import { tagMediaActivity } from './utils/tagMediaActivity.js';
import { useTaskbarControls } from './composables/useTaskbarControls.js';
import { useWindowTitle } from './composables/useWindowTitle.js';
import { useMediaSession } from './composables/useMediaSession.js';
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts.js';
import { useKeyboardShortcutSettings } from './composables/useKeyboardShortcutSettings.js';
import { useNavigationHistory } from './composables/useNavigationHistory.js';
import { useNavigationInput } from './composables/useNavigationInput.js';
import { useFeedbackReport } from './composables/useFeedbackReport.js';
import { provideNoticeReporter } from './components/ui/noticeReporter.js';
import { useShellLayout } from './composables/useShellLayout.js';
import {
  usePanelView,
  usePanelViewTarget,
} from './composables/usePanelView.js';
import { useTheme } from './composables/useTheme.js';
import { useUiDensity } from './composables/useUiDensity.js';
import { useAudioOutput } from './composables/useAudioOutput.js';
import { useAudioPreferences } from './composables/useAudioPreferences.js';
import { useOutputRuntime } from './composables/useOutputRuntime.js';
import { usePerformerSelfView } from './composables/usePerformerSelfView.js';
import { useAppUpdate } from './composables/useAppUpdate.js';
import { useAppAnnouncement } from './composables/useAppAnnouncement.js';
import { useWindowCloseDecision } from './composables/useWindowCloseDecision.js';
import { useTrayNavigation } from './composables/useTrayNavigation.js';
import { usePlaybackHistory } from './composables/usePlaybackHistory.js';
import { usePlaybackResume } from './composables/usePlaybackResume.js';
import { usePreparationActivity } from './composables/usePreparationActivity.js';
import { useSeparationQueue } from './composables/useSeparationQueue.js';
import { SEPARATION_QUEUE_KEY } from './composables/useSeparationQueueContext.js';
import {
  RIGHT_DOCK_SURFACE_METADATA,
  RIGHT_DOCK_SURFACE_QUEUE,
  RIGHT_DOCK_SURFACE_PREPARATION,
  useAppRightDock,
} from './composables/useAppRightDock.js';
import { useAppRightDockWidth } from './composables/useAppRightDockWidth.js';
import { usePlaybackDockDisplay } from './composables/usePlaybackDockDisplay.js';
import { OUTPUT_RUNTIME_KEY } from './composables/useOutputRuntimeContext.js';
import { recordRendererMilestone } from './utils/startupTrace.js';
import { prefetchWhenIdle } from './utils/idlePrefetch.js';
import { measureInteractionToNextPaint } from './utils/interactionPerformance.js';
import { hasOpenTransientOverlay } from './utils/transientOverlay.js';
import { provideUiOverlayHost } from './composables/useUiOverlayHost.js';
import { registeredOverlayHostAttributes } from './utils/rendererSurfaceRegistry.js';
import { focusAppDestinationTrigger } from './utils/appDestinationFocus.js';
import { preparationActivityIndicator } from './components/preparation/preparationActivityPresentation.js';

provideUiOverlayHost('app-shell');
const appOverlayHostAttributes = registeredOverlayHostAttributes('app-shell');

// Library is the only initial view. Keep inactive workflows out of Vite's first
// renderer graph so a new dev server can show the working shell immediately.
const loadDisplayPage = () => import('./pages/DisplayPage.vue');
const loadPerformancePage = () => import('./pages/PerformancePage.vue');
const loadSettingsPage = () => import('./pages/SettingsPage.vue');
const DisplayPage = defineAsyncComponent(loadDisplayPage);
const PerformancePage = defineAsyncComponent(loadPerformancePage);
const SettingsPage = defineAsyncComponent(loadSettingsPage);
const PlaybackInfoContextView = defineAsyncComponent(
  () => import('./views/StudioLibraryContextView.vue'),
);
const PreparationDockPanel = defineAsyncComponent(
  () => import('./components/preparation/PreparationDockPanel.vue'),
);

// These workbenches are development aids, not user-facing product pages.
// Keeping their imports inside a compile-time DEV branch lets Vite omit the
// modules entirely from production builds instead of merely hiding navigation.
const internalWorkbenchesEnabled = import.meta.env.DEV;
const internalViews = internalWorkbenchesEnabled
  ? {
      'microphone-research': defineAsyncComponent(
        () => import('./views/MicrophoneResearchView.vue'),
      ),
      'music-analysis': defineAsyncComponent(
        () => import('./views/MusicAnalysisView.vue'),
      ),
      'diagnostics-workbench': defineAsyncComponent(
        () => import('./views/DiagnosticsWorkbenchView.vue'),
      ),
      'lyrics-provider-review': defineAsyncComponent(
        () => import('./views/LyricsProviderReviewView.vue'),
      ),
      // The Visual System is a development-only component catalogue. Adopted
      // product pages are not retained here as alternate implementations.
      'visual-system': defineAsyncComponent(
        () => import('./views/VisualSystemView.vue'),
      ),
    }
  : {};
// Ordered by current workflow/usage priority: Music Analysis is the most
// active dev-tool area right now, Diagnostics/Lyrics Provider Review are
// established support workflows, and the Visual System catalogue sits last.
const internalViewShortcuts = internalWorkbenchesEnabled
  ? {
      f5: 'music-analysis',
      f6: 'diagnostics-workbench',
      f7: 'lyrics-provider-review',
      f8: 'visual-system',
    }
  : {};

// Long-lived app hooks; each composable owns its cleanup.
useTaskbarControls();
useWindowTitle();
useMediaSession();
useTheme();
useUiDensity();
const closeDecision = useWindowCloseDecision();
const feedbackReport = useFeedbackReport();
// Every error notice in the main window offers a prefilled bug report;
// feedback's own failures are excluded so a report never reports itself.
provideNoticeReporter({
  label: '回報這個問題',
  canReport: (notice) =>
    notice.severity === 'error' && notice.source !== 'feedback',
  report: (notice) =>
    feedbackReport.openReport({ kind: 'bug', errorRecord: notice }),
});
const trayNavigation = useTrayNavigation();
const playbackHistory = usePlaybackHistory();
const performanceHistoryObserver = usePerformanceHistoryObserver();
const playbackResume = usePlaybackResume();
const audioPreferences = useAudioPreferences();
const keyboardShortcutSettings = useKeyboardShortcutSettings();
void keyboardShortcutSettings.initialize();
audioPreferences.initialize();
void Promise.allSettled([
  playbackResume.initialize(),
  playbackHistory.initialize(),
]);
onUnmounted(() => {
  closeDecision.dispose();
  trayNavigation.dispose();
  playbackResume.dispose();
  playbackHistory.dispose();
  performanceHistoryObserver.dispose();
  void audioPreferences.dispose();
  keyboardShortcutSettings.dispose();
});
// Validate and stage the persisted capture device before playback. The capture
// AudioContext itself stays closed until the first explicit play action.
useAudioOutput().restoreInitialDevice();
const outputRuntime = useOutputRuntime();
provide(OUTPUT_RUNTIME_KEY, outputRuntime);
onMounted(() => {
  recordRendererMilestone('interactive-shell');
  outputRuntime.initialize();
  // After the shell settles, so the first visit to each page skips its parse.
  prefetchWhenIdle([loadSettingsPage, loadDisplayPage, loadPerformancePage]);
});
const performerView = usePerformerSelfView();
performerView.initialize();

// Root-level so the passive "update available" tab marker reflects the
// main-process startup check even before Settings is ever opened. The
// subscription is idempotent — SettingsView's own useAppUpdate() call is
// unaffected.
const { updateReady: appUpdateReady, refreshAppUpdateStatus } = useAppUpdate();
onMounted(refreshAppUpdateStatus);

// Same root-level reasoning as the update-ready marker above: the "what's
// new" modal must be able to show up no matter which view the user lands
// on first, not just when they happen to open Settings.
const announcement = useAppAnnouncement();
onMounted(announcement.initialize);

const rightDock = useAppRightDock();
const rightDockExpanded = computed(
  () => rightDock.isExpanded.value && Boolean(rightDock.topSurface.value),
);
const shellRef = useTemplateRef('shell');
const {
  layout: shellGeometry,
  sidebarExpanded,
  toggleSidebar,
} = useShellLayout(shellRef, rightDockExpanded);
const { width: rightDockWidth } = useAppRightDockWidth();
usePlaybackDockDisplay();
const preparationActivity = usePreparationActivity();
const separationQueue = useSeparationQueue();
provide(SEPARATION_QUEUE_KEY, separationQueue);
onMounted(separationQueue.initialize);
onUnmounted(separationQueue.dispose);
const { state: playerState } = usePlayer();
const { currentTrack: queueCurrentTrack } = usePlaybackQueue();
const RIGHT_DOCK_CONTENT_ID = 'app-right-dock-content';
// Audio authority outlives the session page and its Dock projection.
const bgmSession = useBgmSession();
usePlayerPractice();
const tagPreview = useTrackPreview();
const reportTagActivity = () =>
  window.Utawakui?.reportLibraryTagActivity?.({
    trackIds: tagMediaActivity({
      player: playerState,
      bgm: bgmSession.deckState,
      bgmTrackIds: bgmSession.sourceTrackIds.value,
      preview: tagPreview.state,
    }),
  })?.catch(() => {});
watch(
  () =>
    tagMediaActivity({
      player: playerState,
      bgm: bgmSession.deckState,
      bgmTrackIds: bgmSession.sourceTrackIds.value,
      preview: tagPreview.state,
    }).join('\n'),
  reportTagActivity,
  { immediate: true, flush: 'sync' },
);
const disposeTagActivityScope =
  window.Utawakui?.onReleaseOrganizationChanged?.(reportTagActivity);
onUnmounted(() => disposeTagActivityScope?.());
onMounted(bgmSession.initialize);

// No router: the Electron shell has fixed sections and no deep links.
const views = {
  library: LibraryPage,
  performance: PerformancePage,
  display: DisplayPage,
  settings: SettingsPage,
  ...internalViews,
};

// Singleton (see useAppView.js) so deeper components can switch tabs too.
const {
  activeView,
  isSettingsView,
  setActiveView,
  openSettings,
  returnFromSettings,
} = useAppView();
// Starts recording navigation before any destination change (ADR 0025).
const navigationHistory = useNavigationHistory();
useNavigationInput();

function leaveSettings() {
  if (!navigationHistory.leaveSettings()) returnFromSettings();
  nextTick(() => {
    document.querySelector('[data-app-settings-trigger]')?.focus?.();
  });
}

function toggleSettings() {
  if (isSettingsView.value) {
    leaveSettings();
    return;
  }
  openSettings();
  nextTick(() => focusAppDestinationTrigger('settings'));
}
// Playback Info belongs to the persistent player/queue context, not the
// current workspace page. The audio-backed player remains authoritative once
// playback begins; Queue supplies the prepared track before that handoff.
const playbackInfoAvailable = computed(() =>
  Boolean(playerState.track ?? queueCurrentTrack.value),
);
const metadataSurfaceActive = computed(
  () => rightDock.topSurface.value === RIGHT_DOCK_SURFACE_METADATA,
);
const queueSurfaceActive = computed(
  () => rightDock.topSurface.value === RIGHT_DOCK_SURFACE_QUEUE,
);
const preparationSurfaceActive = computed(
  () => rightDock.topSurface.value === RIGHT_DOCK_SURFACE_PREPARATION,
);
const metadataExpanded = computed(
  () => rightDock.isExpanded.value && metadataSurfaceActive.value,
);
const queueExpanded = computed(
  () => rightDock.isExpanded.value && queueSurfaceActive.value,
);
const preparationExpanded = computed(
  () => rightDock.isExpanded.value && preparationSurfaceActive.value,
);
const preparationIndicator = computed(() =>
  preparationActivityIndicator({
    separationQueue: separationQueue.queue.value,
    providerImport: preparationActivity.providerImport.value,
    localImport: preparationActivity.localImport.value,
  }),
);
const restorableDockSurface = computed(
  () =>
    rightDock.topSurface.value ??
    rightDock.lastSurface.value ??
    (playbackInfoAvailable.value
      ? RIGHT_DOCK_SURFACE_METADATA
      : RIGHT_DOCK_SURFACE_QUEUE),
);
const rightDockLabel = computed(() => {
  if (restorableDockSurface.value === RIGHT_DOCK_SURFACE_PREPARATION)
    return '曲目準備';
  if (restorableDockSurface.value === RIGHT_DOCK_SURFACE_QUEUE)
    return '播放佇列';
  return '播放資訊';
});
const rightDockExpandLabel = computed(() => `展開${rightDockLabel.value}`);

let returnFocusTarget = null;

function rememberRightDockTrigger(target = document.activeElement) {
  returnFocusTarget = target;
}

function restoreRightDockFocus() {
  const requestedTarget = returnFocusTarget;
  returnFocusTarget = null;
  nextTick(() => {
    const fallbackTarget = document.querySelector(
      '.app-right-dock__expand[aria-expanded="false"]',
    );
    const requestedTargetBecameHidden =
      !requestedTarget ||
      requestedTarget.isConnected === false ||
      requestedTarget.closest?.('[inert]');
    const target = requestedTargetBecameHidden
      ? fallbackTarget
      : requestedTarget;
    target?.focus?.();
  });
}

function toggleMetadataSurface() {
  if (!playbackInfoAvailable.value) return;
  rememberRightDockTrigger();
  rightDock.toggleSurface(RIGHT_DOCK_SURFACE_METADATA);
}

function toggleQueueSurface() {
  rememberRightDockTrigger();
  measureInteractionToNextPaint('utawakui:right-dock:queue-toggle', () =>
    rightDock.toggleSurface(RIGHT_DOCK_SURFACE_QUEUE),
  );
}

function togglePreparationSurface() {
  rememberRightDockTrigger();
  rightDock.cyclePreparation();
}

function closeDockSurface(surface) {
  rememberRightDockTrigger();
  rightDock.hideSurface(surface);
}

function collapseRightDock() {
  returnFocusTarget = null;
  rightDock.setExpanded(false);
}

function expandRightDock() {
  rememberRightDockTrigger();
  if (rightDock.hasSurfaces.value) {
    rightDock.setExpanded(true);
  } else {
    rightDock.showSurface(restorableDockSurface.value);
  }
}

function toggleRightDockExpanded() {
  if (rightDockExpanded.value) {
    collapseRightDock();
  } else {
    expandRightDock();
  }
}

function handleRightDockKeydown(event) {
  if (
    event.key !== 'Escape' ||
    event.defaultPrevented ||
    !rightDockExpanded.value ||
    panelView.maximizedId.value ||
    hasOpenTransientOverlay()
  ) {
    return;
  }

  event.preventDefault();
  collapseRightDock();
}

watch(
  playbackInfoAvailable,
  (available) => {
    if (!available) rightDock.forgetSurface(RIGHT_DOCK_SURFACE_METADATA);
  },
  { immediate: true },
);

watch(rightDock.isExpanded, (expanded, wasExpanded) => {
  if (!expanded && wasExpanded) restoreRightDockFocus();
});

onMounted(() => document.addEventListener('keydown', handleRightDockKeydown));
onUnmounted(() =>
  document.removeEventListener('keydown', handleRightDockKeydown),
);

const pageComposedFolderViews = new Set([
  ...INTERNAL_TOOL_ROUTES.map((tool) => tool.route),
  'library',
  'performance',
  'display',
  'settings',
  'visual-system',
]);
const activeViewOwnsFolderPage = computed(() =>
  pageComposedFolderViews.has(activeView.value),
);

const panelView = usePanelView();
const workspacePanel = useTemplateRef('workspacePanel');
const dockPanel = useTemplateRef('dockPanel');
usePanelViewTarget({
  id: 'workspace',
  element: workspacePanel,
  label: '主工作區',
  context: activeView,
});
usePanelViewTarget({
  id: 'dock',
  element: dockPanel,
  label: rightDockLabel,
  enabled: rightDockExpanded,
  context: restorableDockSurface,
});
watch([activeView, rightDockExpanded, restorableDockSurface], () =>
  panelView.restore({ focus: false }),
);
useKeyboardShortcuts({
  onPanelShortcut: panelView.handleKeydown,
  internalViewShortcuts,
  shortcutConfiguration: keyboardShortcutSettings.configuration,
  getShortcutContext: () => ({
    recording: keyboardShortcutSettings.isRecording.value,
    globalBlocked: !keyboardShortcutSettings.state.loaded,
  }),
});
</script>

<template>
  <div
    ref="shell"
    class="shell"
    :style="{
      '--ui-shell-navigation-inline-size': `${shellGeometry.sidebarWidth}px`,
      '--ui-right-dock-width': `${rightDockWidth}px`,
      '--ui-shell-dock-inline-size': `${shellGeometry.dockBayWidth}px`,
    }"
  >
    <div v-bind="appOverlayHostAttributes" class="ui-overlay-host" />
    <AppTitleBar
      class="shell__titlebar"
      :preparation-active="preparationExpanded"
      :preparation-action-label="rightDock.preparationActionLabel.value"
      :preparation-controls="RIGHT_DOCK_CONTENT_ID"
      :preparation-status="preparationIndicator.state"
      :preparation-status-label="preparationIndicator.label"
      :performer-active="performerView.state.open"
      :performer-busy="performerView.state.isOpening"
      :settings-active="isSettingsView"
      :update-available="appUpdateReady"
      @toggle-preparation="togglePreparationSurface"
      @toggle-performer="performerView.toggle"
      @toggle-settings="toggleSettings"
    />
    <div class="shell__sidebar">
      <AppPlaylistSidebar
        :expanded="sidebarExpanded"
        @toggle-expanded="toggleSidebar"
      />
    </div>
    <main
      class="shell__main shell__main--with-dock"
      :data-panel-view="panelView.maximizedId.value"
    >
      <div
        ref="workspacePanel"
        class="shell__workspace"
        tabindex="-1"
        :inert="panelView.maximizedId.value === 'dock'"
      >
        <AppSurfaceBoundary surface-id="app-folder">
          <AppFolderLayout
            :active-destination="activeView"
            @navigate="setActiveView"
          >
            <component
              :is="views[activeView]"
              v-if="activeViewOwnsFolderPage"
            />
            <AppFolderPage v-else mode="workspace">
              <component :is="views[activeView]" />
            </AppFolderPage>
          </AppFolderLayout>
        </AppSurfaceBoundary>
      </div>

      <div
        ref="dockPanel"
        class="shell__dock"
        tabindex="-1"
        :inert="panelView.maximizedId.value === 'workspace'"
        :class="{
          'shell__dock--collapsed': !rightDockExpanded,
        }"
      >
        <AppRightDock
          :maximized="panelView.maximizedId.value === 'dock'"
          :expanded="rightDockExpanded"
          :performance="
            queueSurfaceActive && rightDock.queueVariant.value === 'arrangement'
          "
          :label="rightDockLabel"
          :expand-label="rightDockExpandLabel"
          :content-id="RIGHT_DOCK_CONTENT_ID"
          :motion-origin="
            restorableDockSurface === RIGHT_DOCK_SURFACE_QUEUE
              ? 'bottom'
              : 'end'
          "
          @expand="expandRightDock"
          @toggle-expanded="toggleRightDockExpanded"
        >
          <component
            :is="PlaybackInfoContextView"
            v-if="
              playbackInfoAvailable &&
              rightDock.mountedSurfaces[RIGHT_DOCK_SURFACE_METADATA]
            "
            class="shell__dock-surface"
            :class="{
              'shell__dock-surface--active': metadataSurfaceActive,
            }"
            :aria-hidden="!metadataExpanded"
            :inert="!metadataExpanded"
            @collapse="collapseRightDock"
            @open-queue="toggleQueueSurface"
          />
          <QueuePanel
            v-if="rightDock.mountedSurfaces[RIGHT_DOCK_SURFACE_QUEUE]"
            class="shell__dock-surface shell__dock-surface--queue"
            :class="{
              'shell__dock-surface--active': queueExpanded,
            }"
            :active="queueExpanded"
            :aria-hidden="!queueExpanded"
            :inert="!queueExpanded"
            @collapse="collapseRightDock"
            @close="closeDockSurface(RIGHT_DOCK_SURFACE_QUEUE)"
          />
          <PreparationDockPanel
            v-if="rightDock.mountedSurfaces[RIGHT_DOCK_SURFACE_PREPARATION]"
            class="shell__dock-surface"
            :class="{
              'shell__dock-surface--active': preparationSurfaceActive,
            }"
            :active="preparationExpanded"
            :active-preparation-tab="rightDock.preparationTab.value"
            :separation-controller="separationQueue"
            :aria-hidden="!preparationExpanded"
            :inert="!preparationExpanded"
            @update:active-preparation-tab="rightDock.selectPreparationTab"
            @collapse="collapseRightDock"
          />
        </AppRightDock>
      </div>
    </main>
    <PlayerBar
      class="shell__player"
      :artwork-expandable="playbackInfoAvailable"
      :artwork-expanded="metadataExpanded"
      :artwork-controls="RIGHT_DOCK_CONTENT_ID"
      :queue-expanded="queueExpanded"
      :queue-controls="RIGHT_DOCK_CONTENT_ID"
      @artwork-activate="toggleMetadataSurface"
      @queue-activate="toggleQueueSurface"
    />
    <AppNotificationHost />
    <FeedbackReportModal />
    <AutoErrorReportModal />
    <ObsSessionExportModal />
    <AppFeatureNoticeModal />
    <AppAnnouncementModal />
    <AppConfirmationModal />
    <WorkVersionEditor />
    <ReleaseInfoEditor />
    <ReleaseCatalogModal />
    <WindowCloseDecisionModal
      :open="closeDecision.state.open"
      :remember="closeDecision.state.remember"
      :is-responding="closeDecision.state.isResponding"
      :pending-action="closeDecision.state.pendingAction"
      :active-work="closeDecision.state.activeWork"
      :presentation="closeDecision.state.presentation"
      :error-title="closeDecision.state.errorTitle"
      :error="closeDecision.state.error"
      @close="closeDecision.close"
      @decision="closeDecision.respond"
      @update:remember="closeDecision.setRemember"
    />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-areas:
    'titlebar titlebar'
    'sidebar  main'
    'player   player';
  /* The Shell allocator owns both fixed navigation states and Dock fit. */
  grid-template-columns:
    calc(
      clamp(
          var(--ui-shell-navigation-min-inline-size),
          var(--ui-shell-navigation-inline-size),
          var(--ui-shell-navigation-max-inline-size)
        ) +
        var(--ui-shell-edge-inset-inline)
    )
    1fr;
  grid-template-rows: var(--ui-window-titlebar-block-size) 1fr auto;
  height: 100%;
  /* Prevent 1fr content from forcing the fixed shell wider than viewport. */
  min-width: 0;
  background: var(--ui-color-shell-substrate);
}

.shell__titlebar {
  grid-area: titlebar;
}

.shell__sidebar {
  grid-area: sidebar;
  /* A plain, unstyled wrapper, like .shell__main owning the Folder workspace
     below — AppPlaylistSidebar.vue's own root paints --ui-color-surface
     across its full box, so padding placed directly on it (via class
     fallthrough) just got filled by that same background instead of
     revealing the canvas behind it. */
  /* Same fix as .shell__main below — without this, a grid item's default
     min-height:auto refuses to shrink below its content's natural height,
     so a long playlist list stretches the whole 1fr row taller than the
     viewport and pushes the player bar off the bottom of the window,
     requiring the page itself to scroll to reach it. AppPlaylistSidebar.vue
     already owns its own internal scroll — this just lets it actually be
     bounded to the row instead of forcing the row to grow around it. */
  min-height: 0;
  /* The Sidebar is its own inset plane rather than a continuation of the
     tabbed dossier baseline. The shared shell-edge token keeps its block
     perimeter aligned with Right Dock in production and Token v2. */
  padding-block: var(--ui-shell-content-inset-block);
  /* Matches .shell__main's own padding-right below — both are the shell's
     outermost edge insets (window edge to sidebar/main+context), kept to
     the same smaller value so the app doesn't run flush to the window but
     the inset still reads as tighter than the wider gaps between blocks. */
  padding-left: var(--ui-shell-edge-inset-inline);
}

.shell__main {
  grid-area: main;
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  /* AppFolderPage owns document scrolling while workspace views own their
     internal regions. This shell row only needs to shrink instead of growing with
     content, so that scroll actually has a bounded box to work within. */
  min-width: 0;
  min-height: 0;
  /* Split, not the padding shorthand — left is the gap opened up between
     this column and the sidebar (matching the Inspector bay's own
     inter-block gap below), while right is the shell's outer edge inset
     (matches .shell__sidebar's own padding-left above). The two are
     different distances on purpose, not a shorthand that happens to cover
     both. */
  padding-bottom: var(--ui-shell-content-inset-block);
  padding-left: var(--ui-shell-workspace-inline-start);
  padding-right: var(--ui-shell-edge-inset-inline);
}

.shell__main--with-dock {
  /* Both panels stay in flow; Dock disclosure keeps the same allocated bay. */
  grid-template-columns: minmax(0, 1fr) var(--ui-shell-dock-inline-size);
  gap: var(--ui-shell-gutter);
}

.shell__workspace {
  min-width: 0;
  min-height: 0;
  padding-top: var(--ui-shell-content-inset-block);
}
.shell__main[data-panel-view='workspace'],
.shell__main[data-panel-view='dock'] {
  grid-template-columns: minmax(0, 1fr);
}
.shell__main[data-panel-view='workspace'] > .shell__workspace,
.shell__main[data-panel-view='dock'] > .shell__dock {
  grid-area: 1 / 1;
}
.shell__main[data-panel-view='workspace'] > .shell__dock,
.shell__main[data-panel-view='dock'] > .shell__workspace {
  display: none;
}

.shell__dock {
  display: flex;
  justify-content: flex-end;
  min-width: 0;
  min-height: 0;
  /* The shell's shared bottom padding already leaves the outer inset above
     PlayerBar. This matching top inset makes the right plane independent of
     the workspace's taller archive-tab baseline, just like the Sidebar. */
  padding-top: var(--ui-shell-content-inset-block);
  /* The wrapper owns layout only. It must not become an invisible hit target
     above the collapsed restore control. AppRightDock opts its real boundary
     back into pointer handling. */
  pointer-events: none;
}

.shell__dock--collapsed {
  /* Only the restore control paints inside the reserved composition space. */
  align-items: flex-end;
}

.shell__dock-surface {
  position: absolute;
  inset: 0;
  min-width: 0;
  min-height: 0;
  opacity: 0;
  visibility: hidden;
  transform: translateX(var(--ui-space-2));
  pointer-events: none;
  transition:
    opacity var(--ui-motion-duration-fast) var(--ui-motion-easing-exit),
    transform var(--ui-motion-duration-fast) var(--ui-motion-easing-exit),
    visibility 0s linear var(--ui-motion-duration-fast);
}

.shell__dock-surface--active {
  opacity: 1;
  visibility: visible;
  transform: translateX(0);
  pointer-events: auto;
  transition:
    opacity var(--ui-motion-duration-standard) var(--ui-motion-easing-enter),
    transform var(--ui-motion-duration-standard) var(--ui-motion-easing-enter),
    visibility 0s linear 0s;
}

.shell__dock-surface--queue {
  transform: translateY(var(--ui-space-3));
}

.shell__dock-surface--queue.shell__dock-surface--active {
  transform: translateY(0);
}

/* The Queue is lazily mounted on its first request. Subsequent requests
   transition the retained surface; the first uses the same bottom origin. */
@starting-style {
  .shell__dock-surface--queue.shell__dock-surface--active {
    opacity: 0;
    transform: translateY(var(--ui-space-3));
  }
}

.shell__player {
  grid-area: player;
}
</style>

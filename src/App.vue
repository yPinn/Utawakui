<script setup>
import {
  computed,
  defineAsyncComponent,
  nextTick,
  onMounted,
  onUnmounted,
  provide,
  watch,
} from 'vue';
import AppArchiveFrame from './components/layout/AppArchiveFrame.vue';
import AppPlaylistSidebar from './components/layout/AppPlaylistSidebar.vue';
import AppRightDock from './components/layout/AppRightDock.vue';
import AppTitleBar from './components/layout/AppTitleBar.vue';
import AppUtilityFrame from './components/layout/AppUtilityFrame.vue';
import AppFeatureNoticeModal from './components/layout/AppFeatureNoticeModal.vue';
import AppAnnouncementModal from './components/layout/AppAnnouncementModal.vue';
import WindowCloseDecisionModal from './components/layout/WindowCloseDecisionModal.vue';
import UiNotice from './components/ui/UiNotice.vue';
import PlayerBar from './components/playback/PlayerBar.vue';
import QueuePanel from './components/queue/QueuePanel.vue';
import SetlistView from './views/SetlistView.vue';
import { useAppView } from './composables/useAppView.js';
import { useTaskbarControls } from './composables/useTaskbarControls.js';
import { useWindowTitle } from './composables/useWindowTitle.js';
import { useMediaSession } from './composables/useMediaSession.js';
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts.js';
import { useSidebarWidth } from './composables/useSidebarWidth.js';
import {
  isStudioLibraryComparisonMode,
  useVisualSystemMode,
} from './composables/useVisualSystemMode.js';
import { useTheme } from './composables/useTheme.js';
import { useUiDensity } from './composables/useUiDensity.js';
import { useAudioOutput } from './composables/useAudioOutput.js';
import { useOutputRuntime } from './composables/useOutputRuntime.js';
import { usePerformerSelfView } from './composables/usePerformerSelfView.js';
import { useAppUpdate } from './composables/useAppUpdate.js';
import { useAppAnnouncement } from './composables/useAppAnnouncement.js';
import { useWindowCloseDecision } from './composables/useWindowCloseDecision.js';
import { useTrayNavigation } from './composables/useTrayNavigation.js';
import { usePlaybackHistory } from './composables/usePlaybackHistory.js';
import { usePlaybackResume } from './composables/usePlaybackResume.js';
import {
  RIGHT_DOCK_SURFACE_METADATA,
  RIGHT_DOCK_SURFACE_QUEUE,
  useAppRightDock,
} from './composables/useAppRightDock.js';
import { useAppRightDockWidth } from './composables/useAppRightDockWidth.js';
import { OUTPUT_RUNTIME_KEY } from './composables/useOutputRuntimeContext.js';
import { recordRendererMilestone } from './utils/startupTrace.js';
import { measureInteractionToNextPaint } from './utils/interactionPerformance.js';

// Setlist is the only initial view. Keep inactive workflows out of Vite's first
// renderer graph so a new dev server can show the working shell immediately.
const OutputView = defineAsyncComponent(() => import('./views/OutputView.vue'));
const LyricsView = defineAsyncComponent(() => import('./views/LyricsView.vue'));
const ImportView = defineAsyncComponent(() => import('./views/ImportView.vue'));
const SettingsView = defineAsyncComponent(
  () => import('./views/SettingsView.vue'),
);

// These workbenches are development aids, not user-facing product pages.
// Keeping their imports inside a compile-time DEV branch lets Vite omit the
// modules entirely from production builds instead of merely hiding navigation.
const internalWorkbenchesEnabled = import.meta.env.DEV;
const internalViews = internalWorkbenchesEnabled
  ? {
      'music-analysis': defineAsyncComponent(
        () => import('./views/MusicAnalysisView.vue'),
      ),
      'diagnostics-workbench': defineAsyncComponent(
        () => import('./views/DiagnosticsWorkbenchView.vue'),
      ),
      'lyrics-provider-review': defineAsyncComponent(
        () => import('./views/LyricsProviderReviewView.vue'),
      ),
      // Demo and Studio Library are both facets of the same not-yet-adopted
      // visual-refresh exploration — see VisualSystemView.vue's internal
      // mode toggle instead of two separate global shortcuts.
      'visual-system': defineAsyncComponent(
        () => import('./views/VisualSystemView.vue'),
      ),
    }
  : {};
const internalContextDefinitions = internalWorkbenchesEnabled
  ? {
      'visual-system': {
        component: defineAsyncComponent(
          () => import('./views/StudioLibraryContextView.vue'),
        ),
      },
    }
  : {};
// Ordered by current workflow/usage priority: Music Analysis is the most
// active dev-tool area right now, Diagnostics/Lyrics Provider Review are
// established support workflows, and the merged Visual System exploration
// (not yet adopted, see DESIGN.md) sits last.
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
const trayNavigation = useTrayNavigation();
const playbackHistory = usePlaybackHistory();
const playbackResume = usePlaybackResume();
Promise.all([playbackResume.initialize(), playbackHistory.initialize()]);
onUnmounted(() => {
  closeDecision.dispose();
  trayNavigation.dispose();
  playbackResume.dispose();
  playbackHistory.dispose();
});
// Validate and stage the persisted capture device before playback. The capture
// AudioContext itself stays closed until the first explicit play action.
useAudioOutput().restoreInitialDevice();
const outputRuntime = useOutputRuntime();
provide(OUTPUT_RUNTIME_KEY, outputRuntime);
onMounted(() => {
  recordRendererMilestone('interactive-shell');
  outputRuntime.initialize();
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

// Live-updated by AppPlaylistSidebar.vue's resize handle (useSidebarResize.js
// writes into the same useSidebarWidth.js singleton this reads).
const { width: sidebarWidth } = useSidebarWidth();
const { width: rightDockWidth } = useAppRightDockWidth();
const rightDock = useAppRightDock();
const RIGHT_DOCK_CONTENT_ID = 'app-right-dock-content';

// No router: the Electron shell has fixed sections and no deep links.
const views = {
  setlist: SetlistView,
  output: OutputView,
  lyrics: LyricsView,
  import: ImportView,
  ...internalViews,
};

// Singleton (see useAppView.js) so deeper components can switch tabs too.
const {
  activeView,
  returnView,
  isSettingsView,
  setActiveView,
  openSettings,
  returnFromSettings,
} = useAppView();
const workflowViewLabels = {
  setlist: '歌單',
  lyrics: '歌詞',
  output: '輸出',
  import: '匯入',
};
const settingsBackLabel = computed(() => {
  const label = workflowViewLabels[returnView.value];
  return label ? `返回${label}` : '返回先前頁面';
});

function leaveSettings() {
  returnFromSettings();
  nextTick(() => {
    document.querySelector('[data-app-settings-trigger]')?.focus?.();
  });
}
// The Studio Library inspector only makes sense while VisualSystemView is
// actually showing its Studio Library sub-mode, not its Demo sub-mode.
const { mode: visualSystemMode } = useVisualSystemMode();
const activeContextDefinition = computed(() => {
  if (
    activeView.value === 'visual-system' &&
    visualSystemMode.value !== 'studio-library'
  ) {
    return null;
  }
  return internalContextDefinitions[activeView.value] ?? null;
});
const activeContextView = computed(
  () => activeContextDefinition.value?.component ?? null,
);
const activeContextAvailable = computed(() => Boolean(activeContextView.value));
const metadataSurfaceActive = computed(
  () => rightDock.topSurface.value === RIGHT_DOCK_SURFACE_METADATA,
);
const queueSurfaceActive = computed(
  () => rightDock.topSurface.value === RIGHT_DOCK_SURFACE_QUEUE,
);
const metadataExpanded = computed(
  () => rightDock.isExpanded.value && metadataSurfaceActive.value,
);
const queueExpanded = computed(
  () => rightDock.isExpanded.value && queueSurfaceActive.value,
);
const rightDockExpanded = computed(
  () => rightDock.isExpanded.value && Boolean(rightDock.topSurface.value),
);
const restorableDockSurface = computed(
  () =>
    rightDock.topSurface.value ??
    rightDock.lastSurface.value ??
    (activeContextAvailable.value
      ? RIGHT_DOCK_SURFACE_METADATA
      : RIGHT_DOCK_SURFACE_QUEUE),
);
const rightDockLabel = computed(() => {
  return restorableDockSurface.value === RIGHT_DOCK_SURFACE_QUEUE
    ? '播放佇列'
    : '播放資訊';
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
      `[aria-controls="${RIGHT_DOCK_CONTENT_ID}"][aria-expanded="false"]`,
    );
    const target =
      requestedTarget?.isConnected === false ? fallbackTarget : requestedTarget;
    target?.focus?.();
  });
}

function toggleMetadataSurface() {
  rememberRightDockTrigger();
  rightDock.toggleSurface(RIGHT_DOCK_SURFACE_METADATA);
}

function toggleQueueSurface() {
  rememberRightDockTrigger();
  measureInteractionToNextPaint('utawakui:right-dock:queue-toggle', () =>
    rightDock.toggleSurface(RIGHT_DOCK_SURFACE_QUEUE),
  );
}

function closeDockSurface(surface) {
  rememberRightDockTrigger();
  rightDock.hideSurface(surface);
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
    rememberRightDockTrigger();
    rightDock.setExpanded(false);
  } else {
    expandRightDock();
  }
}

function closeTopDockSurface() {
  if (rightDock.topSurface.value) {
    closeDockSurface(rightDock.topSurface.value);
  }
}

function handleRightDockKeydown(event) {
  if (
    event.key !== 'Escape' ||
    event.defaultPrevented ||
    !rightDockExpanded.value ||
    event.target?.closest?.('dialog[open]')
  ) {
    return;
  }

  event.preventDefault();
  closeTopDockSurface();
}

watch(
  activeContextAvailable,
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

// Studio Library is a development preview of the Setlist interior. Keep the
// real Setlist folder visibly selected while the hidden preview component is
// active so the shell still communicates the owning workflow. This applies
// to both Candidate and Current comparison panels, but not the component lab.
const archiveTabView = internalWorkbenchesEnabled
  ? computed(() =>
      activeView.value === 'visual-system' &&
      isStudioLibraryComparisonMode(visualSystemMode.value)
        ? 'setlist'
        : activeView.value,
    )
  : activeView;
useKeyboardShortcuts({ internalViewShortcuts });
</script>

<template>
  <div
    class="shell"
    :style="{
      '--ui-playlist-sidebar-width': `${sidebarWidth}px`,
      '--ui-right-dock-width': `${rightDockWidth}px`,
    }"
  >
    <AppTitleBar
      class="shell__titlebar"
      :settings-active="isSettingsView"
      :update-available="appUpdateReady"
      @open-settings="openSettings"
    />
    <div class="shell__sidebar">
      <AppPlaylistSidebar />
    </div>
    <main class="shell__main shell__main--with-dock">
      <div
        class="shell__workspace"
        :class="{ 'shell__workspace--utility': isSettingsView }"
      >
        <AppUtilityFrame
          v-if="isSettingsView"
          title="設定"
          description="管理曲庫、音訊、進階功能與應用程式行為。"
          :back-label="settingsBackLabel"
          @back="leaveSettings"
        >
          <SettingsView />
        </AppUtilityFrame>
        <AppArchiveFrame
          v-else
          :active-view="activeView"
          :tab-active-view="archiveTabView"
          @update:active-view="setActiveView"
        >
          <component :is="views[activeView]" />
        </AppArchiveFrame>
      </div>
      <div class="shell__dock">
        <AppRightDock
          :expanded="rightDockExpanded"
          :label="rightDockLabel"
          :expand-label="rightDockExpandLabel"
          :content-id="RIGHT_DOCK_CONTENT_ID"
          @expand="expandRightDock"
          @toggle-expanded="toggleRightDockExpanded"
        >
          <component
            :is="activeContextView"
            v-if="
              activeContextView &&
              rightDock.mountedSurfaces[RIGHT_DOCK_SURFACE_METADATA]
            "
            class="shell__dock-surface"
            :class="{
              'shell__dock-surface--active': metadataSurfaceActive,
            }"
            :aria-hidden="!metadataExpanded"
            :inert="!metadataExpanded"
            @close="closeDockSurface(RIGHT_DOCK_SURFACE_METADATA)"
          />
          <QueuePanel
            v-if="rightDock.mountedSurfaces[RIGHT_DOCK_SURFACE_QUEUE]"
            class="shell__dock-surface"
            :class="{
              'shell__dock-surface--active': queueSurfaceActive,
            }"
            :active="queueExpanded"
            :aria-hidden="!queueExpanded"
            :inert="!queueExpanded"
            @close="closeDockSurface(RIGHT_DOCK_SURFACE_QUEUE)"
          />
        </AppRightDock>
      </div>
    </main>
    <PlayerBar
      class="shell__player"
      :artwork-expandable="activeContextAvailable"
      :artwork-expanded="metadataExpanded"
      :artwork-controls="RIGHT_DOCK_CONTENT_ID"
      :queue-expanded="queueExpanded"
      :queue-controls="RIGHT_DOCK_CONTENT_ID"
      @artwork-activate="toggleMetadataSurface"
      @queue-activate="toggleQueueSurface"
    />
    <UiNotice
      v-if="performerView.state.error"
      class="shell__notice"
      tone="danger"
      title="表演者畫面操作未完成"
      :message="performerView.state.error"
      action-label="重試"
      compact
      @action="performerView.open"
    />
    <AppFeatureNoticeModal />
    <AppAnnouncementModal />
    <WindowCloseDecisionModal
      :open="closeDecision.state.open"
      :remember="closeDecision.state.remember"
      :is-responding="closeDecision.state.isResponding"
      :pending-action="closeDecision.state.pendingAction"
      :active-work="closeDecision.state.activeWork"
      :error="closeDecision.state.error"
      @close="closeDecision.cancel"
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
  /* clamp(), not the raw variable — a defensive bound on the rendered
     column so an out-of-range persisted/runtime value (e.g. from an older
     config.json) can't push the grid column past useSidebarWidth.js's own
     min/max. useSidebarResize.js already clamps during a live drag; this
     is the CSS-side backstop for values that arrive some other way.
     Plus --ui-shell-edge-inset-inline: .shell__sidebar's own padding-left (the sidebar's
     outer margin from the window edge) below eats into whatever this track
     hands it — without the extra space here, that padding would shrink
     AppPlaylistSidebar.vue's own rendered width below its calibrated
     min/max/compact-threshold values instead of just shifting it right.
     Must match .shell__sidebar's padding-left exactly, or the resize
     drag's tracked width (useSidebarWidth.js) and the actual DOM width the
     @container query measures (PlaylistSidebar.vue/PlaylistSidebarRow.vue)
     drift apart, desyncing the collapsed/expanded snap point from the drag
     position. */
  grid-template-columns:
    calc(
      clamp(
          var(--ui-playlist-sidebar-width-min),
          var(--ui-playlist-sidebar-width),
          var(--ui-playlist-sidebar-width-max)
        ) +
        var(--ui-shell-edge-inset-inline)
    )
    1fr;
  grid-template-rows: var(--ui-titlebar-height) 1fr auto;
  height: 100%;
  /* Prevent 1fr content from forcing the fixed shell wider than viewport. */
  min-width: 0;
}

.shell__titlebar {
  grid-area: titlebar;
}

.shell__sidebar {
  grid-area: sidebar;
  /* A plain, unstyled wrapper, like .shell__main owning AppInnerPage's card
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
     tabbed dossier baseline. The shared shell-panel token keeps its block
     breathing room aligned with Right Dock in production and Token v2. */
  padding-block: var(--ui-shell-panel-inset-block);
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
  /* AppInnerPage now owns the card-internal scroll (see its own CSS) —
     this just needs to shrink to its grid row instead of growing with
     content, so that scroll actually has a bounded box to work within. */
  min-width: 0;
  min-height: 0;
  /* Split, not the padding shorthand — left is the gap opened up between
     this column and the sidebar (matching the Inspector bay's own
     inter-block gap below), while right is the shell's outer edge inset
     (matches .shell__sidebar's own padding-left above). The two are
     different distances on purpose, not a shorthand that happens to cover
     both. */
  padding-bottom: var(--ui-shell-panel-inset-block);
  padding-left: var(--ui-space-3);
  padding-right: var(--ui-shell-edge-inset-inline);
}

.shell__main--with-dock {
  /* Queue and metadata are surfaces in one shell-owned plane. Reserve the
     complete desktop bay so foreground changes and folding never reflow the
     active workspace. */
  grid-template-columns: minmax(0, 1fr) var(--ui-right-dock-width);
  gap: var(--ui-space-3);
}

.shell__workspace {
  min-width: 0;
  min-height: 0;
}

.shell__workspace--utility {
  /* Neutral destinations share the Sidebar／Right Dock top boundary.
     Folder workflows intentionally remain flush to the row top because
     their tabs and cover rail own a separate silhouette above the page. */
  padding-top: var(--ui-shell-panel-inset-block);
}

.shell__dock {
  display: flex;
  justify-content: flex-end;
  min-width: 0;
  min-height: 0;
  /* The shell's shared bottom padding already leaves the panel inset above
     PlayerBar. This matching top inset makes the right plane independent of
     the workspace's taller archive-tab baseline, just like the Sidebar. */
  padding-top: var(--ui-shell-panel-inset-block);
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

:global(:root[data-ui-motion='reduced']) .shell__dock-surface {
  transition: none;
}

@media (prefers-reduced-motion: reduce) {
  .shell__dock-surface {
    transition: none;
  }
}

@media (max-width: 70rem) {
  .shell__main--with-dock {
    grid-template-columns: minmax(0, 1fr);
    gap: 0;
  }

  .shell__dock {
    position: absolute;
    z-index: var(--ui-z-sticky);
    inset-block: 0 var(--ui-shell-panel-inset-block);
    inset-inline-end: var(--ui-shell-edge-inset-inline);
  }
}

.shell__player {
  grid-area: player;
}

.shell__notice {
  position: fixed;
  z-index: var(--ui-z-context-menu);
  right: var(--ui-space-4);
  bottom: calc(var(--ui-player-bar-height) + var(--ui-space-4));
  max-width: min(30rem, calc(100vw - 2 * var(--ui-space-4)));
}
</style>

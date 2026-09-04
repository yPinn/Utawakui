<script setup>
import {
  computed,
  defineAsyncComponent,
  onMounted,
  provide,
  shallowRef,
  watch,
} from 'vue';
import AppArchiveFrame from './components/layout/AppArchiveFrame.vue';
import AppPlaylistSidebar from './components/layout/AppPlaylistSidebar.vue';
import AppTitleBar from './components/layout/AppTitleBar.vue';
import AppFeatureNoticeModal from './components/layout/AppFeatureNoticeModal.vue';
import UiNotice from './components/ui/UiNotice.vue';
import PlayerBar from './components/playback/PlayerBar.vue';
import SetlistView from './views/SetlistView.vue';
import { useAppView } from './composables/useAppView.js';
import { useTaskbarControls } from './composables/useTaskbarControls.js';
import { useWindowTitle } from './composables/useWindowTitle.js';
import { useMediaSession } from './composables/useMediaSession.js';
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts.js';
import { useSidebarWidth } from './composables/useSidebarWidth.js';
import { useVisualSystemMode } from './composables/useVisualSystemMode.js';
import { useTheme } from './composables/useTheme.js';
import { useAudioOutput } from './composables/useAudioOutput.js';
import { useOutputRuntime } from './composables/useOutputRuntime.js';
import { usePerformerSelfView } from './composables/usePerformerSelfView.js';
import { useAppUpdate } from './composables/useAppUpdate.js';
import { OUTPUT_RUNTIME_KEY } from './composables/useOutputRuntimeContext.js';
import { recordRendererMilestone } from './utils/startupTrace.js';

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
        controlId: 'studio-library-inspector-content',
        loadController: () =>
          import('./composables/useStudioLibraryInspector.js').then(
            ({ useStudioLibraryInspector }) => useStudioLibraryInspector(),
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
// Restores the persisted capture device (see usePlayer.js's capture chain)
// before any track can play — same "kick off the module-load side effect
// once" reasoning as useTheme() above.
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

// Live-updated by AppPlaylistSidebar.vue's resize handle (useSidebarResize.js
// writes into the same useSidebarWidth.js singleton this reads).
const { width: sidebarWidth } = useSidebarWidth();

// No router: the Electron shell has fixed sections and no deep links.
const views = {
  setlist: SetlistView,
  output: OutputView,
  lyrics: LyricsView,
  import: ImportView,
  settings: SettingsView,
  ...internalViews,
};

// Singleton (see useAppView.js) so deeper components can switch tabs too.
const { activeView } = useAppView();
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
const activeContextController = shallowRef(null);
let activeContextRequest = 0;

watch(
  [activeView, visualSystemMode],
  async () => {
    const request = ++activeContextRequest;
    const definition = activeContextDefinition.value;
    activeContextController.value = null;
    if (!definition) return;

    const controller = await definition.loadController();
    if (request !== activeContextRequest) return;
    activeContextController.value = controller;
  },
  { immediate: true },
);

const activeContextControlId = computed(
  () => activeContextDefinition.value?.controlId,
);
const activeContextAvailable = computed(() =>
  Boolean(
    activeContextView.value &&
    activeContextController.value &&
    activeContextControlId.value,
  ),
);
const activeContextExpanded = computed(
  () => activeContextController.value?.isInspectorOpen.value ?? false,
);

function toggleActiveContext() {
  activeContextController.value?.toggleInspector();
}
// Studio Library is a development preview of the Setlist interior. Keep the
// real Setlist folder visibly selected while the hidden preview component is
// active so the shell still communicates the owning workflow. Only applies
// to VisualSystemView's Studio Library sub-mode, not its Demo sub-mode.
const archiveTabView = internalWorkbenchesEnabled
  ? computed(() =>
      activeView.value === 'visual-system' &&
      visualSystemMode.value === 'studio-library'
        ? 'setlist'
        : activeView.value,
    )
  : activeView;
// Pass the ref so global shortcuts can read and update the active view.
useKeyboardShortcuts(activeView, { internalViewShortcuts });
</script>

<template>
  <div
    class="shell"
    :style="{ '--ui-playlist-sidebar-width': `${sidebarWidth}px` }"
  >
    <AppTitleBar class="shell__titlebar" />
    <AppPlaylistSidebar class="shell__sidebar" />
    <main class="shell__main">
      <AppArchiveFrame
        v-model:active-view="activeView"
        :tab-active-view="archiveTabView"
        :update-available="appUpdateReady"
      >
        <component :is="views[activeView]" />
        <template v-if="activeContextView" #context>
          <component :is="activeContextView" />
        </template>
      </AppArchiveFrame>
    </main>
    <PlayerBar
      class="shell__player"
      :artwork-expandable="activeContextAvailable"
      :artwork-expanded="activeContextExpanded"
      :artwork-controls="activeContextControlId"
      @artwork-activate="toggleActiveContext"
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
     is the CSS-side backstop for values that arrive some other way. */
  grid-template-columns:
    clamp(
      var(--ui-playlist-sidebar-width-min),
      var(--ui-playlist-sidebar-width),
      var(--ui-playlist-sidebar-width-max)
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
  /* Same fix as .shell__main below — without this, a grid item's default
     min-height:auto refuses to shrink below its content's natural height,
     so a long playlist list stretches the whole 1fr row taller than the
     viewport and pushes the player bar off the bottom of the window,
     requiring the page itself to scroll to reach it. AppPlaylistSidebar.vue
     already owns its own internal scroll — this just lets it actually be
     bounded to the row instead of forcing the row to grow around it. */
  min-height: 0;
}

.shell__main {
  grid-area: main;
  /* AppInnerPage now owns the card-internal scroll (see its own CSS) —
     this just needs to shrink to its grid row instead of growing with
     content, so that scroll actually has a bounded box to work within. */
  min-height: 0;
  padding: 0 var(--ui-space-3) var(--ui-space-3);
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

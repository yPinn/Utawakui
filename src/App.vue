<script setup>
import AppArchiveFrame from './components/layout/AppArchiveFrame.vue';
import AppPlaylistSidebar from './components/layout/AppPlaylistSidebar.vue';
import AppTitleBar from './components/layout/AppTitleBar.vue';
import FeatureNoticeModal from './components/layout/FeatureNoticeModal.vue';
import PlayerBar from './components/playback/PlayerBar.vue';
import SetlistView from './views/SetlistView.vue';
import AppearanceView from './views/AppearanceView.vue';
import LyricsView from './views/LyricsView.vue';
import ImportView from './views/ImportView.vue';
import { useAppView } from './composables/useAppView.js';
import { useTaskbarControls } from './composables/useTaskbarControls.js';
import { useWindowTitle } from './composables/useWindowTitle.js';
import { useMediaSession } from './composables/useMediaSession.js';
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts.js';
import { useSidebarWidth } from './composables/useSidebarWidth.js';
import { useTheme } from './composables/useTheme.js';

// Long-lived app hooks; each composable owns its cleanup.
useTaskbarControls();
useWindowTitle();
useMediaSession();
useTheme();

// Live-updated by AppPlaylistSidebar.vue's resize handle (useSidebarResize.js
// writes into the same useSidebarWidth.js singleton this reads).
const { width: sidebarWidth } = useSidebarWidth();

// No router: the Electron shell has fixed sections and no deep links.
const views = {
  setlist: SetlistView,
  appearance: AppearanceView,
  lyrics: LyricsView,
  import: ImportView,
};

// Singleton (see useAppView.js) so deeper components can switch tabs too.
const { activeView } = useAppView();
// Pass the ref so global shortcuts can read and update the active view.
useKeyboardShortcuts(activeView);
</script>

<template>
  <div
    class="shell"
    :style="{ '--ui-playlist-sidebar-width': `${sidebarWidth}px` }"
  >
    <AppTitleBar class="shell__titlebar" />
    <AppPlaylistSidebar class="shell__sidebar" />
    <main class="shell__main">
      <AppArchiveFrame v-model:active-view="activeView">
        <component :is="views[activeView]" />
      </AppArchiveFrame>
    </main>
    <PlayerBar class="shell__player" />
    <FeatureNoticeModal />
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
</style>

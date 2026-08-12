<script setup>
import { ref } from 'vue';
import AppSidebar from './components/layout/AppSidebar.vue';
import PlayerBar from './components/playback/PlayerBar.vue';
import SetlistView from './views/SetlistView.vue';
import AppearanceView from './views/AppearanceView.vue';
import LyricsView from './views/LyricsView.vue';
import ImportView from './views/ImportView.vue';
import { useTaskbarControls } from './composables/useTaskbarControls.js';
import { useWindowTitle } from './composables/useWindowTitle.js';
import { useMediaSession } from './composables/useMediaSession.js';
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts.js';

// Long-lived app hooks; each composable owns its cleanup.
useTaskbarControls();
useWindowTitle();
useMediaSession();

// No router: the Electron shell has fixed sections and no deep links.
const views = {
  setlist: SetlistView,
  appearance: AppearanceView,
  lyrics: LyricsView,
  import: ImportView,
};

const activeView = ref('setlist');
// Pass the ref so global shortcuts can read and update the active view.
useKeyboardShortcuts(activeView);
</script>

<template>
  <div class="shell">
    <AppSidebar v-model:active-view="activeView" class="shell__sidebar" />
    <main class="shell__main">
      <component :is="views[activeView]" />
    </main>
    <PlayerBar class="shell__player" />
  </div>
</template>

<style scoped>
.shell {
  display: grid;
  grid-template-areas:
    'sidebar main'
    'player player';
  grid-template-columns: 180px 1fr;
  grid-template-rows: 1fr auto;
  height: 100%;
  /* Prevent 1fr content from forcing the fixed shell wider than viewport. */
  min-width: 0;
}

.shell__sidebar {
  grid-area: sidebar;
}

.shell__main {
  grid-area: main;
  overflow-y: auto;
  padding: var(--ui-space-3);
}

.shell__player {
  grid-area: player;
}
</style>

<script setup>
import { ref } from 'vue';
import AppSidebar from './components/AppSidebar.vue';
import PlayerBar from './components/PlayerBar.vue';
import SetlistView from './views/SetlistView.vue';
import AppearanceView from './views/AppearanceView.vue';
import LyricsView from './views/LyricsView.vue';
import ImportView from './views/ImportView.vue';
import { useTaskbarControls } from './composables/useTaskbarControls.js';
import { useWindowTitle } from './composables/useWindowTitle.js';
import { useMediaSession } from './composables/useMediaSession.js';
import { useKeyboardShortcuts } from './composables/useKeyboardShortcuts.js';

// App.vue lives for the app's whole lifetime in production; each composable
// still owns cleanup for dev HMR and test-like remounts.
useTaskbarControls();
useWindowTitle();
useMediaSession();

// No router: 4 fixed sections, an Electron window has no address bar and
// nothing here needs deep-linking. Revisit only if that changes.
const views = {
  setlist: SetlistView,
  appearance: AppearanceView,
  lyrics: LyricsView,
  import: ImportView,
};

const activeView = ref('setlist');
// F1-F4 tab switching lives in useKeyboardShortcuts.js alongside the other
// global shortcuts — passed the ref itself, not a setter, so the
// composable can both read and write it.
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
  /* The one grid container in the app with no responsive behavior of its
     own (180px sidebar is fixed) — without this, a 1fr track's implicit
     min-width:auto can force the grid wider than the viewport once
     .shell__main's content wants more room than it has, which is why
     individual views (e.g. SetlistView) have each had to add their own
     min-width: 0 defensively. */
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

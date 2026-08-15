<script setup>
import LyricsWorkspace from '../components/lyrics/LyricsWorkspace.vue';
import UiPageHeader from '../components/ui/UiPageHeader.vue';
</script>

<template>
  <div class="lyrics-view">
    <UiPageHeader title="歌詞" />
    <LyricsWorkspace />
  </div>
</template>

<style scoped>
.lyrics-view {
  /* height + flex, not the block default — lets LyricsWorkspace fill
     exactly whatever's left after UiPageHeader (via flex: 1; min-height: 0
     on its own root) instead of guessing that height with 100vh math. */
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
</style>

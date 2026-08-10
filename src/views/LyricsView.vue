<script setup>
import LyricsWorkspace from '../components/lyrics/LyricsWorkspace.vue';
import UiPageHeader from '../components/ui/UiPageHeader.vue';
</script>

<template>
  <div class="lyrics-view">
    <UiPageHeader title="Lyrics" />
    <LyricsWorkspace />
  </div>
</template>

<style scoped>
.lyrics-view {
  display: grid;
  gap: var(--ui-space-3);
}
</style>

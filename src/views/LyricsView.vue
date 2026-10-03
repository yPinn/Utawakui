<script setup>
import LyricsWorkspace from '../components/lyrics/LyricsWorkspace.vue';
import '../styles/features/lyrics.css';
</script>

<template>
  <div class="lyrics-view">
    <LyricsWorkspace />
  </div>
</template>

<style scoped>
.lyrics-view {
  height: 100%;
  display: flex;
  flex-direction: column;
}
</style>

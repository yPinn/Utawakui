<script setup>
import LyricsDisplayControls from './LyricsDisplayControls.vue';
defineOptions({ inheritAttrs: false });
</script>

<template>
  <section class="lyrics-preparation" aria-label="閱讀與預先設定">
    <LyricsDisplayControls v-bind="$attrs" />
  </section>
</template>

<style scoped>
.lyrics-preparation {
  inline-size: 18rem;
  max-inline-size: 100%;
}
</style>

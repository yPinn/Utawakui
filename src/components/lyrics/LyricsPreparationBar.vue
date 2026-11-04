<script setup>
import LyricsDisplayControls from './LyricsDisplayControls.vue';
import { t } from '../../utils/i18n.js';
defineOptions({ inheritAttrs: false });
</script>

<template>
  <section
    class="lyrics-preparation"
    :aria-label="t('lyricsEditor.preparation.label')"
  >
    <LyricsDisplayControls v-bind="$attrs">
      <template #font-actions><slot name="font-actions" /></template>
      <template #text-processing><slot name="text-processing" /></template>
    </LyricsDisplayControls>
  </section>
</template>

<style scoped>
.lyrics-preparation {
  inline-size: 18rem;
  max-inline-size: 100%;
}
</style>

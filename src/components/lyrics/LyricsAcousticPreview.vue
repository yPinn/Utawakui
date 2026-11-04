<script setup>
import { computed } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import { useLyricsAcousticPreview } from '../../composables/lyrics/useLyricsAcousticPreview.js';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  document: { type: Object, required: true },
  estimate: { type: Object, required: true },
  sourceKey: { type: String, required: true },
  positionMs: { type: Number, default: null },
  offsetMs: { type: Number, default: 0 },
  durationMs: { type: Number, default: null },
  disabled: { type: Boolean, default: false },
});
const { enabled, prepared, frame, setEnabled } = useLyricsAcousticPreview({
  document: () => props.document,
  estimate: () => props.estimate,
  sourceKey: () => props.sourceKey,
  positionMs: () => props.positionMs,
  offsetMs: () => props.offsetMs,
  durationMs: () => props.durationMs,
});
const statusLabel = computed(() => {
  if (prepared.value.status === 'ready')
    return props.estimate.preview?.methodKind === 'model'
      ? t('lyricsEditor.acoustic.model')
      : t('lyricsEditor.acoustic.synthetic');
  if (prepared.value.status === 'stale')
    return t('lyricsEditor.acoustic.stale');
  return t('lyricsEditor.acoustic.unavailable');
});
const timingLabel = computed(
  () =>
    ({
      t2: t('lyricsEditor.acoustic.timingWord'),
      'line-estimate': t('lyricsEditor.acoustic.timingLine'),
      'acoustic-estimate': t('lyricsEditor.acoustic.timingChunk'),
      plain: t('lyricsEditor.acoustic.timingPlain'),
    })[frame.value?.timingSource] ?? t('lyricsEditor.acoustic.timingPlain'),
);
</script>

<template>
  <section
    class="lyrics-acoustic-preview"
    :aria-label="t('lyricsEditor.acoustic.title')"
  >
    <div class="lyrics-acoustic-preview__header">
      <div>
        <strong>{{ t('lyricsEditor.acoustic.title') }}</strong>
        <UiHint>{{ statusLabel }}</UiHint>
      </div>
      <UiButton
        variant="secondary"
        :active="enabled"
        :aria-pressed="enabled"
        :disabled="disabled || prepared.status !== 'ready'"
        @click="setEnabled(!enabled)"
        >{{ t('lyricsEditor.acoustic.assist') }}</UiButton
      >
    </div>
    <UiHint>{{ timingLabel }}</UiHint>
    <p
      v-if="frame"
      class="lyrics-acoustic-preview__text"
      :aria-label="t('lyricsEditor.acoustic.chunks')"
    >
      <span
        v-for="chunk in frame.chunks"
        :key="chunk.chunkId"
        :data-chunk-state="chunk.state"
        >{{ chunk.text }}</span
      >
    </p>
    <UiHint v-if="positionMs === null">{{
      t('lyricsEditor.acoustic.playHint')
    }}</UiHint>
  </section>
</template>

<style scoped>
.lyrics-acoustic-preview {
  display: grid;
  min-inline-size: 0;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3) var(--ui-space-4);
}
.lyrics-acoustic-preview__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}
.lyrics-acoustic-preview__text {
  margin: 0;
  max-block-size: 8rem;
  overflow: auto;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  font-size: var(--ui-font-size-lg);
  color: var(--ui-color-text-muted);
}
.lyrics-acoustic-preview__text [data-chunk-state='past'] {
  color: var(--ui-color-text);
}
.lyrics-acoustic-preview__text [data-chunk-state='active'] {
  color: var(--ui-color-text);
  background: var(--ui-color-accent-soft);
  text-decoration: underline;
  text-underline-offset: 0.15em;
}
</style>

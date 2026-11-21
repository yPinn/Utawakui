<script setup>
import { MANGA_BUBBLE_STYLE_IDS } from '../../../shared/presentation/mangaFrameContract.mjs';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import MangaFrameSvg from './MangaFrameSvg.vue';
import ObsPropertySection from './ObsPropertySection.vue';

const props = defineProps({
  available: { type: Boolean, default: false },
  pendingId: { type: String, default: null },
});
const emit = defineEmits(['select']);

const labels = {
  spoken: t('outputPanel.appearance.fields.mangaBubbleStyle.options.spoken'),
  whisper: t('outputPanel.appearance.fields.mangaBubbleStyle.options.whisper'),
  thought: t('outputPanel.appearance.fields.mangaBubbleStyle.options.thought'),
  shout: t('outputPanel.appearance.fields.mangaBubbleStyle.options.shout'),
};

function select(id) {
  if (props.available) emit('select', id === props.pendingId ? null : id);
}
</script>

<template>
  <ObsPropertySection
    role="group"
    :aria-label="t('outputPanel.mangaBubbles.label')"
  >
    <div class="obs-manga-bubbles__grid">
      <UiButton
        v-for="id in MANGA_BUBBLE_STYLE_IDS"
        :key="id"
        class="obs-manga-bubbles__card"
        variant="secondary"
        stretch
        :active="pendingId === id"
        :aria-pressed="pendingId === id"
        :aria-disabled="!available"
        @click="select(id)"
      >
        <MangaFrameSvg class="obs-manga-bubbles__sample" :frame-id="id" />
        <span>{{ labels[id] }}</span>
      </UiButton>
    </div>
    <UiHint role="status">
      {{
        pendingId
          ? t('outputPanel.mangaBubbles.pending', { style: labels[pendingId] })
          : available
            ? t('outputPanel.mangaBubbles.choose')
            : t('outputPanel.mangaBubbles.unavailable')
      }}
    </UiHint>
  </ObsPropertySection>
</template>

<style scoped>
.obs-manga-bubbles__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--ui-space-2);
}

.obs-manga-bubbles__card {
  flex-direction: column;
  min-inline-size: 0;
  padding: var(--ui-space-2);
  white-space: normal;
}

.obs-manga-bubbles__sample {
  inline-size: 100%;
  block-size: var(--ui-artwork-size-sm);
  --manga-frame-ink: var(--ui-output-preview-manga-ink);
  --manga-frame-paper: var(--ui-output-preview-manga-paper);
  --manga-frame-stroke-unit: calc(var(--ui-border-width) / 5);
}
</style>

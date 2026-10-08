<script setup>
import { computed } from 'vue';
import { UserRound } from '../../icons/index.js';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import UiButton from '../ui/UiButton.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';

const props = defineProps({
  summary: { type: Object, required: true },
});

const emit = defineEmits(['open']);

const summaryText = computed(() => {
  const album =
    props.summary.albumCount > 0 ? ` · ${props.summary.albumCount} 張專輯` : '';
  return `本機 ${props.summary.trackCount} 首${album}`;
});
</script>

<template>
  <AppRightDockSection
    class="track-artist-preview"
    heading="藝人"
    appearance="contained"
  >
    <template v-if="summary.artistId" #trailing>
      <UiButton variant="ghost" @click="emit('open')">前往藝人</UiButton>
    </template>

    <div class="track-artist-preview__summary">
      <UiCollageThumb
        :cover-url="summary.photoUrl"
        :tracks="[]"
        :can-collage="false"
        :size="64"
        radius="var(--ui-radius-pill)"
        :empty-icon="UserRound"
      />
      <div class="track-artist-preview__copy">
        <h4 :title="summary.name">{{ summary.name }}</h4>
        <p>{{ summaryText }}</p>
      </div>
    </div>
  </AppRightDockSection>
</template>

<style scoped>
.track-artist-preview,
.track-artist-preview__summary,
.track-artist-preview__copy {
  min-inline-size: 0;
}

.track-artist-preview__summary {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
}

.track-artist-preview__copy {
  display: grid;
  gap: var(--ui-space-1);
}

.track-artist-preview__copy h4,
.track-artist-preview__copy p {
  margin: 0;
}

.track-artist-preview__copy h4 {
  max-inline-size: 100%;
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.track-artist-preview__copy p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
}

.track-artist-preview__copy {
  -webkit-user-select: none;
  user-select: none;
}
</style>

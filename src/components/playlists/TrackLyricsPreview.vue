<script setup>
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import UiButton from '../ui/UiButton.vue';

defineProps({
  preview: { type: Object, required: true },
});

const emit = defineEmits(['open']);
</script>

<template>
  <AppRightDockSection
    class="track-lyrics-preview"
    heading="歌詞預覽"
    appearance="contained"
  >
    <div class="track-lyrics-preview__lines">
      <p
        v-for="line in preview.lines"
        :key="line.id"
        :class="{
          'track-lyrics-preview__line--active': line.active,
        }"
        :aria-current="line.active ? 'true' : undefined"
      >
        {{ line.text }}
      </p>
    </div>
    <p v-if="preview.sourceLabel" class="track-lyrics-preview__source">
      {{ preview.sourceLabel }}
    </p>
    <div class="track-lyrics-preview__actions">
      <UiButton variant="secondary" @click="emit('open')"> 開啟歌詞 </UiButton>
    </div>
  </AppRightDockSection>
</template>

<style scoped>
.track-lyrics-preview,
.track-lyrics-preview__lines {
  min-inline-size: 0;
}

.track-lyrics-preview__lines {
  display: grid;
  gap: var(--ui-space-2);
}

.track-lyrics-preview__lines p,
.track-lyrics-preview__source {
  margin: 0;
}

.track-lyrics-preview__lines p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
  overflow-wrap: anywhere;
  text-wrap: pretty;
}

.track-lyrics-preview__lines .track-lyrics-preview__line--active {
  color: var(--ui-color-text);
}

.track-lyrics-preview__source {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
  overflow-wrap: anywhere;
}

.track-lyrics-preview__actions {
  display: flex;
  justify-content: flex-end;
}

.track-lyrics-preview__lines,
.track-lyrics-preview__source {
  -webkit-user-select: none;
  user-select: none;
}
</style>

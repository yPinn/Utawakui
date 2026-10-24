<script setup>
import { computed, useId, useTemplateRef } from 'vue';
import { deriveAlbumSummary } from '../../utils/albumSummary.js';
import { formatLongDuration } from '../../utils/format.js';
import { releaseYearFromDate } from '../../utils/releasePresentation.js';
import LibraryEntityDossier from '../library/LibraryEntityDossier.vue';
import UiHint from '../ui/UiHint.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';

const props = defineProps({
  source: { type: String, required: true },
  count: { type: Number, required: true },
  entityKind: {
    type: String,
    default: 'playlist',
    validator: (value) => ['album', 'playlist'].includes(value),
  },
  releaseType: { type: String, default: 'unknown' },
  releaseDate: { type: Object, default: null },
  coverUrl: { type: String, default: '' },
  tracks: { type: Array, default: () => [] },
  description: { type: String, default: '' },
  hint: { type: String, default: '' },
  listLabel: { type: String, default: '曲目' },
});

const titleId = useId();
const artist = computed(() =>
  props.entityKind === 'album'
    ? deriveAlbumSummary(props.tracks).artist || ''
    : '',
);
const fields = computed(() => {
  const completeDuration =
    props.tracks.length === props.count &&
    props.count > 0 &&
    props.tracks.every(
      (track) => Number.isFinite(track.duration) && track.duration > 0,
    );
  const duration = completeDuration
    ? formatLongDuration(
        props.tracks.reduce((total, track) => total + track.duration, 0),
      )
    : '';
  const countLine = `${props.count} 首曲目${duration ? `，${duration}` : ''}`;
  const year =
    props.entityKind === 'album'
      ? releaseYearFromDate(props.releaseDate)
      : undefined;
  return year ? [String(year), countLine] : [countLine];
});

const scroll = useTemplateRef('scroll');
function scrollTo(...args) {
  scroll.value?.scrollTo(...args);
}
defineExpose({ scrollTo });
</script>

<template>
  <section class="preparation-review-layout">
    <header class="preparation-review-layout__summary">
      <div class="preparation-review-layout__identity">
        <LibraryEntityDossier
          :entity-kind="entityKind"
          :release-type="releaseType"
          :title="source"
          :title-id="titleId"
          title-tag="h3"
          :artist="artist"
          :fields="fields"
          :cover-tracks="tracks"
          :cover-url="coverUrl"
          :description="description"
        />
        <UiHint v-if="hint">{{ hint }}</UiHint>
      </div>
      <div v-if="$slots.actions" class="preparation-review-layout__actions">
        <slot name="actions" />
      </div>
    </header>
    <UiScrollLayout
      ref="scroll"
      class="preparation-review-layout__scroll"
      :aria-label="listLabel"
      tabindex="0"
    >
      <slot />
    </UiScrollLayout>
    <div v-if="$slots.notice" class="preparation-review-layout__notice">
      <slot name="notice" />
    </div>
  </section>
</template>

<style scoped>
.preparation-review-layout {
  /* Modal rows follow the renderer density, with one shared narrow inset.
     Teleport deliberately keeps them outside the Dock's fixed-density map. */
  --ui-track-row-padding-inline: var(--ui-space-1);
  min-inline-size: 0;
  min-block-size: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: var(--ui-space-3);
}

.preparation-review-layout__summary {
  min-inline-size: 0;
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.preparation-review-layout__identity {
  min-inline-size: 0;
  display: grid;
  flex: 1;
  gap: var(--ui-space-2);
  font-variant-numeric: tabular-nums;
}

.preparation-review-layout__identity :deep(.app-folder-dossier__body) {
  padding-block: 0;
}

.preparation-review-layout__identity :deep(.app-folder-dossier__title),
.preparation-review-layout__identity :deep(.app-folder-dossier__description) {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
}

.preparation-review-layout__actions {
  flex: none;
}

.preparation-review-layout__scroll {
  --ui-scroll-layout-padding-inline-start: var(--ui-space-1);
  --ui-scroll-layout-padding-inline-end: var(--ui-space-1);
  --ui-scroll-layout-padding-block-start: var(--ui-space-1);
  --ui-scroll-layout-padding-block-end: var(--ui-space-1);
  min-block-size: 0;
}

.preparation-review-layout__notice {
  -webkit-user-select: text;
  user-select: text;
}
</style>

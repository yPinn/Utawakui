<script setup>
import { computed } from 'vue';
import { BadgeCheck, Disc3 } from '../../icons/index.js';
import { hasPlayableAccompaniment } from '../../utils/playableTrack.js';
import TrackIdentityRow from '../track/TrackIdentityRow.vue';
import UiHint from '../ui/UiHint.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  searchResults: { type: Array, default: () => [] },
  searchQuery: { type: String, default: '' },
  isLoading: { type: Boolean, default: false },
  isSaving: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits(['update:searchQuery', 'select']);

const resultRows = computed(() =>
  props.searchResults.map((track) => {
    const ready = hasPlayableAccompaniment(track);
    return {
      track,
      ready,
      sourceLabel: t(ready ? 'bgm.accompanimentReady' : 'bgm.originalOnly'),
    };
  }),
);
</script>

<template>
  <section
    class="bgm-track-picker"
    :aria-label="t('bgm.picker')"
    :aria-busy="isLoading || isSaving"
  >
    <UiSearchBox
      :model-value="searchQuery"
      :label="t('bgm.search')"
      :placeholder="t('bgm.searchPlaceholder')"
      :disabled="isSaving"
      @update:model-value="emit('update:searchQuery', $event)"
    />

    <UiHint v-if="error" tone="danger" role="alert">{{ error }}</UiHint>
    <UiHint v-if="isLoading" role="status">{{ t('bgm.loading') }}</UiHint>

    <UiScrollLayout
      v-else-if="searchQuery.trim()"
      class="bgm-track-picker__results-scroll"
      axis="vertical"
      scrollbar-visibility="auto"
      edge-shadow="none"
      :aria-label="t('bgm.results')"
      tabindex="0"
    >
      <ul class="bgm-track-picker__results">
        <TrackIdentityRow
          v-for="{ track, ready, sourceLabel } in resultRows"
          :key="track.id"
          :track="track"
          :interactive="!isSaving"
          :action-label="
            t('bgm.useNamed', {
              title: track.title ?? track.id,
              source: sourceLabel,
            })
          "
          hide-duration
          overflow="ellipsis"
          @row-click="emit('select', track.id)"
        >
          <template #trail>
            <UiStatusIcon
              :icon="ready ? BadgeCheck : Disc3"
              :tone="ready ? 'success' : 'muted'"
              :label="sourceLabel"
            />
          </template>
        </TrackIdentityRow>
        <li v-if="searchResults.length === 0">
          <UiHint center padded>{{ t('bgm.noMatch') }}</UiHint>
        </li>
      </ul>
    </UiScrollLayout>
  </section>
</template>

<style scoped>
.bgm-track-picker,
.bgm-track-picker__results {
  display: flex;
  min-width: 0;
  flex-direction: column;
}

.bgm-track-picker {
  min-block-size: 0;
  gap: var(--ui-space-2);
  overflow: hidden;
}

.bgm-track-picker :deep(.ui-search-box__control) {
  --ui-focus-offset: var(--ui-focus-offset-inset);
}

.bgm-track-picker__results-scroll {
  --ui-track-row-min-height: var(--ui-right-dock-track-row-min-height);
  --ui-track-row-thumb-size: var(--ui-right-dock-track-artwork-size);
  --ui-track-row-padding-inline: var(--ui-right-dock-track-row-padding-inline);

  min-block-size: 0;
  max-block-size: calc(
    3 * var(--ui-track-row-min-height) + 2 * var(--ui-track-list-gap)
  );
  flex: 1 1 auto;
}

.bgm-track-picker__results {
  gap: var(--ui-track-list-gap);
  padding: 0;
  margin: 0;
  list-style: none;
}
</style>

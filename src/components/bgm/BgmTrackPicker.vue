<script setup>
import TrackIdentityRow from '../track/TrackIdentityRow.vue';
import UiHint from '../ui/UiHint.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import { t } from '../../utils/i18n.js';

defineProps({
  searchResults: { type: Array, default: () => [] },
  searchQuery: { type: String, default: '' },
  isLoading: { type: Boolean, default: false },
  isSaving: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits(['update:searchQuery', 'select']);
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
      :aria-label="t('bgm.results')"
      tabindex="0"
    >
      <ul class="bgm-track-picker__results">
        <TrackIdentityRow
          v-for="track in searchResults"
          :key="track.id"
          :track="track"
          :interactive="!isSaving"
          :action-label="t('bgm.useNamed', { title: track.title ?? track.id })"
          overflow="ellipsis"
          @row-click="emit('select', track.id)"
        />
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

.bgm-track-picker__results-scroll {
  min-block-size: 0;
  flex: 1 1 auto;
}

.bgm-track-picker__results {
  gap: var(--ui-track-list-gap);
  padding: 0;
  margin: 0;
  list-style: none;
}
</style>

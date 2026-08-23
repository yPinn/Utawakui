<script setup>
import { computed, ref, useTemplateRef } from 'vue';
import { Search, Tag } from '../../icons/index.js';
import { useLyrics } from '../../composables/useLyrics.js';
import UiButton from '../ui/UiButton.vue';

const emit = defineEmits(['openSearch']);

const { selectedLyrics, backfillSourceLabels } = useLyrics();
const searchTriggerRef = useTemplateRef('searchTrigger');
const isBackfilling = ref(false);

const hasUnlabeledLrclibSources = computed(() =>
  selectedLyrics.value.sources.some(
    (source) => source.kind === 'lrclib' && !source.label,
  ),
);

async function handleBackfill() {
  isBackfilling.value = true;
  try {
    await backfillSourceLabels();
  } finally {
    isBackfilling.value = false;
  }
}

function openSearch() {
  emit('openSearch');
}

function focusSearchTrigger() {
  searchTriggerRef.value?.$el?.focus?.();
}

defineExpose({ focusSearchTrigger });
</script>

<template>
  <section class="lyrics-lrclib-search-panel" aria-label="線上歌詞">
    <div>
      <p class="lyrics-lrclib-search-panel__title">LRCLIB</p>
      <p class="lyrics-lrclib-search-panel__description">
        以可編輯的曲名與歌手搜尋逐字、逐行或純文字歌詞。
      </p>
    </div>
    <div class="lyrics-lrclib-search-panel__actions">
      <UiButton
        ref="searchTrigger"
        :icon="Search"
        variant="accent"
        @click="openSearch"
      >
        搜尋候選
      </UiButton>
      <UiButton
        v-if="hasUnlabeledLrclibSources"
        :icon="Tag"
        :active="isBackfilling"
        :disabled="isBackfilling"
        title="為既有 LRCLIB 來源補上標籤"
        @click="handleBackfill"
      >
        {{ isBackfilling ? '補齊中…' : '補齊標籤' }}
      </UiButton>
    </div>
  </section>
</template>

<style scoped>
.lyrics-lrclib-search-panel {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-4);
  padding-top: var(--ui-space-4);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.lyrics-lrclib-search-panel__title,
.lyrics-lrclib-search-panel__description {
  margin: 0;
}

.lyrics-lrclib-search-panel__title {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.lyrics-lrclib-search-panel__description {
  margin-top: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.lyrics-lrclib-search-panel__actions {
  display: flex;
  flex-shrink: 0;
  gap: var(--ui-space-2);
}

@media (max-width: 680px) {
  .lyrics-lrclib-search-panel {
    align-items: stretch;
    flex-direction: column;
  }

  .lyrics-lrclib-search-panel__actions {
    flex-wrap: wrap;
  }
}
</style>

<script setup>
import { computed, ref, useTemplateRef } from 'vue';
import { Search, Tag } from '../../icons/index.js';
import { useLyrics } from '../../composables/useLyrics.js';
import UiButton from '../ui/UiButton.vue';
import LyricsProviderIcon from './LyricsProviderIcon.vue';

const emit = defineEmits(['openSearch']);
const props = defineProps({
  providerId: { type: String, default: 'lrclib' },
  providerLabel: { type: String, default: 'LRCLIB' },
  primary: { type: Boolean, default: false },
});

const { selectedLyrics, backfillSourceLabels } = useLyrics();
const searchTriggerRef = useTemplateRef('searchTrigger');
const isBackfilling = ref(false);

const hasUnlabeledLrclibSources = computed(
  () =>
    props.providerId === 'lrclib' &&
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
  <section
    class="lyrics-lrclib-search-panel"
    :aria-label="`${providerLabel} 線上歌詞`"
  >
    <p class="lyrics-lrclib-search-panel__title">
      <LyricsProviderIcon :provider-id="providerId" />
      <span>{{ providerLabel }}</span>
    </p>
    <div class="lyrics-lrclib-search-panel__actions">
      <UiButton
        ref="searchTrigger"
        :icon="Search"
        :variant="primary ? 'accent' : 'ghost'"
        @click="openSearch"
      >
        搜尋
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
  gap: var(--ui-space-3);
  min-height: var(--ui-control-height);
  padding: var(--ui-space-2) 0;
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.lyrics-lrclib-search-panel:last-child {
  border-bottom: 0;
}

.lyrics-lrclib-search-panel__title {
  margin: 0;
}

.lyrics-lrclib-search-panel__title {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
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

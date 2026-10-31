<script setup>
import { formatLyricsSourceLabel } from '../../utils/lyricsSourcePresentation.js';
import { computed, useId } from 'vue';
import {
  formatLyricsSourceTier,
  lyricsSourceDisplayTier,
  sortLyricsSources,
} from '../../utils/lyrics.js';
import UiButton from '../ui/UiButton.vue';
import UiCombobox from '../ui/UiCombobox.vue';

const props = defineProps({
  sources: { type: Array, default: () => [] },
  selectedSourceFilename: { type: String, default: '' },
  hasSelectedTrack: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
  labelHidden: { type: Boolean, default: false },
});
const emit = defineEmits(['sourceChange', 'manageSources']);
const selectId = `lyrics-source-${useId()}`;
const options = computed(() => [
  { value: '', label: props.sources.length ? '不顯示歌詞' : '尚無歌詞來源' },
  ...sortLyricsSources(props.sources).map((source) => ({
    value: source.filename,
    label: formatLyricsSourceLabel(source),
    tierLabel: formatLyricsSourceTier(lyricsSourceDisplayTier(source)),
  })),
]);

function changeSource(filename) {
  emit('sourceChange', filename);
}

function manageSources() {
  emit('manageSources');
}
</script>

<template>
  <div class="lyrics-source-control">
    <UiCombobox
      :id="selectId"
      class="lyrics-source-control__select"
      label="歌詞來源"
      aria-label="歌詞來源"
      :label-hidden="labelHidden"
      :model-value="selectedSourceFilename"
      :items="options"
      :editable="false"
      :close-on-scroll="false"
      :disabled="!hasSelectedTrack || isLoading || sources.length === 0"
      @update:model-value="changeSource"
    >
      <template #option="{ item }">
        <template v-if="item.tierLabel">{{ item.tierLabel }} · </template
        >{{ item.label }}
      </template>
    </UiCombobox>
    <UiButton
      class="lyrics-source-control__manage"
      variant="secondary"
      :disabled="!hasSelectedTrack"
      title="搜尋、匯入與管理歌詞來源"
      aria-label="管理歌詞來源"
      @click="manageSources"
    >
      管理來源
    </UiButton>
  </div>
</template>

<style scoped>
.lyrics-source-control {
  display: flex;
  align-items: flex-end;
  gap: var(--ui-space-2);
  min-width: 0;
}

.lyrics-source-control :deep(.lyrics-source-control__select) {
  flex: 1 1 0;
  min-width: 0;
}

.lyrics-source-control__manage {
  flex-shrink: 0;
}
</style>

<script setup>
import {
  describePlaybackLyricsSources,
  formatLyricsSourceLabel,
  formatLyricsSourceTier,
} from '../../utils/lyricsSourcePresentation.js';
import { computed, useId } from 'vue';
import { Settings } from '../../icons/index.js';
import {
  lyricsSourceDisplayTier,
  sortLyricsSources,
} from '../../utils/lyrics.js';
import UiButton from '../ui/UiButton.vue';
import UiCombobox from '../ui/UiCombobox.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  sources: { type: Array, default: () => [] },
  selectedSourceFilename: { type: String, default: '' },
  hasSelectedTrack: { type: Boolean, default: false },
  isLoading: { type: Boolean, default: false },
  labelHidden: { type: Boolean, default: false },
  emptySourceLabel: { type: String, default: '' },
  playbackLabels: { type: Boolean, default: false },
});
const emit = defineEmits(['sourceChange', 'manageSources']);
const selectId = `lyrics-source-${useId()}`;
const sourceChoices = computed(() =>
  describePlaybackLyricsSources(props.sources),
);
const options = computed(() => [
  {
    value: '',
    label: props.sources.length
      ? t('lyricsSource.control.hide')
      : props.emptySourceLabel || t('lyricsSource.control.none'),
  },
  ...sortLyricsSources(props.sources).map((source) => ({
    value: source.filename,
    label: props.playbackLabels
      ? sourceChoices.value.get(source.filename).label
      : formatLyricsSourceLabel(
          source,
          sourceChoices.value.get(source.filename).alias,
        ),
    tierLabel: props.playbackLabels
      ? ''
      : formatLyricsSourceTier(lyricsSourceDisplayTier(source)),
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
      :label="t('lyricsSource.control.label')"
      :aria-label="t('lyricsSource.control.label')"
      :label-hidden="labelHidden"
      :model-value="selectedSourceFilename"
      :items="options"
      :editable="false"
      :close-on-scroll="false"
      :disabled="!hasSelectedTrack || isLoading || sources.length === 0"
      @update:model-value="changeSource"
    >
      <template #option="{ item }">
        <span
          v-if="playbackLabels"
          class="lyrics-source-control__playback-option"
        >
          {{ item.label }}
        </span>
        <template v-else>
          <template v-if="item.tierLabel">{{ item.tierLabel }} · </template>
          {{ item.label }}
        </template>
      </template>
    </UiCombobox>
    <UiButton
      class="lyrics-source-control__manage"
      :icon="Settings"
      variant="secondary"
      :disabled="!hasSelectedTrack"
      :title="t('lyricsSource.control.manageLabel')"
      :aria-label="t('lyricsSource.control.manageLabel')"
      @click="manageSources"
    />
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

.lyrics-source-control__playback-option {
  display: block;
  overflow-wrap: anywhere;
  white-space: normal;
}
</style>

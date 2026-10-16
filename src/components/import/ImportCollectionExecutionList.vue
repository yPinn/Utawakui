<script setup>
import { computed } from 'vue';
import { CircleX, RefreshCw, Square } from '../../icons/index.js';
import {
  identityArtistLabel,
  identityTitle,
} from '../../utils/importCandidateDisplay.js';
import {
  downloadFailureHint,
  downloadFailureLabel,
} from '../../utils/downloadFailureDisplay.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';

const props = defineProps({
  tracks: { type: Array, default: () => [] },
  retryDisabled: { type: Boolean, default: false },
});

const emit = defineEmits(['cancel', 'retryFailed']);

function executionTrack(source) {
  return {
    ...source,
    title: identityTitle(source.trackIdentity, source.title),
    artist: identityArtistLabel(source.trackIdentity, source.artist),
  };
}

const selectedTracks = computed(() =>
  props.tracks.filter((track) => track.selected),
);
const sections = computed(() =>
  [
    {
      id: 'active',
      label: '處理中',
      tracks: selectedTracks.value.filter(
        (track) => track.status === 'downloading',
      ),
    },
    {
      id: 'pending',
      label: '接下來',
      tracks: selectedTracks.value.filter(
        (track) => !track.alreadyDownloaded && track.status === 'pending',
      ),
    },
    {
      id: 'failed',
      label: '未完成',
      tracks: selectedTracks.value.filter((track) => track.status === 'error'),
    },
    {
      id: 'completed',
      label: '已完成',
      tracks: selectedTracks.value.filter(
        (track) => track.alreadyDownloaded || track.status === 'done',
      ),
    },
  ].filter((section) => section.tracks.length > 0),
);

function failureLabel(track) {
  if (!track.errorCode) return '下載未完成';
  return `${downloadFailureLabel(track.errorCode)}｜${downloadFailureHint(track.errorCode)}`;
}
</script>

<template>
  <div class="import-execution-list">
    <section
      v-for="section in sections"
      :key="section.id"
      class="import-execution-list__section"
      :aria-labelledby="`import-execution-${section.id}`"
    >
      <header class="import-execution-list__header">
        <h4 :id="`import-execution-${section.id}`">
          {{ section.label }}
          <span class="import-execution-list__count">{{
            section.tracks.length
          }}</span>
        </h4>
        <UiIconButton
          v-if="section.id === 'failed'"
          :icon="RefreshCw"
          label="重試未完成曲目"
          :disabled="retryDisabled"
          @click="emit('retryFailed')"
        />
      </header>

      <ul class="import-execution-list__rows">
        <UiTrackRow
          v-for="source in section.tracks"
          :key="source.id"
          class="import-execution-list__row"
          :track="executionTrack(source)"
          state-surface
          overflow="ellipsis"
          thumb-loading="lazy"
          thumb-decoding="async"
        >
          <template v-if="section.id === 'active'" #trail>
            <UiIconButton
              :icon="Square"
              :label="`停止下載 ${executionTrack(source).title}`"
              @click="emit('cancel', source.id)"
            />
          </template>
          <template v-else-if="section.id === 'failed'" #trail>
            <UiStatusIcon
              :icon="CircleX"
              tone="danger"
              :label="failureLabel(source)"
            />
          </template>
        </UiTrackRow>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.import-execution-list {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-side-panel-section-gap);
}

.import-execution-list__section {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-side-panel-content-gap);
}

.import-execution-list__header {
  min-inline-size: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
}

.import-execution-list__header h4 {
  min-inline-size: 0;
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.import-execution-list__count {
  margin-inline-start: var(--ui-space-1);
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
  font-weight: var(--ui-type-caption-weight);
}

.import-execution-list__rows {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.import-execution-list__row {
  inline-size: 100%;
  min-inline-size: 0;
  max-inline-size: 100%;
  box-sizing: border-box;
}
</style>

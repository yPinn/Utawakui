<script setup>
import { computed } from 'vue';
import { ListChecks, RefreshCw, SquareCheckBig } from '../../icons/index.js';
import { useImportSession } from '../../composables/useImportSession.js';
import {
  downloadFailureHint,
  downloadFailureTone,
} from '../../utils/downloadFailureDisplay.js';
import {
  identityArtistLabel,
  identityTitle,
} from '../../utils/importCandidateDisplay.js';
import ImportCollectionExecutionList from './ImportCollectionExecutionList.vue';
import ImportCollectionTrackStatus from './ImportCollectionTrackStatus.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiTrackRow from '../ui/UiTrackRow.vue';

const {
  state,
  playlistStats,
  dominantFailureCode,
  visiblePlaylistTracks,
  selectablePlaylistTracks,
  allSelected,
  canRetryFailed,
  filterOptions,
  setActiveFilter,
  setTrackSelected,
  cancelTrackDownload,
  toggleSelectAll,
  selectMissingTracks,
  retryFailedTracks,
} = useImportSession();

const collectionLabel = computed(() =>
  state.collectionKind === 'album' ? '專輯' : '播放清單',
);
const executionMode = computed(
  () =>
    state.isImporting ||
    (state.playlistTracks ?? []).some((track) =>
      ['downloading', 'done', 'error'].includes(track.status),
    ),
);
const filterItems = computed(() =>
  filterOptions.value.map((filter) => ({
    id: filter.key,
    label: filter.label,
    count: filter.count,
  })),
);
const reviewEntries = computed(() =>
  visiblePlaylistTracks.value.map((source) => ({
    track: {
      ...source,
      title: identityTitle(source.trackIdentity, source.title),
      artist: identityArtistLabel(source.trackIdentity, source.artist),
    },
    source,
  })),
);

function checkboxId(trackId) {
  return `import-collection-track-${encodeURIComponent(String(trackId))}`;
}
</script>

<template>
  <section class="import-collection-review" aria-label="匯入曲目確認">
    <header class="import-collection-review__summary">
      <h3 class="import-collection-review__title">
        {{ state.playlistTitle || '未命名清單' }}
      </h3>
      <p class="import-collection-review__meta">
        {{ collectionLabel }} · {{ playlistStats.total }} 首
      </p>
    </header>

    <ImportCollectionExecutionList
      v-if="executionMode"
      :tracks="state.playlistTracks"
      :retry-disabled="!canRetryFailed"
      @cancel="cancelTrackDownload"
      @retry-failed="retryFailedTracks"
    />

    <template v-else>
      <div class="import-collection-review__toolbar">
        <UiSegmentedControl
          :items="filterItems"
          :model-value="state.activeFilter"
          aria-label="匯入曲目篩選"
          :disabled="state.isImporting"
          @update:model-value="setActiveFilter"
        >
          <template #after="{ item }">
            <span class="import-collection-review__filter-count">
              {{ item.count }}
            </span>
          </template>
        </UiSegmentedControl>

        <div class="import-collection-review__actions">
          <UiIconButton
            :icon="ListChecks"
            label="選取未下載"
            :disabled="state.isImporting"
            @click="selectMissingTracks"
          />
          <UiIconButton
            :icon="SquareCheckBig"
            :label="allSelected ? '取消全選' : '全選'"
            :active="allSelected"
            :disabled="
              state.isImporting || selectablePlaylistTracks.length === 0
            "
            :aria-pressed="allSelected"
            @click="toggleSelectAll"
          />
          <UiIconButton
            v-if="playlistStats.error > 0"
            :icon="RefreshCw"
            label="重試失敗"
            :disabled="!canRetryFailed"
            @click="retryFailedTracks"
          />
        </div>
      </div>

      <ul
        v-if="reviewEntries.length > 0"
        class="import-collection-review__rows"
        aria-label="匯入曲目確認"
      >
        <UiTrackRow
          v-for="entry in reviewEntries"
          :key="entry.source.id"
          class="import-collection-review__row"
          :track="entry.track"
          :active="entry.source.selected"
          state-surface
          overflow="ellipsis"
          thumb-loading="lazy"
          thumb-decoding="async"
        >
          <template #lead>
            <UiCheckbox
              :id="checkboxId(entry.source.id)"
              :model-value="entry.source.selected"
              :label="`選取 ${entry.track.title}`"
              label-hidden
              :disabled="entry.source.status === 'done'"
              @update:model-value="setTrackSelected(entry.source.id, $event)"
            />
          </template>
          <template #trail>
            <ImportCollectionTrackStatus :track="entry.source" />
          </template>
        </UiTrackRow>
      </ul>
      <UiHint v-else class="import-collection-review__empty" padded center>
        沒有符合目前篩選的曲目
      </UiHint>
    </template>

    <UiHint
      v-if="dominantFailureCode"
      class="import-collection-review__failure"
      :tone="downloadFailureTone(dominantFailureCode)"
      role="status"
    >
      {{ downloadFailureHint(dominantFailureCode) }}
    </UiHint>
  </section>
</template>

<style scoped>
.import-collection-review {
  min-inline-size: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.import-collection-review__summary {
  min-inline-size: 0;
}

.import-collection-review__title {
  margin: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-type-title-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.import-collection-review__meta {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  font-variant-numeric: tabular-nums;
}

.import-collection-review__toolbar {
  min-inline-size: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.import-collection-review__actions {
  flex: none;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: var(--ui-space-1);
}

.import-collection-review__filter-count {
  color: var(--ui-color-text-muted);
  font-variant-numeric: tabular-nums;
}

.import-collection-review__rows,
.import-collection-review__empty {
  min-inline-size: 0;
  min-block-size: 0;
}

.import-collection-review__rows {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.import-collection-review__row {
  inline-size: 100%;
  min-inline-size: 0;
  max-inline-size: 100%;
  box-sizing: border-box;
}

.import-collection-review__failure {
  min-inline-size: 0;
}

@container (max-width: 42rem) {
  .import-collection-review__toolbar {
    align-items: stretch;
    flex-direction: column;
  }

  .import-collection-review__actions {
    justify-content: flex-start;
  }
}
</style>

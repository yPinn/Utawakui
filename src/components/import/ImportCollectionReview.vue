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
import ImportCollectionTrackStatus from './ImportCollectionTrackStatus.vue';
import TrackTable from '../track/TrackTable.vue';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';

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
  toggleSelectAll,
  selectMissingTracks,
  retryFailedTracks,
} = useImportSession();

const collectionLabel = computed(() =>
  state.collectionKind === 'album' ? '專輯' : '播放清單',
);
const filterItems = computed(() =>
  filterOptions.value.map((filter) => ({
    id: filter.key,
    label: filter.label,
    count: filter.count,
  })),
);
const reviewEntries = computed(() =>
  visiblePlaylistTracks.value.map((source, visibleIndex) => ({
    track: {
      ...source,
      title: identityTitle(source.trackIdentity, source.title),
      artist: identityArtistLabel(source.trackIdentity, source.artist),
    },
    source,
    visibleIndex,
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
        <UiButton
          :icon="ListChecks"
          :disabled="state.isImporting"
          @click="selectMissingTracks"
        >
          選取未下載
        </UiButton>
        <UiButton
          :icon="SquareCheckBig"
          :active="allSelected"
          :disabled="state.isImporting || selectablePlaylistTracks.length === 0"
          :aria-pressed="allSelected"
          @click="toggleSelectAll"
        >
          {{ allSelected ? '取消全選' : '全選' }}
        </UiButton>
        <UiButton
          v-if="playlistStats.error > 0"
          :icon="RefreshCw"
          :disabled="!canRetryFailed"
          @click="retryFailedTracks"
        >
          重試失敗
        </UiButton>
      </div>
    </div>

    <TrackTable
      v-if="reviewEntries.length > 0"
      class="import-collection-review__table"
      :entries="reviewEntries"
      variant="review"
      label="匯入曲目確認"
      duration-label="時長"
      status-label="狀態"
    >
      <template #row-leading="{ track, source }">
        <UiCheckbox
          :id="checkboxId(source.id)"
          :model-value="source.selected"
          :label="`選取 ${track.title}`"
          label-hidden
          :disabled="state.isImporting || source.status === 'done'"
          @update:model-value="setTrackSelected(source.id, $event)"
        />
      </template>
      <template #row-trailing="{ source }">
        <ImportCollectionTrackStatus :track="source" />
      </template>
    </TrackTable>
    <UiHint v-else class="import-collection-review__empty" padded center>
      沒有符合目前篩選的曲目
    </UiHint>

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
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.import-collection-review__meta {
  margin: var(--ui-space-1) 0 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
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

.import-collection-review__table,
.import-collection-review__empty {
  min-inline-size: 0;
  min-block-size: 0;
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

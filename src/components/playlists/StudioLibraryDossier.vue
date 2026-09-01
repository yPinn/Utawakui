<script setup>
import { computed, shallowRef } from 'vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import StudioLibraryDossierHeader from './StudioLibraryDossierHeader.vue';
import StudioLibraryTrackTable from './StudioLibraryTrackTable.vue';

const props = defineProps({
  collectionType: { type: String, required: true },
  kindLabel: { type: String, required: true },
  title: { type: String, required: true },
  summary: { type: String, default: '' },
  description: { type: String, default: '' },
  tracks: { type: Array, default: () => [] },
  coverUrl: { type: String, default: '' },
  canCollage: { type: Boolean, default: true },
  currentTrackId: { type: String, default: null },
  loading: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' },
});

const emit = defineEmits(['retry']);
const searchQuery = shallowRef('');
const normalizedSearchQuery = computed(() =>
  searchQuery.value.trim().toLocaleLowerCase(),
);
const visibleTracks = computed(() => {
  const query = normalizedSearchQuery.value;
  if (!query) return props.tracks;
  return props.tracks.filter((track) =>
    [track.title, track.artist, track.album, track.filename, track.id].some(
      (value) =>
        String(value ?? '')
          .toLocaleLowerCase()
          .includes(query),
    ),
  );
});
const emptyCollectionName = computed(() => {
  if (props.collectionType === 'album') return '專輯';
  if (props.collectionType === 'playlist') return '播放清單';
  return '曲庫';
});
</script>

<template>
  <section class="studio-dossier" aria-labelledby="studio-library-title">
    <StudioLibraryDossierHeader
      :kind-label="kindLabel"
      :title="title"
      :summary="summary"
      :description="description"
      :tracks="tracks"
      :cover-url="coverUrl"
      :can-collage="canCollage"
    />

    <div class="studio-dossier__body">
      <section class="studio-dossier__document" :aria-label="`${title}內容`">
        <div class="studio-dossier__toolbar">
          <UiSearchBox
            v-model="searchQuery"
            label="搜尋目前集合"
            placeholder="搜尋曲目或演出者"
          />
          <span class="studio-dossier__read-only">唯讀接入</span>
        </div>

        <UiNotice
          class="studio-dossier__note"
          tone="info"
          title="遷移切面"
          message="資料來自目前的本機曲庫；這一版不建立第二個播放器，也不改寫播放佇列。"
          compact
        />

        <div v-if="loading" class="studio-dossier__state" role="status">
          正在讀取本機曲庫…
        </div>
        <div
          v-else-if="errorMessage"
          class="studio-dossier__state"
          role="alert"
        >
          <strong>曲庫讀取未完成</strong>
          <span>{{ errorMessage }}</span>
          <button type="button" @click="emit('retry')">重新整理</button>
        </div>
        <div
          v-else-if="tracks.length === 0"
          class="studio-dossier__state"
          role="status"
        >
          <strong>這個{{ emptyCollectionName }}還沒有曲目</strong>
          <span>可先從 Import 匯入，或在既有 Setlist 中加入曲目。</span>
        </div>
        <div
          v-else-if="visibleTracks.length === 0"
          class="studio-dossier__state"
          role="status"
        >
          <strong>找不到符合條件的曲目</strong>
          <span>清除搜尋，或改用曲名、演出者與檔案名稱查找。</span>
        </div>
        <StudioLibraryTrackTable
          v-else
          :title="title"
          :tracks="visibleTracks"
          :current-track-id="currentTrackId"
          :show-artwork="collectionType !== 'album'"
        />
      </section>
    </div>
  </section>
</template>

<style scoped>
.studio-dossier {
  --ui-color-text-muted: color-mix(
    in srgb,
    var(--ui-color-text) 76%,
    var(--ui-color-folder-primary)
  );
  --ui-color-text-subtle: color-mix(
    in srgb,
    var(--ui-color-text) 62%,
    var(--ui-color-folder-primary)
  );
  --ui-color-border: color-mix(
    in srgb,
    var(--ui-color-text) 22%,
    var(--ui-color-folder-primary)
  );
  container: dossier / inline-size;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  padding: var(--ui-folder-perimeter);
  overflow: hidden;
  color: var(--ui-color-text);
  background: var(--ui-color-folder-primary);
  border-radius: var(--ui-radius-sm);
}

.studio-dossier__body {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  overflow: hidden;
  background: transparent;
}

.studio-dossier__document {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  flex: 1;
  padding: var(--ui-panel-inset);
  overflow: hidden;
}

.studio-dossier__toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-3);
}

.studio-dossier__toolbar :deep(.ui-search-box) {
  width: min(24rem, 100%);
}

.studio-dossier__read-only {
  flex: 0 0 auto;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.studio-dossier__note {
  margin-bottom: var(--ui-space-3);
}

.studio-dossier__state {
  display: flex;
  min-height: 10rem;
  align-items: center;
  justify-content: center;
  flex: 1;
  flex-direction: column;
  gap: var(--ui-space-2);
  padding: var(--ui-space-5);
  color: var(--ui-color-text-muted);
  text-align: center;
}

.studio-dossier__state strong {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  line-height: var(--ui-line-height-title);
}

.studio-dossier__state span,
.studio-dossier__state button {
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.studio-dossier__state button {
  min-height: var(--ui-control-height);
  margin-top: var(--ui-space-2);
  padding: 0 var(--ui-space-3);
  color: var(--ui-color-accent-contrast);
  background: var(--ui-color-accent);
  border: 0;
  border-radius: var(--ui-radius-md);
  cursor: pointer;
}

.studio-dossier__state button:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

@container dossier (max-width: 45rem) {
  .studio-dossier__note,
  .studio-dossier__read-only {
    display: none;
  }
}
</style>

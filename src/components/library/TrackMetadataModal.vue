<script setup>
import { computed, shallowRef, watch } from 'vue';
import { ChevronUp, Search, SlidersHorizontal } from '../../icons/index.js';
import ArtworkPreviewPane from './ArtworkPreviewPane.vue';
import ArtworkSearchResults from './ArtworkSearchResults.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiTextField from '../ui/UiTextField.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  artist: { type: String, default: '' },
  thumbnailUrl: { type: String, default: '' },
  saving: { type: Boolean, default: false },
  artworkSaving: { type: Boolean, default: false },
  artworkSearching: { type: Boolean, default: false },
  artworkSearchOpen: { type: Boolean, default: false },
  artworkSearchCompleted: { type: Boolean, default: false },
  artworkQuery: {
    type: Object,
    default: () => ({ album: '' }),
  },
  artworkCandidates: { type: Array, default: () => [] },
  selectedArtworkCandidateId: { type: String, default: null },
  error: { type: String, default: '' },
});

const emit = defineEmits([
  'close',
  'save',
  'chooseThumbnail',
  'clearThumbnail',
  'openArtworkSearch',
  'closeArtworkSearch',
  'updateArtworkQuery',
  'searchArtwork',
  'selectArtworkCandidate',
  'applyArtwork',
  'updateTitle',
  'updateArtist',
]);

const searchOptionsOpen = shallowRef(false);

const currentTrack = computed(() => ({
  title: props.title,
  artist: props.artist,
  thumbnailUrl: props.thumbnailUrl,
}));

const selectedArtworkCandidate = computed(
  () =>
    props.artworkCandidates.find(
      (candidate) => candidate.id === props.selectedArtworkCandidateId,
    ) || null,
);

const fieldsDisabled = computed(
  () => props.saving || props.artworkSaving || props.artworkSearching,
);

watch(
  () => props.artworkSearchOpen,
  (open) => {
    if (!open) searchOptionsOpen.value = false;
  },
);
</script>

<template>
  <UiModal
    :open="open"
    title="編輯資訊"
    size="wide"
    fixed-height
    @close="emit('close')"
  >
    <template #default>
      <div class="track-metadata">
        <ArtworkPreviewPane
          class="track-metadata__preview"
          :current-track="currentTrack"
          :candidate="selectedArtworkCandidate"
          :search-open="artworkSearchOpen"
          :disabled="saving || artworkSaving"
          :artwork-saving="artworkSaving"
          :artwork-searching="artworkSearching"
          @choose="emit('chooseThumbnail')"
          @clear="emit('clearThumbnail')"
          @open-search="emit('openArtworkSearch')"
          @apply="emit('applyArtwork')"
        />

        <div class="track-metadata__workspace">
          <section
            class="track-metadata__section"
            aria-labelledby="track-metadata-fields-heading"
          >
            <h3
              id="track-metadata-fields-heading"
              class="track-metadata__section-title"
            >
              歌曲資料
            </h3>
            <div class="track-metadata__fields">
              <UiTextField
                id="track-metadata-title"
                :model-value="title"
                label="歌名"
                maxlength="200"
                required
                :disabled="fieldsDisabled"
                @update:model-value="emit('updateTitle', $event)"
                @keydown.enter="emit('save')"
              />
              <UiTextField
                id="track-metadata-artist"
                :model-value="artist"
                label="演唱者"
                maxlength="200"
                :disabled="fieldsDisabled"
                @update:model-value="emit('updateArtist', $event)"
                @keydown.enter="emit('save')"
              />
            </div>
          </section>

          <section
            v-if="artworkSearchOpen"
            class="track-metadata__section track-metadata__search"
            aria-labelledby="track-artwork-search-heading"
          >
            <div class="track-metadata__search-heading">
              <div class="track-metadata__search-copy">
                <h3
                  id="track-artwork-search-heading"
                  class="track-metadata__section-title"
                >
                  線上搜尋封面
                </h3>
                <UiHint>使用外部來源搜尋；套用前不會更換封面。</UiHint>
              </div>
              <div class="track-metadata__search-actions">
                <UiIconButton
                  :icon="SlidersHorizontal"
                  label="設定專輯篩選"
                  :active="searchOptionsOpen"
                  :aria-pressed="searchOptionsOpen"
                  aria-controls="track-artwork-search-options"
                  :disabled="fieldsDisabled"
                  @click="searchOptionsOpen = !searchOptionsOpen"
                />
                <UiIconButton
                  :icon="ChevronUp"
                  label="收合線上搜尋"
                  :disabled="artworkSearching || artworkSaving"
                  @click="emit('closeArtworkSearch')"
                />
                <UiButton
                  variant="accent"
                  :icon="Search"
                  :loading="artworkSearching"
                  loading-label="搜尋中"
                  :disabled="
                    saving || artworkSaving || !String(title || '').trim()
                  "
                  @click="emit('searchArtwork')"
                >
                  搜尋
                </UiButton>
              </div>
            </div>

            <div
              v-if="searchOptionsOpen"
              id="track-artwork-search-options"
              class="track-metadata__search-options"
            >
              <UiTextField
                id="track-artwork-album-filter"
                :model-value="artworkQuery.album"
                label="專輯（選填）"
                hint="結果太多或版本相近時再填。"
                maxlength="200"
                :disabled="fieldsDisabled"
                @update:model-value="
                  emit('updateArtworkQuery', 'album', $event)
                "
                @keydown.enter.prevent="emit('searchArtwork')"
              />
            </div>

            <UiHint v-if="artworkSearching" role="status">
              正在尋找最相符的封面…
            </UiHint>

            <ArtworkSearchResults
              v-if="artworkCandidates.length > 0"
              :candidates="artworkCandidates"
              :selected-id="selectedArtworkCandidateId"
              :disabled="artworkSearching || artworkSaving"
              @select="emit('selectArtworkCandidate', $event)"
            />

            <UiHint
              v-else-if="artworkSearchCompleted && !artworkSearching"
              class="track-metadata__empty"
              role="status"
            >
              找不到可用封面。請確認歌名與演唱者，必要時再填入專輯縮小範圍。
            </UiHint>
          </section>

          <UiNotice
            v-if="error"
            tone="danger"
            title="操作未完成"
            :message="error"
            compact
          />
        </div>
      </div>
    </template>

    <template #footer>
      <UiButton
        variant="accent"
        :disabled="fieldsDisabled"
        @click="emit('save')"
      >
        儲存歌曲資料
      </UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.track-metadata {
  min-height: 100%;
  display: grid;
  grid-template-columns: minmax(13rem, 15rem) minmax(0, 1fr);
  align-items: start;
  gap: var(--ui-space-4);
}

.track-metadata__preview {
  position: sticky;
  top: 0;
  align-self: start;
}

.track-metadata__workspace,
.track-metadata__section {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
}

.track-metadata__section-title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-label);
}

.track-metadata__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-3);
}

.track-metadata__search {
  padding-top: var(--ui-space-4);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.track-metadata__search-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--ui-space-3);
}

.track-metadata__search-copy {
  min-width: 0;
  flex: 1 1 12rem;
  display: grid;
  gap: var(--ui-space-1);
}

.track-metadata__search-actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
}

.track-metadata__search-options {
  min-width: 0;
  padding: var(--ui-space-3);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface-raised);
}

.track-metadata__empty {
  padding: var(--ui-space-3);
  border: var(--ui-border-width) dashed var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  text-align: center;
}

@media (max-width: 760px) {
  .track-metadata {
    grid-template-columns: minmax(0, 1fr);
  }

  .track-metadata__preview {
    position: static;
  }

  .track-metadata__fields {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

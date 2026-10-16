<script setup>
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue';
import { ChevronUp, Search, SlidersHorizontal, X } from '../../icons/index.js';
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
  dirty: { type: Boolean, default: false },
  artworkChanged: { type: Boolean, default: false },
  saving: { type: Boolean, default: false },
  artworkPreparing: { type: Boolean, default: false },
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
  'updateTitle',
  'updateArtist',
]);

const searchOptionsOpen = shallowRef(false);
const titleField = useTemplateRef('titleField');
const artworkSearchHeading = useTemplateRef('artworkSearchHeading');
const artworkSearchTrigger = useTemplateRef('artworkSearchTrigger');
const albumFilterField = useTemplateRef('albumFilterField');
const albumFilterTrigger = useTemplateRef('albumFilterTrigger');

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

const fieldsDisabled = computed(() => props.saving || props.artworkPreparing);
const searchControlsDisabled = computed(
  () => props.saving || props.artworkPreparing || props.artworkSearching,
);
const closeDisabled = computed(() => props.saving || props.artworkPreparing);
const titleError = computed(() =>
  props.error === '歌名必填' ? props.error : '',
);
const generalError = computed(() => (titleError.value ? '' : props.error));

function cancel() {
  if (closeDisabled.value) return;
  emit('close');
}

async function focusArtworkSearch() {
  await nextTick();
  artworkSearchHeading.value?.focus();
}

async function restoreArtworkSearchTrigger() {
  await nextTick();
  artworkSearchTrigger.value
    ?.querySelector('[data-artwork-search-trigger]')
    ?.focus();
}

async function focusAlbumFilter() {
  await nextTick();
  albumFilterField.value?.focus();
}

async function closeAlbumFilter({ restoreFocus = false } = {}) {
  searchOptionsOpen.value = false;
  if (!restoreFocus) return;
  await nextTick();
  albumFilterTrigger.value?.$el?.focus?.();
}

watch(
  () => props.artworkSearchOpen,
  (open, wasOpen) => {
    if (open) {
      void focusArtworkSearch();
      return;
    }
    searchOptionsOpen.value = false;
    if (wasOpen && props.open) void restoreArtworkSearchTrigger();
  },
);

watch(titleError, (error) => {
  if (error) void nextTick(() => titleField.value?.focus());
});

watch(searchOptionsOpen, (open) => {
  if (open) void focusAlbumFilter();
});
</script>

<template>
  <UiModal
    :open="open"
    title="編輯歌曲"
    size="wide"
    max-block-size="medium"
    fixed-height
    :close-disabled="closeDisabled"
    @close="cancel"
  >
    <template #default>
      <div class="track-metadata">
        <div ref="artworkSearchTrigger" class="track-metadata__preview">
          <ArtworkPreviewPane
            :current-track="currentTrack"
            :candidate="selectedArtworkCandidate"
            :staged="artworkChanged"
            :search-open="artworkSearchOpen"
            :disabled="saving"
            :artwork-preparing="artworkPreparing"
            :artwork-searching="artworkSearching"
            @choose="emit('chooseThumbnail')"
            @clear="emit('clearThumbnail')"
            @open-search="emit('openArtworkSearch')"
          />
        </div>

        <div class="track-metadata__workspace">
          <section class="track-metadata__section" aria-label="基本資料">
            <div class="track-metadata__fields">
              <UiTextField
                id="track-metadata-title"
                ref="titleField"
                :model-value="title"
                label="歌名"
                :error="titleError"
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
                  ref="artworkSearchHeading"
                  class="track-metadata__section-title"
                  tabindex="-1"
                >
                  搜尋封面
                </h3>
                <UiHint>選取後預覽，儲存後套用。</UiHint>
              </div>
              <div class="track-metadata__search-actions">
                <UiIconButton
                  ref="albumFilterTrigger"
                  :icon="SlidersHorizontal"
                  label="設定專輯篩選"
                  :active="searchOptionsOpen"
                  :aria-pressed="searchOptionsOpen"
                  :aria-expanded="searchOptionsOpen"
                  aria-controls="track-artwork-search-options"
                  :disabled="searchControlsDisabled"
                  @click="searchOptionsOpen = !searchOptionsOpen"
                />
                <UiIconButton
                  :icon="ChevronUp"
                  label="收合線上搜尋"
                  :disabled="artworkSearching || artworkPreparing"
                  @click="emit('closeArtworkSearch')"
                />
                <UiButton
                  variant="secondary"
                  :icon="Search"
                  :loading="artworkSearching"
                  loading-label="搜尋中"
                  :disabled="
                    saving || artworkPreparing || !String(title || '').trim()
                  "
                  @click="emit('searchArtwork')"
                >
                  搜尋
                </UiButton>
              </div>
            </div>

            <form
              v-if="searchOptionsOpen"
              id="track-artwork-search-options"
              class="track-metadata__search-options"
              role="search"
              aria-label="專輯篩選"
              @submit.prevent="emit('searchArtwork')"
              @keydown.escape.stop.prevent="
                closeAlbumFilter({ restoreFocus: true })
              "
            >
              <UiTextField
                id="track-artwork-album-filter"
                ref="albumFilterField"
                :model-value="artworkQuery.album"
                label="專輯（選填）"
                placeholder="專輯（選填）"
                label-hidden
                maxlength="200"
                :disabled="searchControlsDisabled"
                @update:model-value="
                  emit('updateArtworkQuery', 'album', $event)
                "
              />
              <UiIconButton
                :icon="Search"
                label="以專輯條件搜尋"
                :loading="artworkSearching"
                loading-label="搜尋中"
                :disabled="
                  saving || artworkPreparing || !String(title || '').trim()
                "
                @click="emit('searchArtwork')"
              />
              <UiIconButton
                :icon="X"
                label="關閉專輯篩選"
                :disabled="saving || artworkPreparing"
                @click="closeAlbumFilter({ restoreFocus: true })"
              />
            </form>

            <UiHint v-if="artworkSearching" role="status">
              正在尋找封面…
            </UiHint>

            <ArtworkSearchResults
              v-if="artworkCandidates.length > 0"
              :candidates="artworkCandidates"
              :selected-id="selectedArtworkCandidateId"
              :disabled="artworkSearching || artworkPreparing"
              @select="emit('selectArtworkCandidate', $event)"
            />

            <UiHint
              v-else-if="artworkSearchCompleted && !artworkSearching"
              class="track-metadata__empty"
              role="status"
            >
              找不到封面。請確認歌名與演唱者，或加入專輯名稱後再搜尋。
            </UiHint>
          </section>

          <UiNotice
            v-if="generalError"
            tone="danger"
            title="操作未完成"
            :message="generalError"
            compact
          />
        </div>
      </div>
    </template>

    <template #footer>
      <UiButton variant="secondary" :disabled="closeDisabled" @click="cancel">
        取消
      </UiButton>
      <UiButton
        variant="accent"
        :loading="saving"
        loading-label="儲存中"
        :disabled="fieldsDisabled || !dirty"
        @click="emit('save')"
      >
        儲存
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
  display: grid;
  gap: var(--ui-space-2);
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
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-label-line-height);
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
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: start;
  gap: var(--ui-space-1);
  padding-block: var(--ui-space-2);
  border-block: var(--ui-border-width) solid var(--ui-color-border);
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

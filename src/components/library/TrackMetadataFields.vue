<script setup>
import { computed, nextTick, shallowRef, useTemplateRef, watch } from 'vue';
import { ChevronUp, Search, SlidersHorizontal, X } from '../../icons/index.js';
import ArtworkPreviewPane from './ArtworkPreviewPane.vue';
import ArtworkSearchResults from './ArtworkSearchResults.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiTextField from '../ui/UiTextField.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  readOnly: { type: Boolean, default: false },
  title: { type: String, default: '' },
  artist: { type: String, default: '' },
  thumbnailUrl: { type: String, default: '' },
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
  titleError: { type: String, default: '' },
  error: { type: String, default: '' },
});

const emit = defineEmits([
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

const fieldsDisabled = computed(
  () => props.readOnly || props.saving || props.artworkPreparing,
);
const searchControlsDisabled = computed(
  () =>
    props.readOnly ||
    props.saving ||
    props.artworkPreparing ||
    props.artworkSearching,
);
const titleError = computed(() => props.titleError);
const generalError = computed(() => (titleError.value ? '' : props.error));

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
    if (open && props.open) {
      void focusArtworkSearch();
      return;
    }
    searchOptionsOpen.value = false;
    if (wasOpen && props.open) void restoreArtworkSearchTrigger();
  },
);

watch(titleError, (error) => {
  if (error && props.open) void nextTick(() => titleField.value?.focus());
});
watch(
  () => props.open,
  (open) => {
    if (open && titleError.value)
      void nextTick(() => titleField.value?.focus());
  },
);

watch(searchOptionsOpen, (open) => {
  if (open) void focusAlbumFilter();
});
</script>

<template>
  <div class="track-metadata">
    <div ref="artworkSearchTrigger" class="track-metadata__preview">
      <ArtworkPreviewPane
        :current-track="currentTrack"
        :candidate="selectedArtworkCandidate"
        :staged="artworkChanged"
        :search-open="artworkSearchOpen"
        :disabled="saving || readOnly"
        :artwork-preparing="artworkPreparing"
        :artwork-searching="artworkSearching"
        @choose="emit('chooseThumbnail')"
        @clear="emit('clearThumbnail')"
        @open-search="emit('openArtworkSearch')"
      />
    </div>

    <div class="track-metadata__workspace">
      <section
        class="track-metadata__section"
        :aria-label="t('work.metadata.basics')"
      >
        <div class="track-metadata__fields">
          <UiTextField
            id="track-metadata-title"
            ref="titleField"
            :model-value="title"
            :label="t('work.metadata.title')"
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
            :label="t('work.metadata.artist')"
            maxlength="200"
            :disabled="fieldsDisabled"
            @update:model-value="emit('updateArtist', $event)"
            @keydown.enter="emit('save')"
          />
        </div>
      </section>

      <slot name="style-tags" />

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
              {{ t('work.metadata.searchArtwork') }}
            </h3>
            <UiHint>{{ t('work.metadata.previewHint') }}</UiHint>
          </div>
          <div class="track-metadata__search-actions">
            <UiIconButton
              ref="albumFilterTrigger"
              :icon="SlidersHorizontal"
              :label="t('work.metadata.albumFilter')"
              :active="searchOptionsOpen"
              :aria-pressed="searchOptionsOpen"
              :aria-expanded="searchOptionsOpen"
              aria-controls="track-artwork-search-options"
              :disabled="searchControlsDisabled"
              @click="searchOptionsOpen = !searchOptionsOpen"
            />
            <UiIconButton
              :icon="ChevronUp"
              :label="t('work.metadata.collapse')"
              :disabled="readOnly || artworkSearching || artworkPreparing"
              @click="emit('closeArtworkSearch')"
            />
            <UiButton
              variant="secondary"
              :icon="Search"
              :loading="artworkSearching"
              :loading-label="t('work.metadata.searching')"
              :disabled="
                saving || artworkPreparing || !String(title || '').trim()
              "
              @click="emit('searchArtwork')"
            >
              {{ t('work.metadata.search') }}
            </UiButton>
          </div>
        </div>

        <form
          v-if="searchOptionsOpen"
          id="track-artwork-search-options"
          class="track-metadata__search-options"
          role="search"
          :aria-label="t('work.metadata.albumFilterLabel')"
          @submit.prevent="emit('searchArtwork')"
          @keydown.escape.stop.prevent="
            closeAlbumFilter({ restoreFocus: true })
          "
        >
          <UiTextField
            id="track-artwork-album-filter"
            ref="albumFilterField"
            :model-value="artworkQuery.album"
            :label="t('work.metadata.album')"
            :placeholder="t('work.metadata.album')"
            label-hidden
            maxlength="200"
            :disabled="searchControlsDisabled"
            @update:model-value="emit('updateArtworkQuery', 'album', $event)"
          />
          <UiIconButton
            :icon="Search"
            :label="t('work.metadata.searchByAlbum')"
            :loading="artworkSearching"
            :loading-label="t('work.metadata.searching')"
            :disabled="
              saving || artworkPreparing || !String(title || '').trim()
            "
            @click="emit('searchArtwork')"
          />
          <UiIconButton
            :icon="X"
            :label="t('work.metadata.closeAlbumFilter')"
            :disabled="saving || artworkPreparing"
            @click="closeAlbumFilter({ restoreFocus: true })"
          />
        </form>

        <UiHint v-if="artworkSearching" role="status">
          {{ t('work.metadata.findingArtwork') }}
        </UiHint>

        <ArtworkSearchResults
          v-if="artworkCandidates.length > 0"
          :candidates="artworkCandidates"
          :selected-id="selectedArtworkCandidateId"
          :disabled="readOnly || artworkSearching || artworkPreparing"
          @select="emit('selectArtworkCandidate', $event)"
        />

        <UiHint
          v-else-if="artworkSearchCompleted && !artworkSearching"
          class="track-metadata__empty"
          role="status"
        >
          {{ t('work.metadata.noArtwork') }}
        </UiHint>
      </section>

      <UiNotice
        v-if="generalError"
        tone="danger"
        :title="t('work.metadata.failed')"
        :message="generalError"
        compact
      />
    </div>
  </div>
</template>

<style scoped>
.track-metadata {
  min-height: 100%;
  display: grid;
  grid-template-columns: minmax(var(--ui-artwork-size-3xl), 15rem) minmax(
      0,
      1fr
    );
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
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
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

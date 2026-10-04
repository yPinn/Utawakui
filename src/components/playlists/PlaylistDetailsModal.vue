<script setup>
// The single "編輯詳細資料" entry point. Name and description are drafted locally
// and committed only on Save, instead of relying on Enter/blur. A cover change
// (choose/clear) still commits immediately, since it is an independent async IPC
// round-trip. Album descriptions stay read-only here (source-normalized
// metadata, not user-authored; see LibraryEntityDossier.vue).
import { shallowRef, watch } from 'vue';
import { ICON_SIZE, Pencil, X } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiTextarea from '../ui/UiTextarea.vue';
import UiTextField from '../ui/UiTextField.vue';

const PLAYLIST_DETAILS_COVER_SIZE = 160;
const playlistDetailsStyle = Object.freeze({
  '--playlist-details-cover-size': `${PLAYLIST_DETAILS_COVER_SIZE}px`,
});

const props = defineProps({
  open: { type: Boolean, default: false },
  isAlbum: { type: Boolean, default: false },
  name: { type: String, default: '' },
  description: { type: String, default: '' },
  coverUrl: { type: String, default: '' },
  coverTracks: { type: Array, default: () => [] },
});

const emit = defineEmits(['close', 'save', 'chooseCover', 'clearCover']);

const nameDraft = shallowRef('');
const descriptionDraft = shallowRef('');

// Re-seed the draft only when the modal opens — not on every prop change,
// so a cover change committed mid-edit (chooseCover/clearCover updates
// `coverUrl` via the parent) doesn't blow away an in-progress name/
// description edit sitting in the still-open form.
watch(
  () => props.open,
  (isOpen) => {
    if (!isOpen) return;
    nameDraft.value = props.name;
    descriptionDraft.value = props.description;
  },
  { immediate: true },
);

function save() {
  emit('save', {
    name: nameDraft.value.trim() || props.name,
    description: descriptionDraft.value,
  });
}
</script>

<template>
  <UiModal
    :open="open"
    title="編輯詳細資料"
    size="notice"
    @close="emit('close')"
  >
    <div class="playlist-details" :style="playlistDetailsStyle">
      <div class="playlist-details__cover">
        <UiCollageThumb
          :cover-url="coverUrl"
          :tracks="coverTracks"
          :can-collage="!isAlbum"
          :size="PLAYLIST_DETAILS_COVER_SIZE"
        />
        <template v-if="!isAlbum">
          <button
            type="button"
            class="playlist-details__cover-edit"
            aria-label="選擇相片"
            title="選擇相片"
            @click="emit('chooseCover')"
          >
            <Pencil :size="ICON_SIZE" aria-hidden="true" />
            <span>選擇相片</span>
          </button>
          <UiIconButton
            v-if="coverUrl"
            :icon="X"
            class="playlist-details__cover-clear"
            label="移除自訂封面"
            variant="overlay"
            @click="emit('clearCover')"
          />
        </template>
      </div>

      <div class="playlist-details__fields">
        <UiTextField
          id="playlist-details-name"
          v-model="nameDraft"
          class="playlist-details__name-field"
          label="名稱"
          label-hidden
          :maxlength="200"
          @keydown.enter="save"
        />

        <UiTextarea
          v-if="!isAlbum"
          id="playlist-details-description"
          v-model="descriptionDraft"
          class="playlist-details__description-field"
          label="說明"
          label-hidden
          :rows="3"
          :maxlength="500"
          placeholder="新增說明"
        />
        <p
          v-else-if="description"
          class="playlist-details__readonly-description"
        >
          {{ description }}
        </p>
      </div>
    </div>

    <template #footer>
      <UiButton variant="accent" @click="save">儲存</UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.playlist-details {
  min-inline-size: 0;
  display: grid;
  grid-template-columns:
    var(--playlist-details-cover-size)
    minmax(0, 1fr);
  align-items: start;
  gap: var(--ui-modal-section-gap);
}

/* Artwork tier — DESIGN.md's "dense thumbnails and artwork" radius. */
.playlist-details__cover {
  position: relative;
  inline-size: var(--playlist-details-cover-size);
  block-size: var(--playlist-details-cover-size);
  border-radius: var(--ui-radius-sm);
  overflow: hidden;
}

/* Same hover-reveal idiom as the hero's own cover overlay (see
   SetlistCollectionHeader.vue) — this is its consolidated replacement, not a
   second independent implementation of the same interaction. */
.playlist-details__cover-edit,
.playlist-details__cover-clear {
  position: absolute;
  opacity: 0;
  transition: opacity var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}

.playlist-details__cover:hover .playlist-details__cover-edit,
.playlist-details__cover:hover .playlist-details__cover-clear,
.playlist-details__cover-edit:focus-visible,
.playlist-details__cover-clear:focus-visible {
  opacity: 1;
}

.playlist-details__cover-edit {
  inset: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: var(--ui-space-1);
  border: none;
  background: var(--ui-color-overlay-scrim);
  color: var(--ui-color-overlay-contrast);
  cursor: pointer;
  font-size: var(--ui-font-size-sm);
}

.playlist-details__cover-edit:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.playlist-details__cover-clear {
  right: var(--ui-space-2);
  top: var(--ui-space-2);
}

.playlist-details__fields {
  min-inline-size: 0;
  min-block-size: var(--playlist-details-cover-size);
  display: grid;
  grid-template-rows: auto minmax(calc(var(--ui-field-height) * 2), 1fr);
  align-content: start;
  gap: var(--ui-modal-section-gap);
}

/* Title tier — DESIGN.md names active item titles explicitly. */
.playlist-details__name-field :deep(.ui-text-field) {
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-semibold);
  line-height: var(--ui-line-height-title);
}

/* The right-hand lane shares the artwork's 160px visual baseline. The grid
   track already owns the remaining height; carry it through UiField's wrappers
   so the visible textarea — not just its parent row — reaches that baseline. */
.playlist-details__description-field {
  min-block-size: 0;
  block-size: 100%;
}

.playlist-details__description-field :deep(.ui-field__main),
.playlist-details__description-field :deep(.ui-field__control),
.playlist-details__description-field :deep(.ui-textarea) {
  min-block-size: 0;
  block-size: 100%;
}

.playlist-details__description-field :deep(.ui-textarea) {
  resize: none;
}

.playlist-details__readonly-description {
  margin: 0;
  padding: var(--ui-field-padding-block) var(--ui-field-padding-inline);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-body);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* 160px artwork + 12px compact gap + a useful 200px field lane + modal
   insets. Reflow before the text fields become a narrow residual column. */
@container (max-width: 25.5rem) {
  .playlist-details {
    grid-template-columns: minmax(0, 1fr);
  }

  .playlist-details__fields {
    min-block-size: 0;
    grid-template-rows: auto auto;
  }

  .playlist-details__description-field,
  .playlist-details__description-field :deep(.ui-field__main),
  .playlist-details__description-field :deep(.ui-field__control),
  .playlist-details__description-field :deep(.ui-textarea) {
    block-size: auto;
  }
}
</style>

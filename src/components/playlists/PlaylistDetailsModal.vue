<script setup>
// The single "編輯詳細資料" entry point. Name and description are drafted locally
// and committed only on Save, instead of relying on Enter/blur. A cover change
// (choose/clear) still commits immediately, since it is an independent async IPC
// round-trip. Album descriptions stay read-only here (source-normalized
// metadata, not user-authored; see LibraryEntityDossier.vue).
import { shallowRef, watch } from 'vue';
import { ICON_SIZE, Pencil, X } from '../../icons/index.js';
import UiArtworkReveal from '../ui/UiArtworkReveal.vue';
import UiButton from '../ui/UiButton.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiTextarea from '../ui/UiTextarea.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiTooltip from '../ui/UiTooltip.vue';

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
  saving: { type: Boolean, default: false },
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
  if (props.saving) return;
  emit('save', {
    name: nameDraft.value.trim() || props.name,
    description: descriptionDraft.value,
  });
}

function cancel() {
  if (props.saving) return;
  emit('close');
}
</script>

<template>
  <UiModal
    :open="open"
    title="編輯詳細資料"
    size="notice"
    :close-disabled="saving"
    @close="cancel"
  >
    <div class="playlist-details" :style="playlistDetailsStyle">
      <div class="playlist-details__cover" data-artwork-reveal-scope>
        <UiCollageThumb
          :cover-url="coverUrl"
          :tracks="coverTracks"
          :can-collage="!isAlbum"
          :size="PLAYLIST_DETAILS_COVER_SIZE"
          :decorative="isAlbum"
        >
          <template v-if="!isAlbum" #overlay>
            <UiArtworkReveal>
              <UiTooltip text="選擇相片">
                <template #trigger="{ triggerProps }">
                  <button
                    v-bind="triggerProps"
                    type="button"
                    class="playlist-details__cover-edit"
                    aria-label="選擇相片"
                    :disabled="saving"
                    @click="emit('chooseCover')"
                  >
                    <Pencil :size="ICON_SIZE" aria-hidden="true" />
                    <span>選擇相片</span>
                  </button>
                </template>
              </UiTooltip>
            </UiArtworkReveal>
          </template>
        </UiCollageThumb>
        <template v-if="!isAlbum">
          <UiArtworkReveal
            v-if="coverUrl"
            class="playlist-details__cover-clear"
          >
            <UiIconButton
              :icon="X"
              label="移除自訂封面"
              variant="overlay"
              :disabled="saving"
              @click="emit('clearCover')"
            />
          </UiArtworkReveal>
        </template>
      </div>

      <div class="playlist-details__fields">
        <UiTextField
          id="playlist-details-name"
          v-model="nameDraft"
          class="playlist-details__name-field"
          label="名稱"
          label-hidden
          text-role="title"
          :maxlength="200"
          :disabled="saving"
          @keydown.enter="save"
        />

        <UiTextarea
          v-if="!isAlbum"
          id="playlist-details-description"
          v-model="descriptionDraft"
          class="playlist-details__description-field"
          label="說明"
          label-hidden
          fill
          resize="none"
          :rows="3"
          :maxlength="500"
          :disabled="saving"
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
      <!-- Footnote sits on the action row so the fields keep the cover's height. -->
      <UiHint v-if="!isAlbum" class="playlist-details__footnote">
        封面立即套用；名稱與說明需按儲存。
      </UiHint>
      <UiButton variant="secondary" :disabled="saving" @click="cancel">
        取消
      </UiButton>
      <UiButton
        variant="accent"
        :loading="saving"
        loading-label="儲存中"
        :disabled="saving"
        @click="save"
      >
        儲存
      </UiButton>
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

/* Positions the corner control; UiCollageThumb owns the artwork radius clip. */
.playlist-details__cover {
  position: relative;
  isolation: isolate;
  inline-size: var(--playlist-details-cover-size);
  block-size: var(--playlist-details-cover-size);
}

/* Both cover controls reveal through UiArtworkReveal on cover hover
   (data-artwork-reveal-scope) or their own keyboard focus. */

/* Sized by UiArtworkOverlay inside UiCollageThumb. */
.playlist-details__cover-edit {
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

/* Corner control: positioned by the cover, outside the overlay plane. */
.playlist-details__cover-clear {
  position: absolute;
  z-index: var(--ui-layer-indicator);
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

/* Start of the footer row, pushing the actions to the end. */
.playlist-details__footnote {
  min-inline-size: 0;
  margin-inline-end: auto;
}

/* The right-hand lane shares the artwork's 160px visual baseline. */
.playlist-details__description-field {
  min-block-size: 0;
  block-size: 100%;
}

.playlist-details__readonly-description {
  margin: 0;
  padding: var(--ui-field-padding-block) var(--ui-field-padding-inline);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-body-compact-size);
  font-weight: var(--ui-type-body-compact-weight);
  line-height: var(--ui-type-body-line-height);
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

  .playlist-details__description-field {
    --ui-textarea-fill-block-size: auto;

    block-size: auto;
  }
}
</style>

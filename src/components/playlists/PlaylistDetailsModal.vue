<script setup>
// The single "編輯詳細資料" entry point — replaces the old inline hero
// rename-input and inline description-textarea, both of which relied
// entirely on Enter/blur to confirm with no explicit save affordance. Name
// and description are drafted locally and only committed on Save; a cover
// change (choose/clear) still commits immediately on click, same as it did
// inline, since that's already an async IPC round-trip independent of this
// form's Save button. Album fields stay read-only here too — see
// SetlistPlaylistHeader.vue's own comment for why (source-normalized
// metadata, not user-authored).
import { ref, watch } from 'vue';
import { ICON_SIZE, Pencil, X } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  isAlbum: { type: Boolean, default: false },
  name: { type: String, default: '' },
  description: { type: String, default: '' },
  coverUrl: { type: String, default: '' },
  coverTracks: { type: Array, default: () => [] },
});

const emit = defineEmits(['close', 'save', 'chooseCover', 'clearCover']);

const nameDraft = ref('');
const descriptionDraft = ref('');

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
  <UiModal :open="open" title="編輯詳細資料" @close="emit('close')">
    <div class="playlist-details">
      <div class="playlist-details__cover">
        <UiCollageThumb
          :cover-url="coverUrl"
          :tracks="coverTracks"
          :can-collage="!isAlbum"
          :size="120"
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
        <label
          class="playlist-details__label visually-hidden"
          for="playlist-details-name"
        >
          名稱
        </label>
        <input
          id="playlist-details-name"
          v-model="nameDraft"
          class="playlist-details__input"
          maxlength="200"
          @keydown.enter="save"
        />

        <template v-if="!isAlbum">
          <label
            class="playlist-details__label visually-hidden"
            for="playlist-details-description"
          >
            說明
          </label>
          <textarea
            id="playlist-details-description"
            v-model="descriptionDraft"
            class="playlist-details__textarea"
            maxlength="500"
            placeholder="新增說明"
          ></textarea>
        </template>
        <p
          v-else-if="description"
          class="playlist-details__readonly-description"
        >
          {{ description }}
        </p>
      </div>
    </div>

    <div class="playlist-details__actions">
      <UiButton variant="accent" @click="save">儲存</UiButton>
    </div>
  </UiModal>
</template>

<style scoped>
.playlist-details {
  display: grid;
  grid-template-columns: 120px minmax(0, 1fr);
  gap: var(--ui-space-4);
}

/* Artwork tier — DESIGN.md's "dense thumbnails and artwork" radius. */
.playlist-details__cover {
  position: relative;
  width: 120px;
  height: 120px;
  border-radius: var(--ui-radius-sm);
  overflow: hidden;
}

/* Same hover-reveal idiom as the hero's own cover overlay (see
   SetlistPlaylistHeader.vue) — this is its consolidated replacement, not a
   second independent implementation of the same interaction. */
.playlist-details__cover-edit,
.playlist-details__cover-clear {
  position: absolute;
  opacity: 0;
  transition: opacity var(--ui-motion-fast) var(--ui-motion-ease);
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

/* height: 120px is the same literal as .playlist-details__cover's width/
   height above, deliberately — the field column (name input + gap +
   description textarea) must total exactly the cover's size, not just
   happen to look close. The name input keeps its own intrinsic height;
   the textarea absorbs whatever's left via flex-grow below. */
.playlist-details__fields {
  min-width: 0;
  height: 120px;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

/* Field purpose is already conveyed by the visible input value / the
   textarea's own placeholder — a fully visible "名稱"/"說明" caption above
   each field is redundant weight the row-height budget above can't afford.
   Screen readers still get the association via the <label for>. */
.playlist-details__label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.playlist-details__input,
.playlist-details__textarea {
  width: 100%;
  padding: var(--ui-space-2) var(--ui-space-3);
  /* One tier lighter than the modal's own --ui-color-surface (same token
     UiContextMenu.vue's rows use for their own raised/interactive state) —
     gives the field a visible fill against the panel without a border,
     since the modal and a plain --ui-color-surface field would otherwise
     be indistinguishable (identical background color, border-only
     definition). */
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
  border: none;
  border-radius: var(--ui-radius);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
}

/* Title tier — DESIGN.md names active item titles explicitly. */
.playlist-details__input {
  flex: 0 0 auto;
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.playlist-details__textarea {
  flex: 1 1 auto;
  /* Overrides the textarea default of min-height being its content size —
     without this, flex-grow can't shrink it to fit the fixed-height
     column above. Resize is off, not just vertical, because a
     manually-dragged height would break the "matches the cover" contract
     the height: 120px rule above exists to guarantee. */
  min-height: 0;
  resize: none;
}

.playlist-details__input:focus-visible,
.playlist-details__textarea:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.playlist-details__readonly-description {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-caption);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.playlist-details__actions {
  display: flex;
  justify-content: flex-end;
  margin-top: var(--ui-space-4);
}
</style>

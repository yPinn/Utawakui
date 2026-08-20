<script setup>
import { computed } from 'vue';
import { ImagePlus, Trash2 } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiTrackThumb from '../ui/UiTrackThumb.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  artist: { type: String, default: '' },
  thumbnailUrl: { type: String, default: '' },
  saving: { type: Boolean, default: false },
  artworkSaving: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits([
  'close',
  'save',
  'chooseThumbnail',
  'clearThumbnail',
  'updateTitle',
  'updateArtist',
]);

const previewTrack = computed(() => ({
  title: props.title,
  artist: props.artist,
  thumbnailUrl: props.thumbnailUrl,
}));
</script>

<template>
  <UiModal :open="open" title="編輯資訊" @close="emit('close')">
    <div class="track-metadata">
      <section class="track-metadata__artwork" aria-labelledby="track-artwork">
        <UiTrackThumb
          class="track-metadata__thumb"
          :track="previewTrack"
          size="var(--ui-space-8)"
          :decorative="false"
          aria-label="目前封面"
        />
        <div class="track-metadata__artwork-body">
          <div>
            <h3 id="track-artwork" class="track-metadata__artwork-title">
              封面
            </h3>
          </div>
          <div class="track-metadata__artwork-actions">
            <UiButton
              :icon="ImagePlus"
              :disabled="saving || artworkSaving"
              aria-label="選擇封面圖片"
              title="選擇封面圖片"
              @click="emit('chooseThumbnail')"
            >
              選擇圖片
            </UiButton>
            <UiButton
              v-if="thumbnailUrl"
              :icon="Trash2"
              :disabled="saving || artworkSaving"
              aria-label="移除封面圖片"
              title="移除封面圖片"
              @click="emit('clearThumbnail')"
            >
              移除
            </UiButton>
          </div>
        </div>
      </section>

      <label class="track-metadata__field">
        <span class="track-metadata__label">歌名</span>
        <input
          :value="title"
          class="track-metadata__input"
          maxlength="200"
          required
          @input="emit('updateTitle', $event.target.value)"
          @keydown.enter="emit('save')"
        />
      </label>

      <label class="track-metadata__field">
        <span class="track-metadata__label">歌手</span>
        <input
          :value="artist"
          class="track-metadata__input"
          maxlength="200"
          @input="emit('updateArtist', $event.target.value)"
          @keydown.enter="emit('save')"
        />
      </label>

      <UiHint v-if="error" tone="danger" role="alert">
        {{ error }}
      </UiHint>

      <div class="track-metadata__actions">
        <UiButton
          variant="accent"
          :disabled="saving || artworkSaving"
          @click="emit('save')"
        >
          儲存
        </UiButton>
      </div>
    </div>
  </UiModal>
</template>

<style scoped>
.track-metadata {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.track-metadata__field {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.track-metadata__artwork {
  display: grid;
  grid-template-columns: var(--ui-space-8) minmax(0, 1fr);
  gap: var(--ui-space-3);
  align-items: start;
  padding-bottom: var(--ui-space-3);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.track-metadata__thumb {
  border: var(--ui-border-width) solid var(--ui-color-border);
}

.track-metadata__artwork-body {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: var(--ui-space-2);
}

.track-metadata__artwork-title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-md);
  font-weight: var(--ui-font-weight-heavy);
  line-height: var(--ui-line-height-label);
}

.track-metadata__artwork-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.track-metadata__label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-label);
}

.track-metadata__input {
  width: 100%;
  padding: var(--ui-space-2) var(--ui-space-3);
  background: var(--ui-color-surface-hover);
  color: var(--ui-color-text);
  border: none;
  border-radius: var(--ui-radius);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
}

.track-metadata__input:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.track-metadata__actions {
  display: flex;
  justify-content: flex-end;
}
</style>

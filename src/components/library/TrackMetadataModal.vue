<script setup>
import UiButton from '../ui/UiButton.vue';
import UiModal from '../ui/UiModal.vue';

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '' },
  artist: { type: String, default: '' },
  isSaving: { type: Boolean, default: false },
  error: { type: String, default: '' },
});

const emit = defineEmits(['close', 'save', 'updateTitle', 'updateArtist']);
</script>

<template>
  <UiModal :open="open" title="編輯資訊" @close="emit('close')">
    <form class="track-metadata" @submit.prevent="emit('save')">
      <label class="track-metadata__field">
        <span class="track-metadata__label">歌名</span>
        <input
          :value="title"
          class="track-metadata__input"
          maxlength="200"
          required
          @input="emit('updateTitle', $event.target.value)"
        />
      </label>

      <label class="track-metadata__field">
        <span class="track-metadata__label">歌手</span>
        <input
          :value="artist"
          class="track-metadata__input"
          maxlength="200"
          @input="emit('updateArtist', $event.target.value)"
        />
      </label>

      <p v-if="error" class="track-metadata__error" role="alert">
        {{ error }}
      </p>

      <div class="track-metadata__actions">
        <UiButton variant="accent" :disabled="isSaving" @click="emit('save')">
          儲存
        </UiButton>
      </div>
    </form>
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

.track-metadata__label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.track-metadata__input {
  box-sizing: border-box;
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

.track-metadata__error {
  margin: 0;
  color: var(--ui-color-danger);
  font-size: var(--ui-font-size-sm);
}

.track-metadata__actions {
  display: flex;
  justify-content: flex-end;
}
</style>

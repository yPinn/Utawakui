<script setup>
import UiArtworkReveal from './UiArtworkReveal.vue';
import UiIconButton from './UiIconButton.vue';
import UiTrackThumb from './UiTrackThumb.vue';

defineProps({
  track: { type: Object, default: null },
  overlayIcon: { type: [Object, Function], default: undefined },
  label: { type: String, default: undefined },
  disabled: { type: Boolean, default: false },
  loading: { type: String, default: 'eager' },
  decoding: { type: String, default: 'auto' },
});
const emit = defineEmits(['activate']);
</script>

<template>
  <UiTrackThumb
    v-if="overlayIcon"
    :track="track"
    size="var(--ui-track-row-thumb-size)"
    :decorative="false"
    :loading="loading"
    :decoding="decoding"
  >
    <template #overlay>
      <UiArtworkReveal>
        <UiIconButton
          :icon="overlayIcon"
          :label="label"
          :disabled="disabled"
          variant="overlay"
          fill
          stretch
          @click.stop="!disabled && emit('activate', $event)"
          @dblclick.stop
        />
      </UiArtworkReveal>
    </template>
  </UiTrackThumb>
  <button
    v-else
    type="button"
    class="ui-track-artwork-button"
    :disabled="disabled"
    @click.stop="!disabled && emit('activate', $event)"
    @dblclick.stop
  >
    <span class="ui-visually-hidden">{{ label }}</span>
    <UiTrackThumb
      class="ui-track__thumb"
      :track="track"
      size="var(--ui-track-row-thumb-size)"
      :loading="loading"
      :decoding="decoding"
    >
      <template v-if="$slots.overlay" #overlay
        ><slot name="overlay"
      /></template>
    </UiTrackThumb>
  </button>
</template>

<style scoped>
.ui-track-artwork-button {
  position: relative;
  width: var(--ui-track-row-thumb-size);
  height: var(--ui-track-row-thumb-size);
  flex: 0 0 var(--ui-track-row-thumb-size);
  padding: 0;
  border: 0;
  /* Only the focus shape: UiTrackThumb remains the artwork clip owner. */
  border-radius: var(--ui-radius-sm);
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.ui-track-artwork-button:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}
.ui-track-artwork-button:disabled {
  cursor: default;
}
</style>

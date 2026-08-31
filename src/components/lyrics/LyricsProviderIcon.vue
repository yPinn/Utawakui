<script setup>
import {
  Captions,
  Disc3,
  Library,
  MicVocal,
  Music2,
} from '../../icons/index.js';

defineProps({
  providerId: { type: String, required: true },
});
</script>

<template>
  <span
    class="lyrics-provider-icon"
    :class="`lyrics-provider-icon--${providerId}`"
    aria-hidden="true"
  >
    <Library v-if="providerId === 'all'" :size="16" :stroke-width="1.8" />
    <Captions
      v-else-if="providerId === 'lrclib'"
      :size="17"
      :stroke-width="1.8"
    />
    <Disc3 v-else-if="providerId === 'netease'" :size="17" :stroke-width="2" />
    <MicVocal
      v-else-if="providerId === 'betterlyrics'"
      :size="17"
      :stroke-width="1.8"
    />
    <Music2 v-else :size="16" :stroke-width="1.8" />
  </span>
</template>

<style scoped>
.lyrics-provider-icon {
  width: 1.75rem;
  height: 1.75rem;
  display: inline-flex;
  flex: 0 0 1.75rem;
  align-items: center;
  justify-content: center;
  border: var(--ui-border-width) solid
    color-mix(in srgb, currentColor 35%, transparent);
  border-radius: var(--ui-radius);
  background: color-mix(in srgb, currentColor 10%, transparent);
  color: var(--ui-color-text-muted);
}

.lyrics-provider-icon--lrclib {
  color: var(--ui-color-accent);
}

.lyrics-provider-icon--netease {
  color: var(--ui-color-text);
}

.lyrics-provider-icon--betterlyrics {
  color: var(--ui-color-accent);
}
</style>

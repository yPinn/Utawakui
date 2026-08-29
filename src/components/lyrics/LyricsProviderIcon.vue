<script setup>
import { Disc3, Library, Music2 } from '../../icons/index.js';

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
    <span
      v-else-if="providerId === 'lrclib'"
      class="lyrics-provider-icon__monogram"
    >
      LRC
    </span>
    <Disc3 v-else-if="providerId === 'netease'" :size="17" :stroke-width="2" />
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

.lyrics-provider-icon__monogram {
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  letter-spacing: -0.08em;
  line-height: 1;
}
</style>

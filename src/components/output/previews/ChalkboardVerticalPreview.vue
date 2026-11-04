<script setup>
import { computed } from 'vue';

const props = defineProps({ scene: { type: Object, required: true } });
const text = computed(
  () => props.scene.frame?.currentText ?? props.scene.lyrics?.current ?? '',
);
</script>

<template>
  <div
    class="chalkboard-preview"
    :class="{
      'chalkboard-preview--right':
        scene.appearance?.positionAnchor === 'center-right',
    }"
  >
    <span class="chalkboard-preview__ink">{{ text }}</span>
    <span class="chalkboard-preview__rule"></span>
  </div>
</template>

<style scoped>
.chalkboard-preview {
  --chalkboard-preview-rule-gap: 0.18em;
  position: relative;
  inset-inline-start: -33.333cqi;
  place-self: center;
  display: flex;
  gap: var(--chalkboard-preview-rule-gap);
  color: var(--obs-preview-ink);
  font-family: 'Utawakui Open Huninn', sans-serif;
  font-size: 2.53cqi;
  letter-spacing: 0.075em;
  line-height: 1.12;
}

.chalkboard-preview--right {
  inset-inline-start: 33.333cqi;
}

.chalkboard-preview__ink {
  writing-mode: vertical-rl;
  white-space: pre-wrap;
  max-inline-size: 24.75cqi;
}

.chalkboard-preview__rule {
  inline-size: max(1px, 0.03em);
  background: currentColor;
  opacity: 0.78;
}
</style>

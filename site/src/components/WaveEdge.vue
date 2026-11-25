<script setup>
defineProps({
  color: { type: String, required: true },
  background: { type: String, default: 'var(--site-ground-dark)' },
});
</script>

<template>
  <svg
    class="wave"
    :style="{ backgroundColor: background }"
    viewBox="0 0 1440 120"
    preserveAspectRatio="none"
    aria-hidden="true"
  >
    <path
      :fill="color"
      d="M0 64c120-40 240-40 360 0s240 40 360 0 240-40 360 0 240 40 360 0v56H0z"
    />
  </svg>
</template>

<style scoped>
.wave {
  position: absolute;
  inset: 0 0 auto;
  display: block;
  width: 100%;
  height: var(--wave-h);
  pointer-events: none;
}
</style>

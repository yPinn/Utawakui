<script setup>
defineProps({
  src: { type: String, required: true },
});
</script>

<template>
  <div class="obs-streamer-preview" aria-hidden="true">
    <div class="obs-streamer-preview__region">
      <img
        class="obs-streamer-preview__image"
        :src="src"
        alt=""
        :draggable="false"
        decoding="async"
      />
    </div>
  </div>
</template>

<style scoped>
.obs-streamer-preview {
  position: absolute;
  z-index: var(--ui-output-preview-layer-guide);
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
}

.obs-streamer-preview__region {
  position: absolute;
  inset: calc(100% / 3) calc(100% / 3) 0;
  display: grid;
  place-items: end center;
}

.obs-streamer-preview__image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
  object-position: center bottom;
  transform: scale(1.35);
  transform-origin: center bottom;
  -webkit-user-drag: none;
}
</style>

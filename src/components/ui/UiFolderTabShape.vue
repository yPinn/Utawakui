<script setup>
defineProps({
  shapeId: { type: String, required: true },
});
</script>

<template>
  <svg width="0" height="0" aria-hidden="true" focusable="false">
    <defs>
      <clipPath :id="shapeId" clipPathUnits="objectBoundingBox">
        <path
          d="M0.16,0 L0.84,0 C0.9,0 0.92,0.18 0.95,0.42 L1,1 L0,1 L0.05,0.42 C0.08,0.18 0.1,0 0.16,0 Z"
        />
      </clipPath>
    </defs>
  </svg>
</template>

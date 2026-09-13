<script setup>
import { Music2 } from '../../icons/index.js';
</script>

<template>
  <span
    class="demo-candidate-artwork-empty"
    data-artwork-placeholder="no-identity"
    aria-hidden="true"
  >
    <Music2 class="demo-candidate-artwork-empty__icon" aria-hidden="true" />
  </span>
</template>

<style scoped>
.demo-candidate-artwork-empty {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: var(--ui-color-text-muted);
  -webkit-user-select: none;
  user-select: none;
  -webkit-user-drag: none;
}

.demo-candidate-artwork-empty__icon {
  inline-size: clamp(1rem, 33%, 2rem);
  block-size: auto;
  opacity: var(--ui-opacity-muted);
}
</style>

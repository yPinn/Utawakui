<script setup>
import UiPageHeader from '../components/ui/UiPageHeader.vue';
</script>

<template>
  <div class="appearance-view">
    <UiPageHeader title="外觀" />
  </div>
</template>

<style scoped>
.appearance-view {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
</style>

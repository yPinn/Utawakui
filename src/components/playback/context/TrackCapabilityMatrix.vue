<script setup>
import { useId } from 'vue';
import TrackCapabilityItem from './TrackCapabilityItem.vue';

defineProps({
  items: { type: Array, required: true },
});

const headingId = `track-capability-heading-${useId()}`;
</script>

<template>
  <section class="track-capability-matrix" :aria-labelledby="headingId">
    <h4 :id="headingId">素材狀態</h4>
    <ul class="track-capability-matrix__list">
      <TrackCapabilityItem v-for="item in items" :key="item.id" :item="item" />
    </ul>
  </section>
</template>

<style scoped>
.track-capability-matrix {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.track-capability-matrix h4,
.track-capability-matrix__list {
  margin: 0;
}

.track-capability-matrix h4 {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

.track-capability-matrix__list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--ui-space-2);
  padding: 0;
  list-style: none;
}

.track-capability-matrix {
  -webkit-user-select: none;
  user-select: none;
}
</style>

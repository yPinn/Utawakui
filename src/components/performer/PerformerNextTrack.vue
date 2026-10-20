<script setup>
defineProps({
  track: { type: Object, default: null },
});
</script>

<template>
  <footer v-if="track" class="performer-next-track">
    <span>接下來</span>
    <strong>{{ track.title }}</strong>
    <small v-if="track?.artist">{{ track.artist }}</small>
  </footer>
</template>

<style scoped>
.performer-next-track {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  color: var(--ui-performer-secondary-foreground);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.performer-next-track > span {
  flex: 0 0 auto;
  font-weight: var(--ui-font-weight-semibold);
}

.performer-next-track strong,
.performer-next-track small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.performer-next-track strong {
  color: var(--ui-color-text-muted);
  font-weight: var(--ui-font-weight-semibold);
}

.performer-next-track small {
  color: var(--ui-performer-secondary-foreground);
  font-size: var(--ui-font-size-sm);
}
</style>

<script setup>
import '../../../../overlay/now-playing/ticket.css';

defineProps({
  scene: { type: Object, required: true },
});
</script>

<template>
  <div class="now-playing-ticket">
    <div class="ticket-paper ticket-cut">
      <span class="ticket-cover" aria-hidden="true">{{
        scene.track.title?.trim().slice(0, 1).toUpperCase()
      }}</span>
      <div class="ticket-copy" dir="auto">
        <strong class="ticket-title">{{ scene.track.title }}</strong>
        <span class="ticket-artist">{{ scene.track.artist }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.now-playing-ticket {
  --ovl-color-kinetic-paper: var(--ui-output-preview-kinetic-paper);
  --ovl-color-ink: var(--ui-output-look-original-ink);
  --ovl-user-font-weight: var(--obs-user-font-weight);

  font-family: var(--obs-user-font-family);
}
</style>

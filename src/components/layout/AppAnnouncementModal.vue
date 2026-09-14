<script setup>
import UiButton from '../ui/UiButton.vue';
import UiModal from '../ui/UiModal.vue';
import { useAppAnnouncement } from '../../composables/useAppAnnouncement.js';

const { state, version, summary, dismiss } = useAppAnnouncement();

function openReleaseNotes() {
  window.Utawakui?.openExternalTarget?.('release-notes');
}
</script>

<template>
  <UiModal
    :open="state.open"
    title="有什麼新變化"
    size="notice"
    @close="dismiss"
  >
    <div class="announcement-notice">
      <p class="announcement-notice__version">v{{ version }}</p>
      <p class="announcement-notice__summary">{{ summary }}</p>

      <div class="announcement-notice__actions">
        <UiButton variant="ghost" @click="openReleaseNotes">
          查看完整發行說明
        </UiButton>
        <UiButton variant="accent" @click="dismiss">知道了</UiButton>
      </div>
    </div>
  </UiModal>
</template>

<style scoped>
.announcement-notice {
  display: grid;
  gap: var(--ui-space-3);
}

.announcement-notice__version {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
}

.announcement-notice__summary {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
  line-height: var(--ui-line-height-body);
}

.announcement-notice__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
}
</style>

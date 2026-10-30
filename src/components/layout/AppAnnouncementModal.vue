<script setup>
import UiButton from '../ui/UiButton.vue';
import UiModal from '../ui/UiModal.vue';
import { useAppAnnouncement } from '../../composables/useAppAnnouncement.js';
import { t } from '../../utils/i18n.js';

const { state, version, summary, dismiss } = useAppAnnouncement();

function openReleaseNotes() {
  window.Utawakui?.openExternalTarget?.('release-notes');
}
</script>

<template>
  <UiModal
    :open="state.open"
    :title="t('shell.announcement.title')"
    size="notice"
    @close="dismiss"
  >
    <div class="announcement-notice">
      <p class="announcement-notice__version">v{{ version }}</p>
      <p class="announcement-notice__summary">{{ summary }}</p>

      <div class="announcement-notice__actions">
        <UiButton variant="ghost" @click="openReleaseNotes">
          {{ t('shell.announcement.releaseNotes') }}
        </UiButton>
        <UiButton variant="accent" @click="dismiss">{{
          t('common.close')
        }}</UiButton>
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
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
}

.announcement-notice__summary {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-compact-size);
  font-weight: var(--ui-type-body-compact-weight);
  line-height: var(--ui-type-body-line-height);
}

.announcement-notice__actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: var(--ui-space-2);
  padding-top: var(--ui-space-2);
}
</style>

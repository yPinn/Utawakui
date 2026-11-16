<script setup>
import { defineAsyncComponent, shallowRef, watch } from 'vue';
import stageArtwork from '../../../prototypes/performance-calendar/art/stage.webp';
import { t } from '../../utils/i18n.js';
import UiModal from '../ui/UiModal.vue';

const PerformanceSessionArchive = defineAsyncComponent(() =>
  import('./PerformanceSessionArchive.vue').then(
    ({ default: component }) => component,
  ),
);

const props = defineProps({
  sessionId: { type: String, default: null },
  sessionName: { type: String, default: '' },
  wide: Boolean,
  allowSavePlaylist: Boolean,
});
const emit = defineEmits(['close']);
const loadedName = shallowRef('');
const failedArtwork = shallowRef('');
watch(
  () => props.sessionId,
  () => {
    loadedName.value = '';
    failedArtwork.value = '';
  },
);
</script>

<template>
  <UiModal
    :open="Boolean(sessionId)"
    :title="loadedName || sessionName || t('session.archive.record')"
    :size="wide ? 'wide' : 'notice'"
    :max-block-size="wide ? 'large' : 'small'"
    @close="emit('close')"
  >
    <PerformanceSessionArchive
      v-if="sessionId"
      :key="sessionId"
      :session-id="sessionId"
      :allow-save-playlist="allowSavePlaylist"
      embedded
      @session-name="loadedName = $event"
      @navigate="emit('close')"
    >
      <template #artwork="{ coverUrl }">
        <img
          :key="coverUrl"
          :src="(coverUrl !== failedArtwork && coverUrl) || stageArtwork"
          class="performance-archive-modal__artwork"
          alt=""
          decoding="async"
          @error="failedArtwork = coverUrl"
        />
      </template>
    </PerformanceSessionArchive>
  </UiModal>
</template>

<style scoped>
.performance-archive-modal__artwork {
  display: block;
  inline-size: calc(100% + 2 * var(--ui-modal-content-inset));
  margin-inline: calc(-1 * var(--ui-modal-content-inset));
  aspect-ratio: 16 / 9;
  object-fit: cover;
  mask-image: linear-gradient(to bottom, black 88%, transparent);
}
</style>

<script setup>
import { computed } from 'vue';
import { ARTWORK_SIZE } from '../../constants/ui.js';
import { UserRound } from '../../icons/index.js';
import UiArtworkLoading from '../ui/UiArtworkLoading.vue';
import UiButton from '../ui/UiButton.vue';
import UiCollageThumb from '../ui/UiCollageThumb.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiRadioGroup from '../ui/UiRadioGroup.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import { t } from '../../utils/i18n.js';

const CANDIDATE_PHOTO_SIZE = ARTWORK_SIZE.xl;

const props = defineProps({
  open: { type: Boolean, default: false },
  artistName: { type: String, default: '' },
  status: {
    type: String,
    default: 'idle',
    validator: (value) =>
      ['idle', 'searching', 'ready', 'empty', 'error', 'applying'].includes(
        value,
      ),
  },
  candidates: { type: Array, default: () => [] },
  selectedCandidateId: { type: String, default: null },
  error: { type: String, default: '' },
});

const emit = defineEmits(['close', 'retry', 'selectCandidate', 'confirm']);

const title = computed(() =>
  props.artistName
    ? t('artist.photo.titleNamed', { name: props.artistName })
    : t('artist.photo.title'),
);
const showsCandidates = computed(() =>
  ['ready', 'applying'].includes(props.status),
);
const candidateItems = computed(() =>
  props.candidates.map((candidate) => ({
    ...candidate,
    id: candidate.candidateId,
    label: candidate.name,
    disabled: candidate.previewStatus !== 'ready',
  })),
);
const canConfirm = computed(() =>
  props.candidates.some(
    (candidate) =>
      candidate.candidateId === props.selectedCandidateId &&
      candidate.previewStatus === 'ready',
  ),
);

function confirm() {
  if (canConfirm.value && props.status !== 'applying') emit('confirm');
}

function selectCandidate(candidateId) {
  emit('selectCandidate', candidateId);
}
</script>

<template>
  <UiModal :open="open" :title="title" size="wide" @close="emit('close')">
    <div class="artist-photo-candidate-modal">
      <UiHint tone="text">
        {{ t('artist.photo.privacy') }}
      </UiHint>

      <div
        v-if="status === 'searching'"
        class="artist-photo-candidate-modal__loading"
        role="status"
      >
        <UiSkeleton
          v-for="index in 3"
          :key="index"
          class="artist-photo-candidate-modal__search-skeleton"
          shape="circle"
        />
        <UiHint center>{{ t('artist.photo.searching') }}</UiHint>
      </div>

      <UiHint v-else-if="status === 'empty'" padded center role="status">
        {{ t('artist.photo.none') }}
      </UiHint>

      <UiNotice
        v-if="error"
        tone="warning"
        :title="t('artist.photo.unavailable')"
        :message="error"
        :action-label="t('artist.photo.searchAgain')"
        @action="emit('retry')"
      />

      <UiRadioGroup
        v-if="showsCandidates && candidates.length"
        class="artist-photo-candidate-modal__candidates"
        name="artist-photo-candidate"
        :legend="t('artist.photo.choose')"
        :items="candidateItems"
        :model-value="selectedCandidateId"
        appearance="tiles"
        orientation="horizontal"
        :disabled="status === 'applying'"
        @update:model-value="selectCandidate"
      >
        <template #label="{ item: candidate }">
          <span class="artist-photo-candidate-modal__option-content">
            <UiCollageThumb
              class="artist-photo-candidate-modal__portrait"
              :cover-url="
                candidate.previewStatus === 'ready' ? candidate.previewUrl : ''
              "
              :tracks="[]"
              :can-collage="false"
              :size="CANDIDATE_PHOTO_SIZE"
              radius="var(--ui-radius-pill)"
              :empty-icon="UserRound"
            >
              <template v-if="candidate.previewStatus === 'loading'" #overlay>
                <UiArtworkLoading
                  :label="
                    t('artist.photo.loadingNamed', { name: candidate.name })
                  "
                />
              </template>
              <template
                v-else-if="candidate.previewStatus === 'error'"
                #overlay
              >
                <span class="artist-photo-candidate-modal__preview-error">
                  <UiHint center>{{ t('artist.photo.previewFailed') }}</UiHint>
                </span>
              </template>
            </UiCollageThumb>
            <span class="artist-photo-candidate-modal__name">
              {{ candidate.name }}
            </span>
          </span>
        </template>
      </UiRadioGroup>
    </div>

    <template #footer>
      <UiButton variant="secondary" @click="emit('close')">{{
        t('artist.photo.cancel')
      }}</UiButton>
      <UiButton
        variant="accent"
        :disabled="!canConfirm"
        :loading="status === 'applying'"
        :loading-label="t('artist.photo.applying')"
        @click="confirm"
      >
        {{ t('artist.photo.apply') }}
      </UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.artist-photo-candidate-modal {
  display: grid;
  gap: var(--ui-modal-section-gap);
}

.artist-photo-candidate-modal__loading {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
  gap: var(--ui-space-4);
}

.artist-photo-candidate-modal__loading > .ui-hint {
  grid-column: 1 / -1;
}

.artist-photo-candidate-modal__search-skeleton {
  --ui-skeleton-circle-size: min(100%, calc(var(--ui-space-8) * 2));

  justify-self: center;
}

.artist-photo-candidate-modal__candidates {
  --ui-radio-group-option-columns: repeat(3, minmax(0, 1fr));
  --ui-radio-group-option-gap: var(--ui-space-4);
}

.artist-photo-candidate-modal__option-content {
  min-inline-size: 0;
  display: grid;
  justify-items: center;
  gap: var(--ui-space-2);
}

.artist-photo-candidate-modal__portrait {
  max-inline-size: 100%;
}

.artist-photo-candidate-modal__preview-error {
  display: grid;
  place-items: center;
  padding: var(--ui-space-2);
  background: var(--ui-color-surface-hover);
}

.artist-photo-candidate-modal__name {
  max-inline-size: 100%;
  min-inline-size: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}

@container (max-width: 32rem) {
  .artist-photo-candidate-modal__loading {
    grid-template-columns: minmax(0, 1fr);
  }

  .artist-photo-candidate-modal__candidates {
    --ui-radio-group-option-columns: minmax(0, 1fr);
  }
}
</style>

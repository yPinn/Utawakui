<script setup>
import { computed } from 'vue';
import { useReleaseCatalog } from '../../composables/useReleaseCatalog.js';
import { releaseTypeLabel } from '../../utils/releasePresentation.js';
import UiModal from '../ui/UiModal.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiRadioGroup from '../ui/UiRadioGroup.vue';
import { t } from '../../utils/i18n.js';
const catalog = useReleaseCatalog();
const { state } = catalog;
const candidates = computed(() =>
  state.candidates.map((entry) => ({
    id: entry.candidateId,
    label: entry.title,
    description: [entry.artist, entry.year].filter(Boolean).join(' · '),
  })),
);
const slots = computed(() =>
  (state.preview?.rows ?? []).map((row) => ({
    id: row.position,
    label: t('release.catalog.slot', {
      position: row.position,
      title: row.title || t('release.catalog.untitled'),
    }),
    description: row.artist,
  })),
);
</script>

<template>
  <UiModal
    :open="state.open"
    :title="t('release.catalog.title')"
    size="wide"
    max-block-size="medium"
    :close-disabled="state.busy"
    @close="catalog.close"
  >
    <div class="release-catalog-modal">
      <p>{{ state.track?.title }}</p>
      <UiHint>{{ t('release.catalog.intro') }}</UiHint>
      <div class="release-catalog-modal__actions">
        <UiButton :disabled="state.busy" @click="catalog.search">{{
          t('release.catalog.search')
        }}</UiButton>
      </div>
      <UiHint v-if="state.busy" role="status">{{
        t('release.catalog.searching')
      }}</UiHint>
      <UiHint v-if="state.error" tone="danger" role="alert">{{
        state.error
      }}</UiHint>
      <UiHint v-if="state.message" role="status">{{ state.message }}</UiHint>
      <UiRadioGroup
        v-if="candidates.length"
        name="release-candidate"
        :legend="t('release.catalog.chooseRelease')"
        :items="candidates"
        :model-value="state.candidateId"
        :disabled="state.busy"
        @update:model-value="catalog.preview"
      />
      <template v-if="state.preview">
        <p>
          {{ state.preview.title }} · {{ releaseTypeLabel(state.preview.type)
          }}<template v-if="state.preview.year">
            · {{ state.preview.year }}</template
          >
        </p>
        <UiHint v-if="state.preview.completeness !== 'complete'">{{
          t('release.catalog.partialTracklist')
        }}</UiHint>
        <UiRadioGroup
          name="release-slot"
          :legend="t('release.catalog.chooseSlot')"
          :items="slots"
          :model-value="state.position ?? ''"
          :disabled="state.busy"
          @update:model-value="catalog.setPosition"
        />
        <UiButton
          v-if="state.preview.hasMore"
          :disabled="state.busy"
          @click="catalog.preview(state.candidateId, state.preview.nextOffset)"
          >{{ t('release.catalog.showMore') }}</UiButton
        >
      </template>
    </div>
    <template #footer>
      <UiButton :disabled="state.busy" @click="catalog.close">{{
        t('release.catalog.close')
      }}</UiButton>
      <UiButton
        variant="primary"
        :disabled="state.busy || !Number.isInteger(state.position)"
        @click="catalog.accept"
        >{{ t('release.catalog.confirm') }}</UiButton
      >
    </template>
  </UiModal>
</template>

<style scoped>
.release-catalog-modal {
  display: grid;
  gap: var(--ui-space-4);
}
.release-catalog-modal__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
</style>

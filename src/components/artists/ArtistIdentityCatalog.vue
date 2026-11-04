<script setup>
import { Check, Search } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiRadioGroup from '../ui/UiRadioGroup.vue';
import { t } from '../../utils/i18n.js';

defineProps({
  status: { type: String, default: 'idle' },
  error: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
  busy: { type: Boolean, default: false },
});

const emit = defineEmits(['search', 'update:selectedId', 'apply']);
</script>

<template>
  <div class="artist-identity-catalog">
    <div class="artist-identity-catalog__action">
      <UiButton
        variant="secondary"
        :icon="Search"
        :disabled="busy"
        :loading="status === 'searching'"
        :loading-label="t('artist.catalog.searching')"
        @click="emit('search')"
      >
        {{ t('artist.catalog.reidentify') }}
      </UiButton>
    </div>
    <UiNotice
      v-if="error"
      tone="warning"
      :title="t('artist.catalog.failed')"
      :message="error"
      compact
    />
    <UiHint v-else-if="status === 'empty'" padded center role="status">
      {{ t('artist.catalog.noMatch') }}
    </UiHint>
    <UiRadioGroup
      v-if="items.length"
      name="artist-catalog-candidate"
      :legend="t('artist.catalog.choose')"
      :items="items"
      :model-value="selectedId"
      :disabled="busy || status === 'searching'"
      @update:model-value="emit('update:selectedId', $event)"
    />
    <div v-if="items.length" class="artist-identity-catalog__action">
      <UiButton
        variant="accent"
        :icon="Check"
        :disabled="!selectedId"
        :loading="busy"
        @click="emit('apply')"
      >
        {{ t('artist.catalog.apply') }}
      </UiButton>
    </div>
  </div>
</template>

<style scoped>
.artist-identity-catalog {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.artist-identity-catalog__action {
  display: flex;
  justify-content: flex-end;
}
</style>

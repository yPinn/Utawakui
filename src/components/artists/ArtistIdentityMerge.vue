<script setup>
import { UserRoundPlus } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiRadioGroup from '../ui/UiRadioGroup.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';

defineProps({
  query: { type: String, default: '' },
  items: { type: Array, default: () => [] },
  selectedId: { type: String, default: '' },
  busy: { type: Boolean, default: false },
});

const emit = defineEmits(['update:query', 'update:selectedId', 'merge']);
</script>

<template>
  <div class="artist-identity-merge">
    <UiSearchBox
      label="搜尋要合併的藝人"
      placeholder="搜尋藝人"
      :model-value="query"
      :disabled="busy"
      @update:model-value="emit('update:query', $event)"
    />
    <UiRadioGroup
      v-if="items.length"
      name="artist-merge-target"
      legend="選擇合併目標"
      :items="items"
      :model-value="selectedId"
      :disabled="busy"
      @update:model-value="emit('update:selectedId', $event)"
    />
    <UiHint v-else padded center role="status">
      {{ query.trim() ? '找不到符合的藝人。' : '請先輸入藝人名稱。' }}
    </UiHint>
    <div class="artist-identity-merge__action">
      <UiButton
        variant="accent"
        :icon="UserRoundPlus"
        :disabled="!selectedId"
        :loading="busy"
        @click="emit('merge')"
      >
        合併
      </UiButton>
    </div>
  </div>
</template>

<style scoped>
.artist-identity-merge {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-2);
}

.artist-identity-merge__action {
  display: flex;
  justify-content: flex-end;
}
</style>

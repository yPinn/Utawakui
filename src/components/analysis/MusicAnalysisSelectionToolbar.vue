<script setup>
import { computed, useTemplateRef, watchEffect } from 'vue';
import UiButton from '../ui/UiButton.vue';

const props = defineProps({
  visibleCount: { type: Number, default: 0 },
  selectedCount: { type: Number, default: 0 },
  allVisibleSelected: { type: Boolean, default: false },
  someVisibleSelected: { type: Boolean, default: false },
  disabled: { type: Boolean, default: false },
});

const emit = defineEmits(['setVisible', 'clear']);
const toggleRef = useTemplateRef('toggle');
const mixed = computed(
  () => props.someVisibleSelected && !props.allVisibleSelected,
);
const ariaChecked = computed(() =>
  mixed.value ? 'mixed' : String(props.allVisibleSelected),
);
const filteredActionLabel = computed(() =>
  props.someVisibleSelected ? '取消選取搜尋結果' : '全選搜尋結果',
);

watchEffect(() => {
  if (toggleRef.value) toggleRef.value.indeterminate = mixed.value;
});

function toggleVisible() {
  emit('setVisible', !props.someVisibleSelected);
}
</script>

<template>
  <div class="analysis-selection-toolbar">
    <label class="analysis-selection-toolbar__filtered">
      <input
        ref="toggle"
        type="checkbox"
        :checked="allVisibleSelected"
        :aria-checked="ariaChecked"
        :disabled="disabled || visibleCount === 0"
        @change="toggleVisible"
      />
      <span>{{ filteredActionLabel }}</span>
    </label>
    <span class="analysis-selection-toolbar__count">
      批次已選 {{ selectedCount }} 首
    </span>
    <UiButton
      :disabled="disabled || selectedCount === 0"
      @click="emit('clear')"
    >
      清除全部
    </UiButton>
  </div>
</template>

<style scoped>
.analysis-selection-toolbar {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.analysis-selection-toolbar__filtered {
  min-height: var(--ui-control-height);
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-2);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  cursor: pointer;
}

.analysis-selection-toolbar__filtered input {
  width: var(--ui-space-4);
  height: var(--ui-space-4);
  margin: 0;
  accent-color: var(--ui-color-accent);
}

.analysis-selection-toolbar__filtered:has(input:disabled) {
  opacity: var(--ui-opacity-disabled);
  cursor: default;
}

.analysis-selection-toolbar__count {
  margin-inline-start: auto;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

@media (max-width: 520px) {
  .analysis-selection-toolbar {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .analysis-selection-toolbar__count {
    width: 100%;
    order: -1;
    margin-inline-start: 0;
  }
}
</style>

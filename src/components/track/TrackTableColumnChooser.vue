<script setup>
import { computed, shallowRef } from 'vue';
import { Columns3 } from '../../icons/index.js';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiPopover from '../ui/UiPopover.vue';
import {
  TRACK_COLLECTION_KINDS,
  normalizeTrackCollectionPreferences,
  trackCollectionColumnChoices,
} from './trackCollectionProfiles.js';

const props = defineProps({
  collectionKind: {
    type: String,
    required: true,
    validator: (value) => TRACK_COLLECTION_KINDS.includes(value),
  },
  preferences: { type: Object, default: () => ({}) },
  hiddenForWidth: { type: Array, default: () => [] },
});

const emit = defineEmits(['updateColumnPreferences']);
const open = shallowRef(false);
const columns = computed(() =>
  trackCollectionColumnChoices(props.collectionKind),
);
const normalizedPreferences = computed(() =>
  normalizeTrackCollectionPreferences(props.collectionKind, props.preferences),
);

function isColumnVisible(column) {
  return column.defaultVisible
    ? !normalizedPreferences.value.hiddenDefaultColumns.includes(column.role)
    : normalizedPreferences.value.visibleAdvanced.includes(column.role);
}

function updateColumn(column, visible) {
  if (column.locked) return;
  const selected = new Set(normalizedPreferences.value.visibleAdvanced);
  const hiddenDefaults = new Set(
    normalizedPreferences.value.hiddenDefaultColumns,
  );
  if (column.defaultVisible) {
    if (visible) hiddenDefaults.delete(column.role);
    else hiddenDefaults.add(column.role);
  } else if (visible) selected.add(column.role);
  else selected.delete(column.role);

  const normalized = normalizeTrackCollectionPreferences(props.collectionKind, {
    visibleAdvanced: columns.value
      .filter((candidate) => !candidate.defaultVisible)
      .map((candidate) => candidate.role)
      .filter((role) => selected.has(role)),
    hiddenDefaultColumns: columns.value
      .filter((candidate) => candidate.defaultVisible)
      .map((candidate) => candidate.role)
      .filter((role) => hiddenDefaults.has(role)),
    widths: {},
    columnOrder: normalizedPreferences.value.columnOrder,
  });
  emit('updateColumnPreferences', {
    visibleAdvanced: [...normalized.visibleAdvanced],
    hiddenDefaultColumns: [...normalized.hiddenDefaultColumns],
    widths: { ...normalized.widths },
    ...(normalized.columnOrder
      ? { columnOrder: [...normalized.columnOrder] }
      : {}),
  });
}
</script>

<template>
  <UiPopover
    v-model:open="open"
    aria-label="顯示欄位"
    placement="bottom-end"
    :close-on-scroll="false"
    scroll-axis="vertical"
  >
    <template #trigger="{ triggerProps }">
      <UiIconButton
        v-bind="triggerProps"
        class="track-table-column-chooser__trigger"
        :icon="Columns3"
        label="選擇顯示欄位"
        tooltip-placement="bottom"
        :active="open"
        @click="open = !open"
      />
    </template>

    <template #header>顯示欄位</template>

    <div class="track-table-column-chooser__options">
      <UiCheckbox
        v-for="column in columns"
        :id="`track-table-column-${collectionKind}-${column.role}`"
        :key="column.role"
        :label="column.label"
        :disabled="column.locked"
        :hint="
          hiddenForWidth.includes(column.role) && isColumnVisible(column)
            ? '空間不足，暫時隱藏'
            : ''
        "
        :model-value="isColumnVisible(column)"
        @update:model-value="updateColumn(column, $event)"
      />
    </div>
  </UiPopover>
</template>

<style scoped>
.track-table-column-chooser__trigger {
  --ui-icon-button-size-override: var(--ui-track-row-utility-size);
}

.track-table-column-chooser__options {
  display: grid;
  gap: var(--ui-space-1);
}
</style>

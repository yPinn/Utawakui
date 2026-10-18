<script setup>
import { computed, shallowRef, watch } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import SettingsDependencyActions from './SettingsDependencyActions.vue';

const props = defineProps({
  items: { type: Array, default: () => [] },
  additionalCount: { type: Number, default: 0 },
  additionalBusy: { type: Boolean, default: false },
  additionalAttention: { type: Boolean, default: false },
  additionalLoaded: { type: Boolean, default: true },
  highlighted: { type: Boolean, default: false },
});
const emit = defineEmits(['itemAction', 'itemAdvancedAction', 'noticeAction']);
const open = shallowRef(false);
const busyCount = computed(
  () =>
    props.items.filter((item) => item.busy).length +
    Number(props.additionalBusy),
);
const attentionCount = computed(
  () =>
    props.items.filter((item) => item.needsAttention).length +
    Number(props.additionalAttention),
);
const summary = computed(() => {
  const status =
    [
      busyCount.value ? `${busyCount.value} 項處理中` : '',
      attentionCount.value ? `${attentionCount.value} 項待處理` : '',
    ]
      .filter(Boolean)
      .join(' · ') || (props.additionalLoaded ? '已就緒' : '讀取中');
  return `工具與模型 · ${props.items.length + props.additionalCount} 項 · ${status}`;
});
watch(
  () => props.highlighted || attentionCount.value > 0 || busyCount.value > 0,
  (value) => {
    if (value) open.value = true;
  },
  { immediate: true },
);
</script>

<template>
  <UiDisclosure
    v-model:open="open"
    class="settings-dependency-list settings-section__disclosure"
    :label="summary"
  >
    <div class="settings-dependency-list__rows">
      <slot />
      <SettingsDocumentItem
        v-for="item in items"
        :key="item.id"
        :title="item.title || item.name"
        :status="item.status"
        :status-tone="item.statusTone"
        :guidance="item.description"
        variant="nested"
      >
        <template #actions>
          <SettingsDependencyActions
            :item="item"
            @primary-action="emit('itemAction', $event)"
            @advanced-action="emit('itemAdvancedAction', $event)"
          />
        </template>
        <template v-if="item.notice" #feedback>
          <UiHint tone="danger" role="alert"
            >{{ item.notice.title }}：{{ item.notice.message }}</UiHint
          >
          <UiButton
            v-if="item.notice.operation !== 'remove'"
            variant="ghost"
            :disabled="item.actionDisabled"
            @click="emit('noticeAction', item.notice)"
            >重試</UiButton
          >
        </template>
      </SettingsDocumentItem>
    </div>
  </UiDisclosure>
</template>

<style scoped>
.settings-dependency-list {
  border-block-end: 0;
}
.settings-dependency-list__rows > :deep(* + *) {
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}
</style>

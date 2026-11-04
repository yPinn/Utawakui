<script setup>
import { computed, shallowRef, watch } from 'vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import SettingsDependencyRows from './SettingsDependencyRows.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  items: { type: Array, default: () => [] },
  additionalCount: { type: Number, default: 0 },
  additionalBusy: { type: [Boolean, Number], default: false },
  additionalAttention: { type: [Boolean, Number], default: false },
  additionalUnavailable: { type: Number, default: 0 },
  additionalLoaded: { type: Boolean, default: true },
  highlighted: { type: Boolean, default: false },
  // A group title replaces the generic tools label; bare drops the disclosure.
  title: { type: String, default: '' },
  bare: { type: Boolean, default: false },
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
      busyCount.value
        ? t('dependencies.summary.busy', { count: busyCount.value })
        : '',
      attentionCount.value
        ? t('dependencies.summary.attention', { count: attentionCount.value })
        : '',
      props.additionalUnavailable
        ? t('dependencies.summary.unavailable', {
            count: props.additionalUnavailable,
          })
        : '',
    ]
      .filter(Boolean)
      .join(' · ') ||
    (props.additionalLoaded
      ? t('dependencies.summary.ready')
      : t('dependencies.summary.loading'));
  if (props.title) {
    return t('dependencies.summary.group', { title: props.title, status });
  }
  return t('dependencies.summary.line', {
    count: props.items.length + props.additionalCount,
    status,
  });
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
  <SettingsDependencyRows
    v-if="bare"
    class="settings-dependency-list settings-dependency-list--bare"
    :items="items"
    @item-action="emit('itemAction', $event)"
    @item-advanced-action="emit('itemAdvancedAction', $event)"
    @notice-action="emit('noticeAction', $event)"
  >
    <slot />
    <template #after><slot name="after" /></template>
  </SettingsDependencyRows>
  <UiDisclosure
    v-else
    v-model:open="open"
    class="settings-dependency-list settings-section__disclosure"
    :label="summary"
  >
    <SettingsDependencyRows
      :items="items"
      @item-action="emit('itemAction', $event)"
      @item-advanced-action="emit('itemAdvancedAction', $event)"
      @notice-action="emit('noticeAction', $event)"
    >
      <slot />
      <template #after><slot name="after" /></template>
    </SettingsDependencyRows>
  </UiDisclosure>
</template>

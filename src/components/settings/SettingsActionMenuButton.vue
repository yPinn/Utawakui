<script setup>
import { computed, shallowRef, watch } from 'vue';
import { ChevronDown } from '../../icons/index.js';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiButton from '../ui/UiButton.vue';

const props = defineProps({
  label: { type: String, required: true },
  items: { type: Array, required: true },
  disabled: Boolean,
  loading: Boolean,
  loadingLabel: { type: String, required: true },
});
const emit = defineEmits(['select']);
const anchorElement = shallowRef(null);
const anchor = computed(() => ({
  kind: 'element',
  element: anchorElement.value,
}));
const content = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'commands',
      items: props.items.map((item) => ({
        ...item,
        kind: 'action',
        value: item.id,
      })),
    },
  ],
}));

function close() {
  anchorElement.value = null;
}

watch(
  () => props.disabled || props.loading,
  (blocked) => {
    if (blocked) close();
  },
);
</script>

<template>
  <UiButton
    :icon="ChevronDown"
    variant="secondary"
    :disabled="disabled"
    :loading="loading"
    :loading-label="loadingLabel"
    aria-haspopup="menu"
    :aria-expanded="Boolean(anchorElement)"
    @click="anchorElement = anchorElement ? null : $event.currentTarget"
  >
    {{ label }}
  </UiButton>
  <UiActionMenu
    :open="Boolean(anchorElement)"
    :anchor="anchor"
    :aria-label="label"
    :content="content"
    @select="emit('select', $event)"
    @close="close"
  />
</template>

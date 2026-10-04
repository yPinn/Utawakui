<script setup>
import { computed, shallowRef } from 'vue';
import { Download, Ellipsis } from '../../icons/index.js';
import UiContextMenu from '../ui/UiContextMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';

const props = defineProps({
  item: { type: Object, required: true },
});

const emit = defineEmits(['primaryAction', 'advancedAction']);

const isMenuOpen = shallowRef(false);
const menuAnchorEl = shallowRef(null);

const menuItems = computed(() =>
  (props.item.advancedActions ?? []).map((action) =>
    action.separator
      ? action
      : {
          ...action,
          value: action.id,
        },
  ),
);

const hasMenuItems = computed(() => menuItems.value.length > 0);
const primaryIcon = computed(() => props.item.actionIcon || Download);
const menuLabel = computed(() => `${props.item.title || props.item.name}選項`);

function openMenu(event) {
  event.stopPropagation();
  menuAnchorEl.value = event.currentTarget;
  isMenuOpen.value = true;
}

function closeMenu() {
  isMenuOpen.value = false;
  menuAnchorEl.value = null;
}

function handleMenuSelect(actionId) {
  closeMenu();
  emit('advancedAction', {
    item: props.item,
    action: actionId,
  });
}
</script>

<template>
  <div class="settings-dependency-actions">
    <UiIconButton
      v-if="item.actionIcon"
      :icon="primaryIcon"
      :label="item.actionLabel"
      :disabled="item.actionDisabled"
      :aria-disabled="item.actionDisabled ? 'true' : undefined"
      @click="emit('primaryAction', item.id)"
    />

    <UiIconButton
      v-if="hasMenuItems"
      :icon="Ellipsis"
      :label="menuLabel"
      aria-haspopup="menu"
      :aria-expanded="isMenuOpen ? 'true' : 'false'"
      @click="openMenu"
    />

    <UiContextMenu
      :open="isMenuOpen"
      :anchor-el="menuAnchorEl"
      :width="184"
      :items="menuItems"
      empty-text="沒有可用的進階操作"
      @select="handleMenuSelect"
      @close="closeMenu"
    />
  </div>
</template>

<style scoped>
.settings-dependency-actions {
  display: inline-flex;
  align-items: center;
  gap: var(--ui-space-1);
}
</style>

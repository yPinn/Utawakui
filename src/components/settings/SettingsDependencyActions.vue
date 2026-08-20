<script setup>
import { computed, shallowRef } from 'vue';
import { Download, Ellipsis } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiContextMenu from '../ui/UiContextMenu.vue';

const props = defineProps({
  item: { type: Object, required: true },
});

const emit = defineEmits(['primaryAction', 'advancedAction']);

const isMenuOpen = shallowRef(false);
const menuX = shallowRef(0);
const menuY = shallowRef(0);

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

function openMenu(event) {
  event.stopPropagation();
  const rect = event.currentTarget.getBoundingClientRect();
  menuX.value = rect.left;
  menuY.value = rect.bottom + 4;
  isMenuOpen.value = true;
}

function closeMenu() {
  isMenuOpen.value = false;
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
    <UiButton
      v-if="item.actionIcon"
      :icon="primaryIcon"
      :disabled="item.actionDisabled"
      :aria-disabled="item.actionDisabled ? 'true' : undefined"
      :aria-label="item.actionLabel"
      :title="item.actionLabel"
      @click="emit('primaryAction', item.id)"
    />

    <UiButton
      v-if="hasMenuItems"
      :icon="Ellipsis"
      :aria-label="`更多${item.title || item.name}選項`"
      :title="`更多${item.title || item.name}選項`"
      aria-haspopup="menu"
      :aria-expanded="isMenuOpen ? 'true' : 'false'"
      @click="openMenu"
    />

    <UiContextMenu
      :open="isMenuOpen"
      :x="menuX"
      :y="menuY"
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

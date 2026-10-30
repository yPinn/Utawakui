<script setup>
import { computed, shallowRef } from 'vue';
import { Download, Ellipsis } from '../../icons/index.js';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  item: { type: Object, required: true },
});

const emit = defineEmits(['primaryAction', 'advancedAction']);

const isMenuOpen = shallowRef(false);
const menuAnchorEl = shallowRef(null);

const menuAnchor = computed(() => ({
  kind: 'element',
  element: menuAnchorEl.value,
}));
const menuContent = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'advanced',
      items: (props.item.advancedActions ?? []).map((action) => ({
        ...action,
        kind: 'action',
        value: action.id,
      })),
    },
  ],
  emptyText: t('dependencies.actions.noActions'),
}));

const hasMenuItems = computed(
  () => menuContent.value.groups[0].items.length > 0,
);
const primaryIcon = computed(() => props.item.actionIcon || Download);
const menuLabel = computed(() =>
  t('dependencies.actions.menuNamed', {
    name: props.item.title || props.item.name,
  }),
);

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
      variant="accent"
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

    <UiActionMenu
      :open="isMenuOpen"
      :anchor="menuAnchor"
      size="sm"
      :content="menuContent"
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

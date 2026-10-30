<script setup>
import { computed, shallowRef } from 'vue';
import { Clock, Ellipsis, ListX } from '../../icons/index.js';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiButton from '../ui/UiButton.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  recordCount: { type: Number, default: 0 },
  isLoading: { type: Boolean, default: false },
  isClearing: { type: Boolean, default: false },
  error: { type: String, default: '' },
  readError: { type: String, default: '' },
});

const emit = defineEmits(['clear', 'refresh']);
const isMenuOpen = shallowRef(false);
const menuAnchorEl = shallowRef(null);

const valueLabel = computed(() => {
  if (props.readError) return t('librarySettings.history.unconfirmed');
  if (props.isLoading) return t('librarySettings.reading');
  if (props.isClearing) return t('librarySettings.history.clearing');
  return props.recordCount > 0
    ? t(
        'librarySettings.history.saved',
        { count: props.recordCount },
        props.recordCount,
      )
    : t('librarySettings.history.empty');
});

const menuAnchor = computed(() => ({
  kind: 'element',
  element: menuAnchorEl.value,
}));
const menuContent = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'history',
      items: [
        {
          id: 'clear',
          kind: 'action',
          value: 'clear',
          label: t('librarySettings.history.clear'),
          icon: ListX,
          intent: 'danger',
          disabled:
            props.isLoading || props.isClearing || props.recordCount === 0,
        },
      ],
    },
  ],
}));

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
  if (actionId === 'clear') emit('clear');
}
</script>

<template>
  <div class="playback-history-settings-row">
    <SettingsDocumentItem
      :icon="Clock"
      :title="t('librarySettings.history.title')"
      :value="valueLabel"
      :guidance="t('librarySettings.history.guidance')"
    >
      <template #actions>
        <UiIconButton
          :icon="Ellipsis"
          :label="t('librarySettings.history.options')"
          aria-haspopup="menu"
          :aria-expanded="isMenuOpen ? 'true' : 'false'"
          @click="openMenu"
        />
      </template>
      <template v-if="error" #feedback>
        <UiHint tone="danger" role="alert">{{
          t(
            readError
              ? 'librarySettings.history.readFailedNamed'
              : 'librarySettings.history.updateFailedNamed',
            { error },
          )
        }}</UiHint>
        <UiButton
          v-if="readError"
          variant="ghost"
          :loading="isLoading"
          @click="emit('refresh')"
          >{{ t('librarySettings.reload') }}</UiButton
        >
      </template>
    </SettingsDocumentItem>

    <UiActionMenu
      :open="isMenuOpen"
      :anchor="menuAnchor"
      size="sm"
      :aria-label="t('librarySettings.history.actions')"
      :content="menuContent"
      @select="handleMenuSelect"
      @close="closeMenu"
    />
  </div>
</template>

<style scoped>
.playback-history-settings-row {
  display: grid;
  gap: var(--ui-space-2);
}
</style>

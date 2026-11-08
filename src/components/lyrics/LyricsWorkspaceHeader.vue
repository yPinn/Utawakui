<script setup>
import { computed, nextTick, shallowRef } from 'vue';
import { Pencil, SlidersHorizontal } from '../../icons/index.js';
import AppFolderWorkspaceToolbar from '../layout/AppFolderWorkspaceToolbar.vue';
import UiButton from '../ui/UiButton.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiHint from '../ui/UiHint.vue';
import { t } from '../../utils/i18n.js';
const props = defineProps({
  track: { type: Object, default: null },
  trackMeta: { type: String, default: '' },
  reloadStatus: { type: String, default: '' },
  isReloading: { type: Boolean, default: false },
  canEditReadings: { type: Boolean, default: false },
  canEditText: { type: Boolean, default: false },
  canExport: { type: Boolean, default: false },
  canEditTiming: { type: Boolean, default: false },
  canEditVocals: { type: Boolean, default: false },
  isLocked: { type: Boolean, default: false },
  editMode: { type: String, default: 'preview' },
});
const emit = defineEmits(['selectTrack', 'refresh', 'editModeChange']);
const displayOpen = shallowRef(false);
const menuOpen = shallowRef(false);
const menuElement = shallowRef(null);
let displayTrigger = null;
const menuAnchor = computed(() => ({
  kind: 'element',
  element: menuElement.value,
}));
const menuContent = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'edit',
      items: [
        {
          id: 'text',
          kind: 'action',
          label: t('lyricsEditor.correction.title'),
          disabled: !props.canEditText || props.isLocked,
        },
        {
          id: 'tap',
          kind: 'action',
          label: t('lyricsEditor.tap.title'),
          disabled: !props.canEditText || props.isLocked,
        },
        {
          id: 'reading',
          kind: 'action',
          label: t('lyricsEditor.header.reading'),
          disabled: !props.canEditReadings || props.isLocked,
        },
        {
          id: 'timing',
          kind: 'action',
          label: t('lyricsEditor.header.timing'),
          disabled: !props.canEditTiming || props.isLocked,
          disabledReason: !props.canEditTiming
            ? t('lyricsEditor.header.timingUnavailable')
            : '',
        },
        {
          id: 'vocal',
          kind: 'action',
          label: t('lyricsEditor.header.vocal'),
          disabled: !props.canEditVocals || props.isLocked,
        },
        {
          id: 'export',
          kind: 'action',
          label: t('lyricsEditor.export.title'),
          disabled: !props.canExport || props.isLocked,
        },
      ],
    },
    {
      id: 'track',
      items: [
        {
          id: 'selectTrack',
          kind: 'action',
          label: t('lyricsEditor.header.selectTrack'),
          disabled: props.isLocked,
        },
        {
          id: 'refresh',
          kind: 'action',
          label: t('lyricsEditor.header.rescan'),
          disabled: props.isLocked || props.isReloading || !props.track,
        },
      ],
    },
  ],
}));
function toggleDisplay(event) {
  displayTrigger = event.currentTarget;
  menuOpen.value = false;
  displayOpen.value = !displayOpen.value;
}
async function closeDisplay() {
  displayOpen.value = false;
  await nextTick();
  displayTrigger?.focus();
}
function restoreDisplay() {
  if (props.track && !props.isLocked) displayOpen.value = true;
}
function openMenu(event) {
  displayOpen.value = false;
  menuElement.value = event.currentTarget;
  menuOpen.value = !menuOpen.value;
}
function selectAction(item) {
  const action = menuContent.value.groups
    .flatMap((group) => group.items)
    .find((entry) => entry.id === item.id);
  if (!action || action.disabled) return;
  menuOpen.value = false;
  if (['text', 'tap', 'reading', 'timing', 'vocal', 'export'].includes(item.id))
    emit('editModeChange', item.id);
  else emit(item.id);
}
</script>
<template>
  <div class="lyrics-workspace-header">
    <AppFolderWorkspaceToolbar
      :context="track?.title || t('lyricsEditor.header.noTrack')"
      :meta="trackMeta"
    >
      <template #actions>
        <slot name="review" />
        <UiPopover
          v-model:open="displayOpen"
          :aria-label="t('lyricsEditor.header.displayLabel')"
          placement="bottom-end"
          :close-on-scroll="false"
          focus-on-open
        >
          <template #trigger="{ triggerProps }">
            <UiButton
              v-bind="triggerProps"
              :icon="SlidersHorizontal"
              :active="displayOpen"
              :disabled="isLocked"
              @click="toggleDisplay"
              >{{ t('lyricsEditor.header.display') }}</UiButton
            >
          </template>
          <slot
            name="display"
            :close-display="closeDisplay"
            :restore-display="restoreDisplay"
          />
        </UiPopover>
        <UiButton
          :icon="Pencil"
          :active="editMode !== 'preview'"
          :disabled="isLocked"
          aria-haspopup="menu"
          :aria-expanded="menuOpen"
          @click="openMenu"
          >{{ t('lyricsEditor.header.edit') }}</UiButton
        >
      </template>
    </AppFolderWorkspaceToolbar>
    <UiHint v-if="reloadStatus" role="status">{{ reloadStatus }}</UiHint>
    <UiActionMenu
      :open="menuOpen"
      :anchor="menuAnchor"
      :aria-label="t('lyricsEditor.header.actions')"
      :content="menuContent"
      @select="selectAction"
      @close="menuOpen = false"
    />
  </div>
</template>
<style scoped>
.lyrics-workspace-header {
  min-width: 0;
  padding: var(--ui-space-3) var(--ui-space-4);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}
</style>

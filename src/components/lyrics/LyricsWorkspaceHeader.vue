<script setup>
import { computed, nextTick, shallowRef } from 'vue';
import { Pencil, SlidersHorizontal } from '../../icons/index.js';
import AppFolderWorkspaceToolbar from '../layout/AppFolderWorkspaceToolbar.vue';
import UiButton from '../ui/UiButton.vue';
import UiPopover from '../ui/UiPopover.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiHint from '../ui/UiHint.vue';
const props = defineProps({
  track: { type: Object, default: null },
  trackMeta: { type: String, default: '' },
  reloadStatus: { type: String, default: '' },
  isReloading: { type: Boolean, default: false },
  canEditReadings: { type: Boolean, default: false },
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
          id: 'reading',
          kind: 'action',
          label: '修正讀音',
          disabled: !props.canEditReadings || props.isLocked,
        },
        {
          id: 'timing',
          kind: 'action',
          label: '調整對時',
          disabled: !props.canEditTiming || props.isLocked,
          disabledReason: !props.canEditTiming ? '需要已有句首時間的歌詞' : '',
        },
        {
          id: 'vocal',
          kind: 'action',
          label: '標註聲部',
          disabled: !props.canEditVocals || props.isLocked,
        },
      ],
    },
    {
      id: 'track',
      items: [
        {
          id: 'selectTrack',
          kind: 'action',
          label: '選擇曲目',
          disabled: props.isLocked,
        },
        {
          id: 'refresh',
          kind: 'action',
          label: '重新掃描歌詞',
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
  if (['reading', 'timing', 'vocal'].includes(item.id))
    emit('editModeChange', item.id);
  else emit(item.id);
}
</script>
<template>
  <div class="lyrics-workspace-header">
    <AppFolderWorkspaceToolbar
      :context="track?.title || '尚未選擇曲目'"
      :meta="trackMeta"
    >
      <template #actions>
        <slot name="review" />
        <UiPopover
          v-model:open="displayOpen"
          aria-label="歌詞顯示設定"
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
              >顯示</UiButton
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
          >編輯</UiButton
        >
      </template>
    </AppFolderWorkspaceToolbar>
    <UiHint v-if="reloadStatus" role="status">{{ reloadStatus }}</UiHint>
    <UiActionMenu
      :open="menuOpen"
      :anchor="menuAnchor"
      aria-label="歌詞編輯操作"
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

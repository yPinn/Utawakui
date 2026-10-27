<script setup>
import { computed, shallowRef } from 'vue';
import { Ellipsis, Save, RefreshCw, X } from '../../icons/index.js';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSeparator from '../ui/UiSeparator.vue';

const props = defineProps({ state: { type: Object, required: true } });
const emit = defineEmits(['action']);
const slotItems = computed(() =>
  [1, 2, 3].map((slot) => ({
    id: slot,
    label: String(slot),
    tooltip: !props.state.hasTrack
      ? '請先選擇曲目'
      : `設定 ${slot}${slot === (props.state.defaultSlot ?? 1) ? '（預設）' : !props.state.savedSlots?.[slot - 1] ? '（空組）' : ''} · 右鍵重設`,
    empty:
      !props.state.error &&
      !props.state.reading &&
      !props.state.savedSlots?.[slot - 1],
    description: !props.state.hasTrack
      ? `設定 ${slot}，請先選擇曲目`
      : `設定 ${slot}${slot === (props.state.defaultSlot ?? 1) ? '，下次預設' : ''}，${props.state.savedSlots?.[slot - 1] ? '已保存' : '空組'}${slot === (props.state.selectedSlot ?? 1) && props.state.dirty ? '，未保存變更' : ''}`,
  })),
);
const menuOpen = shallowRef(false),
  anchor = shallowRef(null);
const status = computed(() => {
  if (props.state.reading) return '讀取歌曲設定中…';
  if (props.state.writing) return '保存中…';
  if (props.state.applying) return '套用中…';
  if (props.state.error) return '設定未確認';
  if (!props.state.hasTrack) return '請先選擇曲目';
  if (props.state.dirty) return '未保存變更';
  return props.state.hasSaved ? '已保存' : '空組';
});
const menuContent = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'copy',
      items: [
        {
          id: 'copy',
          kind: 'submenu',
          label: '複製已存設定到',
          size: 'md',
          disabled:
            props.state.busy || !props.state.hasTrack || !props.state.hasSaved,
          content: {
            kind: 'actions',
            groups: [
              {
                id: 'destinations',
                items: [1, 2, 3]
                  .filter((slot) => slot !== (props.state.selectedSlot ?? 1))
                  .map((slot) => ({
                    id: `copy-${slot}`,
                    kind: 'action',
                    label: `設定 ${slot}${props.state.savedSlots?.[slot - 1] ? '（保存後覆寫）' : '（空組）'}`,
                    value: { kind: 'copyToSlot', slot },
                  })),
              },
            ],
          },
        },
      ],
    },
    {
      id: 'settings',
      items: [
        {
          id: 'reset',
          label: '重設目前設定',
          disabled: !props.state.hasTrack,
        },
        {
          id: 'remove',
          label: '移除此組設定',
          disabled: !props.state.hasSaved,
        },
        {
          id: 'setDefault',
          label: '設為下次預設',
          disabled:
            !props.state.hasSaved ||
            props.state.selectedSlot === props.state.defaultSlot,
        },
        { id: 'reload', label: '重新讀取', disabled: !props.state.hasTrack },
      ].map((item) => ({
        ...item,
        kind: 'action',
        value: item.id,
        disabled: props.state.busy || item.disabled,
      })),
    },
  ],
}));
function select(action) {
  menuOpen.value = false;
  emit('action', action);
}
function resetSlot(slot) {
  if (!props.state.hasTrack || props.state.busy) return;
  emit('action', { kind: 'resetSlot', slot });
}
</script>

<template>
  <div class="performance-settings-controls">
    <span v-if="!state.blocked" class="ui-visually-hidden" role="status">{{
      status
    }}</span>
    <div v-if="state.blocked" class="performance-settings-controls__actions">
      <UiIconButton
        :icon="RefreshCw"
        label="重新讀取"
        :disabled="state.busy"
        @click="emit('action', 'retry')"
      />
      <UiButton variant="secondary" @click="emit('action', 'useDefaultsOnce')"
        >本次使用預設</UiButton
      >
    </div>
    <div v-else class="performance-settings-controls__row">
      <div
        class="performance-settings-controls__slots"
        role="group"
        aria-label="本曲設定組別"
      >
        <UiButton
          v-for="item in slotItems"
          :key="item.id"
          variant="secondary"
          :class="{ 'performance-settings-controls__slot--empty': item.empty }"
          :active="item.id === (state.selectedSlot ?? 1)"
          :aria-pressed="item.id === (state.selectedSlot ?? 1)"
          :aria-label="item.description"
          :title="item.tooltip"
          :disabled="state.busy || !state.hasTrack"
          @click="emit('action', { kind: 'selectSlot', slot: item.id })"
          @contextmenu.prevent.stop="resetSlot(item.id)"
          >{{ item.label }}</UiButton
        >
      </div>
      <UiSeparator orientation="vertical" />
      <UiIconButton
        v-if="state.pendingStart"
        :icon="X"
        label="取消開始播放"
        @click="emit('action', 'cancelStart')"
      />
      <UiIconButton
        :icon="Save"
        label="保存本曲"
        :variant="
          state.hasTrack && (state.dirty || !state.hasSaved)
            ? 'accent'
            : 'ghost'
        "
        :loading="state.writing"
        loading-label="正在保存歌曲設定"
        :disabled="!state.hasTrack || !state.canSave"
        @click="emit('action', 'save')"
      />
      <UiIconButton
        :icon="Ellipsis"
        label="歌曲設定選項"
        aria-haspopup="menu"
        :aria-expanded="menuOpen"
        :disabled="state.busy || !state.hasTrack"
        @click="
          anchor = $event.currentTarget;
          menuOpen = true;
        "
      />
    </div>
    <UiActionMenu
      :open="menuOpen"
      :anchor="{ kind: 'element', element: anchor }"
      size="sm"
      aria-label="歌曲設定選項"
      :content="menuContent"
      @select="select"
      @close="menuOpen = false"
    />
  </div>
</template>

<style scoped>
.performance-settings-controls {
  display: grid;
  gap: var(--ui-space-2);
}
.performance-settings-controls__row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-1);
}
.performance-settings-controls__slots {
  display: flex;
  gap: var(--ui-space-1);
  flex: 1;
  min-width: 0;
}
.performance-settings-controls__slots > * {
  flex: 1;
}
.performance-settings-controls__slots
  > .performance-settings-controls__slot--empty {
  border-style: dashed;
}
.performance-settings-controls__actions {
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
</style>

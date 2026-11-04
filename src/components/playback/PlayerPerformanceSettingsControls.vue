<script setup>
import { computed, shallowRef } from 'vue';
import { Ellipsis, Save, RefreshCw, X } from '../../icons/index.js';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({ state: { type: Object, required: true } });
const emit = defineEmits(['action']);
const slotItems = computed(() =>
  [1, 2, 3].map((slot) => ({
    id: slot,
    label: String(slot),
    tooltip: !props.state.hasTrack
      ? t('player.slots.chooseTrack')
      : t(
          slot === (props.state.defaultSlot ?? 1)
            ? 'player.slots.tooltipDefault'
            : !props.state.savedSlots?.[slot - 1]
              ? 'player.slots.tooltipEmpty'
              : 'player.slots.tooltip',
          { slot },
        ),
    empty:
      !props.state.error &&
      !props.state.reading &&
      !props.state.savedSlots?.[slot - 1],
    description: !props.state.hasTrack
      ? t('player.slots.descriptionNoTrack', { slot })
      : [
          t('player.slots.name', { slot }),
          slot === (props.state.defaultSlot ?? 1) &&
            t('player.slots.nextDefault'),
          t(
            props.state.savedSlots?.[slot - 1]
              ? 'player.slots.saved'
              : 'player.slots.empty',
          ),
          slot === (props.state.selectedSlot ?? 1) &&
            props.state.dirty &&
            t('player.slots.unsavedChanges'),
        ]
          .filter(Boolean)
          .join(t('common.clauseSeparator')),
  })),
);
const menuOpen = shallowRef(false),
  anchor = shallowRef(null);
const status = computed(() => {
  if (props.state.reading) return t('player.slots.reading');
  if (props.state.writing) return t('player.slots.writing');
  if (props.state.applying) return t('player.slots.applying');
  if (props.state.error) return t('player.slots.unconfirmed');
  if (!props.state.hasTrack) return t('player.slots.chooseTrack');
  if (props.state.dirty) return t('player.slots.unsavedChanges');
  return props.state.hasSaved
    ? t('player.slots.saved')
    : t('player.slots.empty');
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
          label: t('player.slots.copyTo'),
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
                    label: t(
                      props.state.savedSlots?.[slot - 1]
                        ? 'player.slots.copyTargetOverwrite'
                        : 'player.slots.copyTargetEmpty',
                      { slot },
                    ),
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
          label: t('player.slots.reset'),
          disabled: !props.state.hasTrack,
        },
        {
          id: 'remove',
          label: t('player.slots.remove'),
          disabled: !props.state.hasSaved,
        },
        {
          id: 'setDefault',
          label: t('player.slots.setDefault'),
          disabled:
            !props.state.hasSaved ||
            props.state.selectedSlot === props.state.defaultSlot,
        },
        {
          id: 'reload',
          label: t('player.slots.reload'),
          disabled: !props.state.hasTrack,
        },
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
        :label="t('player.slots.reload')"
        :disabled="state.busy"
        @click="emit('action', 'retry')"
      />
      <UiButton
        variant="secondary"
        @click="emit('action', 'useDefaultsOnce')"
        >{{ t('player.slots.useDefault') }}</UiButton
      >
    </div>
    <div v-else class="performance-settings-controls__row">
      <div
        class="performance-settings-controls__slots"
        role="group"
        :aria-label="t('player.slots.groupLabel')"
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
        :label="t('player.slots.cancelStart')"
        @click="emit('action', 'cancelStart')"
      />
      <UiIconButton
        :icon="Save"
        :label="t('player.slots.save')"
        :variant="
          state.hasTrack && (state.dirty || !state.hasSaved)
            ? 'accent'
            : 'ghost'
        "
        :loading="state.writing"
        :loading-label="t('player.slots.saving')"
        :disabled="!state.hasTrack || !state.canSave"
        @click="emit('action', 'save')"
      />
      <UiIconButton
        :icon="Ellipsis"
        :label="t('player.slots.options')"
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
      :aria-label="t('player.slots.options')"
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

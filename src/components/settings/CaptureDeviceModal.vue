<script setup>
import { computed, shallowRef } from 'vue';
import { Cable, Headphones, ICON_SIZE, Info } from '../../icons/index.js';
import { useAudioOutput } from '../../composables/useAudioOutput.js';
import { usePlayer } from '../../composables/usePlayer.js';
import {
  compareAudioDevices,
  groupDevicesByIdentity,
  isVirtualCableDevice,
} from '../../utils/audioDeviceLabel.js';
import UiIconButton from '../ui/UiIconButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiRadioGroup from '../ui/UiRadioGroup.vue';
import UiNotice from '../ui/UiNotice.vue';
import VirtualCableGuideModal from './VirtualCableGuideModal.vue';

// A dedicated modal rather than a UiActionMenu row list — real Windows
// audio device names run long ("喇叭 (Turtle Beach Stream Mic 2 Chat)"),
// which a ~220px context menu has to ellipsis-truncate into
// indistinguishable labels. Picking the wrong device here silently breaks
// the capture feature (see usePlayer.js's capture chain), so this needs
// full-width, unclipped rows — and a click target sized for a deliberate,
// occasional configuration choice, not a tucked-away overflow action.
defineProps({
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const { state: playerState } = usePlayer();
const { devices, monitorDeviceLabel, captureErrorNotice, selectDevice } =
  useAudioOutput();

// "Off" doesn't mean silence — the monitor chain (see usePlayer.js) always
// plays through the OS's current default device regardless of any capture
// selection here. Naming it explicitly (not a hardcoded "耳機" guess, which
// isn't always true) tells the user what they'll actually hear through.
const offOptionLabel = computed(
  () => `關閉擷取（仍從 ${monitorDeviceLabel.value} 播放）`,
);

const isGuideOpen = shallowRef(false);

// Virtual-cable devices sort first with their own icon/heading: that is the one
// category this feature cares about, and VB-CABLE/VoiceMeeter names are reliable
// to match (audioDeviceLabel.js). Everything else gets a generic icon, since
// enumerateDevices() cannot tell headphones from speakers.
//
// groupDevicesByIdentity() runs first so the Default/Communications pseudo-devices
// collapse onto the physical device they alias (merge key is the label, not
// deviceId; see its comment).
const deviceRows = computed(() => {
  const virtual = [];
  const other = [];
  for (const device of groupDevicesByIdentity(devices.value)) {
    (isVirtualCableDevice(device.label) ? virtual : other).push(device);
  }
  // enumerateDevices() order is OS/driver enumeration order, not
  // alphabetical — see compareAudioDevices for why Default/Communications
  // stay pinned first within each group instead of sorting purely by name.
  // sortDeviceId (not canonicalDeviceId) carries the row's role for this,
  // since a merged row's persisted id is deliberately the literal one.
  const bySortOrder = (a, b) =>
    compareAudioDevices(
      { deviceId: a.sortDeviceId, label: a.label },
      { deviceId: b.sortDeviceId, label: b.label },
    );
  virtual.sort(bySortOrder);
  other.sort(bySortOrder);
  return [
    ...virtual.map((device) => ({
      ...device,
      icon: Cable,
      category: 'virtual',
    })),
    ...other.map((device) => ({
      ...device,
      icon: Headphones,
      category: 'other',
    })),
  ];
});

// Resolve saved default/communications aliases to the canonical visible option.
const selectedDevice = computed(() => {
  if (!playerState.captureDeviceId) return 0;
  return (
    deviceRows.value.find((row) =>
      row.deviceIds.includes(playerState.captureDeviceId),
    )?.canonicalDeviceId ?? playerState.captureDeviceId
  );
});
const deviceGroups = computed(() => {
  const virtual = deviceRows.value.filter((row) => row.category === 'virtual');
  const other = deviceRows.value.filter((row) => row.category === 'other');
  return [
    {
      id: 'off',
      label: '擷取音訊',
      hideHeading: true,
      items: [{ id: 0, label: offOptionLabel.value, roleBadges: [] }],
    },
    ...[
      { id: 'virtual', label: '虛擬音效裝置', rows: virtual },
      { id: 'other', label: '其他輸出裝置', rows: other },
    ]
      .filter((group) => group.rows.length)
      .map((group) => ({
        ...group,
        hideHeading: !virtual.length || !other.length,
        items: group.rows.map((row) => ({
          ...row,
          id: row.canonicalDeviceId,
          label: row.label || '未命名的輸出裝置',
        })),
      })),
  ];
});
function choose(deviceId) {
  selectDevice(deviceId === 0 ? null : deviceId);
}
</script>

<template>
  <UiModal
    :open="open"
    title="選擇擷取輸出裝置"
    size="wide"
    max-block-size="small"
    body-mode="workspace"
    @close="emit('close')"
  >
    <template #header-actions>
      <UiIconButton
        :icon="Info"
        label="如何選擇擷取裝置"
        @click="isGuideOpen = true"
      />
    </template>
    <div class="capture-device-modal">
      <p class="capture-device-modal__description">
        選擇直播或錄影軟體要擷取的輸出裝置，選擇後立即套用。
      </p>
      <UiScrollLayout
        class="capture-device-modal__list"
        content-class="capture-device-modal__options"
        axis="vertical"
      >
        <UiRadioGroup
          v-for="group in deviceGroups"
          :key="group.id"
          name="capture-output-device"
          :legend="group.label"
          :legend-hidden="group.hideHeading"
          :items="group.items"
          :model-value="selectedDevice"
          @update:model-value="choose"
        >
          <template #label="{ item }">
            <span class="capture-device-modal__option-label">
              <component
                :is="item.icon"
                v-if="item.icon"
                :size="ICON_SIZE"
                aria-hidden="true"
              />
              <span class="capture-device-modal__label">{{ item.label }}</span>
              <UiChip
                v-for="badge in item.roleBadges"
                :key="badge"
                tone="muted"
                >{{ badge }}</UiChip
              >
            </span>
          </template>
        </UiRadioGroup>
      </UiScrollLayout>
      <UiHint v-if="devices.length === 0"
        >找不到可用裝置。請先安裝虛擬音效裝置。</UiHint
      >
      <UiNotice
        v-if="captureErrorNotice"
        :notice="captureErrorNotice"
        compact
      />
    </div>
    <VirtualCableGuideModal :open="isGuideOpen" @close="isGuideOpen = false" />
  </UiModal>
</template>

<style scoped>
.capture-device-modal {
  --capture-device-modal-focus-safe-inset: calc(
    var(--ui-focus-width) + var(--ui-focus-offset)
  );
  min-block-size: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.capture-device-modal__description {
  min-inline-size: 0;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}
.capture-device-modal__list {
  --ui-scroll-layout-padding-block-start: var(
    --capture-device-modal-focus-safe-inset
  );
  --ui-scroll-layout-padding-block-end: var(
    --capture-device-modal-focus-safe-inset
  );
  --ui-scroll-layout-padding-inline-start: var(
    --capture-device-modal-focus-safe-inset
  );
  --ui-scroll-layout-padding-inline-end: var(
    --capture-device-modal-focus-safe-inset
  );
  min-block-size: 0;
  flex: 1 1 auto;
}
.capture-device-modal__list :deep(.capture-device-modal__options) {
  display: grid;
  gap: var(--ui-space-3);
}
.capture-device-modal__option-label {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}
.capture-device-modal__label {
  min-inline-size: 0;
  flex: 1;
  overflow-wrap: anywhere;
}
</style>

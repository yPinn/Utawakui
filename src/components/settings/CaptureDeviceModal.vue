<script setup>
import { computed, shallowRef } from 'vue';
import {
  Cable,
  Check,
  CircleX,
  Headphones,
  ICON_SIZE,
  Info,
} from '../../icons/index.js';
import { useAudioOutput } from '../../composables/useAudioOutput.js';
import { usePlayer } from '../../composables/usePlayer.js';
import {
  compareAudioDevices,
  groupDevicesByIdentity,
  isVirtualCableDevice,
} from '../../utils/audioDeviceLabel.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiStatusIcon from '../ui/UiStatusIcon.vue';
import VirtualCableGuideModal from './VirtualCableGuideModal.vue';

// A dedicated modal rather than a UiContextMenu row list — real Windows
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
  () => `關閉(僅透過 ${monitorDeviceLabel.value} 播放)`,
);

const isGuideOpen = shallowRef(false);

// Virtual-cable devices sort first with their own icon/heading — that's
// the one category this feature actually cares about, and name-matching
// against VB-CABLE/VoiceMeeter's fixed product names is reliable (see
// audioDeviceLabel.js). Everything else keeps a generic headphones icon:
// enumerateDevices() never exposes Windows' real headphone-vs-speaker
// classification (EndpointFormFactor doesn't cross the Web Audio API
// boundary), so a genuine per-device icon split there isn't groundable —
// don't fake one.
//
// groupDevicesByIdentity() runs first so the Default/Communications role
// pseudo-devices collapse onto the one physical device they're aliasing
// instead of drawing three near-identical rows — see its own comment for
// why the merge key is the label, not deviceId.
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
  const showGroupHeadings = virtual.length > 0 && other.length > 0;
  return [
    ...virtual.map((device, index) => ({
      ...device,
      icon: Cable,
      groupLabel: showGroupHeadings && index === 0 ? '虛擬音效裝置' : null,
    })),
    ...other.map((device, index) => ({
      ...device,
      icon: Headphones,
      groupLabel: showGroupHeadings && index === 0 ? '其他輸出裝置' : null,
    })),
  ];
});

// A merged row can represent more than one deviceId (see
// groupDevicesByIdentity) — match against any of them, not just the one
// this modal would persist going forward, so a selection saved before the
// merge (e.g. literally 'default') still shows as selected.
function isSelected(row) {
  return row.deviceIds.includes(playerState.captureDeviceId);
}

function choose(deviceId) {
  selectDevice(deviceId);
}
</script>

<template>
  <UiModal :open="open" title="擷取輸出裝置" size="wide" @close="emit('close')">
    <div class="capture-device-modal">
      <div class="capture-device-modal__intro">
        <p class="capture-device-modal__description">
          選擇一個虛擬音效裝置，讓直播或錄影軟體擷取到獨立於耳機的伴奏混音。
        </p>
        <UiButton
          class="capture-device-modal__guide-btn"
          :icon="Info"
          @click="isGuideOpen = true"
        >
          不知道要裝哪套虛擬音效軟體?
        </UiButton>
      </div>

      <ul class="capture-device-modal__list">
        <li>
          <button
            type="button"
            class="capture-device-modal__row"
            :class="{
              'capture-device-modal__row--active': !playerState.captureDeviceId,
            }"
            @click="choose(null)"
          >
            <CircleX :size="ICON_SIZE" aria-hidden="true" />
            <span class="capture-device-modal__label">{{
              offOptionLabel
            }}</span>
            <UiStatusIcon
              v-if="!playerState.captureDeviceId"
              :icon="Check"
              tone="accent"
              label="已選取"
            />
          </button>
        </li>
        <template v-for="device in deviceRows" :key="device.canonicalDeviceId">
          <li
            v-if="device.groupLabel"
            class="capture-device-modal__group-heading"
          >
            {{ device.groupLabel }}
          </li>
          <li>
            <button
              type="button"
              class="capture-device-modal__row"
              :class="{
                'capture-device-modal__row--active': isSelected(device),
              }"
              @click="choose(device.canonicalDeviceId)"
            >
              <component
                :is="device.icon"
                :size="ICON_SIZE"
                aria-hidden="true"
              />
              <span class="capture-device-modal__label">{{
                device.label || `裝置 ${device.canonicalDeviceId.slice(0, 12)}`
              }}</span>
              <UiChip
                v-for="badge in device.roleBadges"
                :key="badge"
                tone="accent"
              >
                {{ badge }}
              </UiChip>
              <UiStatusIcon
                v-if="isSelected(device)"
                :icon="Check"
                tone="accent"
                label="已選取"
              />
            </button>
          </li>
        </template>
      </ul>

      <UiHint v-if="devices.length === 0" padded>
        找不到可用的輸出裝置——需先在系統安裝一套虛擬音效裝置才會出現在這裡,可以參考上方的選擇建議。
      </UiHint>

      <UiNotice
        v-if="captureErrorNotice"
        tone="danger"
        :title="captureErrorNotice.title"
        :message="captureErrorNotice.message"
        compact
      />
    </div>

    <VirtualCableGuideModal :open="isGuideOpen" @close="isGuideOpen = false" />
  </UiModal>
</template>

<style scoped>
.capture-device-modal {
  display: grid;
  gap: var(--ui-space-3);
}

.capture-device-modal__intro {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.capture-device-modal__description {
  flex: 1;
  min-width: 0;
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.capture-device-modal__guide-btn {
  flex-shrink: 0;
  color: var(--ui-color-accent);
  white-space: nowrap;
}

.capture-device-modal__list {
  display: grid;
  gap: var(--ui-space-1);
  max-height: min(52vh, 420px);
  margin: 0;
  padding: 0;
  overflow: auto;
  list-style: none;
}

.capture-device-modal__row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  width: 100%;
  min-height: var(--ui-control-height);
  padding: var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  font: inherit;
  font-size: var(--ui-font-size-sm);
  text-align: left;
  cursor: pointer;
}

.capture-device-modal__row:hover {
  background: var(--ui-color-surface-hover);
}

.capture-device-modal__row:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.capture-device-modal__row--active {
  border-color: var(--ui-color-accent);
  background: var(--ui-color-accent-soft);
}

.capture-device-modal__group-heading {
  padding: var(--ui-space-2) var(--ui-space-1) 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-caption);
}

.capture-device-modal__label {
  min-width: 0;
  flex: 1;
  /* Deliberately no truncation — see the top-of-file comment for why this
     modal exists instead of a context menu. */
  overflow-wrap: anywhere;
}
</style>

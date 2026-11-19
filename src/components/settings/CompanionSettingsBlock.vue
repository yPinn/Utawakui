<script setup>
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  shallowRef,
} from 'vue';
import { Pencil, Trash2 } from '../../icons/index.js';
import { useSharedCompanion } from '../../composables/useCompanionSettings.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiTextField from '../ui/UiTextField.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

// Settings keeps only the paired-phone record; pairing and connection
// controls live in the title-bar phone panel.
const props = defineProps({
  settings: { type: Object, default: null },
});

// Matches the device store's name limit.
const LABEL_MAX = 40;

const companion = props.settings ?? useSharedCompanion();
const devices = computed(() => companion.status.value?.devices ?? []);
const formatDate = (value) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

// One phone is renamed in place at a time; Enter or leaving the field saves,
// Escape keeps the old name.
const editingId = shallowRef(null);
const draft = shallowRef('');
let renameField = null;

async function startRename(device) {
  editingId.value = device.id;
  draft.value = device.label;
  await nextTick();
  renameField?.focus();
}

function finishRename(device) {
  if (editingId.value !== device.id) return;
  editingId.value = null;
  const label = draft.value.trim();
  if (label && label !== device.label) void companion.rename(device.id, label);
}

function cancelRename() {
  editingId.value = null;
}

onMounted(() => companion.start());
onBeforeUnmount(() => companion.stop());
</script>

<template>
  <SettingsDocumentItem :title="t('companion.devices')" variant="nested">
    <template v-if="devices.length > 1" #actions>
      <UiButton
        variant="ghost"
        :disabled="companion.busy.value"
        @click="companion.revokeAll()"
        >{{ t('companion.revokeAll') }}</UiButton
      >
    </template>
    <template #feedback>
      <UiHint v-if="!devices.length">{{ t('companion.noDevices') }}</UiHint>
      <ul v-else class="companion-settings-block__devices">
        <li v-for="device in devices" :key="device.id">
          <UiTextField
            v-if="editingId === device.id"
            :id="`companion-device-name-${device.id}`"
            :ref="(field) => (renameField = field)"
            :label="t('companion.renameNamed', { name: device.label })"
            label-hidden
            :maxlength="LABEL_MAX"
            :model-value="draft"
            @update:model-value="draft = $event"
            @keydown.enter.prevent="finishRename(device)"
            @keydown.esc.stop.prevent="cancelRename"
            @blur="finishRename(device)"
          />
          <span v-else class="companion-settings-block__device-name">{{
            device.label
          }}</span>
          <UiHint>{{
            t('companion.deviceMeta', { date: formatDate(device.lastSeenAt) })
          }}</UiHint>
          <UiIconButton
            :icon="Pencil"
            :label="t('companion.renameNamed', { name: device.label })"
            :disabled="companion.busy.value || editingId === device.id"
            @click="startRename(device)"
          />
          <UiIconButton
            :icon="Trash2"
            :label="t('companion.revokeNamed', { name: device.label })"
            :disabled="companion.busy.value"
            @click="companion.revoke(device.id)"
          />
        </li>
      </ul>
    </template>
  </SettingsDocumentItem>
</template>

<style scoped>
.companion-settings-block__devices {
  display: grid;
  inline-size: 100%;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.companion-settings-block__devices li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto auto;
  align-items: center;
  gap: var(--ui-space-2);
}

/* A dense value row: body-compact, like other Settings values. */
.companion-settings-block__device-name {
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-compact-size);
  font-weight: var(--ui-type-body-compact-weight);
  line-height: var(--ui-type-body-compact-line-height);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

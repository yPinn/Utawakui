<script setup>
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import { Eye, EyeOff, Smartphone, Trash2 } from '../../icons/index.js';
import { useCompanionSettings } from '../../composables/useCompanionSettings.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiTextField from '../ui/UiTextField.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import CompanionPairingQr from './CompanionPairingQr.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  settings: { type: Object, default: null },
});

const companion = props.settings ?? useCompanionSettings();
const portDraft = shallowRef('');
// The pairing code stays hidden until asked for, so a captured or streamed
// Settings window does not show it by default.
const revealed = shallowRef(false);
watch(
  () => companion.pairing.value?.url,
  () => {
    revealed.value = false;
  },
);
const approvalRequest = computed(() => status.value?.pairing?.request ?? null);

const status = computed(() => companion.status.value);
const interfaceOptions = computed(() =>
  (status.value?.interfaces ?? []).map((entry) => ({
    value: entry.address,
    label: t(
      entry.privateNetwork
        ? 'companion.interfaceOption'
        : 'companion.interfacePublic',
      entry,
    ),
  })),
);
const errorText = computed(() => {
  const code = companion.error.value || status.value?.error;
  return code ? t(`companion.errors.${code}`) : '';
});
const stateLabel = computed(() =>
  status.value?.running ? t('companion.running') : t('companion.stopped'),
);
const address = computed(() =>
  status.value?.running
    ? `http://${status.value.interfaceAddress}:${status.value.port}/m/`
    : '',
);
const formatDate = (value) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

function savePort() {
  const port = Number(portDraft.value);
  if (!portDraft.value || port === status.value?.port) return;
  void companion.configure({ port });
}

onMounted(async () => {
  await companion.start();
  portDraft.value = String(status.value?.port ?? '');
});
onBeforeUnmount(() => companion.stop());
</script>

<template>
  <div class="companion-settings-block">
    <SettingsDocumentItem
      :icon="Smartphone"
      :title="t('companion.title')"
      :status="stateLabel"
      :status-tone="status?.running ? 'success' : 'muted'"
      :guidance="t('companion.guidance')"
    >
      <template #actions>
        <UiCheckbox
          id="companion-enabled"
          :label="t('companion.enable')"
          :model-value="Boolean(status?.enabled)"
          :disabled="companion.busy.value || !status"
          @update:model-value="companion.configure({ enabled: $event })"
        />
      </template>
      <template #feedback>
        <div class="companion-settings-block__fields">
          <UiSelect
            id="companion-interface"
            :label="t('companion.interface')"
            :placeholder="t('companion.interfacePlaceholder')"
            :options="interfaceOptions"
            :model-value="status?.interfaceAddress ?? ''"
            :disabled="companion.busy.value || !interfaceOptions.length"
            @update:model-value="
              companion.configure({ interfaceAddress: $event })
            "
          />
          <UiTextField
            id="companion-port"
            :label="t('companion.port')"
            inputmode="numeric"
            :model-value="portDraft"
            :disabled="companion.busy.value"
            @update:model-value="portDraft = $event"
            @change="savePort"
          />
        </div>
        <UiHint v-if="status && !interfaceOptions.length">{{
          t('companion.noInterface')
        }}</UiHint>
        <UiHint v-if="errorText" tone="danger" role="status">{{
          errorText
        }}</UiHint>
        <UiHint v-if="address">{{ address }}</UiHint>
        <UiHint v-if="status?.enabled">{{ t('companion.firewall') }}</UiHint>
      </template>
    </SettingsDocumentItem>

    <SettingsDocumentItem :title="t('companion.devices')" variant="nested">
      <template #actions>
        <UiButton
          v-if="!companion.pairing.value"
          variant="secondary"
          :disabled="companion.busy.value || !status?.running"
          @click="companion.beginPairing()"
          >{{ t('companion.pair') }}</UiButton
        >
        <UiButton v-else variant="ghost" @click="companion.cancelPairing()">{{
          t('companion.cancelPairing')
        }}</UiButton>
      </template>
      <template #feedback>
        <div
          v-if="companion.pairing.value"
          class="companion-settings-block__pairing"
          role="status"
        >
          <strong>{{ t('companion.pairingTitle') }}</strong>
          <template v-if="revealed">
            <CompanionPairingQr
              :value="companion.pairing.value.url"
              :label="t('companion.pairingQr')"
            />
            <code class="companion-settings-block__url">{{
              companion.pairing.value.url
            }}</code>
          </template>
          <p v-else class="companion-settings-block__concealed">
            {{ t('companion.pairingHidden') }}
          </p>
          <UiButton
            :icon="revealed ? EyeOff : Eye"
            @click="revealed = !revealed"
            >{{
              t(revealed ? 'companion.hidePairing' : 'companion.showPairing')
            }}</UiButton
          >
          <UiHint>{{ t('companion.pairingHint') }}</UiHint>
        </div>
        <section
          v-if="approvalRequest"
          class="companion-settings-block__approval"
          :aria-label="t('companion.approval.label')"
        >
          <strong>{{
            t('companion.approval.title', { name: approvalRequest.label })
          }}</strong>
          <span class="companion-settings-block__match-code">{{
            approvalRequest.matchCode
          }}</span>
          <UiHint>{{ t('companion.approval.hint') }}</UiHint>
          <div class="companion-settings-block__approval-actions">
            <UiButton
              variant="accent"
              :disabled="companion.busy.value"
              @click="companion.approve(approvalRequest.id)"
              >{{ t('companion.approval.allow') }}</UiButton
            >
            <UiButton
              :disabled="companion.busy.value"
              @click="companion.deny(approvalRequest.id)"
              >{{ t('companion.approval.deny') }}</UiButton
            >
          </div>
        </section>
        <UiHint v-if="status && !status.devices.length">{{
          t('companion.noDevices')
        }}</UiHint>
        <ul v-else class="companion-settings-block__devices">
          <li v-for="device in status?.devices ?? []" :key="device.id">
            <span class="companion-settings-block__device-name">{{
              device.label
            }}</span>
            <UiHint>{{
              t('companion.deviceMeta', {
                date: formatDate(device.lastSeenAt),
              })
            }}</UiHint>
            <UiIconButton
              :icon="Trash2"
              :label="t('companion.revokeNamed', { name: device.label })"
              :disabled="companion.busy.value"
              @click="companion.revoke(device.id)"
            />
          </li>
        </ul>
        <UiButton
          v-if="(status?.devices.length ?? 0) > 1"
          variant="ghost"
          :disabled="companion.busy.value"
          @click="companion.revokeAll()"
          >{{ t('companion.revokeAll') }}</UiButton
        >
      </template>
    </SettingsDocumentItem>
  </div>
</template>

<style scoped>
.companion-settings-block {
  display: grid;
  gap: var(--ui-space-2);
  min-inline-size: 0;
}

.companion-settings-block__fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 8rem);
  gap: var(--ui-space-2);
}

.companion-settings-block__pairing {
  display: grid;
  gap: var(--ui-space-1);
}

.companion-settings-block__concealed {
  display: grid;
  place-items: center;
  inline-size: min(100%, 12rem);
  aspect-ratio: 1;
  margin: 0;
  border: var(--ui-border-width) dashed var(--ui-color-border-strong);
  border-radius: var(--ui-radius-sm);
  color: var(--ui-color-text-muted);
  text-align: center;
}

.companion-settings-block__approval {
  display: grid;
  gap: var(--ui-space-1);
  padding: var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-accent);
  border-radius: var(--ui-radius-sm);
}

.companion-settings-block__match-code {
  font-size: var(--ui-font-size-xl);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2em;
}

.companion-settings-block__approval-actions {
  display: flex;
  gap: var(--ui-space-2);
}

.companion-settings-block__url {
  overflow-wrap: anywhere;
  user-select: all;
}

.companion-settings-block__devices {
  display: grid;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.companion-settings-block__devices li {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto auto;
  align-items: center;
  gap: var(--ui-space-2);
}

.companion-settings-block__device-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>

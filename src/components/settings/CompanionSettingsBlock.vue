<script setup>
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import {
  Play,
  Power,
  RefreshCw,
  Smartphone,
  Trash2,
} from '../../icons/index.js';
import { useCompanionSettings } from '../../composables/useCompanionSettings.js';
import UiArtworkOverlay from '../ui/UiArtworkOverlay.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiSelect from '../ui/UiSelect.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import CompanionPairingQr from './CompanionPairingQr.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  settings: { type: Object, default: null },
});

const companion = props.settings ?? useCompanionSettings();
const SETUP_STEPS = ['companion.steps.scan', 'companion.steps.allow'];
const approvalRequest = computed(() => status.value?.pairing?.request ?? null);

// The QR shows as soon as the remote runs. A used or expired code stays
// drawn under a scrim that offers a fresh one.
const lastUrl = shallowRef('');
const expired = shallowRef(true);
let expiryTimer = null;
watch(
  () => companion.pairing.value,
  (pairing) => {
    clearTimeout(expiryTimer);
    const left = pairing ? pairing.expiresAt - Date.now() : 0;
    expired.value = left <= 0;
    if (!pairing) return;
    lastUrl.value = pairing.url;
    if (left > 0)
      expiryTimer = setTimeout(() => {
        expired.value = true;
      }, left);
  },
  { immediate: true },
);
watch(
  () => Boolean(companion.status.value?.running),
  (running) => {
    if (!running) lastUrl.value = '';
    else if (!companion.pairing.value) void companion.beginPairing();
  },
  { immediate: true },
);
const showQr = computed(
  () => Boolean(companion.status.value?.running) && !approvalRequest.value,
);

const status = computed(() => companion.status.value);
// Main picks the only private network itself; a choice is offered only
// when the computer is on several.
const interfaceOptions = computed(() =>
  (status.value?.interfaces ?? [])
    .filter((entry) => entry.privateNetwork)
    .map((entry) => ({
      value: entry.address,
      label: t('companion.interfaceOption', entry),
    })),
);
const errorText = computed(() => {
  const code = companion.error.value || status.value?.error;
  return code ? t(`companion.errors.${code}`) : '';
});
const stateLabel = computed(() =>
  status.value?.running ? t('companion.running') : t('companion.stopped'),
);
// Setup help stays until the first phone is paired.
const firstSetup = computed(() =>
  Boolean(status.value && !status.value.devices.length),
);
const formatDate = (value) =>
  new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));

onMounted(() => companion.start());
// A code is only good while Settings shows it.
onBeforeUnmount(() => {
  clearTimeout(expiryTimer);
  if (companion.pairing.value) void companion.cancelPairing();
  companion.stop();
});
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
        <!-- Start also retries a failed start, e.g. after a network fix. -->
        <UiButton
          v-if="!status?.running"
          :icon="Play"
          variant="accent"
          :disabled="companion.busy.value || !status"
          @click="companion.configure({ enabled: true })"
          >{{ t('companion.start') }}</UiButton
        >
        <UiButton
          v-if="status?.enabled"
          :icon="Power"
          variant="secondary"
          :disabled="companion.busy.value"
          @click="companion.configure({ enabled: false })"
          >{{ t('companion.stop') }}</UiButton
        >
      </template>
      <template #feedback>
        <ol
          v-if="firstSetup"
          class="companion-settings-block__steps"
          :aria-label="t('companion.steps.label')"
        >
          <li v-for="step in SETUP_STEPS" :key="step">{{ t(step) }}</li>
        </ol>
        <UiSelect
          v-if="status?.enabled && interfaceOptions.length > 1"
          id="companion-interface"
          class="companion-settings-block__interface"
          :label="t('companion.interface')"
          :placeholder="t('companion.interfacePlaceholder')"
          :options="interfaceOptions"
          :model-value="status?.interfaceAddress ?? ''"
          :disabled="companion.busy.value"
          @update:model-value="
            companion.configure({ interfaceAddress: $event })
          "
        />
        <UiHint v-if="errorText" tone="danger" role="status">{{
          errorText
        }}</UiHint>
        <UiHint v-if="status?.enabled && firstSetup">{{
          t('companion.firewall')
        }}</UiHint>
      </template>
    </SettingsDocumentItem>

    <SettingsDocumentItem :title="t('companion.devices')" variant="nested">
      <template #feedback>
        <figure v-if="showQr" class="companion-settings-block__pairing">
          <div class="companion-settings-block__qr ui-artwork-composite">
            <CompanionPairingQr
              v-if="lastUrl"
              :value="lastUrl"
              :label="t('companion.pairingQr')"
            />
            <UiArtworkOverlay v-if="lastUrl && expired">
              <div class="companion-settings-block__qr-scrim" role="status">
                <span>{{ t('companion.pairingExpired') }}</span>
                <UiButton
                  :icon="RefreshCw"
                  variant="overlay"
                  :disabled="companion.busy.value"
                  @click="companion.beginPairing()"
                  >{{ t('companion.renewPairing') }}</UiButton
                >
              </div>
            </UiArtworkOverlay>
          </div>
          <figcaption class="companion-settings-block__qr-caption">
            {{ t('companion.pairingTitle') }}
          </figcaption>
        </figure>
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
        <ul v-if="!firstSetup" class="companion-settings-block__devices">
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

.companion-settings-block__steps {
  inline-size: 100%;
  margin: 0;
  padding-inline-start: var(--ui-space-5);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.companion-settings-block__interface {
  inline-size: min(100%, 24rem);
}

.companion-settings-block__pairing {
  display: grid;
  justify-items: start;
  gap: var(--ui-space-2);
  inline-size: 100%;
  margin: 0;
}

/* Empty while the first code is created, then the QR fills it. */
.companion-settings-block__qr {
  position: relative;
  display: grid;
  inline-size: min(100%, 12rem);
  aspect-ratio: 1;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-palette-neutral-50);
}

.companion-settings-block__qr > :deep(.companion-pairing-qr) {
  inline-size: 100%;
  border-radius: 0;
}

.companion-settings-block__qr-scrim {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  background: var(--ui-color-overlay-scrim-active);
  color: var(--ui-color-overlay-contrast);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  text-align: center;
}

/* The feedback row pushes buttons to the end; keep this one centred. */
.companion-settings-block .companion-settings-block__qr-scrim :deep(button) {
  margin-inline-start: 0;
}

.companion-settings-block__qr-caption {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
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

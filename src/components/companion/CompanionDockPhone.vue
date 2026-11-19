<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';
import { RefreshCw } from '../../icons/index.js';
import { useSharedCompanion } from '../../composables/useCompanionSettings.js';
import { useCompanionPairingQr } from '../../composables/useCompanionPairingQr.js';
import UiArtworkOverlay from '../ui/UiArtworkOverlay.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiSeparator from '../ui/UiSeparator.vue';
import CompanionPairingQr from './CompanionPairingQr.vue';
import CompanionPhoneFrame from './CompanionPhoneFrame.vue';
import { t } from '../../utils/i18n.js';

// Stands directly in the Right Dock bay (not inside a Dock panel). Its screen
// holds the pairing flow, then notes and a network choice when needed, split
// by separators. There is no on／off control: the remote runs whenever the
// feature is on.
const props = defineProps({
  active: { type: Boolean, default: false },
  companion: { type: Object, default: null },
});

const companion = props.companion ?? useSharedCompanion();
const status = computed(() => companion.status.value);
const busy = computed(() => companion.busy.value);
const running = computed(() => Boolean(status.value?.running));
const approvalPending = computed(() => Boolean(status.value?.pairing?.request));
const qr = useCompanionPairingQr(companion, () => props.active);

const SETUP_STEPS = ['companion.steps.scan', 'companion.steps.allow'];
const interfaces = computed(() => status.value?.interfaces ?? []);
const allowedNetworks = computed(() => status.value?.allowedNetworks ?? []);
const isUsable = (entry) =>
  entry.privateNetwork || allowedNetworks.value.includes(entry.network);
// Main picks the only usable network; a choice appears only between several.
const interfaceOptions = computed(() =>
  interfaces.value.filter(isUsable).map((entry) => ({
    value: entry.address,
    label: t('companion.interfaceOption', entry),
  })),
);
const errorCode = computed(
  () => companion.error.value || status.value?.error || '',
);
const errorText = computed(() =>
  errorCode.value ? t(`companion.errors.${errorCode.value}`) : '',
);
// A public network can be used anyway when Windows can't be changed.
const publicCandidate = computed(() =>
  errorCode.value === 'public-network'
    ? (interfaces.value.find(
        (entry) => !entry.privateNetwork && entry.network,
      ) ?? null)
    : null,
);
const onPublicNetwork = computed(() => {
  const current = interfaces.value.find(
    (entry) => entry.address === status.value?.interfaceAddress,
  );
  return Boolean(running.value && current && !current.privateNetwork);
});
const firstSetup = computed(() =>
  Boolean(status.value && !status.value.devices.length),
);

onMounted(() => companion.start());
onBeforeUnmount(() => companion.stop());
</script>

<template>
  <section class="companion-dock-phone" :aria-label="t('companion.title')">
    <CompanionPhoneFrame :label="t('companion.dock.phone')">
      <!-- Pairing flow -->
      <!-- Always on, so there is no on／off state to show: the QR frame stays
           in place and fills once the connection is ready. -->
      <div class="companion-dock-phone__section">
        <p v-if="approvalPending" class="companion-dock-phone__message">
          {{ t('companion.dock.awaitingApproval') }}
        </p>
        <template v-else>
          <!-- A new code crossfades over the old one; the scrim fades. -->
          <div class="companion-dock-phone__qr ui-artwork-composite">
            <Transition name="companion-dock-phone-qr">
              <CompanionPairingQr
                v-if="qr.url.value"
                :key="qr.url.value"
                :value="qr.url.value"
                :label="t('companion.pairingQr')"
              />
            </Transition>
            <Transition name="companion-dock-phone-scrim">
              <UiArtworkOverlay v-if="qr.url.value && qr.expired.value">
                <div class="companion-dock-phone__scrim" role="status">
                  <span>{{ t('companion.pairingExpired') }}</span>
                  <UiButton
                    :icon="RefreshCw"
                    variant="overlay"
                    :disabled="busy"
                    @click="qr.renew()"
                    >{{ t('companion.renewPairing') }}</UiButton
                  >
                </div>
              </UiArtworkOverlay>
            </Transition>
          </div>
          <ol
            v-if="firstSetup && running"
            class="companion-dock-phone__steps"
            :aria-label="t('companion.steps.label')"
          >
            <li v-for="step in SETUP_STEPS" :key="step">{{ t(step) }}</li>
          </ol>
          <!-- Main retries on its own; only a public network needs a choice. -->
          <UiHint v-if="!running && errorText" tone="danger" role="status">{{
            errorText
          }}</UiHint>
          <UiButton
            v-if="!running && publicCandidate"
            variant="accent"
            :disabled="busy"
            @click="
              companion.configure({ allowNetwork: publicCandidate.network })
            "
            >{{ t('companion.allowPublic') }}</UiButton
          >
        </template>
      </div>

      <!-- Notes only matter until the first phone is paired. -->
      <template v-if="firstSetup">
        <UiSeparator />

        <div class="companion-dock-phone__section">
          <UiHint>{{ t('companion.guidance') }}</UiHint>
          <UiHint>{{
            t(
              onPublicNetwork
                ? 'companion.firewallPublic'
                : 'companion.firewall',
            )
          }}</UiHint>
        </div>
      </template>

      <!-- A network choice appears only between several usable networks. -->
      <template v-if="interfaceOptions.length > 1">
        <UiSeparator />

        <div class="companion-dock-phone__section">
          <UiSelect
            id="companion-interface"
            :label="t('companion.interface')"
            :placeholder="t('companion.interfacePlaceholder')"
            :options="interfaceOptions"
            :model-value="status?.interfaceAddress ?? ''"
            :disabled="busy"
            @update:model-value="
              companion.configure({ interfaceAddress: $event })
            "
          />
        </div>
      </template>
    </CompanionPhoneFrame>
  </section>
</template>

<style scoped>
.companion-dock-phone {
  display: grid;
  justify-items: center;
  inline-size: 100%;
  -webkit-user-select: none;
  user-select: none;
}

/* Each screen part spans the width; notes read from the start edge. */
.companion-dock-phone__section {
  display: grid;
  gap: var(--ui-space-2);
  inline-size: 100%;
  text-align: start;
}

/* The QR fills the screen width inside its own outline; empty until the
   first code arrives. */
.companion-dock-phone__qr {
  position: relative;
  display: grid;
  inline-size: 100%;
  aspect-ratio: 1;
  box-sizing: border-box;
  overflow: hidden;
  border: var(--ui-border-width) solid var(--ui-color-border-strong);
  border-radius: var(--ui-radius-md);
  /* Same fixed light field the QR draws, so the empty frame matches it. */
  background: var(--ui-palette-neutral-50);
}

/* Old and new codes share one cell so they can crossfade. */
.companion-dock-phone__qr > :deep(.companion-pairing-qr) {
  grid-area: 1 / 1;
}

.companion-dock-phone-qr-enter-active,
.companion-dock-phone-qr-leave-active {
  transition:
    opacity var(--ui-motion-duration-slow) var(--ui-motion-easing-standard),
    transform var(--ui-motion-duration-slow) var(--ui-motion-easing-enter);
}

.companion-dock-phone-qr-enter-from {
  opacity: 0;
  transform: scale(0.96);
}

.companion-dock-phone-qr-leave-to {
  opacity: 0;
}

.companion-dock-phone-scrim-enter-active {
  transition: opacity var(--ui-motion-duration-standard)
    var(--ui-motion-easing-enter);
}

.companion-dock-phone-scrim-leave-active {
  transition: opacity var(--ui-motion-duration-fast)
    var(--ui-motion-easing-exit);
}

.companion-dock-phone-scrim-enter-from,
.companion-dock-phone-scrim-leave-to {
  opacity: 0;
}

.companion-dock-phone__scrim {
  display: grid;
  place-content: center;
  justify-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-3);
  background: var(--ui-color-overlay-scrim-active);
  color: var(--ui-color-overlay-contrast);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
  text-align: center;
}

.companion-dock-phone__steps,
.companion-dock-phone__message {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-caption-weight);
  line-height: var(--ui-type-caption-line-height);
}

.companion-dock-phone__steps {
  padding-inline-start: var(--ui-space-4);
}
</style>

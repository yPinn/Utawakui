<script setup>
import { computed, onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiHint from '../ui/UiHint.vue';
import { t } from '../../utils/i18n.js';

const controlsId = useId();
const status = shallowRef({ state: 'loading' });
const pending = shallowRef(false);
const notice = shallowRef('');
const canTrigger = computed(
  () => status.value.state === 'ready' && !pending.value,
);
const effects = [
  { id: 'glitch', label: t('outputPanel.cameraEffects.glitch') },
  { id: 'zoom', label: t('outputPanel.cameraEffects.zoom') },
  { id: 'grain', label: t('outputPanel.cameraEffects.grain') },
];
const stateKeys = new Set([
  'loading',
  'unavailable',
  'no-output',
  'request-failed',
  'ready',
]);
const stateLabel = computed(() =>
  t(
    `outputPanel.cameraEffects.states.${stateKeys.has(status.value.state) ? status.value.state : 'request-failed'}`,
  ),
);
let refreshTimer;
let revision = 0;
let checking = false;

async function invoke(action) {
  if (pending.value) return;
  const isStatus = action === 'status';
  if (isStatus && checking) return;
  if (isStatus) checking = true;
  const current = ++revision;
  if (!isStatus) {
    pending.value = true;
    notice.value = '';
  }
  let result;
  try {
    result = await window.Utawakui?.controlOutputFisheyeEffects?.(action);
  } catch {
    result = { state: 'request-failed' };
  } finally {
    if (isStatus) checking = false;
  }
  if (revision !== current) return;
  pending.value = false;
  if (result?.state === 'busy') {
    notice.value = t('outputPanel.cameraEffects.busy');
    return;
  }
  status.value = result ?? { state: 'unavailable' };
  if (result?.sent) notice.value = t('outputPanel.cameraEffects.sent');
}

onMounted(() => {
  invoke('status');
  refreshTimer = setInterval(() => invoke('status'), 2000);
});
onBeforeUnmount(() => {
  ++revision;
  clearInterval(refreshTimer);
});
</script>

<template>
  <section
    class="obs-fisheye-camera"
    :aria-label="t('outputPanel.cameraEffects.label')"
  >
    <UiHint aria-live="polite">{{ stateLabel }}</UiHint>
    <!-- Checked state mirrors the Output status, so the click never toggles locally. -->
    <UiCheckbox
      :id="controlsId"
      :label="t('outputPanel.cameraEffects.automatic')"
      :model-value="status.automatic === true"
      :disabled="!canTrigger"
      @click.prevent="invoke(status.automatic ? 'auto-off' : 'auto-on')"
    />
    <div class="obs-fisheye-camera__buttons">
      <UiButton
        v-for="effect in effects"
        :key="effect.id"
        variant="secondary"
        :disabled="!canTrigger"
        @click="invoke(effect.id)"
      >
        {{ effect.label }}
      </UiButton>
    </div>
    <UiHint v-if="notice" aria-live="polite">{{ notice }}</UiHint>
  </section>
</template>

<style scoped>
.obs-fisheye-camera {
  display: grid;
  gap: var(--ui-space-3);
  padding-block: var(--ui-space-3);
}

.obs-fisheye-camera__buttons {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
}
</style>

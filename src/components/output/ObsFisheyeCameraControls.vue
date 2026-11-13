<script setup>
import { computed, onBeforeUnmount, onMounted, shallowRef, useId } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import { t } from '../../utils/i18n.js';

const controlsId = useId();
const status = shallowRef({ state: 'loading' });
const pending = shallowRef(false);
const notice = shallowRef('');
const canTrigger = computed(
  () => status.value.state === 'ready' && !pending.value,
);
const canBind = computed(
  () =>
    ['unbound', 'scene-changed', 'filter-changed'].includes(
      status.value.state,
    ) && !pending.value,
);
const effects = [
  { id: 'glitch', label: t('outputPanel.cameraEffects.glitch') },
  { id: 'zoom', label: t('outputPanel.cameraEffects.zoom') },
  { id: 'grain', label: t('outputPanel.cameraEffects.grain') },
];
const stateKeys = new Set([
  'loading',
  'disconnected',
  'unbound',
  'scene-changed',
  'filter-changed',
  'missing',
  'ambiguous',
  'update-script',
  'disabled-filter',
  'inactive-filter',
  'no-scene',
  'unconfirmed',
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
    result = await window.Utawakui?.controlObsFisheyeCamera?.(action);
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
  status.value = result ?? { state: 'disconnected' };
  if (result?.confirmed) {
    notice.value = t(
      effects.some(({ id }) => id === action)
        ? 'outputPanel.cameraEffects.sent'
        : 'outputPanel.cameraEffects.saved',
    );
  }
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
    <p v-if="status.scene" class="obs-fisheye-camera__scene">
      {{ t('outputPanel.cameraEffects.scene', { name: status.scene }) }}
    </p>
    <UiButton
      v-if="canBind && status.state !== 'ready'"
      variant="secondary"
      @click="invoke('bind')"
    >
      {{ t('outputPanel.cameraEffects.bind') }}
    </UiButton>
    <label class="obs-fisheye-camera__automatic" :for="controlsId">
      <input
        :id="controlsId"
        type="checkbox"
        :checked="status.automatic === true"
        :disabled="!canTrigger"
        @click.prevent="invoke(status.automatic ? 'auto-off' : 'auto-on')"
      />
      {{ t('outputPanel.cameraEffects.automatic') }}
    </label>
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

.obs-fisheye-camera__scene {
  margin: 0;
  overflow-wrap: anywhere;
}

.obs-fisheye-camera__automatic,
.obs-fisheye-camera__buttons {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2);
}
</style>

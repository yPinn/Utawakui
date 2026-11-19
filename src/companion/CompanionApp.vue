<script setup>
import { computed, onBeforeUnmount, shallowRef } from 'vue';
import PerformerSurface from '../components/performer/PerformerSurface.vue';
import CompanionRemoteControls from './CompanionRemoteControls.vue';
import UiButton from '../components/ui/UiButton.vue';
import { usePerformerViewState } from '../composables/usePerformerViewState.js';
import { provideUiOverlayHost } from '../composables/useUiOverlayHost.js';
import { registeredOverlayHostAttributes } from '../utils/rendererSurfaceRegistry.js';
import '../styles/features/performer.css';
import { t } from '../utils/i18n.js';

const props = defineProps({
  status: { type: Object, required: true },
  remote: { type: Object, default: null },
  matchCode: { type: Object, default: null },
});

provideUiOverlayHost('performer');
const overlayHostAttributes = registeredOverlayHostAttributes('performer');
const {
  frame,
  readingScale,
  controlPending,
  control,
  adjustLyricsOffset,
  setReadingScale,
  setDisplayBoundary,
} = usePerformerViewState();

const sending = shallowRef(false);
const notice = shallowRef('');
let noticeTimer = null;

function showNotice(result) {
  clearTimeout(noticeTimer);
  notice.value =
    result === 'applied' ? '' : t(`companion.remote.results.${result}`);
  if (notice.value) noticeTimer = setTimeout(() => (notice.value = ''), 3000);
}

// Commands target the snapshot on screen; a refusal shows a short reason.
async function sendRemote(command) {
  if (!props.remote || sending.value) return;
  sending.value = true;
  try {
    const result = await props.remote.sendCommand(command, {
      revision: frame.value.revision,
      trackId: frame.value.trackId,
    });
    showNotice(
      ['stale', 'unavailable', 'busy', 'rate-limited', 'timed_out'].includes(
        result,
      ) || result === 'applied'
        ? result
        : 'failed',
    );
  } finally {
    sending.value = false;
  }
}

onBeforeUnmount(() => clearTimeout(noticeTimer));

const state = computed(() => props.status.value);
const message = computed(() =>
  state.value === 'live' ? '' : t(`companion.page.${state.value}`),
);
</script>

<template>
  <div class="companion-app">
    <div v-bind="overlayHostAttributes" class="ui-overlay-host" />
    <p
      v-if="message"
      class="companion-app__status"
      :class="{ 'companion-app__status--overlay': state === 'reconnecting' }"
      role="status"
    >
      {{ message }}
      <strong
        v-if="state === 'awaiting-approval' && matchCode?.value"
        class="companion-app__match-code"
        >{{ matchCode.value }}</strong
      >
      <!-- Still paired: one tap takes the connection back. -->
      <UiButton
        v-if="state === 'displaced' && remote?.resume"
        class="companion-app__resume"
        variant="accent"
        @click="remote.resume()"
        >{{ t('companion.page.resume') }}</UiButton
      >
    </p>
    <PerformerSurface
      v-if="state === 'live' || state === 'reconnecting'"
      :frame="frame"
      mode="prompter"
      :reading-scale="readingScale"
      :pending="controlPending"
      @control="control"
      @sync-action="adjustLyricsOffset"
      @update:reading-scale="setReadingScale"
      @display-boundary="setDisplayBoundary"
    >
      <template v-if="remote" #rail-tools>
        <CompanionRemoteControls
          :disabled="sending || !frame.trackId || state !== 'live'"
          @command="sendRemote"
        />
      </template>
    </PerformerSurface>
    <p v-if="notice" class="companion-app__notice" role="status">
      {{ notice }}
    </p>
  </div>
</template>

<style scoped>
.companion-app {
  position: relative;
  display: grid;
  min-block-size: 100dvh;
  padding: env(safe-area-inset-top) env(safe-area-inset-right)
    env(safe-area-inset-bottom) env(safe-area-inset-left);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
}

/* Same display tier as the computer's approval dialog it is compared with. */
.companion-app__match-code {
  display: block;
  margin-block-start: var(--ui-space-3);
  font-size: var(--ui-type-display-size);
  font-weight: var(--ui-type-display-weight);
  line-height: var(--ui-type-display-line-height);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2em;
}

/* Layout only: the button's own anatomy comes from UiButton. */
.companion-app__resume {
  display: flex;
  margin: var(--ui-space-3) auto 0;
}

.companion-app__status {
  margin: auto;
  max-inline-size: 32ch;
  padding: var(--ui-space-4);
  text-align: center;
}

.companion-app__notice {
  position: fixed;
  inset-block-end: calc(env(safe-area-inset-bottom) + var(--ui-space-4));
  inset-inline: var(--ui-space-4);
  margin: 0 auto;
  max-inline-size: 32ch;
  padding: var(--ui-space-2) var(--ui-space-3);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface);
  text-align: center;
  z-index: var(--ui-layer-raised);
}

.companion-app__status--overlay {
  position: absolute;
  inset-block-start: var(--ui-space-2);
  inset-inline: var(--ui-space-2);
  margin: 0 auto;
  padding: var(--ui-space-1) var(--ui-space-2);
  border-radius: var(--ui-radius-sm);
  background: var(--ui-color-surface);
  z-index: var(--ui-layer-raised);
}
</style>

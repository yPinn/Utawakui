<script setup>
import { computed, onBeforeUnmount, onMounted, watch } from 'vue';
import { useSharedCompanion } from '../../composables/useCompanionSettings.js';
import UiButton from '../ui/UiButton.vue';
import UiModal from '../ui/UiModal.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  companion: { type: Object, default: null },
});

const companion = props.companion ?? useSharedCompanion();
const request = computed(
  () => companion.status.value?.pairing?.request ?? null,
);
const busy = computed(() => companion.busy.value);

// Main lets an unanswered request lapse without an event; reread then so the
// dialog closes with it.
let expiryTimer = null;
watch(
  () => request.value?.expiresAt,
  (expiresAt) => {
    clearTimeout(expiryTimer);
    if (!expiresAt) return;
    expiryTimer = setTimeout(
      () => void companion.refresh(),
      Math.max(0, expiresAt - Date.now()),
    );
  },
  { immediate: true },
);

function deny() {
  if (request.value && !busy.value) void companion.deny(request.value.id);
}

function approve() {
  if (request.value && !busy.value) void companion.approve(request.value.id);
}

onMounted(() => companion.start());
onBeforeUnmount(() => {
  clearTimeout(expiryTimer);
  companion.stop();
});
</script>

<template>
  <!-- Closing without a decision refuses the phone. -->
  <UiModal
    :open="Boolean(request)"
    :title="
      request
        ? t('companion.approval.title', { name: request.label })
        : t('companion.approval.label')
    "
    size="notice"
    initial-focus="dialog"
    :selectable="false"
    :close-disabled="busy"
    @close="deny"
  >
    <div v-if="request" class="app-companion-approval">
      <p class="app-companion-approval__message">
        {{ t('companion.approval.hint') }}
      </p>
      <output
        class="app-companion-approval__code"
        :aria-label="t('companion.approval.codeLabel')"
        >{{ request.matchCode }}</output
      >
    </div>

    <template v-if="request" #footer>
      <UiButton variant="secondary" :disabled="busy" @click="deny">
        {{ t('companion.approval.deny') }}
      </UiButton>
      <UiButton variant="accent" :disabled="busy" @click="approve">
        {{ t('companion.approval.allow') }}
      </UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.app-companion-approval {
  display: grid;
  justify-items: center;
  gap: var(--ui-modal-section-gap);
}

.app-companion-approval__message {
  justify-self: stretch;
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-compact-size);
  font-weight: var(--ui-type-body-compact-weight);
  line-height: var(--ui-type-body-line-height);
}

/* The code is the thing to compare, so it carries the display tier. */
.app-companion-approval__code {
  padding: var(--ui-space-3) var(--ui-space-5);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-md);
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
  font-size: var(--ui-type-display-size);
  font-weight: var(--ui-type-display-weight);
  line-height: var(--ui-type-display-line-height);
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.2em;
}
</style>

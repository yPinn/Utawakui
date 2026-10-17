<script setup>
import {
  computed,
  defineAsyncComponent,
  onMounted,
  shallowRef,
  watch,
} from 'vue';
import { useBgmSession } from '../../composables/useBgmSession.js';
import { projectBgmShellStatus } from './bgmPresentation.js';

const props = defineProps({
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['requestClose', 'statusChange']);
const BgmPlayerPanel = defineAsyncComponent(
  () => import('./BgmPlayerPanel.vue'),
);
// Keep the visual instance after first use: closing only hides its surface,
// preserving pin, search and movement state without owning the audio lifecycle.
const hasOpened = shallowRef(props.open);
const { state, handoffState, deckState, initialize } = useBgmSession();
const shellStatus = computed(() =>
  projectBgmShellStatus({
    phase: handoffState.phase,
    audibleLane: handoffState.audibleLane,
    error: state.error ?? handoffState.error ?? deckState.error ?? '',
  }),
);

onMounted(initialize);
watch(
  () => props.open,
  (open) => {
    if (open) hasOpened.value = true;
  },
);
watch(shellStatus, (status) => emit('statusChange', status), {
  immediate: true,
});
</script>

<template>
  <BgmPlayerPanel
    v-if="hasOpened"
    :open="open"
    @request-close="emit('requestClose')"
  />
</template>

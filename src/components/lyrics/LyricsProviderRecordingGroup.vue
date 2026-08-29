<script setup>
import { computed } from 'vue';
import LyricsLrclibCandidateRow from './LyricsLrclibCandidateRow.vue';

const props = defineProps({
  group: { type: Object, required: true },
  expandedKey: { type: String, default: null },
  savingKey: { type: String, default: null },
  saveDisabled: { type: Boolean, default: false },
  changedCandidates: { type: Map, default: () => new Map() },
  showProvider: { type: Boolean, default: false },
});
const emit = defineEmits(['toggle', 'save', 'confirmChanged', 'cancelChanged']);

const orderedCandidates = computed(() => {
  const candidates = [...(props.group.candidates || [])];
  return candidates.sort((first, second) => {
    if (first.candidateKey === props.group.recommendedCandidateKey) return -1;
    if (second.candidateKey === props.group.recommendedCandidateKey) return 1;
    return first.candidateKey.localeCompare(second.candidateKey);
  });
});
const hasAlternatives = computed(() => orderedCandidates.value.length > 1);

function providerLabel(candidate) {
  if (candidate?.providerId === 'netease') return '網易雲音樂';
  if (candidate?.providerId === 'lrclib') return 'LRCLIB';
  return '線上來源';
}

function changedCandidate(candidate) {
  return props.changedCandidates.get(candidate.candidateKey) || null;
}
</script>

<template>
  <li class="lyrics-provider-recording-group">
    <ul class="lyrics-provider-recording-group__sources">
      <LyricsLrclibCandidateRow
        v-for="candidate in orderedCandidates"
        :key="candidate.candidateKey"
        :candidate="candidate"
        :expanded="expandedKey === candidate.candidateKey"
        :saving="savingKey === candidate.candidateKey"
        :save-disabled="saveDisabled"
        :changed-candidate="changedCandidate(candidate)"
        :provider-label="providerLabel(candidate)"
        :show-provider="showProvider || hasAlternatives"
        :recommended="
          hasAlternatives &&
          candidate.candidateKey === group.recommendedCandidateKey
        "
        @toggle="emit('toggle', candidate)"
        @save="emit('save', candidate)"
        @confirm-changed="emit('confirmChanged', changedCandidate(candidate))"
        @cancel-changed="emit('cancelChanged', candidate)"
      />
    </ul>
  </li>
</template>

<style scoped>
.lyrics-provider-recording-group {
  display: grid;
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
}

.lyrics-provider-recording-group:last-child {
  border-bottom: 0;
}

.lyrics-provider-recording-group__sources {
  margin: 0;
  padding: 0;
  list-style: none;
}
</style>

<script setup>
import { computed, onBeforeUnmount, watch } from 'vue';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useArtistIndex } from '../../composables/useArtistIndex.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import ArtistIdentityModal from '../artists/ArtistIdentityModal.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  artistId: { type: String, default: '' },
});
const emit = defineEmits(['close']);

const { confirm: confirmAction } = useAppConfirmation();
const { selectArtist } = usePlaylists();
const {
  state: artistIndexState,
  mergeArtists,
  splitArtistCredit,
  setDisplayName: setArtistDisplayName,
  undoOrganization: undoArtistOrganization,
  searchCatalog,
  applyCatalogCandidate,
  cancelCatalogSearch,
} = useArtistIndex();

const selectedArtistIdentity = computed(() =>
  artistIndexState.index?.artists?.find(
    (artist) => artist.id === props.artistId,
  ),
);

function cancelIdentityLookup() {
  const lookupArtistId = artistIndexState.identityLookup.artistId;
  if (lookupArtistId) void cancelCatalogSearch(lookupArtistId);
}

function closeIdentity() {
  if (artistIndexState.isMutating) return;
  cancelIdentityLookup();
  emit('close');
}

watch(
  () => props.open,
  (open) => {
    if (!open) cancelIdentityLookup();
  },
);

onBeforeUnmount(cancelIdentityLookup);

function handleArtistCatalogSearch() {
  const current = selectedArtistIdentity.value;
  if (current) void searchCatalog(current.id);
}

async function handleArtistCatalogApply(candidateId) {
  const current = selectedArtistIdentity.value;
  if (!current) return;
  const result = await applyCatalogCandidate(current.id, candidateId);
  if (result?.status === 'ok' && result.artistId) {
    selectArtist(result.artistId);
  }
}

async function handleArtistMerge(targetArtistId) {
  const current = selectedArtistIdentity.value;
  const target = artistIndexState.index?.artists?.find(
    (artist) => artist.id === targetArtistId,
  );
  if (!current || !target) return;
  const confirmed = await confirmAction({
    title: '合併藝人？',
    subject: `${current.name} ＋ ${target.name}`,
    message: '兩邊的曲目會整理到同一個藝人頁，原始曲目標示不會改寫。',
    detail: '需要時可復原上一次整理，或再拆分標示。',
    confirmLabel: '合併藝人',
  });
  if (!confirmed) return;
  const result = await mergeArtists([current.id, target.id]);
  if (result?.status === 'ok' && result.artistId) {
    selectArtist(result.artistId);
  }
}

async function handleArtistDisplayName(displayName) {
  const current = selectedArtistIdentity.value;
  if (!current) return;
  const result = await setArtistDisplayName(current.id, displayName);
  if (result?.status === 'ok' && result.artistId) {
    selectArtist(result.artistId);
  }
}

async function handleArtistSplit(creditId) {
  const current = selectedArtistIdentity.value;
  const credit = current?.credits?.find((entry) => entry.id === creditId);
  if (!current || !credit) return;
  const confirmed = await confirmAction({
    title: '拆分藝人標示？',
    subject: credit.name,
    message: '這個標示及其曲目會回到獨立的藝人頁。',
    detail: '其他標示不受影響，需要時可復原上一次整理。',
    confirmLabel: '拆分標示',
  });
  if (!confirmed) return;
  const result = await splitArtistCredit(current.id, credit.id);
  if (result?.status === 'ok' && result.artistId) {
    selectArtist(result.artistId);
  }
}

async function handleArtistUndo() {
  const firstTrackId = selectedArtistIdentity.value?.trackIds?.[0];
  const result = await undoArtistOrganization();
  if (result?.status !== 'ok' || !firstTrackId) return;
  const fallbackArtistId =
    artistIndexState.index?.trackArtistIds?.[firstTrackId]?.[0];
  if (fallbackArtistId) selectArtist(fallbackArtistId);
}
</script>

<template>
  <ArtistIdentityModal
    :open="open"
    :artist="selectedArtistIdentity"
    :artists="artistIndexState.index?.artists ?? []"
    :can-undo="artistIndexState.index?.canUndoOrganization ?? false"
    :busy="artistIndexState.isMutating"
    :error="artistIndexState.error?.message ?? ''"
    :lookup-status="artistIndexState.identityLookup.status"
    :catalog-candidates="artistIndexState.identityLookup.candidates"
    :lookup-error="artistIndexState.identityLookup.error"
    @close="closeIdentity"
    @merge="handleArtistMerge"
    @set-display-name="handleArtistDisplayName"
    @split="handleArtistSplit"
    @undo="handleArtistUndo"
    @search-catalog="handleArtistCatalogSearch"
    @apply-catalog="handleArtistCatalogApply"
  />
</template>

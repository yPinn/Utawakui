<script setup>
import { computed, onBeforeUnmount, watch } from 'vue';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useArtistIndex } from '../../composables/useArtistIndex.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import ArtistIdentityModal from '../artists/ArtistIdentityModal.vue';
import { t } from '../../utils/i18n.js';

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
    title: t('library.artistIdentity.merge.title'),
    subject: t('library.artistIdentity.merge.subject', {
      current: current.name,
      target: target.name,
    }),
    message: t('library.artistIdentity.merge.message'),
    detail: t('library.artistIdentity.merge.detail'),
    confirmLabel: t('library.artistIdentity.merge.confirm'),
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
    title: t('library.artistIdentity.split.title'),
    subject: credit.name,
    message: t('library.artistIdentity.split.message'),
    detail: t('library.artistIdentity.split.detail'),
    confirmLabel: t('library.artistIdentity.split.confirm'),
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

<script setup>
import { computed, shallowRef, watch } from 'vue';
import { Check, RotateCcw, SlidersHorizontal } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiTextField from '../ui/UiTextField.vue';
import ArtistIdentityCatalog from './ArtistIdentityCatalog.vue';
import ArtistIdentityCredits from './ArtistIdentityCredits.vue';
import ArtistIdentityMerge from './ArtistIdentityMerge.vue';
import { t } from '../../utils/i18n.js';

const MAX_DISPLAY_NAME_CHARS = 200;

const props = defineProps({
  open: { type: Boolean, default: false },
  artist: { type: Object, default: null },
  artists: { type: Array, default: () => [] },
  canUndo: { type: Boolean, default: false },
  busy: { type: Boolean, default: false },
  error: { type: String, default: '' },
  lookupStatus: { type: String, default: 'idle' },
  catalogCandidates: { type: Array, default: () => [] },
  lookupError: { type: String, default: '' },
});

const emit = defineEmits([
  'close',
  'merge',
  'setDisplayName',
  'split',
  'undo',
  'searchCatalog',
  'applyCatalog',
]);

const searchQuery = shallowRef('');
const selectedTargetId = shallowRef('');
const displayNameDraft = shallowRef('');
const selectedCatalogCandidateId = shallowRef('');
const advancedOpen = shallowRef(false);

const title = computed(() =>
  props.artist?.name
    ? t('artist.modal.titleNamed', { name: props.artist.name })
    : t('artist.modal.title'),
);
const credits = computed(() =>
  Array.isArray(props.artist?.credits) ? props.artist.credits : [],
);
const mergeTargets = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  if (!query) return [];
  return props.artists
    .filter((artist) => artist?.id && artist.id !== props.artist?.id)
    .filter((artist) =>
      [artist.name, ...(artist.credits ?? []).map((credit) => credit.name)]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase().includes(query)),
    )
    .map((artist) => ({
      id: artist.id,
      label: artist.name,
      description: t(
        'artist.modal.trackCount',
        { count: artist.trackIds?.length ?? 0 },
        artist.trackIds?.length ?? 0,
      ),
    }));
});
const canApplyDisplayName = computed(
  () =>
    Boolean(displayNameDraft.value.trim()) &&
    displayNameDraft.value.trim().length <= MAX_DISPLAY_NAME_CHARS,
);
const catalogCandidateItems = computed(() =>
  props.catalogCandidates.map((candidate) => {
    const evidence =
      candidate.evidence === 'exact-recording'
        ? t('artist.modal.exactRecording')
        : candidate.evidence === 'exact'
          ? t('artist.modal.exact')
          : t('artist.modal.possible');
    const aliases = Array.isArray(candidate.aliases)
      ? candidate.aliases.slice(0, 3).join(t('common.listSeparator'))
      : '';
    return {
      id: candidate.candidateId,
      label: candidate.name,
      description: aliases
        ? t('artist.modal.evidenceAliases', { evidence, aliases })
        : evidence,
    };
  }),
);

watch(
  () => [props.open, props.artist?.id],
  ([isOpen]) => {
    if (!isOpen) return;
    searchQuery.value = '';
    selectedTargetId.value = '';
    selectedCatalogCandidateId.value = '';
    displayNameDraft.value = props.artist?.name ?? '';
    advancedOpen.value = false;
  },
  { immediate: true },
);

function close() {
  if (!props.busy) emit('close');
}

function setSearchQuery(value) {
  searchQuery.value = value;
  if (
    !mergeTargets.value.some((artist) => artist.id === selectedTargetId.value)
  ) {
    selectedTargetId.value = '';
  }
}

function applyDisplayName() {
  if (props.busy || !canApplyDisplayName.value) return;
  emit('setDisplayName', displayNameDraft.value.trim());
}

function merge() {
  if (props.busy || !selectedTargetId.value) return;
  emit('merge', selectedTargetId.value);
}

function split(creditId) {
  if (props.busy || credits.value.length < 2) return;
  emit('split', creditId);
}

function applyCatalog() {
  if (props.busy || !selectedCatalogCandidateId.value) return;
  emit('applyCatalog', selectedCatalogCandidateId.value);
}
</script>

<template>
  <UiModal
    :open="open"
    :title="title"
    size="wide"
    max-block-size="medium"
    :close-disabled="busy"
    @close="close"
  >
    <div class="artist-identity-modal">
      <UiHint tone="text"> {{ t('artist.modal.displayHint') }} </UiHint>

      <UiNotice
        v-if="error"
        tone="warning"
        :title="t('artist.modal.failed')"
        :message="error"
        compact
      />

      <div class="artist-identity-modal__workflow">
        <section class="artist-identity-modal__section">
          <div class="artist-identity-modal__section-heading">
            <h3 class="artist-identity-modal__section-title">
              {{ t('artist.modal.currentGroup') }}
            </h3>
            <UiHint>{{ t('artist.modal.splitHint') }}</UiHint>
          </div>
          <ArtistIdentityCredits
            :credits="credits"
            :busy="busy"
            @split="split"
          />
        </section>

        <section class="artist-identity-modal__section">
          <div class="artist-identity-modal__section-heading">
            <h3 class="artist-identity-modal__section-title">
              {{ t('artist.modal.status') }}
            </h3>
            <template v-if="artist?.identityResolved">
              <strong class="artist-identity-modal__status">
                {{ t('artist.modal.auto') }}
              </strong>
              <UiHint>{{ t('artist.modal.splitCreditsHint') }}</UiHint>
            </template>
            <template v-else>
              <strong class="artist-identity-modal__status">
                {{ t('artist.modal.waiting') }}
              </strong>
              <UiHint>{{ t('artist.modal.waitingHint') }}</UiHint>
            </template>
          </div>
        </section>
      </div>

      <div class="artist-identity-modal__advanced-toggle">
        <UiButton
          variant="secondary"
          :icon="SlidersHorizontal"
          :aria-expanded="advancedOpen"
          :disabled="busy"
          aria-controls="artist-identity-advanced"
          @click="advancedOpen = !advancedOpen"
        >
          {{
            t(
              advancedOpen
                ? 'artist.modal.collapseManual'
                : 'artist.modal.manual',
            )
          }}
        </UiButton>
      </div>

      <div
        v-if="advancedOpen"
        id="artist-identity-advanced"
        class="artist-identity-modal__advanced"
      >
        <section class="artist-identity-modal__section">
          <div class="artist-identity-modal__section-heading">
            <h3 class="artist-identity-modal__section-title">
              {{ t('artist.modal.displayName') }}
            </h3>
            <UiHint>{{ t('artist.modal.displayNameHint') }}</UiHint>
          </div>
          <div class="artist-identity-modal__inline-action">
            <UiTextField
              id="artist-display-name"
              class="artist-identity-modal__display-name"
              :label="t('artist.modal.displayName')"
              :model-value="displayNameDraft"
              :maxlength="MAX_DISPLAY_NAME_CHARS"
              :disabled="busy"
              @update:model-value="displayNameDraft = $event"
              @keydown.enter="applyDisplayName"
            />
            <UiButton
              variant="secondary"
              :icon="Check"
              :disabled="!canApplyDisplayName"
              :loading="busy"
              @click="applyDisplayName"
            >
              {{ t('artist.modal.save') }}
            </UiButton>
          </div>
        </section>

        <section class="artist-identity-modal__section">
          <div class="artist-identity-modal__section-heading">
            <h3 class="artist-identity-modal__section-title">
              {{ t('artist.modal.mergeTitle') }}
            </h3>
            <UiHint>{{ t('artist.modal.mergeHint') }}</UiHint>
          </div>
          <ArtistIdentityMerge
            :query="searchQuery"
            :items="mergeTargets"
            :selected-id="selectedTargetId"
            :busy="busy"
            @update:query="setSearchQuery"
            @update:selected-id="selectedTargetId = $event"
            @merge="merge"
          />
        </section>

        <section
          class="artist-identity-modal__section artist-identity-modal__section--catalog"
        >
          <div class="artist-identity-modal__section-heading">
            <h3 class="artist-identity-modal__section-title">
              {{ t('artist.modal.reidentify') }}
            </h3>
            <UiHint>{{ t('artist.modal.reidentifyHint') }}</UiHint>
          </div>
          <ArtistIdentityCatalog
            :status="lookupStatus"
            :error="lookupError"
            :items="catalogCandidateItems"
            :selected-id="selectedCatalogCandidateId"
            :busy="busy"
            @search="emit('searchCatalog')"
            @update:selected-id="selectedCatalogCandidateId = $event"
            @apply="applyCatalog"
          />
        </section>
      </div>
    </div>

    <template #footer>
      <UiButton
        v-if="canUndo"
        variant="ghost"
        :icon="RotateCcw"
        :loading="busy"
        @click="emit('undo')"
      >
        {{ t('artist.modal.undo') }}
      </UiButton>
      <UiButton variant="secondary" :disabled="busy" @click="close">
        {{ t('artist.modal.close') }}
      </UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.artist-identity-modal {
  display: grid;
  gap: var(--ui-space-3);
}

.artist-identity-modal__workflow {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--ui-space-4);
}

.artist-identity-modal__advanced {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: start;
  gap: var(--ui-space-4);
}

.artist-identity-modal__advanced-toggle {
  display: flex;
  justify-content: flex-end;
}

.artist-identity-modal__section {
  min-inline-size: 0;
  display: grid;
  gap: var(--ui-space-2);
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.artist-identity-modal__section-heading {
  display: grid;
  gap: var(--ui-space-1);
}

.artist-identity-modal__section-title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
}

.artist-identity-modal__status {
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-compact-size);
  line-height: var(--ui-type-body-compact-line-height);
  -webkit-user-select: none;
  user-select: none;
}

.artist-identity-modal__section--catalog {
  grid-column: 1 / -1;
}

.artist-identity-modal__inline-action {
  min-inline-size: 0;
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: end;
  gap: var(--ui-space-2);
}

@container (max-width: 40rem) {
  .artist-identity-modal__workflow,
  .artist-identity-modal__advanced {
    grid-template-columns: minmax(0, 1fr);
  }

  .artist-identity-modal__section--catalog {
    grid-column: auto;
  }
}

@container (max-width: 26rem) {
  .artist-identity-modal__inline-action {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>

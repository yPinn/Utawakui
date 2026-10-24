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
  props.artist?.name ? `整理藝人：${props.artist.name}` : '整理藝人',
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
      description: `${artist.trackIds?.length ?? 0} 首曲目`,
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
        ? '名稱與曲目相符'
        : candidate.evidence === 'exact'
          ? '名稱相符，請確認'
          : '可能相符，請確認';
    const aliases = Array.isArray(candidate.aliases)
      ? candidate.aliases.slice(0, 3).join('、')
      : '';
    return {
      id: candidate.candidateId,
      label: candidate.name,
      description: aliases ? `${evidence}；別名：${aliases}` : evidence,
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
      <UiHint tone="text"> 曲目會統一顯示此名稱；原始標示仍可搜尋。 </UiHint>

      <UiNotice
        v-if="error"
        tone="warning"
        title="藝人整理未完成"
        :message="error"
        compact
      />

      <div class="artist-identity-modal__workflow">
        <section class="artist-identity-modal__section">
          <div class="artist-identity-modal__section-heading">
            <h3 class="artist-identity-modal__section-title">目前組合</h3>
            <UiHint>若組合有誤，可拆回個別藝人。</UiHint>
          </div>
          <ArtistIdentityCredits
            :credits="credits"
            :busy="busy"
            @split="split"
          />
        </section>

        <section class="artist-identity-modal__section">
          <div class="artist-identity-modal__section-heading">
            <h3 class="artist-identity-modal__section-title">整理狀態</h3>
            <template v-if="artist?.identityResolved">
              <strong class="artist-identity-modal__status">
                已自動整理
              </strong>
              <UiHint>若組合有誤，可拆分標示。</UiHint>
            </template>
            <template v-else>
              <strong class="artist-identity-modal__status">
                等待自動整理
              </strong>
              <UiHint>找到相符資料後會自動整理。</UiHint>
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
          {{ advancedOpen ? '收起修正' : '手動修正' }}
        </UiButton>
      </div>

      <div
        v-if="advancedOpen"
        id="artist-identity-advanced"
        class="artist-identity-modal__advanced"
      >
        <section class="artist-identity-modal__section">
          <div class="artist-identity-modal__section-heading">
            <h3 class="artist-identity-modal__section-title">顯示名稱</h3>
            <UiHint>套用於藝人頁與曲目。</UiHint>
          </div>
          <div class="artist-identity-modal__inline-action">
            <UiTextField
              id="artist-display-name"
              class="artist-identity-modal__display-name"
              label="顯示名稱"
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
              儲存
            </UiButton>
          </div>
        </section>

        <section class="artist-identity-modal__section">
          <div class="artist-identity-modal__section-heading">
            <h3 class="artist-identity-modal__section-title">合併藝人</h3>
            <UiHint>只合併確定為同一人的項目。</UiHint>
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
            <h3 class="artist-identity-modal__section-title">重新辨識</h3>
            <UiHint>需要其他結果時，可選擇 MusicBrainz 資料。</UiHint>
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
        復原
      </UiButton>
      <UiButton variant="secondary" :disabled="busy" @click="close">
        關閉
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
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-title-weight);
  line-height: var(--ui-type-title-line-height);
}

.artist-identity-modal__status {
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-compact-size);
  line-height: var(--ui-type-body-compact-line-height);
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

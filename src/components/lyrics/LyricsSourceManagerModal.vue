<script setup>
import {
  formatLyricsSourceLabel,
  formatLyricsSourceTier,
  describeLyricsSourceTier,
} from '../../utils/lyricsSourcePresentation.js';
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue';
import {
  MessageSquare,
  Pencil,
  Plus,
  Search,
  Tag,
  Trash2,
} from '../../icons/index.js';
import { useLyrics } from '../../composables/useLyrics.js';
import { useFeedbackReport } from '../../composables/useFeedbackReport.js';
import { buildLyricsIssueReport } from '../../utils/lyricsIssueReport.js';
import {
  formatLyricsSourceOffset,
  lyricsSourceDisplayTier,
} from '../../utils/lyrics.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiOverflowTooltip from '../ui/UiOverflowTooltip.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import UiSurface from '../ui/UiSurface.vue';
import UiTextField from '../ui/UiTextField.vue';
import LyricsLrclibSearchWorkspace from './LyricsLrclibSearchWorkspace.vue';
import LyricsManualImportPanel from './LyricsManualImportPanel.vue';
import LyricsSourceAnalysis from './LyricsSourceAnalysis.vue';
import { catalogKey, t } from '../../utils/i18n.js';

const props = defineProps({
  open: { type: Boolean, default: false },
  analysisDisabled: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const {
  state,
  selectedTrack,
  selectedLyrics,
  selectSource,
  setSourceLabel,
  deleteSource,
  backfillSourceLabels,
  experimentalLyrics,
  availableSources,
  refreshSourceDetails,
  linkedReference,
  hasLinkedReference,
  applyLinkedReference,
  toggleLinkedReference,
} = useLyrics();
const feedback = useFeedbackReport();

const searchOpen = ref(false);
const searchMounted = ref(false);
const analysisOpen = ref(false);
const searchPaneId = `lyrics-source-search-${useId()}`;
const searchTriggerRef = useTemplateRef('searchTrigger');
const isManualImportOpen = ref(false);
const isBackfilling = ref(false);
const hasUnlabeledLrclibSources = computed(() =>
  selectedLyrics.value.sources.some(
    (source) => source.kind === 'lrclib' && !source.label,
  ),
);
const editingFilename = ref(null);
const labelDraft = ref('');
const sourceLabelId = `lyrics-source-label-${useId()}`;
const pendingDeleteSource = ref(null);
const isDeletingSource = ref(false);
const displaySources = computed(
  () => availableSources?.value ?? selectedLyrics.value.sources,
);
const SOURCE_ACTIONS = new Set([
  'set-label',
  'delete-source',
  'backfill-labels',
]);
const sourceActionTitle = computed(() => {
  const operation = state.sourceAction?.operation;
  return t(
    `lyricsSource.manager.actionFailed.${SOURCE_ACTIONS.has(operation) ? catalogKey(operation) : 'other'}`,
  );
});
// Cancel/close hides only the shown attempt; the domain clears it on the
// next action or track change.
const dismissedAttempt = ref(null);
const sourceActionError = computed(() =>
  state.sourceAction?.attempt === dismissedAttempt.value
    ? ''
    : state.sourceAction?.error || '',
);
function dismissSourceActionError() {
  dismissedAttempt.value = state.sourceAction?.attempt ?? null;
}
watch(
  () => props.open,
  (open) => {
    if (!open) {
      resetPanes();
      dismissSourceActionError();
    }
  },
);

watch(
  () => props.open,
  (open) => {
    if (open) void refreshSourceDetails?.();
  },
  { immediate: true },
);

watch(() => state.selectedTrackId, resetPanes);

function resetPanes() {
  searchOpen.value = false;
  searchMounted.value = false;
  analysisOpen.value = false;
  isManualImportOpen.value = false;
  editingFilename.value = null;
  pendingDeleteSource.value = null;
}

function toggleSearch() {
  if (searchOpen.value) {
    void collapseSearch();
    return;
  }
  searchMounted.value = true;
  searchOpen.value = true;
}

async function handleBackfill() {
  if (isBackfilling.value) return;
  isBackfilling.value = true;
  try {
    await backfillSourceLabels();
  } finally {
    isBackfilling.value = false;
  }
}

async function collapseSearch() {
  searchOpen.value = false;
  await nextTick();
  searchTriggerRef.value?.$el?.focus?.();
}

function handleModalClose() {
  resetPanes();
  emit('close');
}

function startEdit(source) {
  editingFilename.value = source.filename;
  labelDraft.value = source.label || '';
}

function cancelEdit() {
  editingFilename.value = null;
  dismissSourceActionError();
}

// A failed save keeps the draft open so the user can retry in place.
async function commitEdit(filename) {
  await setSourceLabel(filename, labelDraft.value);
  if (!state.sourceAction?.error) editingFilename.value = null;
}

function handleDelete(source) {
  editingFilename.value = null;
  pendingDeleteSource.value = source;
}

function cancelDelete() {
  if (isDeletingSource.value) return;
  pendingDeleteSource.value = null;
  dismissSourceActionError();
}

async function confirmDelete() {
  const source = pendingDeleteSource.value;
  if (!source || isDeletingSource.value) return;
  isDeletingSource.value = true;
  try {
    await deleteSource(source.filename);
    if (!state.sourceAction?.error) pendingDeleteSource.value = null;
  } finally {
    isDeletingSource.value = false;
  }
}

function sourceOffsetMs(source) {
  return state.selectedSourceFilename === source.filename
    ? Math.round(state.offsetSeconds * 1000)
    : source.offsetMs;
}

function sourceTierLabel(source) {
  return formatLyricsSourceTier(lyricsSourceDisplayTier(source));
}

function sourceTierDescription(source) {
  const tier = lyricsSourceDisplayTier(source);
  const description = describeLyricsSourceTier(tier);
  return tier === 'T1+'
    ? [
        description,
        source.filename === state.selectedSourceFilename &&
        experimentalLyrics?.applied.value
          ? t('lyricsSource.manager.applied')
          : t('lyricsSource.manager.notApplied'),
      ].join(t('common.sentenceJoin'))
    : description;
}

function reportSource(source) {
  if (!selectedTrack?.value || isDeletingSource.value) return;
  feedback.openReport(
    buildLyricsIssueReport({
      track: selectedTrack.value,
      source,
      tier: source.timingTier,
      offsetMs: sourceOffsetMs(source),
    }),
  );
}
</script>

<template>
  <UiModal
    :open="open"
    :title="t('lyricsSource.manager.sourcesTitle')"
    :size="
      searchOpen || selectedLyrics.sources.length || isManualImportOpen
        ? 'wide'
        : 'notice'
    "
    max-block-size="small"
    body-mode="workspace"
    initial-focus="dialog"
    @close="handleModalClose"
  >
    <template #header-actions>
      <UiIconButton
        v-if="hasUnlabeledLrclibSources"
        :icon="Tag"
        :disabled="isBackfilling"
        :label="
          isBackfilling
            ? t('lyricsSource.manager.backfilling')
            : t('lyricsSource.manager.backfill')
        "
        @click="handleBackfill"
      />
      <UiIconButton
        :icon="Plus"
        :active="isManualImportOpen"
        :aria-expanded="isManualImportOpen"
        :label="t('lyricsSource.manager.manualImport')"
        @click="isManualImportOpen = !isManualImportOpen"
      />
      <UiIconButton
        ref="searchTrigger"
        :icon="Search"
        :variant="searchOpen ? 'ghost' : 'accent'"
        :active="searchOpen"
        :aria-expanded="searchOpen"
        :aria-controls="searchMounted ? searchPaneId : undefined"
        :label="
          t(
            searchOpen
              ? 'lyricsSource.manager.collapseSearch'
              : 'lyricsSource.manager.searchTitle',
          )
        "
        @click="toggleSearch"
      />
    </template>
    <div class="lyrics-source-manager">
      <UiScrollLayout
        class="lyrics-source-manager__scroll"
        :class="{ 'lyrics-source-manager__scroll--expanded': searchOpen }"
        viewport-class="lyrics-source-manager__viewport"
        content-class="lyrics-source-manager__panes"
        scrollbar-reserve="overflow"
      >
        <UiScrollLayout
          class="lyrics-source-manager__local"
          viewport-class="lyrics-source-manager__local-viewport"
          content-class="lyrics-source-manager__local-content"
          scrollbar-reserve="overflow"
        >
          <section :aria-label="t('lyricsSource.manager.listLabel')">
            <h3 class="lyrics-source-manager__heading">
              {{ t('lyricsSource.manager.localTitle') }}
            </h3>
            <UiNotice
              v-if="sourceActionError"
              class="lyrics-source-manager__action-error"
              tone="danger"
              compact
              :title="sourceActionTitle"
              :message="sourceActionError"
            />
            <template
              v-if="
                linkedReference ||
                (hasLinkedReference && state.linkedReferenceHidden)
              "
            >
              <UiHint v-if="linkedReference">
                {{
                  t(
                    linkedReference.document.granularity === 'T0'
                      ? 'lyricsSource.manager.linkedReferenceText'
                      : 'lyricsSource.manager.linkedReference',
                    { title: linkedReference.title },
                  )
                }}
              </UiHint>
              <UiHint v-else-if="selectedLyrics.sources.length === 0">{{
                t('lyricsSource.manager.empty')
              }}</UiHint>
              <div
                v-if="linkedReference || state.linkedReferenceHidden"
                class="lyrics-source-manager__reference-actions"
              >
                <UiButton
                  v-if="linkedReference"
                  variant="secondary"
                  :loading="state.sourceAction?.isSaving"
                  @click="applyLinkedReference"
                >
                  {{ t('lyricsSource.manager.applyReference') }}
                </UiButton>
                <UiButton
                  :disabled="state.sourceAction?.isSaving"
                  @click="toggleLinkedReference"
                >
                  {{
                    t(
                      linkedReference
                        ? 'lyricsSource.manager.hideReference'
                        : 'lyricsSource.manager.showReference',
                    )
                  }}
                </UiButton>
              </div>
            </template>
            <UiHint v-else-if="selectedLyrics.sources.length === 0">{{
              t('lyricsSource.manager.empty')
            }}</UiHint>
            <ul
              v-if="selectedLyrics.sources.length"
              class="lyrics-source-manager__list"
            >
              <UiSurface
                v-for="source in displaySources"
                :key="source.filename"
                tag="li"
                tone="surface"
                class="lyrics-source-manager__row"
              >
                <template
                  v-if="pendingDeleteSource?.filename === source.filename"
                >
                  <div class="lyrics-source-manager__delete-copy">
                    <strong>{{ t('lyricsSource.manager.deleteTitle') }}</strong>
                    <span>{{
                      t('lyricsSource.manager.deleteMessage', {
                        name: formatLyricsSourceLabel(source),
                      })
                    }}</span>
                  </div>
                  <UiButton
                    variant="secondary"
                    :disabled="isDeletingSource"
                    @click="cancelDelete"
                  >
                    {{ t('common.cancel') }}
                  </UiButton>
                  <UiButton
                    variant="accent"
                    intent="danger"
                    :loading="isDeletingSource"
                    :loading-label="t('lyricsSource.manager.deleting')"
                    @click="confirmDelete"
                  >
                    {{ t('lyricsSource.manager.delete') }}
                  </UiButton>
                </template>
                <template v-else-if="editingFilename === source.filename">
                  <UiTextField
                    :id="sourceLabelId"
                    v-model="labelDraft"
                    class="lyrics-source-manager__label-field"
                    :maxlength="32"
                    :label="t('lyricsSource.manager.labelField')"
                    label-hidden
                    :placeholder="t('lyricsSource.manager.labelPlaceholder')"
                    @keydown.enter="commitEdit(source.filename)"
                    @keydown.esc="cancelEdit"
                  />
                  <UiButton
                    :title="t('lyricsSource.manager.saveLabel')"
                    @click="commitEdit(source.filename)"
                  >
                    {{ t('common.save') }}
                  </UiButton>
                  <UiButton
                    :title="t('lyricsSource.manager.cancelEdit')"
                    @click="cancelEdit"
                    >{{ t('common.cancel') }}</UiButton
                  >
                </template>
                <div v-else class="lyrics-source-manager__row-content">
                  <div class="lyrics-source-manager__row-identity">
                    <UiButton
                      class="lyrics-source-manager__row-label"
                      :title="formatLyricsSourceLabel(source)"
                      :aria-pressed="
                        !linkedReference &&
                        state.selectedSourceFilename === source.filename
                      "
                      @click="
                        linkedReference &&
                        state.selectedSourceFilename === source.filename
                          ? toggleLinkedReference()
                          : selectSource(source.filename)
                      "
                    >
                      <span
                        class="lyrics-source-manager__row-name"
                        dir="auto"
                        >{{ formatLyricsSourceLabel(source) }}</span
                      >
                    </UiButton>
                    <UiChip
                      v-if="
                        !linkedReference &&
                        state.selectedSourceFilename === source.filename
                      "
                      class="lyrics-source-manager__row-status"
                      tone="current"
                    >
                      {{ t('lyricsSource.manager.current') }}
                    </UiChip>
                  </div>
                  <span
                    class="lyrics-source-manager__row-meta"
                    :aria-label="
                      [
                        sourceTierDescription(source),
                        t('lyricsSource.manager.offsetNamed', {
                          offset: formatLyricsSourceOffset(
                            sourceOffsetMs(source),
                          ),
                        }),
                      ].join(t('common.clauseSeparator'))
                    "
                  >
                    <UiOverflowTooltip
                      class="lyrics-source-manager__row-tier"
                      :text="sourceTierDescription(source)"
                    >
                      {{ sourceTierLabel(source) }}
                    </UiOverflowTooltip>
                    <span
                      v-if="sourceOffsetMs(source)"
                      class="lyrics-source-manager__row-offset"
                    >
                      {{ formatLyricsSourceOffset(sourceOffsetMs(source)) }}
                    </span>
                  </span>
                  <div class="lyrics-source-manager__row-actions">
                    <UiIconButton
                      :icon="MessageSquare"
                      :label="t('lyricsSource.candidate.report')"
                      @click="reportSource(source)"
                    />
                    <UiIconButton
                      :icon="Pencil"
                      :label="t('lyricsSource.manager.editLabel')"
                      @click="startEdit(source)"
                    />
                    <UiIconButton
                      :icon="Trash2"
                      intent="danger"
                      :label="t('lyricsSource.manager.deleteNamed')"
                      @click="handleDelete(source)"
                    />
                  </div>
                </div>
              </UiSurface>
            </ul>

            <LyricsManualImportPanel
              v-if="isManualImportOpen"
              class="lyrics-source-manager__manual-import"
              @cancel="isManualImportOpen = false"
              @saved="isManualImportOpen = false"
            />
          </section>
          <UiDisclosure
            v-if="experimentalLyrics && state.selectedSourceFilename"
            v-model:open="analysisOpen"
            :label="t('lyricsResearch.settings.title')"
          >
            <LyricsSourceAnalysis
              :active="open && analysisOpen"
              :disabled="analysisDisabled || isDeletingSource"
            />
          </UiDisclosure>
        </UiScrollLayout>
        <section
          v-if="searchMounted"
          v-show="searchOpen"
          :id="searchPaneId"
          class="lyrics-source-manager__search"
          :aria-labelledby="`${searchPaneId}-heading`"
        >
          <h3
            :id="`${searchPaneId}-heading`"
            class="lyrics-source-manager__heading"
          >
            {{ t('lyricsSource.manager.searchTitle') }}
          </h3>
          <LyricsLrclibSearchWorkspace :active="searchOpen" provider-id="all" />
        </section>
      </UiScrollLayout>
    </div>
  </UiModal>
</template>

<style scoped>
.lyrics-source-manager {
  container: lyrics-manager / inline-size;
  display: grid;
  min-block-size: 0;
  grid-template-rows: minmax(0, 1fr);
}

.lyrics-source-manager :deep(.lyrics-source-manager__panes),
.lyrics-source-manager :deep(.lyrics-source-manager__local-content) {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  align-content: start;
  gap: var(--ui-space-4);
}

.lyrics-source-manager__local {
  container: lyrics-local / inline-size;
  display: block;
}

.lyrics-source-manager__local :deep(.lyrics-source-manager__local-viewport) {
  block-size: auto;
  overflow: visible;
}

.lyrics-source-manager__search {
  --lyrics-search-results-display: block;
  --lyrics-search-results-overflow: visible;

  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-inline-size: 0;
  min-block-size: 0;
  padding-block-start: var(--ui-space-4);
  border-block-start: var(--ui-border-width) solid var(--ui-color-border);
}

.lyrics-source-manager__heading {
  margin: 0 0 var(--ui-space-2);
  color: var(--ui-color-text);
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
}

.lyrics-source-manager__reference-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  margin-block-start: var(--ui-space-3);
}

.lyrics-source-manager__reference-actions + .lyrics-source-manager__list {
  margin-block-start: var(--ui-space-3);
}

@media (min-width: 64rem) {
  @container lyrics-manager (min-width: 40rem) {
    .lyrics-source-manager__scroll--expanded > :deep(.ui-scroll-region__rail),
    .lyrics-source-manager__scroll--expanded > :deep(.ui-scroll-region__edge) {
      display: none;
    }

    .lyrics-source-manager__scroll--expanded
      :deep(.lyrics-source-manager__viewport) {
      display: grid;
      grid-template-rows: minmax(0, 1fr);
      overflow: clip;
    }

    .lyrics-source-manager__scroll--expanded
      :deep(.lyrics-source-manager__panes) {
      grid-template-columns: 16rem minmax(0, 1fr);
      align-content: stretch;
      min-block-size: 0;
    }

    .lyrics-source-manager__scroll--expanded .lyrics-source-manager__local {
      display: grid;
      overflow: clip;
    }

    .lyrics-source-manager__scroll--expanded
      :deep(.lyrics-source-manager__local-viewport) {
      block-size: 100%;
      overflow: hidden auto;
    }

    .lyrics-source-manager__search {
      --lyrics-search-results-display: grid;
      --lyrics-search-results-overflow: hidden auto;

      padding-block-start: 0;
      padding-inline-start: var(--ui-space-4);
      border-block-start: 0;
      border-inline-start: var(--ui-border-width) solid var(--ui-color-border);
    }
  }
}

.lyrics-source-manager__list {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.lyrics-source-manager__row {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
}

.lyrics-source-manager__row-content {
  display: grid;
  flex: 1;
  min-inline-size: 0;
  grid-template-columns: minmax(0, 1fr) minmax(0, 14rem) max-content;
  align-items: center;
  gap: var(--ui-space-2);
}

.lyrics-source-manager__row-identity {
  display: grid;
  grid-template-columns: minmax(0, 1fr) max-content;
  align-items: center;
}

.lyrics-source-manager__row-identity > .lyrics-source-manager__row-label {
  color: var(--ui-color-text);
  justify-content: flex-start;
  padding-inline: var(--ui-space-2);
  text-align: start;
}

.lyrics-source-manager__row-name {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lyrics-source-manager__row-meta {
  display: flex;
  flex-wrap: wrap;
  min-inline-size: 0;
  align-items: center;
  gap: var(--ui-space-1) var(--ui-space-2);
  font-size: var(--ui-type-caption-size);
  white-space: nowrap;
}

.lyrics-source-manager__row-meta :deep(.lyrics-source-manager__row-tier) {
  display: flex;
  min-width: 0;
  align-items: center;
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-weight: var(--ui-font-weight-semibold);
  font-variant-numeric: tabular-nums;
  text-align: start;
  text-overflow: ellipsis;
}

.lyrics-source-manager__row-offset {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  box-sizing: border-box;
  padding-inline-start: var(--ui-space-2);
  border-inline-start: var(--ui-border-width) solid var(--ui-color-border);
  color: var(--ui-color-text);
  font-variant-numeric: tabular-nums;
  text-align: end;
  white-space: nowrap;
}

.lyrics-source-manager__row-actions {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: var(--ui-space-1);
}

@container lyrics-local (width < 32rem) {
  .lyrics-source-manager__row {
    flex-wrap: wrap;
    gap: var(--ui-space-1) var(--ui-space-2);
  }

  .lyrics-source-manager__label-field,
  .lyrics-source-manager__delete-copy {
    flex-basis: 100%;
  }

  .lyrics-source-manager__row-content {
    grid-template-columns: minmax(0, 1fr) max-content;
    row-gap: var(--ui-space-1);
  }

  .lyrics-source-manager__row-identity {
    grid-column: 1 / -1;
  }

  .lyrics-source-manager__row-meta {
    padding-inline-start: calc(var(--ui-space-2) + var(--ui-border-width));
  }

  .lyrics-source-manager__row-actions {
    align-self: end;
  }
}

.lyrics-source-manager__delete-copy {
  display: grid;
  flex: 1;
  gap: var(--ui-space-1);
  min-width: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-compact-size);
  line-height: var(--ui-type-body-line-height);
}

.lyrics-source-manager__delete-copy span {
  color: var(--ui-color-text-muted);
  overflow-wrap: anywhere;
}

.lyrics-source-manager__label-field {
  min-width: 0;
  flex: 1;
}

.lyrics-source-manager__manual-import {
  margin-top: var(--ui-space-3);
}

.lyrics-source-manager__action-error {
  margin-bottom: var(--ui-space-3);
}
</style>

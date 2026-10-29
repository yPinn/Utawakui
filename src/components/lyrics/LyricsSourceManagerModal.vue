<script setup>
import { computed, nextTick, ref, useId, useTemplateRef, watch } from 'vue';
import {
  ArrowLeft,
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
  describeLyricsSourceTier,
  formatLyricsSourceLabel,
  formatLyricsSourceOffset,
  formatLyricsSourceTier,
  lyricsSourceDisplayTier,
} from '../../utils/lyrics.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiOverflowTooltip from '../ui/UiOverflowTooltip.vue';
import UiSurface from '../ui/UiSurface.vue';
import UiTextField from '../ui/UiTextField.vue';
import LyricsLrclibSearchWorkspace from './LyricsLrclibSearchWorkspace.vue';
import LyricsManualImportPanel from './LyricsManualImportPanel.vue';
import LyricsSourceAnalysis from './LyricsSourceAnalysis.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
  analysisDisabled: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const {
  state,
  selectedTrack,
  selectedLyrics,
  setSourceLabel,
  deleteSource,
  backfillSourceLabels,
  experimentalLyrics,
  availableSources,
  refreshSourceDetails,
} = useLyrics();
const feedback = useFeedbackReport();

const activeView = ref('sources');
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
const SOURCE_ACTION_TITLES = Object.freeze({
  'set-label': '標籤未更新',
  'delete-source': '歌詞來源未刪除',
  'backfill-labels': '標籤未補齊',
});
const sourceActionTitle = computed(
  () => SOURCE_ACTION_TITLES[state.sourceAction?.operation] ?? '操作未完成',
);
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
const modalTitle = computed(() =>
  activeView.value === 'search' ? '搜尋歌詞' : '可用歌詞',
);

watch(
  () => props.open,
  (open) => {
    if (!open) {
      activeView.value = 'sources';
      pendingDeleteSource.value = null;
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

function openSearch() {
  activeView.value = 'search';
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

async function returnToSources() {
  activeView.value = 'sources';
  await nextTick();
  searchTriggerRef.value?.$el?.focus?.();
}

function handleModalClose() {
  activeView.value = 'sources';
  pendingDeleteSource.value = null;
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
    ? `${description} ${source.filename === state.selectedSourceFilename && experimentalLyrics?.applied.value ? '已套用' : '未套用'}。`
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
    :title="modalTitle"
    :size="
      activeView === 'search' || selectedLyrics.sources.length
        ? 'wide'
        : 'notice'
    "
    max-block-size="small"
    :body-mode="activeView === 'search' ? 'workspace' : 'scroll'"
    @close="handleModalClose"
  >
    <template #header-actions>
      <UiIconButton
        v-if="activeView === 'search'"
        :icon="ArrowLeft"
        label="返回可用歌詞"
        @click="returnToSources"
      />
      <template v-else>
        <UiIconButton
          v-if="hasUnlabeledLrclibSources"
          :icon="Tag"
          :disabled="isBackfilling"
          :label="isBackfilling ? '補齊標籤中…' : '補齊標籤'"
          @click="handleBackfill"
        />
        <UiIconButton
          :icon="Plus"
          :active="isManualImportOpen"
          :aria-expanded="isManualImportOpen"
          label="手動匯入歌詞"
          @click="isManualImportOpen = !isManualImportOpen"
        />
        <UiIconButton
          ref="searchTrigger"
          :icon="Search"
          variant="accent"
          label="搜尋歌詞"
          @click="openSearch"
        />
      </template>
    </template>
    <LyricsLrclibSearchWorkspace
      v-if="activeView === 'search'"
      provider-id="all"
      provider-label="所有線上來源"
      @back="returnToSources"
    />
    <div v-else class="lyrics-source-manager">
      <section aria-label="可使用的歌詞">
        <UiNotice
          v-if="sourceActionError"
          class="lyrics-source-manager__action-error"
          tone="danger"
          compact
          :title="sourceActionTitle"
          :message="sourceActionError"
        />
        <UiHint v-if="selectedLyrics.sources.length === 0">
          尚無可用歌詞，可搜尋歌詞或手動匯入。
        </UiHint>
        <ul v-else class="lyrics-source-manager__list">
          <UiSurface
            v-for="source in displaySources"
            :key="source.filename"
            tag="li"
            tone="surface"
            class="lyrics-source-manager__row"
          >
            <template v-if="pendingDeleteSource?.filename === source.filename">
              <div class="lyrics-source-manager__delete-copy">
                <strong>刪除歌詞來源？</strong>
                <span>
                  {{ formatLyricsSourceLabel(source) }}
                  會被刪除，且無法復原。
                </span>
              </div>
              <UiButton
                variant="secondary"
                :disabled="isDeletingSource"
                @click="cancelDelete"
              >
                取消
              </UiButton>
              <UiButton
                variant="accent"
                intent="danger"
                :loading="isDeletingSource"
                loading-label="刪除中"
                @click="confirmDelete"
              >
                刪除來源
              </UiButton>
            </template>
            <template v-else-if="editingFilename === source.filename">
              <UiTextField
                :id="sourceLabelId"
                v-model="labelDraft"
                class="lyrics-source-manager__label-field"
                :maxlength="32"
                label="歌詞來源標籤"
                label-hidden
                placeholder="標籤（留空清除）"
                @keydown.enter="commitEdit(source.filename)"
                @keydown.esc="cancelEdit"
              />
              <UiButton title="儲存標籤" @click="commitEdit(source.filename)">
                儲存
              </UiButton>
              <UiButton title="取消編輯" @click="cancelEdit">取消</UiButton>
            </template>
            <template v-else>
              <span class="lyrics-source-manager__row-label">
                <UiOverflowTooltip
                  class="lyrics-source-manager__row-name"
                  :text="formatLyricsSourceLabel(source)"
                />
                <UiChip
                  v-if="state.selectedSourceFilename === source.filename"
                  class="lyrics-source-manager__row-status"
                  tone="current"
                >
                  使用中
                </UiChip>
              </span>
              <span
                class="lyrics-source-manager__row-meta"
                :aria-label="`${sourceTierDescription(source)}，時間偏移 ${formatLyricsSourceOffset(sourceOffsetMs(source))}`"
              >
                <UiOverflowTooltip
                  class="lyrics-source-manager__row-tier"
                  :text="sourceTierDescription(source)"
                >
                  {{ sourceTierLabel(source) }}
                </UiOverflowTooltip>
                <span class="lyrics-source-manager__row-offset">
                  {{ formatLyricsSourceOffset(sourceOffsetMs(source)) }}
                </span>
              </span>
              <div class="lyrics-source-manager__row-actions">
                <UiIconButton
                  :icon="MessageSquare"
                  label="回報歌詞問題"
                  @click="reportSource(source)"
                />
                <UiIconButton
                  :icon="Pencil"
                  label="編輯標籤"
                  @click="startEdit(source)"
                />
                <UiIconButton
                  :icon="Trash2"
                  intent="danger"
                  label="刪除這個歌詞來源"
                  @click="handleDelete(source)"
                />
              </div>
            </template>
          </UiSurface>
        </ul>

        <LyricsManualImportPanel
          v-if="isManualImportOpen"
          class="lyrics-source-manager__manual-import"
          @cancel="isManualImportOpen = false"
          @saved="isManualImportOpen = false"
        />
      </section>
      <LyricsSourceAnalysis
        v-if="experimentalLyrics && state.selectedSourceFilename"
        :active="open && activeView === 'sources'"
        :disabled="analysisDisabled || isDeletingSource"
      />
    </div>
  </UiModal>
</template>

<style scoped>
.lyrics-source-manager {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
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
  --ui-lyrics-source-meta-width: 9rem;

  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
}

.lyrics-source-manager__row-label {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--ui-space-2);
  min-width: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  white-space: nowrap;
}

.lyrics-source-manager__row-label :deep(.lyrics-source-manager__row-name) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lyrics-source-manager__row-status {
  flex-shrink: 0;
}

.lyrics-source-manager__row-meta {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  align-items: stretch;
  column-gap: 0;
  flex: 0 0 var(--ui-lyrics-source-meta-width);
  width: var(--ui-lyrics-source-meta-width);
  box-sizing: border-box;
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

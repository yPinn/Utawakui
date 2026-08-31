<script setup>
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { Pencil, Plus, Trash2 } from '../../icons/index.js';
import { useLyrics } from '../../composables/useLyrics.js';
import {
  formatLyricsSourceLabel,
  formatLyricsSourceOffset,
  formatLyricsSourceTier,
} from '../../utils/lyrics.js';
import { normalizeLyricsDocument } from '../../utils/lyricsDocument.js';
import UiButton from '../ui/UiButton.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import LyricsLrclibSearchPanel from './LyricsLrclibSearchPanel.vue';
import LyricsLrclibSearchWorkspace from './LyricsLrclibSearchWorkspace.vue';
import LyricsManualImportPanel from './LyricsManualImportPanel.vue';

const props = defineProps({
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const { state, selectedLyrics, setSourceLabel, deleteSource } = useLyrics();

const activeView = ref('sources');
const activeProviderId = ref('all');
const allProvidersPanelRef = useTemplateRef('allProvidersPanelRef');
const neteasePanelRef = useTemplateRef('neteasePanelRef');
const lrclibPanelRef = useTemplateRef('lrclibPanelRef');
const betterLyricsPanelRef = useTemplateRef('betterLyricsPanelRef');
const isManualImportOpen = ref(false);
const editingFilename = ref(null);
const labelDraft = ref('');
const sourceTiers = ref(new Map());
let sourceTierRequestId = 0;
const PROVIDERS = Object.freeze({
  all: Object.freeze({ id: 'all', label: '所有線上來源' }),
  netease: Object.freeze({ id: 'netease', label: '網易雲音樂' }),
  lrclib: Object.freeze({ id: 'lrclib', label: 'LRCLIB' }),
  betterlyrics: Object.freeze({ id: 'betterlyrics', label: 'Better Lyrics' }),
});
const activeProvider = computed(() => PROVIDERS[activeProviderId.value]);
const modalTitle = computed(() =>
  activeView.value === 'search'
    ? activeProvider.value.id === 'all'
      ? '搜尋歌詞'
      : `搜尋 ${activeProvider.value.label}`
    : '管理歌詞來源',
);

watch(
  () => props.open,
  (open) => {
    if (!open) activeView.value = 'sources';
  },
);

const sourceFilenames = computed(() =>
  selectedLyrics.value.sources.map((source) => source.filename).join('\0'),
);

watch(
  [() => props.open, () => state.selectedTrackId, sourceFilenames],
  ([open]) => {
    sourceTierRequestId += 1;
    sourceTiers.value = new Map();
    if (open) void loadSourceTiers(sourceTierRequestId);
  },
  { immediate: true },
);

function openProviderSearch(providerId) {
  activeProviderId.value = providerId;
  activeView.value = 'search';
}

async function returnToSources() {
  activeView.value = 'sources';
  await nextTick();
  const panelRef = {
    all: allProvidersPanelRef.value,
    netease: neteasePanelRef.value,
    lrclib: lrclibPanelRef.value,
    betterlyrics: betterLyricsPanelRef.value,
  }[activeProviderId.value];
  panelRef?.focusSearchTrigger();
}

function handleModalClose() {
  activeView.value = 'sources';
  emit('close');
}

function startEdit(source) {
  editingFilename.value = source.filename;
  labelDraft.value = source.label || '';
}

function cancelEdit() {
  editingFilename.value = null;
}

async function commitEdit(filename) {
  await setSourceLabel(filename, labelDraft.value);
  editingFilename.value = null;
}

async function handleDelete(source) {
  const confirmed = window.confirm(
    `確定要刪除這個歌詞來源（${formatLyricsSourceLabel(source)}）嗎？此動作無法復原。`,
  );
  if (!confirmed) return;
  await deleteSource(source.filename);
}

function sourceOffsetMs(source) {
  return state.selectedSourceFilename === source.filename
    ? Math.round(state.offsetSeconds * 1000)
    : source.offsetMs;
}

async function loadSourceTiers(requestId) {
  const trackId = state.selectedTrackId;
  const sources = [...selectedLyrics.value.sources];
  if (!trackId || typeof window.Utawakui?.getTrackLyrics !== 'function') return;

  const tiers = await Promise.all(
    sources.map(async (source) => {
      try {
        const result = await window.Utawakui.getTrackLyrics(
          trackId,
          source.filename,
        );
        const document = normalizeLyricsDocument({
          text: result?.text ?? '',
          source: result?.source ?? source,
          sourceFingerprint: result?.timing?.sourceFingerprint,
          normalizerProfileId: result?.timing?.normalizerProfileId,
          timing: result?.timing,
        });
        return [source.filename, document.granularity];
      } catch {
        return [source.filename, null];
      }
    }),
  );

  if (requestId !== sourceTierRequestId || state.selectedTrackId !== trackId) {
    return;
  }
  sourceTiers.value = new Map(tiers.filter(([, tier]) => tier));
}

function sourceTierLabel(source) {
  return formatLyricsSourceTier(sourceTiers.value.get(source.filename));
}
</script>

<template>
  <UiModal
    :open="open"
    :title="modalTitle"
    size="wide"
    @close="handleModalClose"
  >
    <LyricsLrclibSearchWorkspace
      v-if="activeView === 'search'"
      :provider-id="activeProvider.id"
      :provider-label="activeProvider.label"
      @back="returnToSources"
    />
    <div v-else class="lyrics-source-manager">
      <section aria-labelledby="lyrics-source-manager-current-title">
        <div class="lyrics-source-manager__section-header">
          <h3
            id="lyrics-source-manager-current-title"
            class="lyrics-source-manager__section-title"
          >
            目前的來源
          </h3>
          <UiButton
            v-if="!isManualImportOpen"
            :icon="Plus"
            title="手動匯入歌詞"
            @click="isManualImportOpen = true"
          >
            手動匯入
          </UiButton>
        </div>

        <UiHint v-if="selectedLyrics.sources.length === 0">
          尚無歌詞來源。
        </UiHint>
        <ul v-else class="lyrics-source-manager__list">
          <li
            v-for="source in selectedLyrics.sources"
            :key="source.filename"
            class="lyrics-source-manager__row"
          >
            <template v-if="editingFilename === source.filename">
              <input
                v-model="labelDraft"
                class="lyrics-source-manager__input"
                maxlength="32"
                aria-label="歌詞來源標籤"
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
                {{ formatLyricsSourceLabel(source) }}
                <UiChip
                  v-if="state.selectedSourceFilename === source.filename"
                  tone="current"
                >
                  使用中
                </UiChip>
              </span>
              <span
                class="lyrics-source-manager__row-meta"
                :aria-label="`歌詞層級 ${sourceTierLabel(source)}，時間偏移 ${formatLyricsSourceOffset(sourceOffsetMs(source))}`"
              >
                <span class="lyrics-source-manager__row-tier">
                  {{ sourceTierLabel(source) }}
                </span>
                <span class="lyrics-source-manager__row-offset">
                  {{ formatLyricsSourceOffset(sourceOffsetMs(source)) }}
                </span>
              </span>
              <div class="lyrics-source-manager__row-actions">
                <UiButton
                  :icon="Pencil"
                  title="編輯標籤"
                  aria-label="編輯標籤"
                  @click="startEdit(source)"
                />
                <UiButton
                  :icon="Trash2"
                  title="刪除這個歌詞來源"
                  aria-label="刪除這個歌詞來源"
                  @click="handleDelete(source)"
                />
              </div>
            </template>
          </li>
        </ul>

        <LyricsManualImportPanel
          v-if="isManualImportOpen"
          class="lyrics-source-manager__manual-import"
          @cancel="isManualImportOpen = false"
          @saved="isManualImportOpen = false"
        />
      </section>

      <section aria-labelledby="lyrics-source-manager-online-title">
        <div class="lyrics-source-manager__section-header">
          <h3
            id="lyrics-source-manager-online-title"
            class="lyrics-source-manager__section-title"
          >
            線上搜尋
          </h3>
        </div>
        <div class="lyrics-source-manager__online-list">
          <LyricsLrclibSearchPanel
            ref="allProvidersPanelRef"
            provider-id="all"
            provider-label="所有線上來源"
            primary
            @open-search="openProviderSearch('all')"
          />
          <LyricsLrclibSearchPanel
            ref="neteasePanelRef"
            provider-id="netease"
            provider-label="網易雲音樂"
            @open-search="openProviderSearch('netease')"
          />
          <LyricsLrclibSearchPanel
            ref="lrclibPanelRef"
            @open-search="openProviderSearch('lrclib')"
          />
          <LyricsLrclibSearchPanel
            ref="betterLyricsPanelRef"
            provider-id="betterlyrics"
            provider-label="Better Lyrics"
            @open-search="openProviderSearch('betterlyrics')"
          />
        </div>
      </section>
    </div>
  </UiModal>
</template>

<style scoped>
.lyrics-source-manager {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.lyrics-source-manager__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-2);
}

.lyrics-source-manager__section-title {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
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
  --ui-lyrics-source-meta-width: 6rem;

  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
}

.lyrics-source-manager__row-label {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--ui-space-2);
  min-width: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.lyrics-source-manager__row-meta {
  display: grid;
  grid-template-columns: var(--ui-space-5) minmax(0, 1fr);
  align-items: stretch;
  column-gap: 0;
  flex: 0 0 var(--ui-lyrics-source-meta-width);
  width: var(--ui-lyrics-source-meta-width);
  box-sizing: border-box;
  font-size: var(--ui-font-size-sm);
  white-space: nowrap;
}

.lyrics-source-manager__row-tier {
  display: flex;
  min-width: 0;
  align-items: center;
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-weight: var(--ui-font-weight-strong);
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

.lyrics-source-manager__input {
  min-width: 0;
  flex: 1;
  height: var(--ui-control-height);
  padding: 0 var(--ui-space-2);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-surface);
  color: var(--ui-color-text);
  font-family: var(--ui-font-family-base);
  font-size: var(--ui-font-size-sm);
}

.lyrics-source-manager__input:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.lyrics-source-manager__manual-import {
  margin-top: var(--ui-space-3);
}

.lyrics-source-manager__online-list {
  padding: 0 var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-canvas);
}
</style>

<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { Pencil, Plus, Trash2 } from '../../icons/index.js';
import { useLyrics } from '../../composables/useLyrics.js';
import { formatLyricsSourceLabel } from '../../utils/lyrics.js';
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
const lrclibPanelRef = ref(null);
const isManualImportOpen = ref(false);
const editingFilename = ref(null);
const labelDraft = ref('');
const modalTitle = computed(() =>
  activeView.value === 'lrclib' ? '搜尋 LRCLIB 歌詞' : '管理歌詞來源',
);

watch(
  () => props.open,
  (open) => {
    if (!open) activeView.value = 'sources';
  },
);

function openLrclibSearch() {
  activeView.value = 'lrclib';
}

async function returnToSources() {
  activeView.value = 'sources';
  await nextTick();
  lrclibPanelRef.value?.focusSearchTrigger();
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
</script>

<template>
  <UiModal
    :open="open"
    :title="modalTitle"
    size="wide"
    @close="handleModalClose"
  >
    <LyricsLrclibSearchWorkspace
      v-if="activeView === 'lrclib'"
      @back="returnToSources"
    />
    <div v-else class="lyrics-source-manager">
      <section aria-labelledby="lyrics-source-manager-current-title">
        <div class="lyrics-source-manager__section-header">
          <h3 id="lyrics-source-manager-current-title">目前的來源</h3>
        </div>

        <UiHint v-if="selectedLyrics.sources.length === 0" padded>
          這個曲目還沒有任何歌詞來源。
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

        <div class="lyrics-source-manager__add-source">
          <UiButton
            v-if="!isManualImportOpen"
            :icon="Plus"
            title="手動匯入歌詞"
            @click="isManualImportOpen = true"
          >
            手動匯入
          </UiButton>
          <LyricsManualImportPanel
            v-else
            @cancel="isManualImportOpen = false"
            @saved="isManualImportOpen = false"
          />
        </div>
      </section>

      <LyricsLrclibSearchPanel
        ref="lrclibPanelRef"
        @open-search="openLrclibSearch"
      />
    </div>
  </UiModal>
</template>

<style scoped>
.lyrics-source-manager {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-4);
}

.lyrics-source-manager__section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
  margin-bottom: var(--ui-space-2);
}

.lyrics-source-manager__section-header h3 {
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-2);
  padding: var(--ui-space-2) var(--ui-space-3);
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius);
  background: var(--ui-color-canvas);
}

.lyrics-source-manager__row-label {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
  min-width: 0;
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  text-overflow: ellipsis;
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

.lyrics-source-manager__add-source {
  margin-top: var(--ui-space-3);
}
</style>

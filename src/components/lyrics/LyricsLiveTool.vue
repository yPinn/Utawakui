<script setup>
import LyricsDocumentPanel from './LyricsDocumentPanel.vue';
import LyricsLiveControls from './LyricsLiveControls.vue';
import '../../styles/features/lyrics.css';

defineProps({
  experimentalFrame: { type: Object, default: null },
  documentId: { type: String, default: '' },
  error: { type: String, default: '' },
  isLoading: { type: Boolean, default: false },
  isLoadingLyrics: { type: Boolean, default: false },
  trackCount: { type: Number, default: 0 },
  hasSelectedTrack: { type: Boolean, default: false },
  selectionHint: { type: String, default: '請先選擇曲目。' },
  uncheckedHint: { type: String, default: '尚未檢查歌詞。' },
  lyricsStatus: { type: String, default: 'unchecked' },
  hasSelectedSource: { type: Boolean, default: false },
  lines: { type: Array, default: () => [] },
  activeLineIndex: { type: Number, default: -1 },
  positionedLineIndex: { type: Number, default: null },
  fontSizeClass: { type: String, default: '' },
  showsReadingAid: { type: Boolean, default: false },
  readingVariant: { type: String, default: 'off' },
  readingLines: { type: Array, default: () => [] },
  hasReadingDocument: { type: Boolean, default: false },
  editingReadingLineIndex: { type: Number, default: null },
  readingLineDraft: { type: String, default: '' },
  isSavingReading: { type: Boolean, default: false },
  lyricsScript: { type: String, default: 'unknown' },
  canEditTiming: { type: Boolean, default: false },
  editableTimingLineIds: { type: Array, default: null },
  vocalRoles: { type: Object, default: () => ({}) },
  isPaintingVocals: { type: Boolean, default: false },
  vocalSectionLineIds: { type: Array, default: () => [] },
  offsetLabel: { type: String, required: true },
  canResetOffset: { type: Boolean, default: false },
  offsetError: { type: String, default: '' },
  allowAuthoringActions: { type: Boolean, default: false },
  presentation: { type: String, default: 'list' },
});

const emit = defineEmits([
  'seekLine',
  'editTiming',
  'startReadingEdit',
  'updateReadingDraft',
  'commitReadingEdit',
  'cancelReadingEdit',
  'paintLine',
  'adjustOffset',
  'resetOffset',
  'retryOffset',
]);
</script>

<template>
  <section class="lyrics-live-tool" aria-label="演唱歌詞工具">
    <LyricsDocumentPanel
      :experimental-frame="experimentalFrame"
      :document-id="documentId"
      :error="error"
      :is-loading="isLoading"
      :is-loading-lyrics="isLoadingLyrics"
      :track-count="trackCount"
      :has-selected-track="hasSelectedTrack"
      :selection-hint="selectionHint"
      :unchecked-hint="uncheckedHint"
      :lyrics-status="lyricsStatus"
      :has-selected-source="hasSelectedSource"
      :lines="lines"
      :active-line-index="activeLineIndex"
      :positioned-line-index="positionedLineIndex"
      :font-size-class="fontSizeClass"
      :shows-reading-aid="showsReadingAid"
      :reading-variant="readingVariant"
      :reading-lines="readingLines"
      :has-reading-document="allowAuthoringActions && hasReadingDocument"
      :editing-reading-line-index="
        allowAuthoringActions ? editingReadingLineIndex : null
      "
      :reading-line-draft="readingLineDraft"
      :is-saving-reading="isSavingReading"
      :lyrics-script="lyricsScript"
      :can-edit-timing="allowAuthoringActions && canEditTiming"
      :editable-timing-line-ids="editableTimingLineIds"
      :presentation="presentation"
      :vocal-roles="vocalRoles"
      :is-painting-vocals="allowAuthoringActions && isPaintingVocals"
      :vocal-section-line-ids="vocalSectionLineIds"
      @seek-line="emit('seekLine', $event)"
      @edit-timing="emit('editTiming', $event)"
      @start-reading-edit="emit('startReadingEdit', $event)"
      @update-reading-draft="emit('updateReadingDraft', $event)"
      @commit-reading-edit="emit('commitReadingEdit', $event)"
      @cancel-reading-edit="emit('cancelReadingEdit')"
      @paint-line="(lineId, extend) => emit('paintLine', lineId, extend)"
    />

    <LyricsLiveControls
      :offset-label="offsetLabel"
      :can-reset="canResetOffset"
      :error="offsetError"
      @adjust-offset="emit('adjustOffset', $event)"
      @reset-offset="emit('resetOffset')"
      @retry-offset="emit('retryOffset')"
    />
  </section>
</template>

<style scoped>
.lyrics-live-tool {
  position: relative;
  display: grid;
  grid-template-rows: minmax(0, 1fr);
  min-width: 0;
  min-height: 0;
}
</style>

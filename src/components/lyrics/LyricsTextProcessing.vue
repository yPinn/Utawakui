<script setup>
import { useId } from 'vue';
import { useLyrics } from '../../composables/useLyrics.js';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiButton from '../ui/UiButton.vue';
import { t } from '../../utils/i18n.js';

const { lyricsTextProcessing, selectedSource, state } = useLyrics();
const { candidates, hiddenLineIds, setHidden, restore } = lyricsTextProcessing;
const id = useId();
function candidateLabel(line) {
  const action = line.outputLabelRanges?.length
    ? t('lyricsEditor.textProcessing.part')
    : t('lyricsEditor.textProcessing.line');
  return t('lyricsEditor.textProcessing.candidate', {
    line: line.sourceLineIndex + 1,
    action,
    text: line.text,
  });
}
</script>

<template>
  <UiDisclosure
    v-if="selectedSource"
    class="lyrics-text-processing"
    :label="t('lyricsEditor.textProcessing.title')"
  >
    <div class="lyrics-text-processing__body">
      <UiHint>{{ t('lyricsEditor.textProcessing.hint') }}</UiHint>
      <UiHint v-if="!candidates.length">{{
        t('lyricsEditor.textProcessing.empty')
      }}</UiHint>
      <UiCheckbox
        v-for="(line, index) in candidates"
        :id="`${id}-credit-${index}`"
        :key="line.lineId"
        :label="candidateLabel(line)"
        :model-value="hiddenLineIds.includes(line.lineId)"
        :disabled="state.isLoadingLyrics"
        @update:model-value="setHidden(line.lineId, $event)"
      />
      <div v-if="hiddenLineIds.length" class="lyrics-text-processing__actions">
        <UiButton variant="accent" @click="restore">{{
          t('lyricsEditor.textProcessing.restore')
        }}</UiButton>
      </div>
    </div>
  </UiDisclosure>
</template>

<style scoped>
.lyrics-text-processing__body {
  display: grid;
  gap: var(--ui-space-2);
  min-width: 0;
  overflow-wrap: anywhere;
}
.lyrics-text-processing__actions {
  display: flex;
  justify-content: flex-end;
}
</style>

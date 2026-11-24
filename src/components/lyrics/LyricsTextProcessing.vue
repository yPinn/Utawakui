<script setup>
import { useId } from 'vue';
import { useLyrics } from '../../composables/useLyrics.js';
import { LYRICS_REPEAT_MODES } from '../../../shared/presentation/lyricsTextProcessing.mjs';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiButton from '../ui/UiButton.vue';
import UiSelect from '../ui/UiSelect.vue';
import { t } from '../../utils/i18n.js';

const { lyricsTextProcessing, selectedSource, state } = useLyrics();
const {
  candidates,
  hiddenLineIds,
  setHidden,
  restore,
  repeatCandidates,
  repeatModes,
  setRepeatMode,
} = lyricsTextProcessing;
const id = useId();
const repeatOptions = ['auto', ...LYRICS_REPEAT_MODES].map((value) => ({
  value,
  label: t(`lyricsEditor.textProcessing.repeat.${value}`),
}));
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
      <UiDisclosure
        v-if="repeatCandidates?.length"
        :label="t('lyricsEditor.textProcessing.repeat.title')"
      >
        <div class="lyrics-text-processing__body">
          <UiHint>{{ t('lyricsEditor.textProcessing.repeat.hint') }}</UiHint>
          <UiSelect
            v-for="line in repeatCandidates"
            :id="`${id}-repeat-${line.index}`"
            :key="line.lineId"
            :label="
              t('lyricsEditor.textProcessing.repeat.line', {
                line: line.index + 1,
                text: line.text,
              })
            "
            :options="repeatOptions"
            :model-value="repeatModes.get(line.lineId) ?? 'auto'"
            :disabled="state.isLoadingLyrics"
            @update:model-value="setRepeatMode(line.lineId, $event)"
          />
        </div>
      </UiDisclosure>
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

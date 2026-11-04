<script setup>
import { computed } from 'vue';
import { summarizeAcousticPreview } from '../../../shared/presentation/lyricsAcousticPreview.mjs';
import UiButton from '../ui/UiButton.vue';
import { useLyrics } from '../../composables/useLyrics.js';
import { t } from '../../utils/i18n.js';
const experiment = useLyrics().experimentalLyrics;
const summary = computed(() =>
  summarizeAcousticPreview(experiment?.prepared.value),
);
const props = defineProps({ disabled: { type: Boolean, default: false } });
const blocked = computed(
  () => props.disabled || experiment?.prepared.value.status !== 'ready',
);
const description = computed(() => {
  if (!experiment) return '';
  const join = t('common.sentenceJoin');
  const fineLines = summary.value.fineLines;
  const status = experiment.needsReanalysis.value
    ? t('lyricsEditor.experiment.reanalyze')
    : experiment.prepared.value.status === 'ready'
      ? [
          experiment.applied.value
            ? t('lyricsEditor.experiment.turnOff')
            : t('lyricsEditor.experiment.turnOn'),
          [
            fineLines
              ? t(
                  'lyricsEditor.experiment.fineLines',
                  { count: fineLines },
                  fineLines,
                )
              : t('lyricsEditor.experiment.hintsOnly'),
            experiment.estimate.value.compatibility?.rule ===
            'normalizer-v2-v3-exact-v1'
              ? t('lyricsEditor.experiment.reused')
              : '',
          ]
            .filter(Boolean)
            .join(' · '),
        ].join(join)
      : t('lyricsEditor.experiment.unavailable');
  return [
    t('lyricsEditor.experiment.intro'),
    status,
    props.disabled ? t('lyricsEditor.experiment.finishEditing') : '',
  ]
    .filter(Boolean)
    .join(join);
});
function toggleApplied() {
  if (!blocked.value) experiment.setApplied(!experiment.applied.value);
}
</script>

<template>
  <UiButton
    v-if="
      experiment &&
      (experiment.needsReanalysis.value ||
        experiment.estimate.value.status !== 'missing') &&
      experiment.estimate.value.status !== 'disabled'
    "
    :active="experiment.applied.value"
    :aria-pressed="experiment.applied.value"
    :aria-disabled="blocked"
    :aria-description="description"
    :title="description"
    @click="toggleApplied"
  >
    {{ t('lyricsEditor.experiment.button') }}
  </UiButton>
</template>

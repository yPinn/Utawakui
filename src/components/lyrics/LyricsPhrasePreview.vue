<script setup>
import { computed, shallowRef, useId, watch } from 'vue';
import { planLyricsPhrases } from '../../../shared/presentation/lyricsPhraseBreaks.mjs';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiSelect from '../ui/UiSelect.vue';

const props = defineProps({
  document: { type: Object, default: null },
  positionMs: { type: Number, default: null },
});
const open = shallowRef(false),
  selected = shallowRef('');
const selectId = `lyrics-phrase-preview-${useId()}`;
const candidates = computed(() => {
  const result = [];
  for (const [index, line] of (props.document?.lines ?? []).entries()) {
    const plan = planLyricsPhrases(line);
    if (plan.status === 'unchanged') continue;
    result.push({ value: String(index), label: line.text, line, plan });
    if (result.length >= 20) break;
  }
  return result;
});
const candidate = computed(
  () =>
    candidates.value.find((c) => c.value === selected.value) ??
    candidates.value[0],
);
const selection = computed({
  get: () => candidate.value?.value ?? '',
  set: (value) => {
    selected.value = value;
  },
});
const activeIndex = computed(() => {
  if (
    candidate.value?.plan.status !== 'ready' ||
    !Number.isFinite(props.positionMs)
  )
    return -1;
  return candidate.value.plan.phrases.findIndex(
    (p) => props.positionMs >= p.startMs && props.positionMs < p.endMs,
  );
});
const active = computed(() => candidate.value?.plan.phrases[activeIndex.value]);
watch(
  () => props.document,
  () => {
    open.value = false;
    selected.value = '';
  },
);
</script>

<template>
  <UiDisclosure
    v-if="candidates.length"
    v-model:open="open"
    label="長句分段預覽（實驗性）"
  >
    <div v-if="open" class="lyrics-phrase-preview">
      <UiSelect
        v-if="candidates.length > 1"
        :id="selectId"
        v-model="selection"
        label="預覽句子（最多 20 句）"
        :options="candidates"
      />
      <template v-if="candidate.plan.status === 'ready'">
        <UiHint
          >{{ candidate.plan.timingSource === 't2' ? '來源 T2' : '已套用 T1+' }}
          ·
          {{
            active ? `第 ${activeIndex + 1} / 2 段` : '播放此句時切換'
          }}</UiHint
        >
        <p class="lyrics-phrase-preview__text">
          {{ active?.text ?? candidate.plan.phrases[0].text }}
        </p>
        <UiHint>Kinetic Pop 依既有起點切換；文字分段仍待確認。</UiHint>
      </template>
      <template v-else>
        <UiHint>缺少精確切換時間，維持整句；以下僅為文字候選。</UiHint>
        <ol class="lyrics-phrase-preview__candidates">
          <li
            v-for="phrase in candidate.plan.phrases"
            :key="phrase.sourceStart"
          >
            {{ phrase.text }}
          </li>
        </ol>
      </template>
    </div>
  </UiDisclosure>
</template>

<style scoped>
.lyrics-phrase-preview {
  display: grid;
  gap: var(--ui-space-2);
  min-inline-size: 0;
}
.lyrics-phrase-preview__text {
  margin: 0;
  font-size: var(--ui-font-size-lg);
  color: var(--ui-color-text);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
.lyrics-phrase-preview__candidates {
  margin: 0;
  padding-inline-start: var(--ui-space-5);
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}
</style>

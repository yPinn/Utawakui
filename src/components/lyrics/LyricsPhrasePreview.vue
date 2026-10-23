<script setup>
import { computed, shallowRef, useId, watch } from 'vue';
import { planLyricsDisplay } from '../../../shared/presentation/lyricsDisplayLayout.mjs';
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
    if (typeof line?.text !== 'string' || line.text.length <= 36) continue;
    // This source inspector shows grouping examples; the actual template uses
    // its measured content box, not this nominal preview capacity.
    const plan = planLyricsDisplay(line, { fits: (text) => text.length <= 36 });
    if (plan.pages.length <= 1) continue;
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
  return candidate.value.plan.pages.findIndex(
    (p) => props.positionMs >= p.startMs && props.positionMs < p.endMs,
  );
});
const active = computed(() => candidate.value?.plan.pages[activeIndex.value]);
watch(
  () => props.document,
  () => {
    open.value = false;
    selected.value = '';
  },
);
</script>

<template>
  <UiDisclosure v-if="candidates.length" v-model:open="open" label="長句預覽">
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
          >{{
            candidate.plan.pageTiming === 't2'
              ? '來源 T2'
              : candidate.plan.pageTiming === 'model-starts'
                ? '已套用 T1+'
                : '顯示時間估計'
          }}
          ·
          {{
            active
              ? `第 ${activeIndex + 1} / ${candidate.plan.pages.length} 段`
              : '播放此句時切換'
          }}</UiHint
        >
        <p class="lyrics-phrase-preview__text">
          {{ active?.text ?? candidate.plan.pages[0].text }}
        </p>
        <UiHint>僅示意換行與分頁，實際顯示依模板尺寸調整。</UiHint>
      </template>
      <template v-else>
        <UiHint>目前沒有可用的分頁時間；以下僅為文字分組。</UiHint>
        <ol class="lyrics-phrase-preview__candidates">
          <li v-for="phrase in candidate.plan.pages" :key="phrase.sourceStart">
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

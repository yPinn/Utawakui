<script setup>
import { computed, shallowRef } from 'vue';
import { Info } from '../../icons/index.js';
import UiChip from '../ui/UiChip.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiNotice from '../ui/UiNotice.vue';

const props = defineProps({
  result: { type: Object, default: null },
});
const showSourceDetails = shallowRef(false);

const ROLE_LABELS = Object.freeze({
  intro: '前奏',
  verse: '主歌',
  'pre-chorus': '預副歌',
  chorus: '副歌',
  bridge: '橋段',
  instrumental: '間奏',
  outro: '尾奏',
  unknown: '未分類',
});

const LEVEL_LABELS = Object.freeze({
  M0: '尚無結果',
  M1: '節拍',
  M2: '段落',
});

const REASON_COPY = Object.freeze({
  missing: {
    title: '尚無分析結果',
    message: '安裝分析功能後，可從上方開始分析。',
  },
  invalid: {
    title: '分析結果無法使用',
    message: '資料未通過檢查，暫不顯示節拍或段落。請重新分析。',
  },
  stale: {
    title: '分析結果需要更新',
    message: '歌曲音訊已變更，請重新分析。',
  },
  'unavailable-source': {
    title: '來源音訊無法使用',
    message: '找不到可讀取的歌曲音訊，請確認檔案仍存在。',
  },
  'no-signal': {
    title: '未找到節拍或段落',
    message: '這次分析沒有找到足夠資訊；可重新分析或改用其他音訊。',
  },
});

const signals = computed(() => props.result?.signals ?? null);
const downbeatCount = computed(
  () => signals.value?.beats?.filter((beat) => beat.downbeat).length ?? 0,
);
const fallbackCopy = computed(
  () =>
    REASON_COPY[signals.value?.reason] ?? {
      title: '尚無音樂結構分析結果',
      message: '選擇曲目後即可查看分析結果。',
    },
);
const SECTION_EMPTY_COPY = Object.freeze({
  missing: '已找到節拍，尚未辨識出段落。',
  'low-confidence': '段落信心不足，目前只顯示節拍。',
  incomplete: '段落未涵蓋完整歌曲，目前只顯示節拍。',
  unknown: '部分段落仍無法分類，目前只顯示節拍。',
});
const sectionEmptyCopy = computed(
  () =>
    SECTION_EMPTY_COPY[signals.value?.sectionStatus] ??
    SECTION_EMPTY_COPY.missing,
);
const sourceRevision = computed(() =>
  props.result?.sourceRevision ? props.result.sourceRevision.slice(0, 12) : '—',
);
const bpmFormatter = new Intl.NumberFormat('zh-TW', {
  maximumFractionDigits: 1,
});

function formatConfidence(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
}

function formatEstimatedBpm(value) {
  return Number.isFinite(value) ? `約 ${bpmFormatter.format(value)} BPM` : '—';
}

function formatTime(milliseconds) {
  if (!Number.isFinite(milliseconds)) return '—';
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

function sectionLabel(role) {
  return ROLE_LABELS[role] ?? role;
}
</script>

<template>
  <section
    class="structure-summary"
    aria-labelledby="structure-summary-heading"
  >
    <div class="structure-summary__heading-row">
      <h2 id="structure-summary-heading" class="structure-summary__heading">
        分析結果
      </h2>
      <div class="structure-summary__heading-actions">
        <UiIconButton
          v-if="result"
          :icon="Info"
          label="查看來源資訊"
          title="查看分析版本與音訊長度"
          :aria-expanded="showSourceDetails"
          @click="showSourceDetails = !showSourceDetails"
        />
        <UiChip
          v-if="signals"
          :tone="signals.level === 'M0' ? 'muted' : 'success'"
        >
          {{ LEVEL_LABELS[signals.level] ?? '結果' }}
        </UiChip>
      </div>
    </div>

    <p v-if="showSourceDetails" class="structure-summary__source">
      分析版本 {{ sourceRevision }} · 音訊長度
      {{ formatTime(result?.sourceDurationMs) }}
    </p>

    <UiNotice
      v-if="!signals || signals.level === 'M0'"
      tone="muted"
      :title="fallbackCopy.title"
      :message="fallbackCopy.message"
    />

    <template v-else>
      <dl class="structure-summary__metrics">
        <div class="structure-summary__metric structure-summary__metric--tempo">
          <dt>估算速度</dt>
          <dd>
            <span class="structure-summary__tempo-value">
              {{ formatEstimatedBpm(signals.tempo?.bpm) }}
            </span>
            <span v-if="signals.tempo" class="structure-summary__confidence">
              節拍信心 {{ formatConfidence(signals.tempo.confidence) }}
            </span>
          </dd>
        </div>
        <div class="structure-summary__counts">
          <div class="structure-summary__metric">
            <dt>節拍</dt>
            <dd>{{ signals.beats.length }}</dd>
          </div>
          <div class="structure-summary__metric">
            <dt>強拍</dt>
            <dd>{{ downbeatCount }}</dd>
          </div>
          <div class="structure-summary__metric">
            <dt>段落</dt>
            <dd>{{ signals.sections.length }}</dd>
          </div>
        </div>
      </dl>

      <div class="structure-summary__sections">
        <h3 class="structure-summary__subheading">段落</h3>
        <p
          v-if="signals.sections.length === 0"
          class="structure-summary__empty"
        >
          {{ sectionEmptyCopy }}
        </p>
        <ol v-else class="structure-summary__section-list">
          <li
            v-for="section in signals.sections"
            :key="section.sectionId"
            class="structure-summary__section"
          >
            <span class="structure-summary__section-role">
              {{ sectionLabel(section.role) }}
            </span>
            <span class="structure-summary__section-time">
              {{ formatTime(section.startMs) }}–{{ formatTime(section.endMs) }}
            </span>
            <span class="structure-summary__section-confidence">
              {{ formatConfidence(section.confidence) }}
            </span>
          </li>
        </ol>
      </div>
    </template>
  </section>
</template>

<style scoped>
.structure-summary {
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.structure-summary__heading-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--ui-space-3);
}

.structure-summary__heading-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}

.structure-summary__heading,
.structure-summary__source,
.structure-summary__subheading,
.structure-summary__empty {
  margin: 0;
}

.structure-summary__heading,
.structure-summary__subheading {
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  line-height: var(--ui-line-height-title);
}

.structure-summary__source,
.structure-summary__empty {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-caption);
}

.structure-summary__source,
.structure-summary__section-time,
.structure-summary__section-confidence {
  font-variant-numeric: tabular-nums;
}

.structure-summary__metrics {
  display: grid;
  grid-template-columns: minmax(12rem, 1.5fr) minmax(15rem, 2fr);
  margin: 0;
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.structure-summary__metric {
  display: grid;
  gap: var(--ui-space-1);
  padding: var(--ui-space-3);
}

.structure-summary__metric--tempo {
  border-inline-end: var(--ui-border-width) solid var(--ui-color-border);
}

.structure-summary__counts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.structure-summary__counts
  .structure-summary__metric
  + .structure-summary__metric {
  border-inline-start: var(--ui-border-width) solid var(--ui-color-border);
}

.structure-summary__metric dt {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-strong);
}

.structure-summary__metric dd {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-lg);
  font-weight: var(--ui-font-weight-strong);
  font-variant-numeric: tabular-nums;
}

.structure-summary__metric--tempo dd {
  display: flex;
  align-items: flex-start;
  flex-direction: column;
  gap: var(--ui-space-1);
}

.structure-summary__tempo-value {
  font-size: var(--ui-font-size-xl);
  line-height: var(--ui-line-height-headline);
}

.structure-summary__confidence {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
  font-weight: var(--ui-font-weight-regular);
}

.structure-summary__sections {
  display: grid;
  gap: var(--ui-space-2);
}

.structure-summary__section-list {
  display: flex;
  flex-direction: column;
  margin: 0;
  padding: 0;
  list-style: none;
}

.structure-summary__section {
  display: grid;
  grid-template-columns: minmax(8rem, 1fr) auto 3.5rem;
  gap: var(--ui-space-3);
  align-items: center;
  min-height: var(--ui-menu-item-height);
  border-bottom: var(--ui-border-width) solid var(--ui-color-border);
  color: var(--ui-color-text-muted);
  font-size: var(--ui-font-size-sm);
}

.structure-summary__section-role {
  color: var(--ui-color-text);
  font-weight: var(--ui-font-weight-strong);
}

.structure-summary__section-confidence {
  text-align: end;
}

@media (max-width: 620px) {
  .structure-summary__metrics {
    grid-template-columns: 1fr;
  }

  .structure-summary__metric--tempo {
    border-inline-end: 0;
    border-block-end: var(--ui-border-width) solid var(--ui-color-border);
  }

  .structure-summary__section {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .structure-summary__section-confidence {
    display: none;
  }
}
</style>

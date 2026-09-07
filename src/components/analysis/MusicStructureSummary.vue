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

const REASON_COPY = Object.freeze({
  missing: {
    title: '尚未找到 analysis sidecar',
    message: '目前以 M0 fallback 呈現；可在 activation 就緒後從上方開始分析。',
  },
  invalid: {
    title: 'Analysis sidecar 無效',
    message: '資料未通過契約驗證，因此安全降級為 M0 fallback。',
  },
  stale: {
    title: 'Analysis sidecar 已過期',
    message: '來源音訊與 sidecar 不一致，因此安全降級為 M0 fallback。',
  },
  'unavailable-source': {
    title: '來源音訊無法使用',
    message: '找不到可驗證的本機音訊，因此維持 M0 fallback。',
  },
  'no-signal': {
    title: '分析沒有產生可用訊號',
    message: 'Sidecar 有效，但沒有節拍或段落證據，因此維持 M0 fallback。',
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
      message: '選擇曲目後可讀取既有 sidecar。',
    },
);
const SECTION_EMPTY_COPY = Object.freeze({
  missing: '此 sidecar 只有 M1 節拍資料，尚無段落。',
  'low-confidence': '段落信心不足，已安全保留 M1 節拍結果。',
  incomplete: '段落沒有完整連續覆蓋曲長，已安全保留 M1 節拍結果。',
  unknown: '段落語意尚未完整辨識，已安全保留 M1 節拍結果。',
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
          title="查看 sidecar 來源版本與音訊長度"
          :aria-expanded="showSourceDetails"
          @click="showSourceDetails = !showSourceDetails"
        />
        <UiChip
          v-if="signals"
          :tone="signals.level === 'M0' ? 'muted' : 'success'"
        >
          {{ signals.level }}
        </UiChip>
      </div>
    </div>

    <p v-if="showSourceDetails" class="structure-summary__source">
      Sidecar 來源 {{ sourceRevision }} · 音訊長度
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

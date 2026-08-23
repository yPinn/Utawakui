<script setup>
import { computed } from 'vue';
import UiChip from '../ui/UiChip.vue';
import UiNotice from '../ui/UiNotice.vue';

const props = defineProps({
  result: { type: Object, default: null },
});

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
    title: '分析沒有產生可用 signal',
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
      title: '尚無 Music Structure 結果',
      message: '選擇曲目後可讀取既有 sidecar。',
    },
);
const sourceRevision = computed(() =>
  props.result?.sourceRevision ? props.result.sourceRevision.slice(0, 12) : '—',
);

function formatConfidence(value) {
  return Number.isFinite(value) ? `${Math.round(value * 100)}%` : '—';
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
      <div>
        <h2 id="structure-summary-heading" class="structure-summary__heading">
          Sidecar result
        </h2>
        <p class="structure-summary__source">
          Source {{ sourceRevision }} ·
          {{ formatTime(result?.sourceDurationMs) }}
        </p>
      </div>
      <UiChip
        v-if="signals"
        :tone="signals.level === 'M0' ? 'muted' : 'success'"
      >
        {{ signals.level }}
      </UiChip>
    </div>

    <UiNotice
      v-if="!signals || signals.level === 'M0'"
      tone="muted"
      :title="fallbackCopy.title"
      :message="fallbackCopy.message"
    />

    <template v-else>
      <dl class="structure-summary__metrics">
        <div class="structure-summary__metric">
          <dt>Tempo</dt>
          <dd>
            {{ signals.tempo ? `${signals.tempo.bpm} BPM` : '—' }}
            <span>{{ formatConfidence(signals.tempo?.confidence) }}</span>
          </dd>
        </div>
        <div class="structure-summary__metric">
          <dt>Beats</dt>
          <dd>{{ signals.beats.length }}</dd>
        </div>
        <div class="structure-summary__metric">
          <dt>Downbeats</dt>
          <dd>{{ downbeatCount }}</dd>
        </div>
        <div class="structure-summary__metric">
          <dt>Sections</dt>
          <dd>{{ signals.sections.length }}</dd>
        </div>
      </dl>

      <div class="structure-summary__sections">
        <h3 class="structure-summary__subheading">Sections</h3>
        <p
          v-if="signals.sections.length === 0"
          class="structure-summary__empty"
        >
          此 sidecar 只有 M1 節拍資料，尚無段落。
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
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--ui-space-3);
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
  display: flex;
  flex-wrap: wrap;
  margin: 0;
  border-block: var(--ui-border-width) solid var(--ui-color-border);
}

.structure-summary__metric {
  min-width: 8rem;
  flex: 1 1 8rem;
  display: grid;
  gap: var(--ui-space-1);
  padding: var(--ui-space-3);
}

.structure-summary__metric + .structure-summary__metric {
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

.structure-summary__metric dd span {
  margin-inline-start: var(--ui-space-1);
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
  .structure-summary__metric + .structure-summary__metric {
    border-inline-start: 0;
  }

  .structure-summary__section {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .structure-summary__section-confidence {
    display: none;
  }
}
</style>

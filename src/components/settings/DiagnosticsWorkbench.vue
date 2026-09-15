<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useDiagnosticsWorkbench } from '../../composables/useDiagnosticsWorkbench.js';
import { RefreshCw } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiChip from '../ui/UiChip.vue';
import UiHint from '../ui/UiHint.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiStack from '../ui/UiStack.vue';

const LEVELS = ['error', 'warning', 'info', 'debug'];
const LEVEL_LABELS = {
  error: '錯誤',
  warning: '警告',
  info: '資訊',
  debug: '除錯',
};
const LEVEL_TONES = {
  error: 'danger',
  warning: 'warning',
  info: 'info',
  debug: 'muted',
};

const workbench = useDiagnosticsWorkbench();
const query = ref('');
const activeLevels = reactive({
  error: true,
  warning: true,
  info: true,
  debug: true,
});

const levelCounts = computed(() => {
  const counts = { error: 0, warning: 0, info: 0, debug: 0 };
  for (const event of workbench.state.events) {
    if (Object.hasOwn(counts, event.level)) counts[event.level] += 1;
  }
  return counts;
});

const filteredEvents = computed(() => {
  const needle = query.value.trim().toLowerCase();
  return workbench.state.events.filter((event) => {
    if (!activeLevels[event.level]) return false;
    if (!needle) return true;
    return [event.source, event.operation, event.code, event.message]
      .filter((field) => typeof field === 'string')
      .some((field) => field.toLowerCase().includes(needle));
  });
});

onMounted(workbench.refresh);
</script>

<template>
  <UiStack class="diagnostics-workbench" direction="column" gap="4">
    <UiPageHeader title="診斷工作台">
      <template #description>
        檢視執行期間記錄的診斷訊息，可依等級與關鍵字篩選。
      </template>
      <template #actions>
        <UiButton
          :icon="RefreshCw"
          :disabled="workbench.state.isLoading"
          @click="workbench.refresh"
        >
          重新讀取
        </UiButton>
        <UiChip tone="gated">內部工具 · F6</UiChip>
      </template>
    </UiPageHeader>

    <UiHint v-if="workbench.state.error" tone="warning" role="status">
      {{ workbench.state.error }}
    </UiHint>

    <UiStack
      class="diagnostics-workbench__summary"
      wrap
      gap="2"
      role="group"
      aria-label="依等級分組計數"
    >
      <UiChip v-for="level in LEVELS" :key="level" :tone="LEVEL_TONES[level]">
        {{ LEVEL_LABELS[level] }} {{ levelCounts[level] }}
      </UiChip>
    </UiStack>

    <UiStack class="diagnostics-workbench__filters" wrap align="center" gap="3">
      <UiSearchBox
        v-model="query"
        label="搜尋錯誤紀錄"
        placeholder="搜尋來源、操作、代碼或訊息"
      />
      <UiCheckbox
        v-for="level in LEVELS"
        :id="`diagnostics-workbench-level-${level}`"
        :key="level"
        v-model="activeLevels[level]"
        :label="LEVEL_LABELS[level]"
      />
    </UiStack>

    <ul class="diagnostics-workbench__list">
      <li
        v-for="event in filteredEvents"
        :key="event.id"
        class="diagnostics-workbench__row"
      >
        <details>
          <summary class="diagnostics-workbench__summary-row">
            <UiChip :tone="LEVEL_TONES[event.level] ?? 'muted'">
              {{ LEVEL_LABELS[event.level] ?? event.level }}
            </UiChip>
            <span class="diagnostics-workbench__timestamp">{{
              event.timestamp
            }}</span>
            <span class="diagnostics-workbench__origin"
              >{{ event.source }}／{{ event.operation }}</span
            >
            <span class="diagnostics-workbench__code">{{ event.code }}</span>
            <span class="diagnostics-workbench__message">{{
              event.message
            }}</span>
          </summary>
          <pre class="diagnostics-workbench__detail">{{
            JSON.stringify(event, null, 2)
          }}</pre>
        </details>
      </li>
    </ul>

    <p v-if="filteredEvents.length === 0" class="diagnostics-workbench__empty">
      沒有符合條件的紀錄
    </p>
  </UiStack>
</template>

<style scoped>
.diagnostics-workbench {
  height: 100%;
  min-height: 0;
}

.diagnostics-workbench :deep(.ui-page-header) {
  margin-bottom: 0;
}

.diagnostics-workbench__filters :deep(.ui-search-box) {
  flex: 1 1 16rem;
}

.diagnostics-workbench__list {
  min-height: 0;
  flex: 1;
  margin: 0;
  padding: 0;
  list-style: none;
  overflow-y: auto;
  border: var(--ui-border-width) solid var(--ui-color-border);
  border-radius: var(--ui-radius-lg);
  background: var(--ui-color-surface);
}

.diagnostics-workbench__row + .diagnostics-workbench__row {
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.diagnostics-workbench__row summary {
  cursor: pointer;
}

.diagnostics-workbench__row summary::-webkit-details-marker {
  display: none;
}

.diagnostics-workbench__summary-row {
  display: grid;
  grid-template-columns: max-content max-content max-content max-content 1fr;
  align-items: center;
  gap: var(--ui-space-3);
  padding: var(--ui-space-2) var(--ui-space-3);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
}

.diagnostics-workbench__row summary:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}

.diagnostics-workbench__timestamp,
.diagnostics-workbench__origin,
.diagnostics-workbench__code {
  color: var(--ui-color-text-muted);
  white-space: nowrap;
}

.diagnostics-workbench__message {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diagnostics-workbench__detail {
  margin: 0;
  padding: var(--ui-space-3);
  border-top: var(--ui-border-width) solid var(--ui-color-border);
  background: var(--ui-color-canvas);
  color: var(--ui-color-text);
  font-size: var(--ui-font-size-sm);
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}

.diagnostics-workbench__empty {
  margin: 0;
  padding: var(--ui-space-4);
  text-align: center;
  color: var(--ui-color-text-muted);
}
</style>

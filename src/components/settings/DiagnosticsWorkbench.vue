<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useDiagnosticsWorkbench } from '../../composables/useDiagnosticsWorkbench.js';
import { RefreshCw } from '../../icons/index.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiChip from '../ui/UiChip.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiPageHeader from '../ui/UiPageHeader.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiStack from '../ui/UiStack.vue';
import UiSurface from '../ui/UiSurface.vue';

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
  <UiStack class="diagnostics-workbench" direction="column" :gap="4">
    <UiPageHeader title="Live Diagnostics">
      <template #description>
        唯讀檢視最近 500 筆執行期事件，可依等級與關鍵字篩選。
      </template>
      <template #actions>
        <UiButton
          :icon="RefreshCw"
          :disabled="workbench.state.isLoading"
          @click="workbench.refresh"
        >
          重新讀取
        </UiButton>
        <UiChip tone="info">支援操作 · F6</UiChip>
      </template>
    </UiPageHeader>

    <UiHint v-if="workbench.state.error" tone="warning" role="status">
      {{ workbench.state.error }}
    </UiHint>

    <UiSurface
      class="diagnostics-workbench__panel"
      tag="section"
      radius="lg"
      aria-label="診斷事件"
    >
      <UiStack
        class="diagnostics-workbench__summary"
        wrap
        :gap="2"
        role="group"
        aria-label="依等級分組計數"
      >
        <UiChip v-for="level in LEVELS" :key="level" :tone="LEVEL_TONES[level]">
          {{ LEVEL_LABELS[level] }} {{ levelCounts[level] }}
        </UiChip>
      </UiStack>

      <UiStack
        class="diagnostics-workbench__filters"
        wrap
        align="center"
        :gap="3"
      >
        <UiSearchBox
          v-model="query"
          label="搜尋診斷事件"
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

      <UiSkeleton
        v-if="workbench.state.isLoading"
        class="diagnostics-workbench__loading"
        :lines="5"
        pattern="staggered"
        aria-label="正在讀取診斷事件"
      />

      <UiScrollRegion
        v-else
        class="diagnostics-workbench__list"
        axis="vertical"
        viewport-tag="ul"
        viewport-class="diagnostics-workbench__list-viewport"
      >
        <li
          v-for="event in filteredEvents"
          :key="event.id"
          class="diagnostics-workbench__row"
        >
          <UiDisclosure
            :label="`${event.code}：${event.message}`"
            class="diagnostics-workbench__disclosure"
          >
            <template #summary>
              <span class="diagnostics-workbench__summary-row">
                <UiChip :tone="LEVEL_TONES[event.level] ?? 'muted'">
                  {{ LEVEL_LABELS[event.level] ?? event.level }}
                </UiChip>
                <span class="diagnostics-workbench__timestamp">{{
                  event.timestamp
                }}</span>
                <span class="diagnostics-workbench__origin"
                  >{{ event.source }}／{{ event.operation }}</span
                >
                <span class="diagnostics-workbench__code">{{
                  event.code
                }}</span>
                <span class="diagnostics-workbench__message">{{
                  event.message
                }}</span>
              </span>
            </template>
            <pre class="diagnostics-workbench__detail">{{
              JSON.stringify(event, null, 2)
            }}</pre>
          </UiDisclosure>
        </li>
      </UiScrollRegion>

      <p
        v-if="!workbench.state.isLoading && filteredEvents.length === 0"
        class="diagnostics-workbench__empty"
      >
        沒有符合條件的紀錄
      </p>
    </UiSurface>
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

.diagnostics-workbench__panel {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
  padding: var(--ui-space-3);
  overflow: hidden;
}

.diagnostics-workbench__loading {
  padding: var(--ui-space-3);
}

.diagnostics-workbench__list {
  min-height: 0;
  flex: 1;
}

.diagnostics-workbench__list :deep(.diagnostics-workbench__list-viewport) {
  margin: 0;
  padding: 0;
  list-style: none;
}

.diagnostics-workbench__row + .diagnostics-workbench__row {
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

.diagnostics-workbench__disclosure {
  border-block: 0;
}

.diagnostics-workbench__summary-row {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: max-content max-content max-content max-content 1fr;
  align-items: center;
  gap: var(--ui-space-3);
  font-size: var(--ui-font-size-sm);
  line-height: var(--ui-line-height-label);
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

@media (max-width: 900px) {
  .diagnostics-workbench__summary-row {
    grid-template-columns: max-content max-content minmax(0, 1fr);
  }

  .diagnostics-workbench__timestamp,
  .diagnostics-workbench__origin {
    display: none;
  }
}
</style>

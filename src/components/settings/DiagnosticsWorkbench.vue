<script setup>
import {
  computed,
  onMounted,
  onUnmounted,
  reactive,
  ref,
  shallowRef,
} from 'vue';
import { useClipboardFeedback } from '../../composables/useClipboardFeedback.js';
import { useDiagnosticsWorkbench } from '../../composables/useDiagnosticsWorkbench.js';
import { Copy, FolderOpen, RefreshCw } from '../../icons/index.js';
import {
  formatRelativeTime,
  groupDiagnosticIssues,
  issueToMarkdown,
  issuesToMarkdown,
  sessionTrail,
} from '../../utils/diagnosticIssues.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiChip from '../ui/UiChip.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiScrollRegion from '../ui/UiScrollRegion.vue';
import UiSearchBox from '../ui/UiSearchBox.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiSkeleton from '../ui/UiSkeleton.vue';
import UiTabs from '../ui/UiTabs.vue';

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
const TRIAGE_ITEMS = [
  { id: 'open', label: '未處理' },
  { id: 'confirmed', label: '已確認' },
  { id: 'ignored', label: '略過' },
];
const TRIAGE_FILTERS = [...TRIAGE_ITEMS, { id: 'all', label: '全部' }];
const TRIAGE_LABELS = Object.fromEntries(
  TRIAGE_ITEMS.map((item) => [item.id, item.label]),
);

const workbench = useDiagnosticsWorkbench();
const clipboard = useClipboardFeedback({
  writeText: (value) => globalThis.navigator.clipboard.writeText(value),
  maxLength: 200_000,
});
const activeTab = shallowRef('issues');
const query = ref('');
const triageFilter = shallowRef('open');
const activeLevels = reactive({
  error: true,
  warning: true,
  info: true,
  debug: true,
});
const now = shallowRef(Date.now());

function matchesQuery(fields) {
  const needle = query.value.trim().toLowerCase();
  if (!needle) return true;
  return fields
    .filter((field) => typeof field === 'string')
    .some((field) => field.toLowerCase().includes(needle));
}

const issues = computed(() => groupDiagnosticIssues(workbench.state.events));
const visibleIssues = computed(() =>
  issues.value.filter(
    (issue) =>
      (triageFilter.value === 'all' ||
        workbench.triageOf(issue.fingerprint) === triageFilter.value) &&
      matchesQuery([
        issue.code,
        issue.source,
        issue.operation,
        ...issue.messages,
      ]),
  ),
);
const visibleEvents = computed(() =>
  workbench.state.events.filter(
    (event) =>
      activeLevels[event.level] &&
      matchesQuery([event.source, event.operation, event.code, event.message]),
  ),
);
const tabs = computed(() => [
  { id: 'issues', label: `問題 ${issues.value.length}` },
  { id: 'events', label: `事件 ${workbench.state.events.length}` },
]);
const sourceLabel = computed(() =>
  workbench.state.bundleName
    ? `匯出檔：${workbench.state.bundleName}`
    : '本機紀錄',
);

function relative(timestamp) {
  return formatRelativeTime(timestamp, now.value);
}

function topEntries(counts) {
  return Object.entries(counts).toSorted((a, b) => b[1] - a[1]);
}

function trailOf(issue) {
  return sessionTrail(workbench.state.events, issue.latest);
}

async function refresh() {
  await workbench.refresh();
  now.value = Date.now();
}

async function openBundle() {
  if (await workbench.openBundle()) now.value = Date.now();
}

function copyIssues() {
  clipboard.copy(issuesToMarkdown(visibleIssues.value), '問題清單');
}

function copyIssue(issue) {
  clipboard.copy(issueToMarkdown(issue), '這個問題');
}

onMounted(refresh);
onUnmounted(clipboard.dispose);
</script>

<template>
  <section class="diagnostics" aria-label="診斷">
    <div class="diagnostics__toolbar">
      <span class="diagnostics__source">{{ sourceLabel }}</span>
      <UiButton
        :icon="RefreshCw"
        :disabled="workbench.state.isLoading"
        @click="refresh"
      >
        讀取本機紀錄
      </UiButton>
      <UiButton :icon="FolderOpen" @click="openBundle"> 載入匯出檔 </UiButton>
      <UiButton
        v-if="activeTab === 'issues'"
        :icon="Copy"
        :disabled="visibleIssues.length === 0"
        @click="copyIssues"
      >
        複製問題清單
      </UiButton>
      <span
        v-if="clipboard.state.value.message"
        class="diagnostics__copy-status"
        role="status"
      >
        {{ clipboard.state.value.message }}
      </span>
    </div>

    <UiHint v-if="workbench.state.error" tone="warning" role="status">
      {{ workbench.state.error }}
    </UiHint>

    <UiTabs
      v-model:active-id="activeTab"
      :items="tabs"
      aria-label="診斷檢視"
      tab-id-prefix="diagnostics"
      panel-id-prefix="diagnostics"
    />

    <div class="diagnostics__filters">
      <UiSegmentedControl
        v-if="activeTab === 'issues'"
        v-model="triageFilter"
        :items="TRIAGE_FILTERS"
        aria-label="處理狀態"
      />
      <template v-else>
        <UiCheckbox
          v-for="level in LEVELS"
          :id="`diagnostics-level-${level}`"
          :key="level"
          v-model="activeLevels[level]"
          :label="LEVEL_LABELS[level]"
        />
      </template>
      <UiSearchBox
        v-model="query"
        class="diagnostics__search"
        label="搜尋診斷事件"
        placeholder="搜尋訊息、代碼或來源"
      />
    </div>

    <UiSkeleton
      v-if="workbench.state.isLoading"
      :lines="5"
      pattern="staggered"
      aria-label="正在讀取診斷事件"
    />

    <UiScrollRegion
      v-else
      :id="`diagnostics-${activeTab}-panel`"
      class="diagnostics__list"
      axis="vertical"
      viewport-tag="ul"
      viewport-class="diagnostics__list-viewport"
      role="tabpanel"
      :aria-labelledby="`diagnostics-${activeTab}-tab`"
    >
      <template v-if="activeTab === 'issues'">
        <li
          v-for="issue in visibleIssues"
          :key="issue.fingerprint"
          class="diagnostics__row"
          :data-issue="issue.fingerprint"
        >
          <UiDisclosure :label="`${issue.code}：${issue.messages[0]}`">
            <template #summary>
              <span class="diagnostics__summary">
                <UiChip :tone="LEVEL_TONES[issue.level] ?? 'muted'">
                  {{ LEVEL_LABELS[issue.level] ?? issue.level }}
                </UiChip>
                <span class="diagnostics__message">
                  {{ issue.messages[0] }}
                </span>
                <span class="diagnostics__count">×{{ issue.count }}</span>
                <span class="diagnostics__time">{{
                  relative(issue.lastSeen)
                }}</span>
                <span class="diagnostics__meta">
                  {{ issue.code }} · {{ issue.source }}／{{ issue.operation }}
                  <template v-if="issue.sessionCount">
                    · {{ issue.sessionCount }} 次啟動
                  </template>
                  <template
                    v-if="workbench.triageOf(issue.fingerprint) !== 'open'"
                  >
                    · {{ TRIAGE_LABELS[workbench.triageOf(issue.fingerprint)] }}
                  </template>
                </span>
              </span>
            </template>

            <div class="diagnostics__detail">
              <div class="diagnostics__detail-actions">
                <UiSegmentedControl
                  :model-value="workbench.triageOf(issue.fingerprint)"
                  :items="TRIAGE_ITEMS"
                  aria-label="這個問題的處理狀態"
                  @update:model-value="
                    workbench.setTriage(issue.fingerprint, $event)
                  "
                />
                <UiButton :icon="Copy" @click="copyIssue(issue)">
                  複製這個問題
                </UiButton>
              </div>

              <ul class="diagnostics__messages">
                <li v-for="message in issue.messages" :key="message">
                  {{ message }}
                </li>
              </ul>

              <dl class="diagnostics__facts">
                <div>
                  <dt>首次／最近</dt>
                  <dd>{{ issue.firstSeen }} → {{ issue.lastSeen }}</dd>
                </div>
                <div>
                  <dt>程序</dt>
                  <dd>{{ issue.process }}</dd>
                </div>
                <div v-if="Object.keys(issue.versions).length">
                  <dt>版本</dt>
                  <dd>
                    <span
                      v-for="[version, count] in topEntries(issue.versions)"
                      :key="version"
                      >{{ version }}×{{ count }}
                    </span>
                  </dd>
                </div>
                <div
                  v-for="(counts, key) in issue.context"
                  :key="key"
                  :data-context-key="key"
                >
                  <dt>{{ key }}</dt>
                  <dd>
                    <span
                      v-for="[value, count] in topEntries(counts)"
                      :key="value"
                      >{{ value }}×{{ count }}
                    </span>
                  </dd>
                </div>
              </dl>

              <section v-if="trailOf(issue).length" class="diagnostics__trail">
                <h3>出錯前的事件（同一次啟動）</h3>
                <ol>
                  <li v-for="item in trailOf(issue)" :key="item.id">
                    <span class="diagnostics__time">{{
                      relative(item.timestamp)
                    }}</span>
                    <span>{{ LEVEL_LABELS[item.level] ?? item.level }}</span>
                    <span>{{ item.code }}</span>
                    <span class="diagnostics__trail-message">{{
                      item.message
                    }}</span>
                  </li>
                </ol>
              </section>

              <pre v-if="issue.stack" class="diagnostics__stack">{{
                issue.stack
              }}</pre>
            </div>
          </UiDisclosure>
        </li>
      </template>

      <template v-else>
        <li
          v-for="event in visibleEvents"
          :key="event.id"
          class="diagnostics__row"
        >
          <UiDisclosure :label="`${event.code}：${event.message}`">
            <template #summary>
              <span class="diagnostics__summary">
                <UiChip :tone="LEVEL_TONES[event.level] ?? 'muted'">
                  {{ LEVEL_LABELS[event.level] ?? event.level }}
                </UiChip>
                <span class="diagnostics__message">
                  {{ event.message }}
                </span>
                <span class="diagnostics__count" />
                <span class="diagnostics__time">{{
                  relative(event.timestamp)
                }}</span>
                <span class="diagnostics__meta">
                  {{ event.code }} · {{ event.source }}／{{ event.operation }}
                </span>
              </span>
            </template>
            <pre class="diagnostics__stack">{{
              JSON.stringify(event, null, 2)
            }}</pre>
          </UiDisclosure>
        </li>
      </template>
    </UiScrollRegion>

    <p
      v-if="
        !workbench.state.isLoading &&
        (activeTab === 'issues' ? visibleIssues : visibleEvents).length === 0
      "
      class="diagnostics__empty"
    >
      沒有符合條件的紀錄
    </p>
  </section>
</template>

<style scoped>
.diagnostics {
  height: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}

.diagnostics__toolbar,
.diagnostics__filters,
.diagnostics__detail-actions {
  min-width: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--ui-space-2) var(--ui-space-3);
}

.diagnostics__source {
  min-width: 0;
  margin-inline-end: auto;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  overflow-wrap: anywhere;
  -webkit-user-select: none;
  user-select: none;
}

.diagnostics__copy-status {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
}

.diagnostics__search {
  flex: 1 1 16rem;
}

.diagnostics__list {
  min-height: 0;
  flex: 1;
}

.diagnostics__list :deep(.diagnostics__list-viewport) {
  margin: 0;
  padding: 0;
  list-style: none;
}

.diagnostics__row + .diagnostics__row {
  border-top: var(--ui-border-width) solid var(--ui-color-border);
}

/* Fixed level, count and time columns align every row; the message takes
   the remaining width and locators sit beneath it. */
.diagnostics__summary {
  width: 100%;
  min-width: 0;
  display: grid;
  grid-template-columns: 3.5rem minmax(0, 1fr) 3rem 5.5rem;
  grid-template-areas:
    'level message count time'
    '. meta meta meta';
  align-items: start;
  gap: var(--ui-space-1) var(--ui-space-3);
}

.diagnostics__summary > :first-child {
  grid-area: level;
  justify-self: start;
}

.diagnostics__message {
  grid-area: message;
  min-width: 0;
  display: -webkit-box;
  overflow: hidden;
  color: var(--ui-color-text);
  font-size: var(--ui-type-body-compact-size);
  line-height: var(--ui-type-body-compact-line-height);
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.diagnostics__count {
  grid-area: count;
  color: var(--ui-color-text);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  font-variant-numeric: tabular-nums;
  text-align: end;
}

.diagnostics__time {
  grid-area: time;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  text-align: end;
  white-space: nowrap;
}

.diagnostics__meta {
  grid-area: meta;
  min-width: 0;
  overflow: hidden;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.diagnostics__detail {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
}

.diagnostics__messages,
.diagnostics__trail ol {
  margin: 0;
  padding-inline-start: var(--ui-space-4);
  display: grid;
  gap: var(--ui-space-1);
  overflow-wrap: anywhere;
}

.diagnostics__facts {
  margin: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(14rem, 100%), 1fr));
  gap: var(--ui-space-2) var(--ui-space-4);
}

.diagnostics__facts dt,
.diagnostics__trail h3 {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  font-weight: var(--ui-type-label-weight);
}

.diagnostics__facts dd {
  margin: 0;
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-1) var(--ui-space-2);
  overflow-wrap: anywhere;
}

.diagnostics__trail {
  display: grid;
  gap: var(--ui-space-1);
}

.diagnostics__trail li {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
  font-size: var(--ui-type-caption-size);
}

.diagnostics__trail-message {
  min-width: 0;
  flex: 1 1 16rem;
}

.diagnostics__stack {
  margin: 0;
  color: var(--ui-color-text);
  font-size: var(--ui-type-caption-size);
  white-space: pre-wrap;
  word-break: break-word;
  user-select: text;
}

.diagnostics__empty {
  margin: 0;
  padding: var(--ui-space-4);
  color: var(--ui-color-text-muted);
  text-align: center;
}

@media (max-width: 720px) {
  .diagnostics__summary {
    grid-template-columns: 3.5rem minmax(0, 1fr) 3rem;
    grid-template-areas:
      'level message count'
      '. time time'
      '. meta meta';
  }
}
</style>

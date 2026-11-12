<script setup>
import { computed, shallowRef } from 'vue';
import { ChevronLeft, ChevronRight } from '../../src/icons/index.js';
import { provideUiOverlayHost } from '../../src/composables/useUiOverlayHost.js';
import {
  registeredOverlayHostAttributes,
  registeredSurfaceAttributes,
} from '../../src/utils/rendererSurfaceRegistry.js';
import AppFolderPage from '../../src/components/layout/AppFolderPage.vue';
import UiButton from '../../src/components/ui/UiButton.vue';
import UiHint from '../../src/components/ui/UiHint.vue';
import UiIconButton from '../../src/components/ui/UiIconButton.vue';
import UiModal from '../../src/components/ui/UiModal.vue';
import UiPhotoFrame from '../../src/components/ui/UiPhotoFrame.vue';
import UiTabs from '../../src/components/ui/UiTabs.vue';
import CalendarCollage from '../../src/components/performance-session/PerformanceSessionArchiveCollage.vue';
import { archives, sampleMonth, sampleSelection } from './fixtures.js';

provideUiOverlayHost('component-lab');
const surfaceAttributes = registeredSurfaceAttributes('component-lab');
const overlayAttributes = registeredOverlayHostAttributes('component-lab');

const layouts = [
  { id: 'month', label: '七欄月曆' },
  { id: 'dates', label: '日期分組' },
];
const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
const dateFormat = new Intl.DateTimeFormat('zh-TW', {
  month: 'long',
  day: 'numeric',
  weekday: 'short',
});
const formatDay = (date) => dateFormat.format(new Date(`${date}T12:00:00`));
const formatTime = ({ saved, time }) => (saved ? `保存 ${time}` : time);
const formatSummary = ({ note, playlist, tracks }) =>
  note
    ? '僅有標記'
    : `完成 ${tracks.length} 首${playlist ? ' · 已連結歌單' : ''}`;
const orderSessions = (first, second) =>
  first.time.localeCompare(second.time) || first.id.localeCompare(second.id);

const layout = shallowRef('month');
const month = shallowRef(sampleMonth);
const selectedDay = shallowRef(sampleSelection);
const activeSession = shallowRef(null);
const detailOpen = shallowRef(false);
const year = computed(() => month.value.getFullYear());
const monthNumber = computed(() => month.value.getMonth() + 1);
const monthLabel = computed(() => `${year.value} 年 ${monthNumber.value} 月`);
const monthKey = computed(
  () => `${year.value}-${String(monthNumber.value).padStart(2, '0')}`,
);

const groups = computed(() => {
  const byDate = new Map();
  for (const session of archives) {
    if (!session.date.startsWith(monthKey.value)) continue;
    const sessions = byDate.get(session.date) ?? [];
    sessions.push(session);
    byDate.set(session.date, sessions);
  }
  return [...byDate]
    .sort(([first], [second]) => second.localeCompare(first))
    .map(([date, sessions]) => ({
      date,
      sessions: sessions.sort(orderSessions),
    }));
});

const selectedGroup = computed(() =>
  groups.value.find(({ date }) => date === selectedDay.value),
);
const visibleGroups = computed(() =>
  layout.value === 'month'
    ? selectedGroup.value
      ? [selectedGroup.value]
      : []
    : groups.value,
);

const weeks = computed(() => {
  const offset = month.value.getDay();
  const lastDay = new Date(year.value, monthNumber.value, 0).getDate();
  const byDate = new Map(
    groups.value.map(({ date, sessions }) => [date, sessions]),
  );
  return Array.from({ length: Math.ceil((offset + lastDay) / 7) }, (_, week) =>
    Array.from({ length: 7 }, (_, weekday) => {
      const day = week * 7 + weekday - offset + 1;
      if (day < 1 || day > lastDay) return null;
      const date = `${monthKey.value}-${String(day).padStart(2, '0')}`;
      const sessions = byDate.get(date) ?? [];
      const [first] = sessions;
      return {
        day,
        date,
        sessions,
        collage: first && {
          layout: first.layout,
          photos: sessions.flatMap(({ photos }) => photos).slice(0, 2),
          caption: first.note ?? first.name,
          time: first.time,
        },
      };
    }),
  );
});

function changeMonth(direction) {
  month.value = new Date(year.value, monthNumber.value - 1 + direction, 1);
  selectedDay.value = groups.value[0]?.date ?? '';
}

function openSession(session) {
  activeSession.value = session;
  detailOpen.value = true;
}
</script>

<template>
  <main v-bind="surfaceAttributes" class="calendar-preview">
    <div v-bind="overlayAttributes" class="ui-overlay-host" />
    <AppFolderPage body-label="場次紀錄樣張" :document-key="layout">
      <template #header>
        <div class="preview-toolbar">
          <h1>場次紀錄</h1>
          <UiTabs
            v-model:active-id="layout"
            class="preview-toolbar__tabs"
            :items="layouts"
            aria-label="場次版面"
            tab-id-prefix="session-calendar"
            panel-id-prefix="session-calendar"
            variant="bar"
          />
        </div>
      </template>

      <section
        :id="`session-calendar-${layout}-panel`"
        :aria-labelledby="`session-calendar-${layout}-tab`"
        role="tabpanel"
        class="calendar-content"
        :class="{ 'calendar-content--dates': layout === 'dates' }"
      >
        <header class="month-rail">
          <h2 :aria-label="monthLabel" class="month-number">
            {{ String(monthNumber).padStart(2, '0') }}
          </h2>
          <p class="month-year" aria-hidden="true">{{ year }} 年</p>
          <div class="month-actions" role="group" aria-label="月份導覽">
            <UiIconButton
              :icon="ChevronLeft"
              label="上一個月"
              @click="changeMonth(-1)"
            />
            <UiIconButton
              :icon="ChevronRight"
              label="下一個月"
              @click="changeMonth(1)"
            />
          </div>
        </header>

        <div class="calendar-body">
          <table
            v-if="layout === 'month'"
            class="month-grid"
            :aria-label="monthLabel"
          >
            <thead>
              <tr>
                <th v-for="day in weekdays" :key="day" scope="col">
                  {{ day }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(week, weekIndex) in weeks" :key="weekIndex">
                <td
                  v-for="(cell, weekday) in week"
                  :key="weekday"
                  class="month-cell"
                  :class="{
                    'month-cell--selected': cell && selectedDay === cell.date,
                  }"
                >
                  <template v-if="cell">
                    <UiButton
                      v-if="cell.collage"
                      stretch
                      class="month-cell__action"
                      :aria-label="`${formatDay(cell.date)}，${cell.sessions.length} 場`"
                      :aria-pressed="selectedDay === cell.date"
                      @click="selectedDay = cell.date"
                    />
                    <span
                      class="month-cell__day"
                      :aria-hidden="Boolean(cell.collage)"
                      >{{ cell.day }}</span
                    >
                    <span
                      v-if="cell.sessions.length > 1"
                      class="month-cell__count"
                      aria-hidden="true"
                    >
                      {{ cell.sessions.length }} 場
                    </span>
                    <CalendarCollage
                      v-if="cell.collage"
                      v-bind="cell.collage"
                    />
                  </template>
                </td>
              </tr>
            </tbody>
          </table>

          <div aria-live="polite" class="calendar-records">
            <UiHint v-if="!visibleGroups.length">本月沒有場次紀錄。</UiHint>
            <section
              v-for="group in visibleGroups"
              :key="group.date"
              class="date-group"
            >
              <header class="date-heading">
                <h3>{{ formatDay(group.date) }}</h3>
                <span>{{ group.sessions.length }} 場</span>
              </header>
              <ul class="session-list">
                <li
                  v-for="session in group.sessions"
                  :key="session.id"
                  class="session-row"
                >
                  <div class="session-row__content">
                    <UiPhotoFrame
                      v-if="layout === 'dates' && session.photos[0]"
                      :src="session.photos[0]"
                      class="session-row__photo"
                      ratio="square"
                    />
                    <div>
                      <p class="session-title">{{ session.name }}</p>
                      <p class="session-summary">
                        {{ formatTime(session) }} · {{ formatSummary(session) }}
                      </p>
                    </div>
                  </div>
                  <UiButton
                    variant="secondary"
                    :aria-label="`查看${session.name}的紀錄`"
                    @click="openSession(session)"
                    >查看紀錄</UiButton
                  >
                </li>
              </ul>
            </section>
          </div>
        </div>
      </section>
    </AppFolderPage>

    <UiModal
      :open="detailOpen"
      :title="activeSession?.name ?? ''"
      size="notice"
      @close="detailOpen = false"
      @after-leave="activeSession = null"
    >
      <div v-if="activeSession" class="session-detail">
        <div class="session-detail__heading">
          <UiPhotoFrame
            v-if="activeSession.photos[0]"
            :src="activeSession.photos[0]"
            frame="instant"
            ratio="square"
          />
          <div>
            <p>
              {{ formatDay(activeSession.date) }} ·
              {{ formatTime(activeSession) }}
            </p>
            <p v-if="activeSession.ended">收場 {{ activeSession.ended }}</p>
            <p>{{ formatSummary(activeSession) }}</p>
          </div>
        </div>
        <p v-if="activeSession.note">{{ activeSession.note }}</p>
        <ol v-else class="session-detail__tracks" aria-label="演唱順序">
          <li v-for="(track, index) in activeSession.tracks" :key="index">
            {{ track }}
          </li>
        </ol>
      </div>
    </UiModal>
  </main>
</template>

<style scoped>
.calendar-preview {
  block-size: 100%;
  padding: var(--ui-space-3);
  background: var(--ui-color-canvas);
}

.preview-toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--ui-space-2) var(--ui-space-5);
}

.preview-toolbar h1 {
  font-size: var(--ui-type-heading-size);
  line-height: var(--ui-type-heading-line-height);
}

.preview-toolbar__tabs {
  inline-size: max-content;
  max-inline-size: 100%;
}

.calendar-content {
  display: grid;
  grid-template-columns: var(--ui-artwork-size-lg) minmax(0, 1fr);
  gap: var(--ui-space-4);
  color: var(--ui-color-text);
}

.calendar-content--dates {
  max-inline-size: calc(var(--ui-artwork-size-hero) * 2);
  margin-inline: auto;
}

.month-rail {
  align-self: start;
}

.month-number {
  font-family: var(--ui-font-family-display);
  font-size: calc(var(--ui-type-display-size) * 2.25);
  line-height: var(--ui-type-display-line-height);
  font-variant-numeric: tabular-nums;
  font-weight: var(--ui-type-display-weight);
  letter-spacing: -0.04em;
}

.month-year,
.session-summary {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.month-actions {
  display: flex;
  margin-block-start: var(--ui-space-2);
}

.calendar-body {
  min-inline-size: 0;
  container-type: inline-size;
}

.month-grid {
  --month-rule: color-mix(
    in srgb,
    var(--ui-color-border-strong) 80%,
    var(--ui-color-surface)
  );
  inline-size: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.month-grid th {
  padding: 0 var(--ui-space-2) var(--ui-space-2);
  text-align: start;
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
}

.month-cell {
  position: relative;
  block-size: clamp(
    var(--ui-artwork-size-lg),
    13cqi,
    var(--ui-artwork-size-xl)
  );
  padding: 0;
  border: var(--ui-border-width) solid var(--month-rule);
  overflow: clip;
}

.month-cell__action {
  position: absolute;
  inset: 0;
}

.month-cell--selected {
  background: var(--ui-color-surface-selected);
  box-shadow: inset 0 0 0 var(--ui-border-width) var(--ui-color-current);
}

.month-cell__day,
.month-cell__count {
  position: absolute;
  inset-block-start: var(--ui-space-1);
  pointer-events: none;
  font-size: var(--ui-type-label-size);
  font-variant-numeric: tabular-nums;
}

.month-cell__day {
  inset-inline-start: var(--ui-space-2);
  font-weight: var(--ui-type-label-weight);
}

.month-cell__count {
  inset-inline-end: var(--ui-space-2);
  color: var(--ui-color-text-muted);
}

.calendar-records {
  display: grid;
  gap: var(--ui-space-4);
  margin-block-start: var(--ui-space-5);
}

.calendar-content--dates .calendar-records {
  margin-block-start: 0;
}

.date-heading,
.session-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--ui-space-3);
  padding-block: var(--ui-space-2);
  border-block-end: var(--ui-border-width) solid var(--ui-color-border);
}

.date-heading h3,
.session-title {
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-label-weight);
  overflow-wrap: anywhere;
}

.date-heading span {
  font-size: var(--ui-type-caption-size);
  color: var(--ui-color-text-muted);
}

.session-list {
  margin: 0;
  padding: 0;
  list-style: none;
}

.session-row__content {
  display: flex;
  align-items: center;
  gap: var(--ui-space-3);
  min-inline-size: 0;
}

.session-row__photo {
  --ui-photo-frame-background: var(--ui-color-paper);
  --ui-photo-frame-padding: var(--ui-space-1);
  inline-size: var(--ui-artwork-size-sm);
  flex: none;
}

.session-row .ui-btn {
  flex: none;
}

.session-detail,
.session-detail__heading {
  display: grid;
  gap: var(--ui-space-4);
}

.session-detail__heading:has(.ui-photo-frame) {
  grid-template-columns: var(--ui-artwork-size-lg) minmax(0, 1fr);
  align-items: center;
}

.session-detail__tracks {
  margin: 0;
  padding-inline-start: var(--ui-space-5);
}

.session-detail__tracks li + li {
  margin-block-start: var(--ui-space-2);
}

@media (max-width: 46rem) {
  .calendar-content {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-2);
  }

  .month-rail {
    display: flex;
    align-items: baseline;
    gap: var(--ui-space-2);
  }

  .month-number {
    font-size: var(--ui-type-display-size);
  }

  .month-actions {
    margin-block-start: 0;
    margin-inline-start: auto;
  }
}

@container (max-width: 33rem) {
  .month-cell__day {
    inset-inline-start: var(--ui-space-1);
  }

  .month-cell__count {
    inset-inline-end: var(--ui-space-1);
    font-size: calc(var(--ui-type-caption-size) * 0.85);
  }
}
</style>

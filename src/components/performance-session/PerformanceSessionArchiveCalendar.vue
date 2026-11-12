<script setup>
import { computed, shallowRef } from 'vue';
import { ChevronLeft, ChevronRight } from '../../icons/index.js';
import { t } from '../../utils/i18n.js';
import { UI_LOCALE } from '../../utils/uiLocale.js';
import {
  performanceArchiveDayKey,
  performanceArchiveTiming,
} from '../../utils/performanceArchivePresentation.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import PerformanceSessionArchiveCollage from './PerformanceSessionArchiveCollage.vue';

const props = defineProps({
  groups: { type: Array, required: true },
});

const weekdayFormat = new Intl.DateTimeFormat(UI_LOCALE, { weekday: 'short' });
const monthFormat = new Intl.DateTimeFormat(UI_LOCALE, {
  month: 'long',
  year: 'numeric',
});
const yearFormat = new Intl.DateTimeFormat(UI_LOCALE, { year: 'numeric' });
const monthNumberFormat = new Intl.NumberFormat(UI_LOCALE, {
  minimumIntegerDigits: 2,
});
const weekdays = Array.from({ length: 7 }, (_, offset) =>
  weekdayFormat.format(new Date(2026, 0, 4 + offset)),
);
const printLayouts = ['instant', 'wide', 'stamp', 'ticket'];
const today = new Date();
const requestedMonth = shallowRef(null);
const requestedDay = shallowRef(null);
const month = computed(() => {
  if (requestedMonth.value) return requestedMonth.value;
  const date = props.groups.find((group) => group.date)?.date ?? today;
  return new Date(date.getFullYear(), date.getMonth(), 1);
});
const monthLabel = computed(() => monthFormat.format(month.value));
const daysInMonth = computed(() =>
  new Date(month.value.getFullYear(), month.value.getMonth() + 1, 0).getDate(),
);
const monthPrefix = computed(() =>
  performanceArchiveDayKey(month.value).slice(0, -2),
);
const monthGroups = computed(() =>
  props.groups.filter(({ key }) => key.startsWith(monthPrefix.value)),
);
const selectedGroup = computed(
  () =>
    monthGroups.value.find(({ key }) => key === requestedDay.value) ??
    monthGroups.value[0],
);

const weeks = computed(() => {
  const firstWeekday = month.value.getDay();
  const groupsByDay = new Map(
    monthGroups.value.map((group) => [group.date.getDate(), group]),
  );
  return Array.from(
    { length: Math.ceil((firstWeekday + daysInMonth.value) / 7) },
    (_, week) =>
      weekdays.map((_, weekday) => {
        const day = week * 7 + weekday - firstWeekday + 1;
        if (day < 1 || day > daysInMonth.value) return null;
        const group = groupsByDay.get(day);
        if (!group) return { day };
        const photos = [
          ...new Set(
            group.archives.flatMap(({ coverTracks }) =>
              coverTracks
                .map(({ thumbnailUrl }) => thumbnailUrl)
                .filter(Boolean),
            ),
          ),
        ].slice(0, 2);
        const [first] = group.archives;
        const layout =
          photos.length === 2
            ? 'pair'
            : photos.length === 1
              ? printLayouts[day % printLayouts.length]
              : 'note';
        return {
          day,
          group,
          collage: {
            layout,
            photos,
            caption: first.name,
            time: performanceArchiveTiming(first, { timeOnly: true }),
          },
        };
      }),
  );
});

function changeMonth(direction) {
  requestedMonth.value = new Date(
    month.value.getFullYear(),
    month.value.getMonth() + direction,
    1,
  );
  requestedDay.value = null;
}
</script>

<template>
  <div class="archive-calendar">
    <div class="archive-calendar__layout">
      <header class="archive-calendar__rail">
        <h2 :aria-label="monthLabel" class="archive-calendar__month">
          {{ monthNumberFormat.format(month.getMonth() + 1) }}
        </h2>
        <p class="archive-calendar__year" aria-hidden="true">
          {{ yearFormat.format(month) }}
        </p>
        <div
          class="archive-calendar__actions"
          role="group"
          :aria-label="t('session.archive.monthNavigation')"
        >
          <UiIconButton
            :icon="ChevronLeft"
            :label="t('session.archive.previousMonth')"
            @click="changeMonth(-1)"
          />
          <UiIconButton
            :icon="ChevronRight"
            :label="t('session.archive.nextMonth')"
            @click="changeMonth(1)"
          />
        </div>
      </header>

      <div class="archive-calendar__body">
        <table class="archive-calendar__grid" :aria-label="monthLabel">
          <thead>
            <tr>
              <th v-for="day in weekdays" :key="day" scope="col">{{ day }}</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(week, weekIndex) in weeks" :key="weekIndex">
              <td
                v-for="(cell, weekday) in week"
                :key="weekday"
                class="archive-calendar__cell"
                :class="{
                  'archive-calendar__cell--selected':
                    cell?.group && selectedGroup?.key === cell.group.key,
                }"
              >
                <template v-if="cell">
                  <UiButton
                    v-if="cell.group"
                    stretch
                    class="archive-calendar__date-action"
                    :aria-label="
                      t(
                        'session.archive.calendarDay',
                        {
                          date: cell.group.label,
                          count: cell.group.archives.length,
                        },
                        cell.group.archives.length,
                      )
                    "
                    :aria-pressed="selectedGroup?.key === cell.group.key"
                    aria-controls="performance-archive-day-records"
                    @click="requestedDay = cell.group.key"
                  />
                  <span
                    class="archive-calendar__day"
                    :aria-hidden="Boolean(cell.group)"
                    >{{ cell.day }}</span
                  >
                  <span
                    v-if="cell.group?.archives.length > 1"
                    class="archive-calendar__count"
                    aria-hidden="true"
                    >{{ cell.group.archives.length }}</span
                  >
                  <PerformanceSessionArchiveCollage
                    v-if="cell.collage"
                    v-bind="cell.collage"
                  />
                </template>
              </td>
            </tr>
          </tbody>
        </table>

        <div
          id="performance-archive-day-records"
          class="archive-calendar__records"
          aria-live="polite"
        >
          <slot v-if="selectedGroup" :group="selectedGroup" />
          <UiHint v-else>{{ t('session.archive.monthEmpty') }}</UiHint>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.archive-calendar {
  container: archive-calendar / inline-size;
}

.archive-calendar__layout {
  display: grid;
  grid-template-columns: var(--ui-artwork-size-lg) minmax(0, 1fr);
  gap: var(--ui-space-4);
}

.archive-calendar__rail {
  align-self: start;
}

.archive-calendar__month {
  font-family: var(--ui-font-family-display);
  font-size: calc(var(--ui-type-display-size) * 2.25);
  font-weight: var(--ui-type-display-weight);
  line-height: var(--ui-type-display-line-height);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.04em;
}

.archive-calendar__year,
.archive-calendar__count {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.archive-calendar__actions {
  display: flex;
  margin-block-start: var(--ui-space-2);
}

.archive-calendar__body {
  min-inline-size: 0;
  container-type: inline-size;
}

.archive-calendar__grid {
  --archive-calendar-rule: color-mix(
    in srgb,
    var(--ui-color-border-strong) 80%,
    var(--ui-color-surface)
  );
  inline-size: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

.archive-calendar__grid th {
  padding: 0 var(--ui-space-1) var(--ui-space-2);
  text-align: start;
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
}

.archive-calendar__cell {
  position: relative;
  block-size: clamp(
    var(--ui-artwork-size-md),
    12cqi,
    var(--ui-artwork-size-xl)
  );
  padding: 0;
  border: var(--ui-border-width) solid var(--archive-calendar-rule);
  overflow: clip;
}

.archive-calendar__date-action {
  position: absolute;
  inset: 0;
}

.archive-calendar__cell--selected {
  background: var(--ui-color-surface-selected);
  box-shadow: inset 0 0 0 var(--ui-border-width) var(--ui-color-current);
}

.archive-calendar__day,
.archive-calendar__count {
  position: absolute;
  inset-block-start: var(--ui-space-1);
  font-variant-numeric: tabular-nums;
  pointer-events: none;
}

.archive-calendar__day {
  inset-inline-start: var(--ui-space-1);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
}

.archive-calendar__count {
  inset-inline-end: var(--ui-space-1);
}

.archive-calendar__records {
  margin-block-start: var(--ui-space-5);
}

@container archive-calendar (max-width: 44rem) {
  .archive-calendar__layout {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--ui-space-2);
  }

  .archive-calendar__rail {
    display: flex;
    align-items: baseline;
    gap: var(--ui-space-2);
  }

  .archive-calendar__month {
    font-size: calc(var(--ui-type-display-size) * 1.6);
  }

  .archive-calendar__actions {
    margin-block-start: 0;
    margin-inline-start: auto;
  }
}

@container archive-calendar (max-width: 32rem) {
  .archive-calendar__month {
    font-size: var(--ui-type-display-size);
  }
}
</style>

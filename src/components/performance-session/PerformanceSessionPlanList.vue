<script setup>
import { computed, shallowRef, watch } from 'vue';
import {
  ChevronDown,
  ChevronUp,
  Copy,
  Ellipsis,
  Trash2,
  Play,
  SkipForward,
} from '../../icons/index.js';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiScrollLayout from '../ui/UiScrollLayout.vue';
import TrackTable from '../track/TrackTable.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({
  items: { type: Array, default: () => [] },
  tracks: { type: Array, default: () => [] },
  selectedItemId: { type: String, default: null },
  saving: { type: Boolean, default: false },
  history: { type: Boolean, default: false },
  reviewable: { type: Boolean, default: true },
});

const emit = defineEmits([
  'select',
  'move',
  'duplicate',
  'remove',
  'play',
  'skip',
]);

const menuOpen = shallowRef(false);
const menuAnchorEl = shallowRef(null);
const menuItemId = shallowRef(null);

const STATUS_PRESENTATION = Object.freeze({
  ready: null,
  manual: { label: t('session.planList.status.manual'), tone: 'muted' },
  'needs-link': {
    label: t('session.planList.status.needsAttention'),
    tone: 'warning',
  },
  unavailable: {
    label: t('session.planList.status.unavailable'),
    tone: 'danger',
  },
  'source-changed': {
    label: t('session.planList.status.sourceChanged'),
    tone: 'warning',
  },
  'needs-attention': {
    label: t('session.planList.status.needsAttention'),
    tone: 'warning',
  },
  completed: { label: t('session.planList.status.completed'), tone: 'success' },
  skipped: { label: t('session.planList.status.skipped'), tone: 'muted' },
  interrupted: {
    label: t('session.planList.status.interrupted'),
    tone: 'warning',
  },
});

const tracksById = computed(
  () => new Map(props.tracks.map((track) => [track.id, track])),
);
const presentationRows = computed(() =>
  props.items.map((item, index) => {
    const canonicalTrack = item.trackId
      ? tracksById.value.get(item.trackId)
      : null;
    const fallbackId = item.trackId ?? item.linkedTrack?.id ?? item.itemId;
    return {
      item,
      index,
      position: index + 1,
      status: props.history
        ? STATUS_PRESENTATION[item.progress]
        : Object.hasOwn(STATUS_PRESENTATION, item.status)
          ? STATUS_PRESENTATION[item.status]
          : STATUS_PRESENTATION['needs-attention'],
      track:
        canonicalTrack ??
        (item.linkedTrack
          ? { ...item.linkedTrack, id: item.linkedTrack.id ?? fallbackId }
          : {
              id: fallbackId,
              title: item.displayTitle,
              artist: item.displayArtist,
            }),
    };
  }),
);

const hiddenColumns = shallowRef([]);
const tableEntries = computed(() =>
  presentationRows.value.map((row) => ({
    key: row.item.itemId,
    item: row.item,
    index: row.index,
    position: row.position,
    visibleIndex: row.index,
    interactive: !props.history && props.reviewable,
    disabled: props.saving,
    actionLabel: t('session.planList.checkNamed', {
      position: row.position,
      title: row.item.displayTitle,
    }),
    actionDescription: t('session.planList.rowDescription'),
    performanceStatusText: row.status?.label || t('session.planList.queued'),
    track: {
      ...row.track,
      title: row.item.displayTitle,
      artist: [
        row.item.displayArtist,
        hiddenColumns.value.includes('performanceStatus')
          ? row.status?.label
          : '',
      ]
        .filter(Boolean)
        .join(' · '),
    },
  })),
);

const activeMenuItem = computed(() =>
  props.items.find((item) => item.itemId === menuItemId.value),
);
const activeMenuIndex = computed(() =>
  props.items.findIndex((item) => item.itemId === menuItemId.value),
);
const menuAnchor = computed(() => ({
  kind: 'element',
  element: menuAnchorEl.value,
}));
const menuContent = computed(() => ({
  kind: 'actions',
  groups: [
    ...(!props.history
      ? [
          {
            id: 'playback',
            items: [
              {
                id: 'skip',
                kind: 'action',
                label: t('session.planList.skip'),
                value: 'skip',
                icon: SkipForward,
                disabled: props.saving,
              },
            ],
          },
        ]
      : []),
    {
      id: 'reorder',
      items: [
        {
          id: 'move-up',
          kind: 'action',
          label: t('session.planList.moveUp'),
          value: 'move-up',
          icon: ChevronUp,
          shortcut: 'Alt+↑',
          disabled: props.saving || activeMenuIndex.value <= 0,
        },
        {
          id: 'move-down',
          kind: 'action',
          label: t('session.planList.moveDown'),
          value: 'move-down',
          icon: ChevronDown,
          shortcut: 'Alt+↓',
          disabled:
            props.saving ||
            activeMenuIndex.value < 0 ||
            activeMenuIndex.value >= props.items.length - 1,
        },
      ],
    },
    {
      id: 'manage',
      items: [
        {
          id: 'duplicate',
          kind: 'action',
          label: props.history
            ? t('session.planList.requeue')
            : t('session.planList.duplicate'),
          value: 'duplicate',
          icon: Copy,
          disabled: props.saving || !activeMenuItem.value,
        },
        {
          id: 'remove',
          kind: 'action',
          label: props.history
            ? t('session.planList.removeRecord')
            : t('session.planList.removeQueued'),
          value: 'remove',
          icon: Trash2,
          intent: 'danger',
          disabled: props.saving || !activeMenuItem.value,
        },
      ],
    },
  ].filter((group) => !props.history || group.id !== 'reorder'),
}));

function closeMenu() {
  menuOpen.value = false;
  menuAnchorEl.value = null;
}

function openMenu(event, itemId) {
  if (props.saving) return;
  event.stopPropagation?.();
  menuAnchorEl.value = event.currentTarget;
  menuItemId.value = itemId;
  menuOpen.value = true;
}

function handleMenuSelect(action) {
  const item = activeMenuItem.value;
  if (!item || props.saving) {
    closeMenu();
    return;
  }
  if (action === 'skip') {
    emit('skip', item.itemId);
    closeMenu();
    return;
  }

  if (action === 'move-up') emit('move', item.itemId, -1);
  if (action === 'move-down') emit('move', item.itemId, 1);
  if (action === 'duplicate') emit('duplicate', item.itemId);
  if (action === 'remove') emit('remove', item.itemId);
  closeMenu();
}

function handleRowKeydown(event, item, index) {
  if (!event.altKey || props.saving) return;
  const offset =
    event.key === 'ArrowUp' ? -1 : event.key === 'ArrowDown' ? 1 : 0;
  if (!offset) return;
  if (
    (offset < 0 && index === 0) ||
    (offset > 0 && index === props.items.length - 1)
  ) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  emit('move', item.itemId, offset);
}

watch(
  [() => props.saving, activeMenuItem],
  ([saving, item]) => {
    if (saving || !item) closeMenu();
  },
  { flush: 'sync' },
);
</script>

<template>
  <section class="performance-session-plan-list-surface">
    <UiScrollLayout
      class="performance-session-plan-list__body-scroll"
      axis="vertical"
      edge-shadow="end"
      :scrollbar-reserve="history ? 'overflow' : 'stable'"
      content-class="performance-session-plan-list"
      :aria-label="
        t(history ? 'session.planList.results' : 'session.planList.order')
      "
    >
      <TrackTable
        collection-kind="performance-session"
        :entries="tableEntries"
        :selected-entry-key="selectedItemId || ''"
        :label="
          t(history ? 'session.planList.records' : 'session.planList.order')
        "
        @select-entry="emit('select', $event.item.itemId)"
        @entry-keydown="
          (entry, event) => handleRowKeydown(event, entry.item, entry.index)
        "
        @open-entry-menu="(entry, event) => openMenu(event, entry.item.itemId)"
        @layout-change="hiddenColumns = $event"
      >
        <template #row-actions="{ entry }">
          <UiIconButton
            v-if="!history"
            :icon="Play"
            :label="
              t('session.planList.playNamed', {
                title: entry.item.displayTitle,
              })
            "
            :disabled="saving || entry.item.ready === false"
            @click.stop="emit('play', entry.item.itemId)"
          />
          <UiIconButton
            :icon="Ellipsis"
            :label="
              t('session.planList.moreNamed', {
                position: entry.position,
                title: entry.item.displayTitle,
              })
            "
            :disabled="saving"
            aria-haspopup="menu"
            :aria-expanded="
              menuOpen && menuItemId === entry.item.itemId ? 'true' : 'false'
            "
            @click="openMenu($event, entry.item.itemId)"
          />
        </template>
      </TrackTable>
    </UiScrollLayout>

    <UiActionMenu
      :open="menuOpen"
      :anchor="menuAnchor"
      size="md"
      :aria-label="
        activeMenuIndex >= 0
          ? t('session.planList.itemActions', { position: activeMenuIndex + 1 })
          : t('session.planList.queueActions')
      "
      :content="menuContent"
      @select="handleMenuSelect"
      @close="closeMenu"
    />
  </section>
</template>

<style scoped>
.performance-session-plan-list-surface {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-width: 0;
  min-block-size: calc(
    var(--ui-list-header-height) + var(--ui-track-row-min-height) + 2 *
      var(--ui-focus-safe-inset)
  );
}

.performance-session-plan-list__body-scroll {
  --ui-scroll-layout-padding-block-start: var(--ui-focus-safe-inset);
  --ui-scroll-layout-padding-block-end: var(--ui-focus-safe-inset);
  --ui-scroll-layout-padding-inline-start: var(--ui-focus-safe-inset);
  --ui-scroll-layout-padding-inline-end: var(--ui-focus-safe-inset);
  flex: 1;
  min-height: 0;
}

.performance-session-plan-list__body-scroll
  :deep(.performance-session-plan-list) {
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin: 0;
  list-style: none;
}
</style>

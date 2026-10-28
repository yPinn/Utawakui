<script setup>
import { computed, shallowRef, watch } from 'vue';
import { Copy, Trash2 } from '../../icons/index.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePerformanceSessionPlan } from '../../composables/usePerformanceSessionPlan.js';
import { usePerformanceSessionPlayback } from '../../composables/usePerformanceSessionPlayback.js';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import RecentPlaybackList from '../queue/RecentPlaybackList.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';

const plan = usePerformanceSessionPlan();
const playback = usePerformanceSessionPlayback();
const { state: library } = useLibrary();
const { confirm } = useAppConfirmation();
const selectedEntryKey = shallowRef(null);
const menuKey = shallowRef(null);
const menuAnchor = shallowRef(null);
const busy = computed(() => plan.state.isSaving || playback.state.busy);
const entries = computed(() => {
  const tracks = new Map(library.tracks.map((track) => [track.id, track]));
  const completed = playback.historyItems.value.filter(
    (item) => item.progress === 'completed',
  );
  return completed.map((item) => {
    const canonical = tracks.get(item.trackId);
    return {
      key: item.itemId,
      track: {
        ...canonical,
        id: item.trackId ?? item.itemId,
        title: item.displayTitle,
        artist: item.displayArtist,
      },
      artistText: item.displayArtist,
      playbackDisabled:
        !item.ready || (item.mode !== 'manual' && !canonical?.url),
      playbackLabel: `${item.mode === 'manual' ? '開始' : '播放'}：${item.displayTitle}`,
    };
  });
});
const error = computed(
  () =>
    plan.state.error ||
    plan.state.validationError?.message ||
    playback.state.error ||
    '',
);
const menuEntry = computed(() =>
  entries.value.find((entry) => entry.key === menuKey.value),
);
const menuContent = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'manage',
      items: [
        {
          id: 'requeue',
          kind: 'action',
          label: '再次加入待唱',
          value: 'requeue',
          icon: Copy,
          disabled: busy.value || !menuEntry.value,
        },
        {
          id: 'remove',
          kind: 'action',
          label: '移除紀錄',
          value: 'remove',
          icon: Trash2,
          intent: 'danger',
          disabled: busy.value || !menuEntry.value,
        },
      ],
    },
  ],
}));
function closeMenu() {
  menuKey.value = null;
  menuAnchor.value = null;
}
function openMenu({ entry, event }) {
  if (busy.value) return;
  event.preventDefault?.();
  event.stopPropagation?.();
  menuKey.value = entry.key;
  menuAnchor.value =
    event.type === 'contextmenu'
      ? { kind: 'point', x: event.clientX ?? 0, y: event.clientY ?? 0 }
      : { kind: 'element', element: event.currentTarget };
}
async function selectAction(action) {
  const entry = menuEntry.value;
  closeMenu();
  if (!entry || busy.value) return;
  if (action === 'requeue') await plan.duplicateItem(entry.key);
  if (
    action === 'remove' &&
    (await confirm({
      title: '移除這筆播放紀錄？',
      subject: entry.track.title,
      message: '只移除這次完成紀錄，不會刪除曲庫歌曲。',
      confirmLabel: '移除紀錄',
      intent: 'danger',
    }))
  )
    await plan.removeItem(entry.key);
}
watch([busy, menuEntry], ([saving, entry]) => {
  if (saving || !entry) closeMenu();
});
</script>

<template>
  <div class="performance-session-completed-list">
    <RecentPlaybackList
      :entries="entries"
      :loading="!plan.state.isInitialized"
      :error="error"
      error-title="演出紀錄未更新"
      loading-message="讀取演出紀錄…"
      empty-message="還沒有完成紀錄。從演出待唱播放並完成的曲目會顯示在這裡。"
      menu-context="completed"
      :busy="busy"
      :playback-actions="false"
      :selected-entry-key="selectedEntryKey"
      :open-menu-key="menuKey ? `completed:${menuKey}` : ''"
      @select-entry="selectedEntryKey = $event.key"
      @open-track-menu="openMenu"
    />
    <UiActionMenu
      :open="Boolean(menuEntry)"
      :anchor="menuAnchor"
      :content="menuContent"
      aria-label="演出紀錄操作"
      @select="selectAction"
      @close="closeMenu"
    />
  </div>
</template>

<style scoped>
.performance-session-completed-list {
  min-inline-size: 0;
  user-select: none;
}
.performance-session-completed-list:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}
</style>

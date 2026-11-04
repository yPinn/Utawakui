<script setup>
import { computed, ref } from 'vue';
import { NOTIFICATION_KEYS } from '../../constants/notificationKeys.js';
import {
  Copy,
  Download,
  Ellipsis,
  FolderPlus,
  Tickets,
} from '../../icons/index.js';
import { useLibrary } from '../../composables/useLibrary.js';
import { usePerformanceSessionPlan } from '../../composables/usePerformanceSessionPlan.js';
import { usePerformanceSessionPlayback } from '../../composables/usePerformanceSessionPlayback.js';
import { usePerformanceQueueActions } from '../../composables/usePerformanceQueueActions.js';
import { useAppNotifications } from '../../composables/useAppNotifications.js';
import { useObsSessionExport } from '../../composables/useObsSessionExport.js';
import { useAppView } from '../../composables/useAppView.js';
import { performanceArchiveDate } from '../../utils/performanceArchivePresentation.js';
import PlaylistSidebarRow from '../playlists/PlaylistSidebarRow.vue';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiTextField from '../ui/UiTextField.vue';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import PerformanceSessionPlaylistExportModal from './PerformanceSessionPlaylistExportModal.vue';
import { t } from '../../utils/i18n.js';

const props = defineProps({ dock: Boolean });
const plan = usePerformanceSessionPlan();
const performanceQueue = usePerformanceQueueActions();
const notifications = useAppNotifications();
const playback = usePerformanceSessionPlayback();
const timeline = useObsSessionExport();
const { state: library } = useLibrary();
const { activeView, performanceArchiveId, openPerformanceArchive } =
  useAppView();
const archives = computed(() => plan.state.plan.archives ?? []);
const busy = computed(
  () => plan.state.isSaving || playback.state.busy || archiving.value,
);
const menu = ref(null),
  anchor = ref(null),
  finish = ref(null),
  playlist = ref(null);
const name = ref(''),
  error = ref(''),
  archiving = ref(false);
const archiveRows = computed(() => {
  const tracks = new Map(library.tracks.map((track) => [track.id, track]));
  return [...archives.value].reverse().map((session) => ({
    ...session,
    coverTracks: (session.coverTrackIds ?? [])
      .map((id) => tracks.get(id))
      .filter(Boolean),
  }));
});
const menuContent = computed(() => ({
  kind: 'actions',
  groups: [
    {
      id: 'session',
      items: [
        ...(props.dock && menu.value && !menu.value.current
          ? [
              {
                id: 'pending',
                kind: 'action',
                label: t('session.history.addToQueue'),
                value: 'pending',
                icon: Tickets,
                disabled: busy.value || !menu.value.itemCount,
              },
            ]
          : []),
        ...(menu.value?.current
          ? [
              {
                id: 'archive',
                kind: 'action',
                label: t('session.history.finishAndArchive'),
                value: 'archive',
                icon: FolderPlus,
                disabled: busy.value,
              },
            ]
          : []),
        {
          id: 'playlist',
          kind: 'action',
          label: t('session.history.saveAsPlaylist'),
          value: 'playlist',
          icon: Copy,
          disabled: busy.value,
        },
        {
          id: 'timeline',
          kind: 'action',
          label: t('session.history.exportTimeline'),
          value: 'timeline',
          icon: Download,
          disabled: busy.value,
        },
      ],
    },
  ],
}));
function openMenu(session, event) {
  event.preventDefault?.();
  menu.value = session;
  anchor.value =
    event.type === 'contextmenu'
      ? { kind: 'point', x: event.clientX ?? 0, y: event.clientY ?? 0 }
      : { kind: 'element', element: event.currentTarget };
}
function closeMenu() {
  menu.value = null;
  anchor.value = null;
}
function selectAction(action) {
  const selected = menu.value;
  closeMenu();
  if (!selected || busy.value) return;
  if (
    action === 'pending' &&
    props.dock &&
    !selected.current &&
    selected.itemCount > 0
  )
    void performanceQueue.addArchive(selected.id);
  if (action === 'archive') {
    finish.value = selected;
    name.value = selected.name;
    error.value = '';
  }
  if (action === 'playlist') playlist.value = selected;
  if (action === 'timeline') void timeline.openForArrangement(selected.id);
}
async function archive() {
  if (!finish.value || archiving.value || !name.value.trim()) return;
  archiving.value = true;
  error.value = '';
  try {
    // Stop through the existing owner, including a pending audio start. Main
    // still rejects a playing item if that transition did not commit.
    if (!(await playback.stop())) {
      error.value = t('session.history.stopFailed');
      return;
    }
    if (!(await plan.archiveSession(name.value.trim(), finish.value.id))) {
      error.value =
        plan.state.validationError?.message ||
        plan.state.error ||
        t('session.history.notArchived');
      return;
    }
    finish.value = null;
    notifications.notify({
      key: NOTIFICATION_KEYS.PERFORMANCE_SESSION_ARCHIVE,
      title: t('session.history.archivedTitle'),
      message: t('session.history.archivedMessage'),
    });
  } catch {
    error.value = t('session.history.archiveFailed');
  } finally {
    archiving.value = false;
  }
}
</script>

<template>
  <div
    :id="dock ? 'arrangement-dock-history-panel' : undefined"
    class="session-history-tools"
    :role="dock ? 'tabpanel' : undefined"
    :aria-labelledby="dock ? 'arrangement-dock-history-tab' : undefined"
    :tabindex="dock ? 0 : undefined"
  >
    <AppRightDockSection
      :heading="t('session.history.current')"
      class="session-history-tools__current"
    >
      <template #trailing>
        <div class="session-history-tools__current-actions">
          <slot name="current-status" />
          <UiIconButton
            :icon="Ellipsis"
            :label="t('session.history.currentActions')"
            :disabled="busy || !plan.state.plan.sessionId"
            @click="
              openMenu(
                {
                  id: plan.state.plan.sessionId,
                  name:
                    plan.state.plan.source?.name ||
                    t('session.history.sessionFallback'),
                  current: true,
                },
                $event,
              )
            "
          />
        </div>
      </template>
      <slot />
    </AppRightDockSection>
    <AppRightDockSection
      v-if="archives.length"
      class="session-history-tools__archives"
      :heading="t('session.history.archived')"
    >
      <div class="session-history-tools__collections">
        <PlaylistSidebarRow
          v-for="session in archiveRows"
          :key="session.id"
          class="session-history-tools__collection"
          :playlist="{
            id: session.id,
            name: session.name,
            kind: 'performance-archive',
          }"
          :cover-tracks="session.coverTracks"
          :subtitle="
            dock
              ? performanceArchiveDate(session.endedAt, { includeTime: false })
              : t('session.history.setlist')
          "
          :playback-enabled="false"
          :active="
            activeView === 'performance' && performanceArchiveId === session.id
          "
          @select="openPerformanceArchive(session.id)"
          @contextmenu="openMenu(session, $event)"
        >
          <template #trailing>
            <UiIconButton
              class="session-history-tools__collection-menu"
              :icon="Ellipsis"
              :label="
                t('session.history.sessionActionsNamed', { name: session.name })
              "
              :disabled="busy"
              aria-haspopup="menu"
              :aria-expanded="menu?.id === session.id"
              @click="openMenu(session, $event)"
            />
          </template>
        </PlaylistSidebarRow>
      </div>
    </AppRightDockSection>
    <UiActionMenu
      :open="Boolean(menu)"
      :anchor="anchor"
      :content="menuContent"
      :aria-label="t('session.history.sessionActions')"
      @select="selectAction"
      @close="closeMenu"
    />
    <UiModal
      :open="Boolean(finish)"
      :title="t('session.history.finishAndArchive')"
      :close-disabled="archiving"
      @close="finish = null"
    >
      <div class="session-history-tools__fields">
        <UiTextField
          id="archive-session-name"
          v-model="name"
          :label="t('session.history.nameLabel')"
          :maxlength="200"
          :disabled="archiving"
        />
        <UiNotice
          compact
          tone="info"
          :message="t('session.history.finishMessage')"
        />
        <UiNotice v-if="error" compact tone="warning" :message="error" />
      </div>
      <template #footer>
        <UiButton :disabled="archiving" @click="finish = null">{{
          t('session.history.cancel')
        }}</UiButton>
        <UiButton
          variant="accent"
          :disabled="!name.trim() || name.trim().length > 200 || archiving"
          :loading="archiving"
          @click="archive"
          >{{ t('session.history.finishConfirm') }}</UiButton
        >
      </template>
    </UiModal>
    <PerformanceSessionPlaylistExportModal
      :open="Boolean(playlist)"
      :session-id="playlist?.id"
      :suggested-name="playlist?.name"
      @close="playlist = null"
    />
  </div>
</template>

<style scoped>
.session-history-tools__current-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-right-dock-content-gap);
}
.session-history-tools {
  min-inline-size: 0;
  display: flex;
  flex-direction: column;
  gap: var(--ui-space-3);
}
.session-history-tools:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset-inset);
}
.session-history-tools__archives {
  --ui-sidebar-row-selected-background: var(--ui-color-surface-active);
  --ui-playlist-row-state-surface-outset-inline: var(
    --ui-right-dock-track-row-state-surface-outset-inline
  );
  padding-block-start: var(--ui-space-3);
  border-block-start: var(--ui-border-width) dotted var(--ui-color-border);
}
.session-history-tools__fields {
  display: grid;
  gap: var(--ui-space-3);
}
.session-history-tools__collections {
  display: flex;
  flex-direction: column;
  min-inline-size: 0;
  gap: var(--ui-track-list-gap);
}
.session-history-tools__collection-menu {
  opacity: 0;
  pointer-events: none;
  transition: opacity var(--ui-motion-duration-fast)
    var(--ui-motion-easing-standard);
}
.session-history-tools__collection:hover
  .session-history-tools__collection-menu,
.session-history-tools__collection:focus-within
  .session-history-tools__collection-menu,
.session-history-tools__collection.playlist-sidebar-row--active
  .session-history-tools__collection-menu,
.session-history-tools__collection-menu[aria-expanded='true'] {
  opacity: 1;
  pointer-events: auto;
}
</style>

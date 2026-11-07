<script setup>
import { computed, shallowRef, watch } from 'vue';
import { NOTIFICATION_KEYS } from '../../constants/notificationKeys.js';
import { Copy, Download, Ellipsis } from '../../icons/index.js';
import { usePerformanceSessionPlan } from '../../composables/usePerformanceSessionPlan.js';
import { usePerformanceSessionPlayback } from '../../composables/usePerformanceSessionPlayback.js';
import {
  consumeStreamEndFinishRequest,
  streamEndFinishRequest,
} from '../../composables/usePerformanceStreamEndReminder.js';
import { useAppNotifications } from '../../composables/useAppNotifications.js';
import { useObsSessionExport } from '../../composables/useObsSessionExport.js';
import { useAppView } from '../../composables/useAppView.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { performancePlaylistName } from '../../utils/performanceArchivePresentation.js';
import UiActionMenu from '../ui/UiActionMenu.vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiTextField from '../ui/UiTextField.vue';
import AppRightDockSection from '../layout/AppRightDockSection.vue';
import PerformanceSessionPlaylistExportModal from './PerformanceSessionPlaylistExportModal.vue';
import { t } from '../../utils/i18n.js';

const plan = usePerformanceSessionPlan();
const notifications = useAppNotifications();
const playback = usePerformanceSessionPlayback();
const timeline = useObsSessionExport();
const {
  openLibraryContent,
  openPerformanceArchive,
  selectPerformanceSessionTab,
} = useAppView();
const playlists = usePlaylists();
const anchor = shallowRef(null);
const finish = shallowRef(null);
const playlist = shallowRef(null);
const name = shallowRef('');
const error = shallowRef('');
const archiving = shallowRef(false);
const busy = computed(
  () => plan.state.isSaving || playback.state.busy || archiving.value,
);
const currentSession = computed(() => ({
  id: plan.state.plan.sessionId,
  name: plan.state.plan.source?.name || t('session.history.sessionFallback'),
}));
const canArchive = computed(
  () => plan.state.plan.canArchive && currentSession.value.id && !busy.value,
);
const menuContent = {
  kind: 'actions',
  groups: [
    {
      id: 'export',
      items: [
        {
          id: 'playlist',
          kind: 'action',
          label: t('session.history.saveAsPlaylist'),
          value: 'playlist',
          icon: Copy,
        },
        {
          id: 'timeline',
          kind: 'action',
          label: t('obs.export.title'),
          value: 'timeline',
          icon: Download,
        },
      ],
    },
  ],
};

function toggleMenu(event) {
  anchor.value = anchor.value
    ? null
    : { kind: 'element', element: event.currentTarget };
}

function suggestedPlaylistName() {
  return performancePlaylistName({
    startedAt: plan.state.plan.sessionStartedAt,
    name: plan.state.plan.source?.name,
    existing: playlists.state.playlists.map(({ name }) => name),
  });
}

function openFinish() {
  if (!canArchive.value) return;
  const suggestedName = suggestedPlaylistName();
  finish.value = { id: currentSession.value.id, suggestedName };
  name.value = suggestedName;
  error.value = '';
}

watch(
  [streamEndFinishRequest, canArchive],
  ([sessionId, ready]) => {
    if (!ready || sessionId !== currentSession.value.id) return;
    consumeStreamEndFinishRequest(sessionId);
    openFinish();
  },
  { immediate: true },
);

function selectAction(action) {
  anchor.value = null;
  const selected = currentSession.value;
  if (!selected.id || busy.value) return;
  if (action === 'playlist') playlist.value = selected;
  if (action === 'timeline') void timeline.openForArrangement(selected.id);
}

async function archive() {
  const selected = finish.value;
  if (!selected || archiving.value || !name.value.trim()) return;
  if (
    selected.id !== currentSession.value.id &&
    !plan.state.plan.archives?.some(({ id }) => id === selected.id)
  ) {
    error.value = t('session.history.notArchived');
    return;
  }
  archiving.value = true;
  error.value = '';
  try {
    if (selected.id === currentSession.value.id && !(await playback.stop())) {
      error.value = t('session.history.stopFailed');
      return;
    }
    const archiveName =
      selected.id === currentSession.value.id &&
      name.value === selected.suggestedName
        ? suggestedPlaylistName()
        : name.value.trim();
    if (!(await plan.archiveSession(archiveName, selected.id))) {
      error.value =
        plan.state.validationError?.message ||
        plan.state.error ||
        t('session.history.notArchived');
      return;
    }
    const result = await playlists
      .createFromPerformanceArchive(selected.id)
      .catch(() => null);
    const playlistId = result?.playlistId;
    finish.value = null;
    selectPerformanceSessionTab('pending');
    notifications.notify({
      key: NOTIFICATION_KEYS.PERFORMANCE_SESSION_ARCHIVE,
      title: t(
        playlistId
          ? 'session.history.playlistCreated'
          : 'session.history.archivedTitle',
      ),
      ...(result
        ? {}
        : {
            tone: 'warning',
            message: t('session.history.playlistCreationFailed'),
          }),
      actionLabel: t(
        playlistId
          ? 'session.history.viewPlaylist'
          : 'session.history.viewArchived',
      ),
      action: () => {
        if (
          !playlistId ||
          !playlists.state.playlists.some(({ id }) => id === playlistId)
        ) {
          openPerformanceArchive(selected.id);
          return;
        }
        playlists.select(playlistId);
        openLibraryContent();
      },
    });
  } catch {
    error.value = t('session.history.archiveFailed');
  } finally {
    archiving.value = false;
  }
}
</script>

<template>
  <AppRightDockSection
    :heading="t('session.history.current')"
    class="session-history-tools"
  >
    <template #trailing>
      <div class="session-history-tools__current-actions">
        <UiButton :disabled="!canArchive" @click="openFinish">{{
          t('session.history.finishAndArchive')
        }}</UiButton>
        <UiIconButton
          :icon="Ellipsis"
          :label="t('session.history.currentActions')"
          :disabled="busy || !currentSession.id"
          aria-haspopup="menu"
          :aria-expanded="Boolean(anchor)"
          @click="toggleMenu"
        />
      </div>
    </template>
    <slot />
  </AppRightDockSection>
  <UiActionMenu
    :open="Boolean(anchor)"
    :anchor="anchor"
    :content="menuContent"
    :aria-label="t('session.history.sessionActions')"
    @select="selectAction"
    @close="anchor = null"
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
      <UiHint>{{ t('session.history.finishMessage') }}</UiHint>
      <UiNotice
        v-if="playback.currentItem.value"
        compact
        tone="warning"
        :message="t('session.history.finishPlaying')"
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
</template>

<style scoped>
.session-history-tools {
  min-inline-size: 0;
}
.session-history-tools__current-actions {
  display: flex;
  align-items: center;
  gap: var(--ui-space-2);
}
.session-history-tools__fields {
  display: grid;
  gap: var(--ui-space-3);
}
</style>

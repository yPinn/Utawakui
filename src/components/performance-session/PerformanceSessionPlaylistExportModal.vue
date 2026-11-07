<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { NOTIFICATION_KEYS } from '../../constants/notificationKeys.js';
import { usePlaylists } from '../../composables/usePlaylists.js';
import { useAppNotifications } from '../../composables/useAppNotifications.js';
import UiModal from '../ui/UiModal.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiHint from '../ui/UiHint.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiButton from '../ui/UiButton.vue';
import { t } from '../../utils/i18n.js';
const props = defineProps({
  open: Boolean,
  sessionId: { type: String, default: null },
  suggestedName: {
    type: String,
    default: () => t('session.export.defaultName'),
  },
});
const emit = defineEmits(['close', 'saved']);
const name = ref(''),
  scope = ref('completed'),
  preview = ref(null),
  error = ref(''),
  loading = ref(false),
  saving = ref(false);
const { refresh } = usePlaylists();
const notifications = useAppNotifications();
let revision = 0;
async function load() {
  const current = ++revision;
  preview.value = null;
  error.value = '';
  if (!props.open || !props.sessionId) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const result = await window.Utawakui.previewPerformancePlaylist({
      sessionId: props.sessionId,
      scope: scope.value,
    });
    if (current !== revision) return;
    if (result?.ok !== true) {
      error.value = result?.error?.message || t('session.export.previewFailed');
      return;
    }
    preview.value = result.plan;
  } catch {
    if (current === revision) error.value = t('session.export.previewRetry');
  } finally {
    if (current === revision) loading.value = false;
  }
}
watch(
  () => [props.open, props.sessionId],
  () => {
    name.value = props.suggestedName;
    scope.value = 'completed';
    void load();
  },
  { immediate: true },
);
watch(scope, () => {
  void load();
});
onBeforeUnmount(() => {
  revision++;
});
const canSave = computed(
  () =>
    props.open &&
    !saving.value &&
    !loading.value &&
    preview.value?.sessionId === props.sessionId &&
    preview.value?.scope === scope.value &&
    preview.value?.savedCount > 0 &&
    name.value.trim().length > 0 &&
    name.value.trim().length <= 200,
);
async function save() {
  if (!canSave.value) return;
  saving.value = true;
  error.value = '';
  try {
    const p = preview.value;
    const result = await window.Utawakui.savePerformancePlaylist({
      sessionId: props.sessionId,
      scope: p.scope,
      token: p.token,
      name: name.value.trim(),
    });
    if (result?.ok !== true) {
      error.value = result?.error?.message || t('session.export.notSaved');
      preview.value = null;
      return;
    }
    const playlistId = result.plan?.playlistId;
    if (typeof playlistId !== 'string' || !playlistId)
      throw new Error('invalid saved playlist response');
    // The write already succeeded. A refresh failure must not turn a retry
    // into another create or report that the saved playlist was lost.
    await refresh().catch(() => {});
    notifications.notify({
      key: NOTIFICATION_KEYS.PERFORMANCE_PLAYLIST_EXPORT,
      title: t('session.export.savedTitle'),
      message: t('session.export.savedMessage'),
    });
    emit('saved', playlistId);
    emit('close');
  } catch {
    error.value = t('session.export.saveRetry');
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <UiModal
    :open="open"
    :title="t('session.history.saveAsPlaylist')"
    size="notice"
    max-block-size="small"
    :close-disabled="saving"
    @close="!saving && emit('close')"
  >
    <div class="session-playlist-export">
      <UiTextField
        id="session-playlist-name"
        v-model="name"
        :label="t('session.export.name')"
        :maxlength="200"
        :disabled="saving"
      />
      <UiSelect
        id="session-playlist-scope"
        v-model="scope"
        :label="t('session.export.scope')"
        :options="[
          { value: 'completed', label: t('session.export.completed') },
          { value: 'all', label: t('session.export.all') },
        ]"
        :disabled="saving"
      />
      <UiHint v-if="loading">{{ t('session.export.checking') }}</UiHint>
      <template v-if="preview">
        <UiHint v-if="preview.mergedCount">
          {{ t('session.export.merged', { count: preview.mergedCount }) }}
        </UiHint>
        <UiHint v-if="preview.manualCount">
          {{ t('session.export.manual', { count: preview.manualCount }) }}
        </UiHint>
        <UiHint v-if="preview.unavailableCount">
          {{
            t('session.export.unavailable', { count: preview.unavailableCount })
          }}
        </UiHint>
        <UiHint v-if="!preview.savedCount" tone="warning">{{
          t('session.export.nothingToSave')
        }}</UiHint>
      </template>
      <UiNotice v-if="error" compact tone="warning" :message="error" />
    </div>
    <template #footer>
      <div class="session-playlist-export__footer">
        <UiHint
          v-if="preview?.savedCount"
          class="session-playlist-export__summary"
        >
          {{
            t(
              'session.export.summary',
              { count: preview.savedCount },
              preview.savedCount,
            )
          }}
        </UiHint>
        <div class="session-playlist-export__actions">
          <UiButton :disabled="saving" @click="emit('close')">{{
            t('session.export.cancel')
          }}</UiButton>
          <UiButton
            v-if="!preview"
            :disabled="saving || loading"
            @click="load"
            >{{ t('session.export.repreview') }}</UiButton
          >
          <UiButton
            variant="accent"
            :disabled="!canSave"
            :loading="saving"
            @click="save"
            >{{ t('session.history.saveAsPlaylist') }}</UiButton
          >
        </div>
      </div>
    </template>
  </UiModal>
</template>
<style scoped>
.session-playlist-export {
  display: grid;
  min-inline-size: 0;
  gap: var(--ui-space-3);
}

.session-playlist-export__footer,
.session-playlist-export__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  min-inline-size: 0;
}

.session-playlist-export__footer {
  inline-size: 100%;
  gap: var(--ui-space-3);
}

.session-playlist-export__summary {
  flex: 1 1 12rem;
  text-wrap: balance;
}

.session-playlist-export__actions {
  justify-content: flex-end;
  margin-inline-start: auto;
  gap: var(--ui-space-2);
}
</style>

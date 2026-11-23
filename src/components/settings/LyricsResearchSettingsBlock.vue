<script setup>
import { computed, onMounted, onUnmounted, shallowRef } from 'vue';
import { useLyricsResearch } from '../../composables/lyrics/useLyricsResearch.js';
import {
  Check,
  Download,
  RefreshCw,
  Trash2,
  Wrench,
} from '../../icons/index.js';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import SettingsDependencyActions from './SettingsDependencyActions.vue';
import SettingsDependencyRows from './SettingsDependencyRows.vue';
import LyricsExperimentalQueueSettings from './LyricsExperimentalQueueSettings.vue';
import LyricsResearchPreviewTools from './LyricsResearchPreviewTools.vue';
import UiButton from '../ui/UiButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import { t } from '../../utils/i18n.js';

const research = useLyricsResearch();
const toolsOpen = shallowRef(false);
const experimentOpen = shallowRef(false);
let timer;
const status = computed(() => research.status.value?.status);
const statusLabel = computed(() => {
  if (research.busy.value) {
    const stage = research.status.value?.stage ?? '';
    if (stage.startsWith('download:'))
      return t('lyricsResearch.settings.stage.download');
    return (
      {
        prepare: t('lyricsResearch.settings.stage.prepare'),
        verify: t('lyricsResearch.settings.stage.verify'),
        extract: t('lyricsResearch.settings.stage.extract'),
        preview: t('lyricsResearch.settings.stage.preview'),
        analyze: t('lyricsResearch.settings.stage.analyze'),
        hubertfa: t('lyricsResearch.settings.stage.hubertfa'),
        small: t('lyricsResearch.settings.stage.small'),
        remove: t('lyricsResearch.settings.stage.remove'),
      }[stage] || t('lyricsResearch.settings.stage.other')
    );
  }
  return (
    {
      missing: t('lyricsResearch.settings.status.missing'),
      unverified: t('lyricsResearch.settings.status.unverified'),
      ready: t('lyricsResearch.settings.status.ready'),
      damaged: t('lyricsResearch.settings.status.damaged'),
    }[status.value] || t('lyricsResearch.settings.status.unknown')
  );
});
const statusTone = computed(() =>
  research.busy.value
    ? 'info'
    : status.value === 'ready'
      ? 'success'
      : status.value === 'damaged'
        ? 'warning'
        : 'muted',
);
const primary = computed(
  () =>
    ({
      missing: {
        icon: Download,
        label: t('lyricsResearch.settings.actions.download'),
        action: 'prepare',
      },
      unverified: {
        icon: Check,
        label: t('lyricsResearch.settings.actions.check'),
        action: 'verify',
      },
      damaged: {
        icon: Wrench,
        label: t('lyricsResearch.settings.actions.repair'),
        action: 'prepare',
      },
    })[status.value],
);
const installed = computed(() =>
  Boolean(status.value && status.value !== 'missing'),
);
const managementItem = computed(() => ({
  id: 'lyrics-research',
  title: t('lyricsResearch.settings.tool'),
  actionIcon: research.busy.value ? null : primary.value?.icon,
  actionLabel: primary.value?.label,
  advancedActions: [
    ...(status.value
      ? [
          {
            id: 'refresh',
            label: t('lyricsResearch.settings.actions.refresh'),
            icon: RefreshCw,
          },
        ]
      : []),
    ...(status.value === 'ready'
      ? [
          {
            id: 'verify',
            label: t('lyricsResearch.settings.actions.check'),
            icon: Check,
          },
        ]
      : []),
    ...(installed.value && status.value !== 'damaged'
      ? [
          {
            id: 'prepare',
            label: t('lyricsResearch.settings.actions.repair'),
            icon: Wrench,
          },
        ]
      : []),
    ...(installed.value
      ? [
          {
            id: 'remove',
            label: t('lyricsResearch.settings.actions.remove'),
            icon: Trash2,
            intent: 'danger',
          },
        ]
      : []),
  ].map((action) => ({ ...action, disabled: research.busy.value })),
}));
function runPrimary() {
  if (!research.busy.value && primary.value)
    void research.action(primary.value.action);
}
function manage({ action }) {
  if (research.busy.value) return;
  if (!managementItem.value.advancedActions.some((item) => item.id === action))
    return;
  if (action === 'refresh') void research.refresh();
  else void research.action(action);
}
onMounted(() => {
  void research.refresh();
  // Automatic work may change readiness while management is closed.
  timer = setInterval(() => void research.refresh(), 1000);
});
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <UiDisclosure
    v-model:open="experimentOpen"
    class="settings-section__disclosure"
    :label="t('lyricsResearch.settings.disclosure')"
  >
    <SettingsDependencyRows>
      <UiHint class="lyrics-settings__notice" tone="warning">
        {{ t('lyricsResearch.settings.notice') }}
      </UiHint>
      <slot />
      <SettingsDocumentItem
        :title="t('lyricsResearch.settings.tool')"
        :description="t('lyricsResearch.settings.toolDescription')"
        :guidance="status === 'ready' ? '' : t('lyricsResearch.settings.size')"
        :status="statusLabel"
        :status-tone="statusTone"
        status-live
        variant="nested"
        title-tag="h3"
      >
        <template #actions>
          <UiButton
            v-if="research.busy.value"
            variant="secondary"
            :aria-label="t('lyricsResearch.settings.cancelLabel')"
            @click="research.cancel"
            >{{ t('common.cancel') }}</UiButton
          >
          <SettingsDependencyActions
            :item="managementItem"
            @primary-action="runPrimary"
            @advanced-action="manage"
          />
        </template>
        <template v-if="research.error.value || !status" #feedback>
          <UiHint v-if="research.error.value" tone="danger" role="alert">{{
            research.error.value
          }}</UiHint>
          <UiButton
            v-if="!status && !research.busy.value"
            variant="ghost"
            @click="research.refresh"
            >{{ t('lyricsResearch.settings.actions.refresh') }}</UiButton
          >
        </template>
      </SettingsDocumentItem>

      <LyricsExperimentalQueueSettings />

      <UiDisclosure
        v-model:open="toolsOpen"
        class="settings-section__disclosure"
        :label="t('lyricsResearch.settings.previewTitle')"
      >
        <div v-if="toolsOpen" class="settings-section__form">
          <UiHint>{{ t('lyricsResearch.settings.previewLimit') }}</UiHint>
          <LyricsResearchPreviewTools />
        </div>
      </UiDisclosure>
    </SettingsDependencyRows>
  </UiDisclosure>
</template>

<style scoped>
.lyrics-settings__notice {
  padding-block: var(--settings-row-padding-block, var(--ui-space-4));
  padding-inline-start: var(--settings-copy-inset, 0);
}
</style>

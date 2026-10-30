<script setup>
import { t } from '../../utils/i18n.js';
// Self-contained like CaptureDeviceModal.vue/FeedbackReportModal.vue: this
// modal owns its composable directly rather than SettingsView.vue passing
// every field down as props, since useObsSessionExport() is a module
// singleton the trigger button (ObsIntegrationSettingsBlock.vue) can already
// open without prop drilling between unrelated components.
import { computed, nextTick, useTemplateRef, watch } from 'vue';
import { RefreshCw } from '../../icons/index.js';
import { useObsSessionExport } from '../../composables/useObsSessionExport.js';
import UiButton from '../ui/UiButton.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiTextarea from '../ui/UiTextarea.vue';

const exportState = useObsSessionExport();

const SOURCE_ITEMS = Object.freeze([
  { id: 'stream', label: t('obs.export.stream') },
  { id: 'record', label: t('obs.export.record') },
]);

const missingTimestampCount = computed(
  () =>
    exportState.session.value?.entries?.filter(
      (entry) => !entry[exportState.source.value],
    ).length ?? 0,
);

const hasSession = computed(
  () => (exportState.session.value?.entries?.length ?? 0) > 0,
);
const offsetField = useTemplateRef('offsetField');
const content = useTemplateRef('content');
watch(
  () => exportState.isLoading.value,
  async (loading) => {
    if (loading || !exportState.isOpen.value) return;
    await nextTick();
    if (!exportState.isOpen.value) return;
    if (typeof document !== 'undefined') {
      const active = document.activeElement;
      const dialog = content.value?.closest('[role="dialog"]');
      if (
        active &&
        active !== document.body &&
        active !== dialog &&
        active !== content.value
      )
        return;
    }
    if (hasSession.value && !exportState.error.value)
      offsetField.value?.focus();
    else content.value?.focus();
  },
);
</script>

<template>
  <UiModal
    :open="exportState.isOpen.value"
    :title="t('obs.export.title')"
    size="notice"
    max-block-size="small"
    @close="exportState.close()"
  >
    <template #header-actions>
      <UiIconButton
        :icon="RefreshCw"
        :label="t('obs.export.reload')"
        :loading="exportState.isLoading.value"
        @click="exportState.reload()"
      />
      <UiButton
        variant="accent"
        :aria-label="t('obs.export.copyLabel')"
        :disabled="!exportState.canCopy.value"
        @click="exportState.copyChapters()"
        >{{
          t(
            exportState.copyState.value.tone === 'success'
              ? 'obs.export.copied'
              : 'obs.export.copy',
          )
        }}</UiButton
      >
    </template>
    <div ref="content" class="obs-session-export-modal" tabindex="-1">
      <UiHint
        v-if="exportState.copyState.value.message"
        :tone="
          exportState.copyState.value.tone === 'error' ? 'danger' : 'muted'
        "
        :role="
          exportState.copyState.value.tone === 'error' ? 'alert' : 'status'
        "
        >{{ exportState.copyState.value.message }}</UiHint
      >
      <p
        v-if="exportState.isLoading.value"
        class="obs-session-export-modal__status"
      >
        {{ t('obs.export.loading') }}
      </p>

      <UiNotice
        v-else-if="exportState.error.value"
        tone="danger"
        :message="exportState.error.value"
        compact
      />

      <p v-else-if="!hasSession" class="obs-session-export-modal__status">
        {{ t('obs.export.empty') }}
      </p>

      <template v-else>
        <UiHint>{{
          t('obs.export.session', {
            name:
              exportState.session.value.name ||
              exportState.session.value.id ||
              exportState.session.value.sessionId,
          })
        }}</UiHint>
        <UiHint v-if="missingTimestampCount" tone="warning">{{
          t(
            'obs.export.missingTimestamps',
            { count: missingTimestampCount },
            missingTimestampCount,
          )
        }}</UiHint>
        <div class="obs-session-export-modal__controls">
          <div class="obs-session-export-modal__source">
            <span class="obs-session-export-modal__label" aria-hidden="true">{{
              t('obs.export.timeSource')
            }}</span>
            <UiSegmentedControl
              :model-value="exportState.source.value"
              :items="SOURCE_ITEMS"
              :aria-label="t('obs.export.timeSource')"
              @update:model-value="exportState.source.value = $event"
            />
          </div>
          <UiTextField
            id="obs-session-export-offset"
            ref="offsetField"
            :label="t('obs.export.offset')"
            :model-value="exportState.offsetSeconds.value"
            placeholder="0"
            inputmode="numeric"
            :error="exportState.offsetError.value"
            aria-describedby="obs-session-export-offset-hint"
            @update:model-value="exportState.offsetSeconds.value = $event"
          />
        </div>
        <UiHint id="obs-session-export-offset-hint">{{
          t('obs.export.offsetHint')
        }}</UiHint>

        <UiDisclosure
          v-if="
            !exportState.offsetError.value &&
            exportState.result.value.issues.length
          "
          :label="
            t(
              'obs.export.issues',
              { count: exportState.result.value.issues.length },
              exportState.result.value.issues.length,
            )
          "
        >
          <UiHint tone="warning">{{ t('obs.export.issuesHint') }}</UiHint>
          <ul class="obs-session-export-modal__issues">
            <li
              v-for="(issue, index) in exportState.result.value.issues"
              :key="`${issue.code}-${index}`"
            >
              {{ issue.message }}
            </li>
          </ul>
        </UiDisclosure>

        <UiTextarea
          v-if="!exportState.offsetError.value"
          id="obs-session-export-text"
          :label="t('obs.export.chapters')"
          :model-value="exportState.result.value.text"
          :rows="7"
          readonly
          :hint="t('obs.export.chaptersHint')"
        />
        <UiHint v-else>{{ t('obs.export.offsetRequired') }}</UiHint>
      </template>
    </div>
  </UiModal>
</template>

<style scoped>
.obs-session-export-modal__issues {
  margin: var(--ui-space-2) 0 0;
  padding-inline-start: var(--ui-space-5);
  color: var(--ui-color-warning);
  font-size: var(--ui-type-caption-size);
}

.obs-session-export-modal {
  min-width: 0;
  display: grid;
  gap: var(--ui-space-3);
}
.obs-session-export-modal:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.obs-session-export-modal__status {
  margin: 0;
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.obs-session-export-modal__controls {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: start;
  gap: var(--ui-space-3);
}
.obs-session-export-modal__source {
  display: grid;
  gap: var(--ui-space-1);
}
.obs-session-export-modal__label {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-label-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-label-line-height);
}
</style>

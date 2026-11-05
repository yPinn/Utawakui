<script setup>
import { t } from '../../utils/i18n.js';
// The shell hosts one dialog for the current session, archived sessions and
// the separate recent OBS history entry in the Library.
import { computed, nextTick, ref, useTemplateRef, watch } from 'vue';
import { RefreshCw } from '../../icons/index.js';
import { useObsSessionExport } from '../../composables/useObsSessionExport.js';
import { performanceArchiveDate } from '../../utils/performanceArchivePresentation.js';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiDisclosure from '../ui/UiDisclosure.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiNotice from '../ui/UiNotice.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiStack from '../ui/UiStack.vue';
import UiTextField from '../ui/UiTextField.vue';
import UiTextarea from '../ui/UiTextarea.vue';

const exportState = useObsSessionExport();

const SOURCE_ITEMS = Object.freeze([
  { value: 'stream', label: t('obs.export.stream') },
  { value: 'record', label: t('obs.export.record') },
]);
const MODE_ITEMS = [
  { id: 'youtube', label: t('obs.export.chapters') },
  { id: 'markers', label: t('obs.export.markers') },
];
const sourceItems = computed(() =>
  SOURCE_ITEMS.filter(({ value }) =>
    exportState.availableSources.value.includes(value),
  ),
);
const segmentOptions = computed(() =>
  exportState.segmentStarts.value.map((start, index) => ({
    value: index,
    label: start
      ? t('obs.export.segmentDated', {
          number: index + 1,
          date: performanceArchiveDate(start),
        })
      : t('obs.export.segmentNamed', { number: index + 1 }),
  })),
);
const isYoutube = computed(() => exportState.mode.value === 'youtube');
const previewLabel = computed(() =>
  t(
    !isYoutube.value
      ? 'obs.export.markers'
      : exportState.hasDescriptionIntro.value
        ? 'obs.export.videoDescription'
        : exportState.result.value.valid
          ? 'obs.export.chapters'
          : 'obs.export.timepoints',
  ),
);
const copyLabel = computed(() =>
  t(
    !isYoutube.value
      ? 'obs.export.copyReference'
      : exportState.hasDescriptionIntro.value
        ? 'obs.export.copyDescription'
        : exportState.result.value.valid
          ? 'obs.export.copyLabel'
          : 'obs.export.copyPoints',
  ),
);
const hasSegment = computed(
  () => sourceItems.value.length > 0 && exportState.segmentIndex.value !== '',
);
const optionsOpen = ref(false);
const optionsLabel = computed(() => {
  if (exportState.offsetError.value) return t('obs.export.optionsNeedsCheck');
  const value = Number(exportState.offsetSeconds.value);
  return value === 0
    ? t('obs.export.options')
    : t('obs.export.activeAdjustment', {
        seconds: value > 0 ? `+${value}` : value,
      });
});
const optionsProps = computed(() =>
  isYoutube.value
    ? {
        label: optionsLabel.value,
        open: optionsOpen.value,
        'onUpdate:open': (open) => (optionsOpen.value = open),
      }
    : {},
);
const chapterIssues = computed(() =>
  isYoutube.value ? exportState.result.value.issues : [],
);
const omissionMessages = computed(() => {
  const missing = sourceItems.value.length ? exportState.missingCount.value : 0;
  const trimmed = exportState.offsetError.value
    ? 0
    : exportState.aligned.value.trimmedCount;
  return [
    missing && t('obs.export.missingTimestamps', { count: missing }, missing),
    trimmed && t('obs.export.trimmed', { count: trimmed }, trimmed),
  ]
    .filter(Boolean)
    .join(' ');
});
const showOpening = computed(
  () => Math.round(exportState.aligned.value.rows[0]?.ms / 1000) > 0,
);

const hasSession = computed(
  () => (exportState.session.value?.entries?.length ?? 0) > 0,
);
const content = useTemplateRef('content');
watch(
  () => exportState.isOpen.value,
  (open) => {
    if (!open) optionsOpen.value = false;
  },
);
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
    content.value?.focus();
  },
);
</script>

<template>
  <UiModal
    :open="exportState.isOpen.value"
    :title="t('obs.export.title')"
    size="notice"
    max-block-size="small"
    covers-underlying
    :close-disabled="exportState.isSaving.value"
    @close="exportState.close()"
  >
    <template #header-actions>
      <UiIconButton
        :icon="RefreshCw"
        :label="t('obs.export.reload')"
        :loading="exportState.isLoading.value"
        :disabled="exportState.isSaving.value"
        @click="exportState.reload()"
      />
    </template>
    <div ref="content" class="obs-session-export-modal" tabindex="-1">
      <UiStack direction="column" :gap="3">
        <UiHint v-if="exportState.isLoading.value" role="status">
          {{ t('obs.export.loading') }}
        </UiHint>

        <UiNotice
          v-else-if="exportState.error.value"
          tone="danger"
          :message="exportState.error.value"
          compact
        />

        <UiHint v-else-if="!hasSession">
          {{
            exportState.isLatest.value
              ? t('obs.export.empty')
              : t('obs.export.noTimeSource')
          }}
        </UiHint>

        <template v-else>
          <UiHint>{{
            t('obs.export.session', {
              name:
                exportState.session.value.name ||
                t(
                  exportState.isLatest.value
                    ? 'obs.export.latest'
                    : 'session.history.sessionFallback',
                ),
            })
          }}</UiHint>
          <UiSegmentedControl
            v-if="sourceItems.length"
            :model-value="exportState.mode.value"
            :items="MODE_ITEMS"
            :aria-label="t('obs.export.purpose')"
            :disabled="exportState.isSaving.value"
            @update:model-value="exportState.mode.value = $event"
          />
          <UiHint v-if="!sourceItems.length">{{
            t('obs.export.noTimeSource')
          }}</UiHint>
          <UiStack v-else :gap="3" wrap align="start">
            <UiSelect
              v-if="sourceItems.length > 1"
              id="obs-session-export-source"
              class="obs-session-export-modal__field"
              :label="t('obs.export.timeSource')"
              :model-value="exportState.source.value"
              :options="sourceItems"
              :disabled="exportState.isSaving.value"
              @update:model-value="exportState.source.value = $event"
            />
            <UiHint v-else>{{
              t('obs.export.singleSource', { source: sourceItems[0].label })
            }}</UiHint>
            <UiSelect
              v-if="segmentOptions.length > 1"
              id="obs-session-export-segment"
              class="obs-session-export-modal__field"
              :label="t('obs.export.segment')"
              :placeholder="t('obs.export.chooseSegment')"
              :hint="t('obs.export.segmentHint')"
              :options="segmentOptions"
              :model-value="exportState.segmentIndex.value"
              :disabled="exportState.isSaving.value"
              @update:model-value="exportState.segmentIndex.value = $event"
            />
          </UiStack>
          <component
            :is="isYoutube ? UiDisclosure : 'div'"
            v-if="hasSegment"
            v-bind="optionsProps"
          >
            <UiStack direction="column" :gap="2">
              <UiTextField
                id="obs-session-export-offset"
                :label="t('obs.export.offset')"
                :model-value="exportState.offsetSeconds.value"
                :hint="t('obs.export.offsetHint')"
                :error="exportState.offsetError.value"
                :disabled="exportState.isSaving.value"
                placeholder="0"
                inputmode="decimal"
                @update:model-value="exportState.offsetSeconds.value = $event"
              />
              <UiTextarea
                v-if="isYoutube"
                id="obs-session-export-intro"
                :label="t('obs.export.intro')"
                :model-value="exportState.descriptionIntro.value"
                :rows="2"
                resize="none"
                @update:model-value="
                  exportState.descriptionIntro.value = $event
                "
              />
            </UiStack>
          </component>
          <UiHint v-if="omissionMessages" tone="warning">
            {{ omissionMessages }}
          </UiHint>

          <UiHint
            v-if="
              hasSegment &&
              !exportState.offsetError.value &&
              !exportState.previewText.value
            "
          >
            {{ t('obs.export.noTimepoints') }}
          </UiHint>
          <template
            v-if="
              !exportState.offsetError.value && exportState.previewText.value
            "
          >
            <UiStack
              v-if="chapterIssues.length || (isYoutube && showOpening)"
              direction="column"
              :gap="1"
            >
              <UiHint v-if="chapterIssues.length === 1" tone="warning">
                {{ chapterIssues[0].message }}
              </UiHint>
              <UiDisclosure
                v-else-if="chapterIssues.length > 1"
                :label="
                  t(
                    'obs.export.issues',
                    { count: chapterIssues.length },
                    chapterIssues.length,
                  )
                "
              >
                <ul class="obs-session-export-modal__issues">
                  <li
                    v-for="(issue, index) in chapterIssues"
                    :key="`${issue.code}-${index}`"
                  >
                    {{ issue.message }}
                  </li>
                </ul>
              </UiDisclosure>
              <UiCheckbox
                v-if="isYoutube && showOpening"
                id="obs-session-export-opening"
                :label="t('obs.export.addOpening')"
                :model-value="exportState.includeOpening.value"
                @update:model-value="exportState.includeOpening.value = $event"
              />
            </UiStack>

            <UiTextarea
              id="obs-session-export-text"
              :label="previewLabel"
              :model-value="exportState.previewText.value"
              :hint="
                t(
                  !isYoutube
                    ? 'obs.export.referenceHint'
                    : exportState.result.value.valid
                      ? 'obs.export.chaptersHint'
                      : 'obs.export.issuesHint',
                )
              "
              :rows="5"
              resize="none"
              readonly
            />
            <UiHint
              v-if="exportState.descriptionTooLong.value"
              tone="warning"
              >{{ t('obs.export.descriptionTooLong') }}</UiHint
            >
            <UiHint v-if="exportState.copyTooLong.value">{{
              t('obs.export.copyTooLong')
            }}</UiHint>
          </template>
        </template>
      </UiStack>
    </div>
    <template
      v-if="
        !exportState.isLoading.value &&
        !exportState.error.value &&
        sourceItems.length
      "
      #footer
    >
      <UiHint
        v-if="
          exportState.saveMessage.value || exportState.copyState.value.message
        "
        class="obs-session-export-modal__feedback"
        :tone="
          exportState.saveError.value ||
          exportState.copyState.value.tone === 'error'
            ? 'danger'
            : 'muted'
        "
        :role="
          exportState.saveError.value ||
          exportState.copyState.value.tone === 'error'
            ? 'alert'
            : 'status'
        "
        >{{
          exportState.saveMessage.value || exportState.copyState.value.message
        }}</UiHint
      >
      <UiButton
        v-if="!isYoutube"
        variant="secondary"
        :disabled="!exportState.canSave.value"
        :loading="exportState.isSaving.value"
        @click="exportState.saveMarkers()"
        >{{ t('obs.export.saveCsv') }}</UiButton
      >
      <UiButton
        variant="accent"
        :disabled="!exportState.canCopy.value"
        @click="exportState.copyPreview()"
        >{{ copyLabel }}</UiButton
      >
    </template>
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
}
.obs-session-export-modal:focus-visible {
  outline: var(--ui-focus-width) solid var(--ui-color-focus);
  outline-offset: var(--ui-focus-offset);
}

.obs-session-export-modal__field {
  flex: 1 1 min(calc(var(--ui-modal-inline-size-small) / 2), 100%);
  min-width: 0;
}
.obs-session-export-modal__feedback {
  flex: 1 1 auto;
}
</style>

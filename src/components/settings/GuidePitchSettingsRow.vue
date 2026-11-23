<script setup>
import { computed, shallowRef } from 'vue';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';

const access = typeof window === 'undefined' ? null : window.Utawakui;
const operation = shallowRef(null);
const report = shallowRef(null);
const canBackfill = computed(
  () =>
    report.value?.status === 'ready' &&
    (report.value.finished
      ? report.value.failed > 0
      : report.value.missing + report.value.invalid > 0),
);
const status = computed(() => {
  if (operation.value)
    return t(
      operation.value === 'inspect'
        ? 'guidePitchSettings.checking'
        : 'guidePitchSettings.preparing',
    );
  const result = report.value;
  if (!result) return '';
  if (result.status === 'ready')
    return t(
      result.finished
        ? 'guidePitchSettings.result'
        : 'guidePitchSettings.counts',
      result,
    );
  return t(
    {
      busy: 'guidePitchSettings.busy',
      cancelled: 'guidePitchSettings.cancelled',
      'no-decoder': 'guidePitchSettings.noDecoder',
      'no-model': 'guidePitchSettings.noModel',
      'source-changed': 'guidePitchSettings.sourceChanged',
    }[result.status] ?? 'guidePitchSettings.unavailable',
  );
});

async function run(mode) {
  if (operation.value) return;
  operation.value = mode;
  try {
    const result =
      mode === 'inspect'
        ? await access.inspectGuidePitch()
        : await access.backfillGuidePitch();
    report.value = { ...result, finished: mode === 'backfill' };
  } catch {
    report.value = { status: 'unavailable' };
  } finally {
    operation.value = null;
  }
}
</script>

<template>
  <SettingsDocumentItem
    v-if="access?.inspectGuidePitch"
    :title="t('guidePitchSettings.title')"
    :guidance="t('guidePitchSettings.guidance')"
    :status="status"
    status-live
    variant="nested"
    title-tag="h3"
  >
    <template #actions>
      <UiButton
        v-if="operation !== 'backfill'"
        variant="secondary"
        :loading="operation === 'inspect'"
        @click="run('inspect')"
      >
        {{ t('guidePitchSettings.check') }}
      </UiButton>
      <UiButton
        v-if="operation === 'backfill' || canBackfill"
        :variant="operation === 'backfill' ? 'secondary' : 'accent'"
        :disabled="operation === 'inspect'"
        @click="
          operation === 'backfill'
            ? access.stopGuidePitchBackfill()
            : run('backfill')
        "
      >
        {{
          t(
            operation === 'backfill'
              ? 'guidePitchSettings.stop'
              : 'guidePitchSettings.fill',
          )
        }}
      </UiButton>
    </template>
  </SettingsDocumentItem>
</template>

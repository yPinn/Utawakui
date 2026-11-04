<script setup>
import { computed, shallowRef } from 'vue';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiModal from '../ui/UiModal.vue';
import UiSelect from '../ui/UiSelect.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import { t } from '../../utils/i18n.js';

// `login` mirrors useYoutubeLoginSettings with refs unwrapped.
const props = defineProps({
  login: { type: Object, required: true },
});
const emit = defineEmits(['setSource', 'importFile', 'removeFile', 'refresh']);

const guideOpen = shallowRef(false);
const noticeOpen = shallowRef(false);
const GUIDE_STEPS = Object.freeze(['step1', 'step2', 'step3']);
const NOTICE_POINTS = Object.freeze(['point1', 'point2', 'point3', 'point4']);

const usesFile = computed(
  () => props.login.loaded && props.login.source === 'file',
);
const fileStatus = computed(() =>
  usesFile.value
    ? t(
        props.login.status.imported
          ? 'capabilities.youtubeLogin.imported'
          : 'capabilities.youtubeLogin.notImported',
      )
    : '',
);

// The notice shows before the first import only.
function requestImport() {
  if (props.login.status.noticeAcknowledged) emit('importFile', {});
  else noticeOpen.value = true;
}

function confirmNotice() {
  noticeOpen.value = false;
  emit('importFile', { acknowledgeNotice: true });
}
</script>

<template>
  <SettingsDocumentItem
    :title="t('capabilities.youtubeLogin.title')"
    :guidance="t('capabilities.youtubeLogin.guidance')"
    :status="fileStatus"
    :status-tone="login.status.imported ? 'success' : 'muted'"
    variant="nested"
  >
    <template #actions>
      <UiSelect
        id="youtube-login-source"
        class="youtube-login-row__select"
        :label="t('capabilities.youtubeLogin.label')"
        :options="login.items"
        :model-value="login.loaded ? login.source : ''"
        :placeholder="login.loaded ? '' : t('capabilities.unconfirmed')"
        :disabled="login.busy || login.reading || !login.loaded"
        :error="login.saveError"
        @update:model-value="emit('setSource', $event)"
      />
    </template>
    <template #feedback>
      <template v-if="login.readError">
        <UiHint tone="danger" role="status">{{ login.readError }}</UiHint>
        <UiButton
          variant="ghost"
          :loading="login.reading"
          @click="emit('refresh')"
          >{{ t('capabilities.reload') }}</UiButton
        >
      </template>
      <UiHint v-else-if="login.loaded && login.source === 'firefox'">{{
        t('capabilities.youtubeLogin.firefoxHint')
      }}</UiHint>
      <template v-else-if="usesFile">
        <UiHint v-if="login.fileError" tone="danger" role="alert">{{
          login.fileError
        }}</UiHint>
        <div class="youtube-login-row__file-actions">
          <UiButton :loading="login.fileBusy" @click="requestImport">{{
            t('capabilities.youtubeLogin.importFile')
          }}</UiButton>
          <UiButton
            v-if="login.status.imported"
            variant="ghost"
            :disabled="login.fileBusy"
            @click="emit('removeFile')"
            >{{ t('capabilities.youtubeLogin.remove') }}</UiButton
          >
          <UiButton variant="ghost" @click="guideOpen = true">{{
            t('capabilities.youtubeLogin.howTo')
          }}</UiButton>
        </div>
      </template>
    </template>
  </SettingsDocumentItem>

  <UiModal
    :open="guideOpen"
    :title="t('capabilities.youtubeLogin.guide.title')"
    size="notice"
    max-block-size="small"
    @close="guideOpen = false"
  >
    <ol class="youtube-login-row__steps">
      <li v-for="step in GUIDE_STEPS" :key="step">
        {{ t(`capabilities.youtubeLogin.guide.${step}`) }}
      </li>
    </ol>
    <UiHint tone="warning">{{
      t('capabilities.youtubeLogin.guide.warning')
    }}</UiHint>
    <p class="youtube-login-row__tip">
      {{ t('capabilities.youtubeLogin.guide.firefox') }}
    </p>
  </UiModal>

  <UiModal
    :open="noticeOpen"
    :title="t('capabilities.youtubeLogin.notice.title')"
    size="notice"
    max-block-size="small"
    @close="noticeOpen = false"
  >
    <ol class="youtube-login-row__steps">
      <li v-for="point in NOTICE_POINTS" :key="point">
        {{ t(`capabilities.youtubeLogin.notice.${point}`) }}
      </li>
    </ol>
    <template #footer>
      <UiButton @click="noticeOpen = false">{{ t('common.cancel') }}</UiButton>
      <UiButton variant="accent" @click="confirmNotice">{{
        t('capabilities.youtubeLogin.notice.confirm')
      }}</UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.youtube-login-row__select {
  inline-size: var(--settings-select-inline-size);
  min-inline-size: min(100%, 10ic);
  max-inline-size: 100%;
}

.youtube-login-row__file-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--ui-space-2);
}

.youtube-login-row__steps {
  margin: 0;
  padding-inline-start: var(--ui-space-5);
  display: grid;
  gap: var(--ui-space-2);
}

.youtube-login-row__tip {
  margin: 0;
  color: var(--ui-color-text-muted);
}
</style>

<script setup>
import { computed, shallowRef, useId, watch } from 'vue';
import { ExternalLink, Link, RefreshCw, Unlink } from '../../icons/index.js';
import { useAppView } from '../../composables/useAppView.js';
import {
  pairingReturnSessionId,
  platformVideoRequest,
} from '../../composables/usePlatformVideoPairing.js';
import { performanceArchiveDate } from '../../utils/performanceArchivePresentation.js';
import { formatElapsedClock } from '../../utils/format.js';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import UiIconButton from '../ui/UiIconButton.vue';
import UiModal from '../ui/UiModal.vue';
import UiSegmentedControl from '../ui/UiSegmentedControl.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiStack from '../ui/UiStack.vue';
import UiTextField from '../ui/UiTextField.vue';

const props = defineProps({ sessionId: { type: String, required: true } });
const fieldId = useId();
const { openSettings } = useAppView();
const items = [
  { id: 'youtube', label: t('platformVideo.youtube') },
  { id: 'twitch', label: t('platformVideo.twitch') },
];
const opened = shallowRef(false);
const platform = shallowRef('youtube');
const links = shallowRef([]);
const account = shallowRef(null);
const candidates = shallowRef([]);
const loadingCandidates = shallowRef(false);
const candidateId = shallowRef('');
const url = shallowRef('');
const pendingAction = shallowRef('');
const busy = computed(() => Boolean(pendingAction.value));
const message = shallowRef('');
const error = shallowRef('');
const activeLink = computed(() =>
  links.value.find((link) => link.platform === platform.value),
);
const isYoutube = computed(() => platform.value === 'youtube');
const metadataHint = computed(() => {
  if (isYoutube.value || !activeLink.value) return '';
  const status = activeLink.value.metadataStatus;
  if (status === 'ready') return '';
  return t(
    status === 'notFound'
      ? 'platformVideo.metadataNotFound'
      : status === 'unconfigured'
        ? 'platformVideo.metadataUnconfigured'
        : status === 'unavailable'
          ? 'platformVideo.metadataUnavailable'
          : 'platformVideo.metadataUnchecked',
  );
});
const canChoose = computed(
  () => isYoutube.value && account.value?.configured && account.value?.channel,
);
const selectedCandidate = computed(() =>
  candidates.value.find((video) => video.videoId === candidateId.value),
);
const options = computed(() =>
  candidates.value.map((video) => ({
    value: video.videoId,
    label: video.startedAt
      ? t('platformVideo.candidate', {
          title: video.title || video.videoId,
          date: performanceArchiveDate(video.startedAt),
        })
      : video.title || video.videoId,
  })),
);

function clearDraft() {
  candidateId.value = '';
  url.value = '';
  message.value = '';
  error.value = '';
}

function show(platformId = 'youtube') {
  clearDraft();
  platform.value = platformId;
  opened.value = true;
}

function connectInSettings() {
  pairingReturnSessionId.value = props.sessionId;
  opened.value = false;
  openSettings('platform-accounts');
}

async function apply(method) {
  if (busy.value) return;
  const sessionId = props.sessionId;
  const selectedPlatform = platform.value;
  pendingAction.value = method;
  message.value = '';
  error.value = '';
  try {
    const result =
      method === 'save'
        ? await platformVideoRequest('saveSessionPlatformVideo', {
            sessionId,
            platform: selectedPlatform,
            candidateId: candidateId.value,
            url: url.value,
          })
        : method === 'refresh'
          ? await platformVideoRequest('refreshSessionPlatformVideo', sessionId)
          : await platformVideoRequest(
              method === 'remove'
                ? 'removeSessionPlatformVideo'
                : 'openSessionPlatformVideo',
              sessionId,
              selectedPlatform,
            );
    if (sessionId !== props.sessionId) return;
    if (!result.ok) {
      error.value = result.error.message;
      if (result.error.code === 'PLATFORM_VIDEO_AUTH_REQUIRED') {
        account.value = null;
        candidateId.value = '';
      }
      return;
    }
    if (method === 'refresh') {
      links.value = result.value;
    } else if (method !== 'open') {
      links.value = result.value;
      clearDraft();
      message.value = t(
        method === 'save' ? 'platformVideo.saved' : 'platformVideo.removed',
      );
    }
  } finally {
    pendingAction.value = '';
  }
}

watch(
  () => props.sessionId,
  async (sessionId, _previous, onCleanup) => {
    let current = true;
    onCleanup(() => {
      current = false;
    });
    links.value = [];
    opened.value = false;
    if (pairingReturnSessionId.value === sessionId) {
      pairingReturnSessionId.value = null;
      show();
    }
    const result = await platformVideoRequest(
      'getSessionPlatformVideos',
      sessionId,
    );
    if (current && result.ok) links.value = result.value;
  },
  { immediate: true },
);

watch(
  [opened, platform, () => props.sessionId],
  async ([open, selected, sessionId], _previous, onCleanup) => {
    let current = true;
    onCleanup(() => {
      current = false;
    });
    candidates.value = [];
    loadingCandidates.value = false;
    if (!open || selected !== 'youtube') return;
    loadingCandidates.value = true;
    const status = await platformVideoRequest('getPlatformVideoAccount');
    if (!current) return;
    account.value = status.ok ? status.value : null;
    if (canChoose.value) {
      const result = await platformVideoRequest(
        'listSessionPlatformVideos',
        sessionId,
      );
      if (!current) return;
      if (result.ok) candidates.value = result.value;
      else {
        error.value = result.error.message;
        if (result.error.code === 'PLATFORM_VIDEO_AUTH_REQUIRED') {
          account.value = { ...account.value, channel: null };
          links.value = links.value.filter((link) => !link.verified);
        }
      }
    }
    loadingCandidates.value = false;
  },
  { immediate: true },
);
</script>

<template>
  <UiIconButton
    :icon="Link"
    :label="t(links.length ? 'platformVideo.paired' : 'platformVideo.pair')"
    @click="show(links[0]?.platform)"
  />
  <UiModal
    :open="opened"
    :title="t('platformVideo.pair')"
    size="notice"
    covers-underlying
    :close-disabled="busy"
    @close="opened = false"
  >
    <UiStack direction="column" :gap="3">
      <UiSegmentedControl
        :model-value="platform"
        :items="items"
        :aria-label="t('platformVideo.platform')"
        :disabled="busy"
        @update:model-value="
          platform = $event;
          clearDraft();
        "
      />
      <UiStack v-if="activeLink" direction="column" :gap="1">
        <div class="platform-video-heading">
          <p class="platform-video-title" dir="auto">
            {{
              activeLink.title ||
              t(isYoutube ? 'platformVideo.youtube' : 'platformVideo.vod')
            }}
          </p>
          <UiStack :gap="2" align="center" wrap>
            <UiHint v-if="activeLink.channelName" dir="auto">{{
              activeLink.channelName
            }}</UiHint>
            <UiHint v-if="!activeLink.title">{{
              t('platformVideo.videoId', { id: activeLink.videoId })
            }}</UiHint>
            <UiHint v-if="activeLink.videoDate">{{
              t(
                isYoutube
                  ? 'platformVideo.broadcastStart'
                  : 'platformVideo.createdAt',
                {
                  date: performanceArchiveDate(activeLink.videoDate),
                },
              )
            }}</UiHint>
            <UiHint v-if="activeLink.durationSeconds">{{
              t('platformVideo.duration', {
                time: formatElapsedClock(activeLink.durationSeconds * 1000),
              })
            }}</UiHint>
            <UiHint>{{
              t(
                activeLink.verified
                  ? 'platformVideo.verified'
                  : 'platformVideo.manual',
              )
            }}</UiHint>
          </UiStack>
          <UiStack>
            <UiIconButton
              :icon="ExternalLink"
              :label="t('platformVideo.open')"
              :disabled="busy"
              :loading="pendingAction === 'open'"
              @click="apply('open')"
            />
            <UiIconButton
              v-if="!isYoutube"
              :icon="RefreshCw"
              :label="t('platformVideo.refreshMetadata')"
              :disabled="busy"
              :loading="pendingAction === 'refresh'"
              @click="apply('refresh')"
            />
            <UiIconButton
              :icon="Unlink"
              :label="t('platformVideo.remove')"
              :disabled="busy"
              :loading="pendingAction === 'remove'"
              @click="apply('remove')"
            />
          </UiStack>
        </div>
        <UiHint v-if="metadataHint" role="status">{{ metadataHint }}</UiHint>
      </UiStack>
      <UiHint v-if="loadingCandidates" role="status">{{
        t('platformVideo.loadingCandidates')
      }}</UiHint>
      <UiSelect
        v-if="options.length"
        :id="`platform-video-candidate-${fieldId}`"
        :label="t('platformVideo.chooseVideo')"
        :placeholder="t('platformVideo.candidatePlaceholder')"
        :options="options"
        :model-value="candidateId"
        :aria-describedby="
          selectedCandidate?.title
            ? `platform-video-title-${fieldId}`
            : undefined
        "
        :disabled="busy"
        @update:model-value="
          candidateId = $event;
          url = '';
        "
      />
      <UiHint v-else-if="canChoose && !loadingCandidates && !error">{{
        t('platformVideo.candidatesEmpty')
      }}</UiHint>
      <UiHint
        v-if="selectedCandidate?.title"
        :id="`platform-video-title-${fieldId}`"
        tone="text"
        dir="auto"
      >
        {{ selectedCandidate.title }}
      </UiHint>
      <UiTextField
        :id="`platform-video-url-${fieldId}`"
        :model-value="url"
        :label="
          t(isYoutube ? 'platformVideo.link' : 'platformVideo.twitchLink')
        "
        :hint="canChoose ? '' : t('platformVideo.manualHint')"
        :disabled="busy || loadingCandidates"
        inputmode="url"
        @update:model-value="
          url = $event;
          candidateId = '';
        "
      />
      <UiButton
        v-if="
          isYoutube && account?.configured && account.secure && !account.channel
        "
        :disabled="busy"
        @click="connectInSettings"
        >{{ t('platformVideo.connectInSettings') }}</UiButton
      >
      <UiHint v-if="error" tone="danger" role="alert">{{ error }}</UiHint>
      <UiHint v-else-if="message" role="status">{{ message }}</UiHint>
    </UiStack>
    <template #footer>
      <UiButton
        variant="accent"
        :disabled="busy || loadingCandidates || (!candidateId && !url.trim())"
        :loading="pendingAction === 'save'"
        @click="apply('save')"
      >
        {{ t(activeLink ? 'platformVideo.replace' : 'platformVideo.save') }}
      </UiButton>
    </template>
  </UiModal>
</template>

<style scoped>
.platform-video-heading {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: var(--ui-space-2);
}

.platform-video-title {
  margin: 0;
  grid-column: 1 / -1;
  font-size: var(--ui-type-body-size);
  font-weight: var(--ui-type-label-weight);
  line-height: var(--ui-type-body-line-height);
  overflow-wrap: anywhere;
}
</style>

<script setup>
import { computed, onMounted, reactive, shallowRef } from 'vue';
import { FEATURE_IDS } from '../../constants/featureGates.js';
import { UserRound } from '../../icons/index.js';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useAppView } from '../../composables/useAppView.js';
import { useFeatureGates } from '../../composables/useFeatureGates.js';
import {
  pairingReturnSessionId,
  platformVideoRequest,
} from '../../composables/usePlatformVideoPairing.js';
import { useYoutubeLoginSettings } from '../../composables/useYoutubeLoginSettings.js';
import { formatLocalDateTime } from '../../utils/format.js';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import SettingsSection from './SettingsSection.vue';
import YoutubeLoginRow from './YoutubeLoginRow.vue';

const account = shallowRef(null);
const spotify = shallowRef(null);
const spotifyReadFailed = shallowRef(false);
const spotifyClearing = shallowRef(false);
const spotifyBusy = shallowRef('');
const spotifyMessage = shallowRef('');
const busy = shallowRef('');
const message = shallowRef('');
const { confirm } = useAppConfirmation();
const { openPerformanceArchive } = useAppView();
const { isFeatureEnabled } = useFeatureGates();
const youtubeLogin = reactive(useYoutubeLoginSettings());

const youtubeStatus = computed(() => {
  if (!account.value) return '';
  if (account.value.needsReset) return t('platformVideo.reconnectRequired');
  return t(
    account.value.channel
      ? 'platformVideo.encrypted'
      : 'platformVideo.notConnected',
  );
});
const youtubeDates = computed(() => {
  const { savedAt, retainedUntil } = account.value ?? {};
  if (!savedAt || !retainedUntil) return '';
  return t('platformVideo.youtubeDates', {
    date: formatLocalDateTime(savedAt),
    until: formatLocalDateTime(retainedUntil),
  });
});
const youtubeIdentity = computed(() => {
  const { name, handle } = account.value?.channel ?? {};
  return [name, handle].filter(Boolean).join(' · ');
});
const spotifyStatus = computed(() => {
  const status = spotify.value;
  if (!status) return '';
  if (status.needsReset) return t('platformVideo.reconnectRequired');
  if (!status.configured) return t('platformVideo.authorizationNotConfigured');
  return t(
    status.bound ? 'platformVideo.encrypted' : 'platformVideo.notConnected',
  );
});

async function readSpotifyStatus() {
  try {
    const status = await window.Utawakui.getSpotifyPlaylistImportStatus();
    spotify.value = status;
    spotifyReadFailed.value = !status;
  } catch {
    spotifyReadFailed.value = true;
  }
}

async function clearSpotifyProfile() {
  spotifyClearing.value = true;
  spotifyReadFailed.value = false;
  try {
    await window.Utawakui.clearSpotifyPlaylistProfile();
    spotify.value = { ...spotify.value, profile: null };
  } catch {
    spotifyReadFailed.value = true;
  } finally {
    spotifyClearing.value = false;
  }
}

async function runSpotifyBinding(method, operation) {
  if (spotifyBusy.value) return;
  spotifyBusy.value = operation;
  spotifyMessage.value = '';
  try {
    const result = await platformVideoRequest(method);
    if (result.ok) spotify.value = result.value;
    else if (result.error.code !== 'PLATFORM_VIDEO_CANCELLED')
      spotifyMessage.value = result.error.message;
  } finally {
    spotifyBusy.value = '';
  }
}

async function unbindSpotify() {
  if (
    spotifyBusy.value ||
    !(await confirm({
      title: t('platformVideo.unbindSpotifyTitle'),
      subject: spotify.value?.profile?.name,
      message: t('platformVideo.unbindSpotifyHint'),
      confirmLabel: t('platformVideo.unbindAccount'),
      intent: 'danger',
    }))
  )
    return;
  await runSpotifyBinding('unbindSpotifyAccount', 'unbind');
}

async function run(method, operation) {
  if (busy.value) return;
  busy.value = operation;
  message.value = '';
  try {
    const result = await platformVideoRequest(method);
    if (result.ok) {
      account.value = result.value;
      if (result.value.revoked === false)
        message.value = t('platformVideo.revokeUnconfirmed');
    } else if (result.error.code !== 'PLATFORM_VIDEO_CANCELLED') {
      message.value = result.error.message;
      if (result.error.code === 'PLATFORM_VIDEO_AUTH_REQUIRED') {
        const status = await platformVideoRequest('getPlatformVideoAccount');
        if (status.ok) account.value = status.value;
      }
    }
  } finally {
    busy.value = '';
  }
}

async function disconnect() {
  if (
    busy.value ||
    !(await confirm({
      title: t('platformVideo.disconnectTitle'),
      subject: account.value?.channel?.name,
      message: t('platformVideo.disconnectHint'),
      confirmLabel: t('platformVideo.disconnect'),
      intent: 'danger',
    }))
  )
    return;
  await run('disconnectPlatformVideoAccount', 'disconnect');
}

onMounted(() => {
  run('getPlatformVideoAccount', 'read');
  readSpotifyStatus();
  youtubeLogin.refresh();
});
</script>

<template>
  <SettingsSection
    id="settings-platform-accounts"
    :title="t('platformVideo.accounts')"
    tabindex="-1"
  >
    <template v-if="pairingReturnSessionId" #actions>
      <UiButton
        :disabled="Boolean(busy)"
        @click="openPerformanceArchive(pairingReturnSessionId)"
      >
        {{ t('platformVideo.returnToPairing') }}
      </UiButton>
    </template>
    <SettingsDocumentItem
      :title="t('platformVideo.youtubeAccount')"
      :icon="UserRound"
      :avatar-src="account?.channel?.avatarUrl ?? ''"
      :value="youtubeIdentity"
      :status="youtubeStatus"
      :status-tone="account?.channel ? 'success' : 'muted'"
      status-live
      :description="
        busy === 'connect'
          ? t('platformVideo.authorizeHint')
          : account && !account.configured
            ? t('platformVideo.notConfigured')
            : account && (!account.secure || account.needsReset)
              ? t('platformVideo.authorizationLocked')
              : t('platformVideo.youtubeAccess')
      "
      :guidance="youtubeDates"
    >
      <template #actions>
        <UiButton
          v-if="busy === 'connect'"
          @click="platformVideoRequest('cancelPlatformVideoAccount')"
        >
          {{ t('common.cancel') }}
        </UiButton>
        <template v-else-if="account?.channel || account?.needsReset">
          <UiButton
            v-if="account?.channel && account.configured"
            :loading="busy === 'refresh-channel'"
            :disabled="Boolean(busy)"
            @click="run('refreshPlatformVideoChannel', 'refresh-channel')"
          >
            {{ t('platformVideo.refreshAccount') }}
          </UiButton>
          <UiButton
            :loading="busy === 'disconnect'"
            :disabled="Boolean(busy)"
            @click="disconnect"
          >
            {{ t('platformVideo.disconnect') }}
          </UiButton>
        </template>
        <UiButton
          v-else
          variant="secondary"
          :aria-label="t('platformVideo.connectYouTube')"
          :disabled="Boolean(busy) || !account?.configured || !account.secure"
          @click="run('connectPlatformVideoAccount', 'connect')"
        >
          {{ t('platformVideo.bindAccount') }}
        </UiButton>
      </template>
      <template v-if="message" #feedback>
        <UiHint tone="warning" role="status">{{ message }}</UiHint>
      </template>
    </SettingsDocumentItem>
    <YoutubeLoginRow
      :login="youtubeLogin"
      :feature-enabled="isFeatureEnabled(FEATURE_IDS.PROVIDER_FLOW)"
      @set-source="youtubeLogin.setSource"
      @import-file="youtubeLogin.importFile"
      @remove-file="youtubeLogin.removeFile"
      @refresh="youtubeLogin.refresh"
    />
    <SettingsDocumentItem
      :title="t('platformVideo.spotify')"
      :icon="UserRound"
      :avatar-src="spotify?.profile?.avatarUrl ?? ''"
      :value="spotify?.profile?.name"
      :status="spotifyStatus"
      :status-tone="spotify?.bound ? 'success' : 'muted'"
      status-live
      :description="
        spotifyBusy === 'bind'
          ? t('platformVideo.authorizeHint')
          : spotifyReadFailed
            ? t('platformVideo.fallbackError')
            : spotify?.configured && !spotify.secure
              ? t('platformVideo.authorizationLocked')
              : spotify?.configured
                ? t('platformVideo.spotifyBindingAccess')
                : ''
      "
      :guidance="
        spotify?.savedAt
          ? t('platformVideo.spotifyBoundAt', {
              date: formatLocalDateTime(spotify.savedAt),
            })
          : spotify?.lastAuthorizedAt
            ? t('platformVideo.lastAuthorized', {
                date: formatLocalDateTime(spotify.lastAuthorizedAt),
              })
            : ''
      "
    >
      <template #actions>
        <UiButton
          v-if="spotifyBusy === 'bind'"
          @click="platformVideoRequest('cancelSpotifyBinding')"
        >
          {{ t('common.cancel') }}
        </UiButton>
        <UiButton
          v-else-if="spotify?.bound || spotify?.needsReset"
          :loading="spotifyBusy === 'unbind'"
          @click="unbindSpotify"
        >
          {{ t('platformVideo.unbindAccount') }}
        </UiButton>
        <UiButton
          v-else
          variant="secondary"
          :aria-label="t('platformVideo.bindSpotify')"
          :disabled="!spotify?.configured || !spotify.secure"
          @click="runSpotifyBinding('bindSpotifyAccount', 'bind')"
        >
          {{ t('platformVideo.bindAccount') }}
        </UiButton>
        <UiButton
          v-if="spotify?.profile && !spotify.bound && !spotifyBusy"
          :loading="spotifyClearing"
          @click="clearSpotifyProfile"
        >
          {{ t('platformVideo.clearSpotifyProfile') }}
        </UiButton>
      </template>
      <template v-if="spotifyMessage" #feedback>
        <UiHint tone="warning" role="status">{{ spotifyMessage }}</UiHint>
      </template>
    </SettingsDocumentItem>
    <SettingsDocumentItem
      :title="t('platformVideo.twitch')"
      :status="t('platformVideo.manual')"
      :description="t('platformVideo.twitchManual')"
    />
  </SettingsSection>
</template>

<script setup>
import { onMounted, shallowRef } from 'vue';
import { useAppConfirmation } from '../../composables/useAppConfirmation.js';
import { useAppView } from '../../composables/useAppView.js';
import {
  pairingReturnSessionId,
  platformVideoRequest,
} from '../../composables/usePlatformVideoPairing.js';
import { t } from '../../utils/i18n.js';
import UiButton from '../ui/UiButton.vue';
import UiHint from '../ui/UiHint.vue';
import SettingsDocumentItem from './SettingsDocumentItem.vue';
import SettingsSection from './SettingsSection.vue';

const account = shallowRef(null);
const busy = shallowRef('');
const message = shallowRef('');
const { confirm } = useAppConfirmation();
const { openPerformanceArchive } = useAppView();

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

onMounted(() => run('getPlatformVideoAccount', 'read'));
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
      :title="t('platformVideo.youtube')"
      :value="account?.channel?.name"
      :status="
        account
          ? t(
              account.channel
                ? 'platformVideo.readOnly'
                : 'platformVideo.notConnected',
            )
          : ''
      "
      :description="
        busy === 'connect'
          ? t('platformVideo.authorizeHint')
          : account && !account.configured
            ? t('platformVideo.notConfigured')
            : account && (!account.secure || account.needsReset)
              ? t('platformVideo.secureUnavailable')
              : ''
      "
    >
      <template #actions>
        <UiButton
          v-if="busy === 'connect'"
          @click="platformVideoRequest('cancelPlatformVideoAccount')"
        >
          {{ t('common.cancel') }}
        </UiButton>
        <UiButton
          v-else-if="account?.channel || account?.needsReset"
          :loading="busy === 'disconnect'"
          @click="disconnect"
        >
          {{ t('platformVideo.disconnect') }}
        </UiButton>
        <UiButton
          v-else-if="account?.configured && account.secure"
          variant="secondary"
          :aria-label="t('platformVideo.connectYouTube')"
          :disabled="Boolean(busy)"
          @click="run('connectPlatformVideoAccount', 'connect')"
        >
          {{ t('platformVideo.connect') }}
        </UiButton>
      </template>
      <template v-if="message" #feedback>
        <UiHint tone="warning" role="status">{{ message }}</UiHint>
      </template>
    </SettingsDocumentItem>
    <SettingsDocumentItem
      :title="t('platformVideo.twitch')"
      :description="t('platformVideo.twitchManual')"
    />
  </SettingsSection>
</template>

<script setup>
import { Minus, Plus, Volume1, Volume2, VolumeX } from '../icons/index.js';
import audioCommands from '../../shared/companionAudioCommands.json';
import UiButton from '../components/ui/UiButton.vue';
import UiButtonGroup from '../components/ui/UiButtonGroup.vue';
import UiIconButton from '../components/ui/UiIconButton.vue';
import UiSwitch from '../components/ui/UiSwitch.vue';
import { t } from '../utils/i18n.js';

defineProps({
  disabled: { type: Boolean, default: false },
  keyLabel: { type: String, default: '' },
  tempoRate: { type: Number, default: 1 },
  guideVocal: { type: Object, default: null },
  lockScreenSupported: { type: Boolean, default: false },
  lockScreenEnabled: { type: Boolean, default: false },
});
const emit = defineEmits(['command', 'update:lockScreenEnabled']);

const groups = [
  {
    key: 'key',
    buttons: [
      ['player.transpose-down', Minus, 'keyDown'],
      ['player.transpose-up', Plus, 'keyUp'],
    ],
  },
  {
    key: 'volume',
    buttons: [
      ['player.volume-down', Volume1, 'volumeDown'],
      ['player.volume-up', Volume2, 'volumeUp'],
      ['player.mute', VolumeX, 'mute'],
    ],
  },
];
const tempos = Object.entries(audioCommands).filter(
  ([, value]) => 'tempoRate' in value,
);
const mixes = ['accompaniment', 'guide-vocal'];
</script>

<template>
  <div class="companion-remote-controls">
    <section class="companion-remote-controls__group">
      <h2>{{ t('companion.remote.mix') }}</h2>
      <UiButtonGroup :label="t('companion.remote.mix')">
        <UiButton
          v-for="mix in mixes"
          :key="mix"
          :disabled="disabled || !guideVocal?.available"
          :active="guideVocal?.enabled === (mix === 'guide-vocal')"
          :aria-pressed="
            guideVocal
              ? guideVocal.enabled === (mix === 'guide-vocal')
              : undefined
          "
          @click="emit('command', `player.${mix}`)"
          >{{ t(`companion.remote.${mix}`) }}</UiButton
        >
      </UiButtonGroup>
      <p v-if="!guideVocal?.available">
        {{
          t(
            guideVocal
              ? 'companion.remote.mixFollowsCapture'
              : 'companion.remote.mixUnavailable',
          )
        }}
      </p>
    </section>
    <section
      v-for="group in groups"
      :key="group.key"
      class="companion-remote-controls__group"
    >
      <header class="companion-remote-controls__group-header">
        <h2>{{ t(`companion.remote.groups.${group.key}`) }}</h2>
        <UiButton
          v-if="group.key === 'key'"
          :disabled="disabled"
          @click="emit('command', 'player.transpose-original')"
        >
          {{ t('companion.remote.originalKey') }}
        </UiButton>
      </header>
      <p v-if="group.key === 'key'">
        {{ keyLabel || t('performer.track.originalKey') }}
      </p>
      <UiButtonGroup :label="t(`companion.remote.groups.${group.key}`)">
        <UiIconButton
          v-for="[command, icon, label] in group.buttons"
          :key="command"
          :icon="icon"
          :label="t(`companion.remote.${label}`)"
          size="lg"
          :disabled="disabled"
          @click="emit('command', command)"
        />
      </UiButtonGroup>
    </section>
    <section
      class="companion-remote-controls__group companion-remote-controls__group--tempo"
    >
      <h2>{{ t('companion.remote.tempo') }}</h2>
      <p>{{ t('companion.remote.tempoValue', { value: tempoRate }) }}</p>
      <UiButtonGroup :label="t('companion.remote.tempo')">
        <UiButton
          v-for="[command, value] in tempos"
          :key="command"
          :disabled="disabled"
          :active="tempoRate === value.tempoRate"
          :aria-pressed="tempoRate === value.tempoRate"
          @click="emit('command', command)"
          >{{
            t('companion.remote.tempoValue', { value: value.tempoRate })
          }}</UiButton
        >
      </UiButtonGroup>
    </section>
    <section
      v-if="lockScreenSupported"
      class="companion-remote-controls__group companion-remote-controls__group--wide"
    >
      <UiSwitch
        id="companion-lock-screen"
        :label="t('companion.remote.lockScreen')"
        :hint="t('companion.remote.lockScreenHint')"
        :model-value="lockScreenEnabled"
        @update:model-value="emit('update:lockScreenEnabled', $event)"
      />
    </section>
  </div>
</template>

<style scoped>
.companion-remote-controls {
  display: grid;
  grid-template-columns: repeat(
    auto-fit,
    minmax(min(100%, var(--ui-companion-remote-group-min-inline-size)), 1fr)
  );
  gap: var(--ui-space-2);
}

.companion-remote-controls__group {
  display: grid;
  justify-items: start;
  align-content: start;
  gap: var(--ui-space-1);
  padding: var(--ui-space-2);
  border-radius: var(--ui-radius-md);
  background: var(--ui-companion-panel);
}

.companion-remote-controls__group h2 {
  font-size: var(--ui-type-subtitle-size);
  font-weight: var(--ui-type-subtitle-weight);
  line-height: var(--ui-type-subtitle-line-height);
}

.companion-remote-controls__group-header {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  justify-self: stretch;
  gap: var(--ui-space-1);
}

.companion-remote-controls__group p {
  color: var(--ui-color-text-muted);
  font-size: var(--ui-type-caption-size);
  line-height: var(--ui-type-caption-line-height);
}

.companion-remote-controls__group :deep(.ui-button-group) {
  flex-wrap: wrap;
}

.companion-remote-controls__group--tempo,
.companion-remote-controls__group--wide {
  grid-column: 1 / -1;
}

.companion-remote-controls__group--tempo :deep(.ui-btn) {
  min-inline-size: var(--ui-control-height-live);
  padding-inline: var(--ui-space-1);
}
</style>

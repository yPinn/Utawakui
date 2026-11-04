import {
  CircleAlert,
  CircleDashed,
  Clock,
  Loader2,
  MicVocal,
  Pause,
  Play,
  Volume2,
} from '../../icons/index.js';
import { t } from '../../utils/i18n.js';

export function projectBgmPrimaryAction({
  phase = 'idle',
  hasTrack = false,
} = {}) {
  const playing = phase === 'bgm-playing';
  const locked = [
    'stopping-bgm',
    'track-preroll',
    'track-active',
    'postroll-silence',
  ].includes(phase);
  return {
    intent: playing ? 'pause' : 'play',
    icon: playing ? Pause : Play,
    label: playing ? t('bgm.pause') : t('bgm.play'),
    disabled: !playing && (!hasTrack || locked),
  };
}

const OPERATIONAL_STATUS = Object.freeze({
  idle: {
    label: t('bgm.standby'),
    accessibleLabel: t('bgm.standby'),
    icon: CircleDashed,
    tone: 'muted',
  },
  'bgm-playing': {
    label: t('bgm.playing'),
    accessibleLabel: t('bgm.playing'),
    icon: Volume2,
    tone: 'current',
  },
  'stopping-bgm': {
    label: t('bgm.fading'),
    accessibleLabel: t('bgm.fading'),
    icon: Loader2,
    tone: 'warning',
  },
  'track-preroll': {
    label: t('bgm.preRoll'),
    accessibleLabel: t('bgm.preRollLabel'),
    icon: Clock,
    tone: 'muted',
  },
  'track-active': {
    label: t('bgm.singing'),
    accessibleLabel: t('bgm.singingLabel'),
    icon: MicVocal,
    tone: 'accent',
  },
  'track-paused': {
    label: t('bgm.singingPaused'),
    accessibleLabel: t('bgm.singingPausedLabel'),
    icon: Pause,
    tone: 'muted',
  },
  'postroll-silence': {
    label: t('bgm.postRoll'),
    accessibleLabel: t('bgm.postRoll'),
    icon: Clock,
    tone: 'muted',
  },
  'manual-hold': {
    label: t('bgm.paused'),
    accessibleLabel: t('bgm.pausedLabel'),
    icon: Pause,
    tone: 'muted',
  },
});

export function projectBgmOperationalStatus({
  phase = 'idle',
  restorePending = false,
  error = '',
} = {}) {
  if (error) {
    return {
      label: error,
      accessibleLabel: t('bgm.failedNamed', { error }),
      icon: CircleAlert,
      tone: 'danger',
    };
  }

  const status = OPERATIONAL_STATUS[phase] ?? OPERATIONAL_STATUS.idle;
  if (!restorePending) return { ...status };

  return {
    ...status,
    label: t('bgm.restoreAfter', { status: status.label }),
    accessibleLabel: t('bgm.restoreAfterLabel', {
      status: status.accessibleLabel,
    }),
  };
}

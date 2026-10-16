import {
  CircleAlert,
  CircleDashed,
  Clock,
  Loader2,
  MicVocal,
  Pause,
  Volume2,
} from '../../icons/index.js';

const OPERATIONAL_STATUS = Object.freeze({
  idle: {
    label: 'BGM 待命',
    accessibleLabel: 'BGM 待命',
    icon: CircleDashed,
    tone: 'muted',
  },
  'bgm-playing': {
    label: 'BGM 播放中',
    accessibleLabel: 'BGM 播放中',
    icon: Volume2,
    tone: 'current',
  },
  'stopping-bgm': {
    label: 'BGM 淡出中',
    accessibleLabel: 'BGM 淡出中',
    icon: Loader2,
    tone: 'warning',
  },
  'track-preroll': {
    label: '曲前留白',
    accessibleLabel: '曲目前留白',
    icon: Clock,
    tone: 'muted',
  },
  'track-active': {
    label: '演唱中',
    accessibleLabel: '演唱曲目播放中',
    icon: MicVocal,
    tone: 'accent',
  },
  'track-paused': {
    label: '演唱暫停',
    accessibleLabel: '演唱曲目已暫停',
    icon: Pause,
    tone: 'muted',
  },
  'postroll-silence': {
    label: '曲後留白',
    accessibleLabel: '曲後留白',
    icon: Clock,
    tone: 'muted',
  },
  'manual-hold': {
    label: 'BGM 暫停',
    accessibleLabel: 'BGM 已暫停',
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
      accessibleLabel: `BGM 操作失敗：${error}`,
      icon: CircleAlert,
      tone: 'danger',
    };
  }

  const status = OPERATIONAL_STATUS[phase] ?? OPERATIONAL_STATUS.idle;
  if (!restorePending) return { ...status };

  return {
    ...status,
    label: `${status.label} · 曲後回復`,
    accessibleLabel: `${status.accessibleLabel}，曲後恢復 BGM`,
  };
}

export function projectBgmShellStatus({
  phase = 'idle',
  audibleLane = null,
  error = '',
} = {}) {
  if (error) return { state: 'attention', label: 'BGM 操作失敗' };
  if (phase === 'stopping-bgm') {
    return { state: 'transition', label: 'BGM 淡出中' };
  }
  if (phase === 'track-preroll') {
    return { state: 'transition', label: '曲前留白' };
  }
  if (phase === 'postroll-silence') {
    return { state: 'transition', label: '曲後留白' };
  }
  if (phase === 'bgm-playing' || audibleLane === 'bgm') {
    return { state: 'playing', label: 'BGM 播放中' };
  }
  return { state: 'idle', label: '' };
}

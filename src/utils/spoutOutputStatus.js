import { t } from './i18n.js';
export function describeSpoutOutputStatus(status = {}) {
  if (status.supported === false) {
    return {
      state: 'unsupported',
      label: t('output.spout.unsupported'),
      tone: 'muted',
      detail: t('output.spout.unsupportedDetail'),
    };
  }

  const lifecycle = status.observed?.lifecycle ?? 'stopped';
  if (lifecycle === 'starting') {
    return {
      state: 'starting',
      label: t('output.spout.starting'),
      tone: 'warning',
      detail: t('output.spout.startingDetail'),
    };
  }
  if (lifecycle === 'stopping') {
    return {
      state: 'stopping',
      label: t('output.spout.stopping'),
      tone: 'warning',
      detail: t('output.spout.stoppingDetail'),
    };
  }
  if (lifecycle === 'sending') {
    return {
      state: 'sending',
      label: t('output.spout.sending'),
      tone: 'success',
      detail: status.effective?.surface?.senderName ?? 'Utawakui.Lyrics',
    };
  }
  if (lifecycle === 'error') {
    return {
      state: 'error',
      label: t('output.spout.error'),
      tone: 'danger',
      detail: status.error?.message ?? t('output.spout.errorDetail'),
    };
  }
  return {
    state: 'stopped',
    label: t('output.spout.stopped'),
    tone: 'muted',
    detail: 'Utawakui.Lyrics',
  };
}

import { t } from './i18n.js';
const UNAVAILABLE_DETAILS = Object.freeze({
  renderer_loading: t('output.status.rendererLoading'),
  renderer_crashed: t('output.status.rendererCrashed'),
  renderer_destroyed: t('output.status.rendererCrashed'),
  renderer_not_connected: t('output.status.rendererNotConnected'),
});

function clientCount(status) {
  return Number.isSafeInteger(status?.clients) && status.clients > 0
    ? status.clients
    : 0;
}

function sourceSynchronization(status) {
  return (
    status?.observed?.sourceSynchronization ?? status?.sourceSynchronization
  );
}

function unavailableReason(status) {
  return status?.observed?.unavailableReason ?? status?.unavailableReason;
}

export function describeOutputRuntimeStatus(status = {}) {
  if (status.running !== true) {
    return {
      state: 'stopped',
      label: t('output.status.stopped'),
      tone: 'muted',
      detail: t('output.status.stoppedDetail'),
    };
  }

  const synchronization = sourceSynchronization(status);
  const reason = unavailableReason(status);

  if (synchronization === 'unavailable') {
    return {
      state: 'source-unavailable',
      label: t('output.status.unavailable'),
      tone: 'danger',
      detail:
        UNAVAILABLE_DETAILS[reason] ?? t('output.status.unavailableDetail'),
    };
  }

  if (synchronization === 'syncing') {
    return {
      state: 'source-syncing',
      label: t('output.status.syncing'),
      tone: 'warning',
      detail: t('output.status.syncingDetail'),
    };
  }

  const clients = clientCount(status);
  if (synchronization === 'ready') {
    if (clients > 0) {
      return {
        state: 'client-connected',
        label: t('output.status.clientConnected'),
        tone: 'success',
        detail: t('output.status.clientsDetail', { count: clients }, clients),
      };
    }
    return {
      state: 'source-ready',
      label: t('output.status.waiting'),
      tone: 'accent',
      detail: t('output.status.waitingDetail'),
    };
  }

  if (clients > 0) {
    return {
      state: 'client-connected',
      label: t('output.status.clientConnected'),
      tone: 'success',
      detail: t('output.status.clientsDetail', { count: clients }, clients),
    };
  }

  return {
    state: 'service-running',
    label: t('output.status.running'),
    tone: 'accent',
    detail: t('output.status.runningDetail'),
  };
}

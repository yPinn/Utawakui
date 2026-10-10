const UNAVAILABLE_DETAILS = Object.freeze({
  renderer_loading: '應用程式重新載入中，請稍候。',
  renderer_crashed: '無法取得播放內容，請重新啟動應用程式。',
  renderer_destroyed: '無法取得播放內容，請重新啟動應用程式。',
  renderer_not_connected: '已啟動，正在等待播放內容。',
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
      label: '服務已停止',
      tone: 'muted',
      detail: '按「啟動」開始輸出。',
    };
  }

  const synchronization = sourceSynchronization(status);
  const reason = unavailableReason(status);

  if (synchronization === 'unavailable') {
    return {
      state: 'source-unavailable',
      label: '無法取得播放內容',
      tone: 'danger',
      detail: UNAVAILABLE_DETAILS[reason] ?? '目前無法取得播放內容。',
    };
  }

  if (synchronization === 'syncing') {
    return {
      state: 'source-syncing',
      label: '同步中',
      tone: 'warning',
      detail: '正在讀取播放內容。',
    };
  }

  const clients = clientCount(status);
  if (synchronization === 'ready') {
    if (clients > 0) {
      return {
        state: 'client-connected',
        label: 'Browser Source 已連線',
        tone: 'success',
        detail: `${clients} 個 Browser Source 已連線。`,
      };
    }
    return {
      state: 'source-ready',
      label: '等待連線',
      tone: 'accent',
      detail: '到「工作台」複製網址，或直接拖進直播軟體。',
    };
  }

  if (clients > 0) {
    return {
      state: 'client-connected',
      label: 'Browser Source 已連線',
      tone: 'success',
      detail: `${clients} 個 Browser Source 已連線。`,
    };
  }

  return {
    state: 'service-running',
    label: '已啟動',
    tone: 'accent',
    detail: '等待 Browser Source 連線。',
  };
}

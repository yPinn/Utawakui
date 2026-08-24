const UNAVAILABLE_DETAILS = Object.freeze({
  renderer_loading: '控制面板正在重新載入，等待目前播放資料。',
  renderer_crashed: '播放器資料來源已中斷，請重新啟動應用程式。',
  renderer_destroyed: '播放器資料來源已中斷，請重新啟動應用程式。',
  renderer_not_connected: '本機服務已啟動，但尚未收到播放器資料。',
});

function clientCount(status) {
  return Number.isSafeInteger(status?.clients) && status.clients > 0
    ? status.clients
    : 0;
}

export function describeOutputRuntimeStatus(status = {}) {
  if (status.running !== true) {
    return {
      state: 'stopped',
      label: '服務已停止',
      tone: 'muted',
      detail: '本機服務未啟動。',
    };
  }

  const sourceSynchronization =
    status.observed?.sourceSynchronization ?? status.sourceSynchronization;
  const unavailableReason =
    status.observed?.unavailableReason ?? status.unavailableReason;

  if (sourceSynchronization === 'unavailable') {
    return {
      state: 'source-unavailable',
      label: '資料來源未連線',
      tone: 'danger',
      detail:
        UNAVAILABLE_DETAILS[unavailableReason] ??
        '本機服務已啟動，但播放器資料來源目前不可用。',
    };
  }

  if (sourceSynchronization === 'syncing') {
    return {
      state: 'source-syncing',
      label: '正在同步資料',
      tone: 'warning',
      detail: '正在接收播放器、佇列與歌詞狀態。',
    };
  }

  const clients = clientCount(status);
  if (sourceSynchronization === 'ready') {
    if (clients > 0) {
      return {
        state: 'client-connected',
        label: 'Browser Source 已連線',
        tone: 'success',
        detail: `${clients} 個 Browser Source 連線，播放資料已同步。`,
      };
    }
    return {
      state: 'source-ready',
      label: '資料已同步',
      tone: 'accent',
      detail: '播放資料已就緒，等待 Browser Source 連線。',
    };
  }

  if (clients > 0) {
    return {
      state: 'client-connected',
      label: 'Browser Source 已連線',
      tone: 'success',
      detail: `${clients} 個 Browser Source 連線。`,
    };
  }

  return {
    state: 'service-running',
    label: '服務可用',
    tone: 'accent',
    detail: '等待 Browser Source 連線。',
  };
}

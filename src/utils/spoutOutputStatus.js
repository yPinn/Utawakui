export function describeSpoutOutputStatus(status = {}) {
  if (status.supported === false) {
    return {
      state: 'unsupported',
      label: '不支援',
      tone: 'muted',
      detail: '僅支援 Windows x64。',
    };
  }

  const lifecycle = status.observed?.lifecycle ?? 'stopped';
  if (lifecycle === 'starting') {
    return {
      state: 'starting',
      label: '啟動中',
      tone: 'warning',
      detail: '正在啟動輸出。',
    };
  }
  if (lifecycle === 'stopping') {
    return {
      state: 'stopping',
      label: '停止中',
      tone: 'warning',
      detail: '正在關閉 Spout2 sender。',
    };
  }
  if (lifecycle === 'sending') {
    return {
      state: 'sending',
      label: '輸出中',
      tone: 'success',
      detail: status.effective?.surface?.senderName ?? 'Utawakui.Lyrics',
    };
  }
  if (lifecycle === 'error') {
    return {
      state: 'error',
      label: '錯誤',
      tone: 'danger',
      detail: status.error?.message ?? 'Spout2 sender 未啟動。',
    };
  }
  return {
    state: 'stopped',
    label: '未啟動',
    tone: 'muted',
    detail: 'Utawakui.Lyrics',
  };
}

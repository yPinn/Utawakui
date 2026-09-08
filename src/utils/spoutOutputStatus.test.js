import { describe, expect, it } from 'vitest';
import { describeSpoutOutputStatus } from './spoutOutputStatus.js';

describe('Spout output status presentation', () => {
  it.each([
    [
      { supported: false },
      {
        state: 'unsupported',
        label: '不支援',
        tone: 'muted',
        detail: '僅支援 Windows x64。',
      },
    ],
    [
      { observed: { lifecycle: 'starting' } },
      {
        state: 'starting',
        label: '啟動中',
        tone: 'warning',
        detail: '正在啟動輸出。',
      },
    ],
    [
      {
        observed: { lifecycle: 'sending' },
        effective: { surface: { senderName: 'Utawakui.Lyrics' } },
      },
      {
        state: 'sending',
        label: '輸出中',
        tone: 'success',
        detail: 'Utawakui.Lyrics',
      },
    ],
    [
      {
        observed: { lifecycle: 'error' },
        error: { message: 'Spout2 元件無法載入。' },
      },
      {
        state: 'error',
        label: '錯誤',
        tone: 'danger',
        detail: 'Spout2 元件無法載入。',
      },
    ],
    [
      { observed: { lifecycle: 'stopped' } },
      {
        state: 'stopped',
        label: '未啟動',
        tone: 'muted',
        detail: 'Utawakui.Lyrics',
      },
    ],
  ])(
    'maps lifecycle state without claiming a receiver connection',
    (status, expected) => {
      expect(describeSpoutOutputStatus(status)).toEqual(expected);
    },
  );
});

import { describe, expect, it } from 'vitest';
import { describeOutputRuntimeStatus } from './outputRuntimeStatus.js';

describe('describeOutputRuntimeStatus', () => {
  it('reports a stopped service before considering source or clients', () => {
    expect(
      describeOutputRuntimeStatus({
        running: false,
        clients: 2,
        observed: { sourceSynchronization: 'ready' },
      }),
    ).toEqual({
      state: 'stopped',
      label: '服務已停止',
      tone: 'muted',
      detail: '本機服務未啟動。',
    });
  });

  it('distinguishes an unavailable renderer source from a running server', () => {
    expect(
      describeOutputRuntimeStatus({
        running: true,
        clients: 1,
        observed: {
          sourceSynchronization: 'unavailable',
          unavailableReason: 'renderer_not_connected',
        },
      }),
    ).toEqual({
      state: 'source-unavailable',
      label: '資料來源未連線',
      tone: 'danger',
      detail: '本機服務已啟動，但尚未收到播放器資料。',
    });
  });

  it('reports source synchronization before Browser Source connectivity', () => {
    expect(
      describeOutputRuntimeStatus({
        running: true,
        clients: 1,
        observed: { sourceSynchronization: 'syncing' },
      }),
    ).toEqual({
      state: 'source-syncing',
      label: '正在同步資料',
      tone: 'warning',
      detail: '正在接收播放器、佇列與歌詞狀態。',
    });
  });

  it('distinguishes ready data from a connected Browser Source', () => {
    expect(
      describeOutputRuntimeStatus({
        running: true,
        clients: 0,
        observed: { sourceSynchronization: 'ready' },
      }),
    ).toEqual({
      state: 'source-ready',
      label: '資料已同步',
      tone: 'accent',
      detail: '播放資料已就緒，等待 Browser Source 連線。',
    });

    expect(
      describeOutputRuntimeStatus({
        running: true,
        clients: 2,
        observed: { sourceSynchronization: 'ready' },
      }),
    ).toEqual({
      state: 'client-connected',
      label: 'Browser Source 已連線',
      tone: 'success',
      detail: '2 個 Browser Source 連線，播放資料已同步。',
    });
  });

  it('keeps a safe legacy fallback when source diagnostics are absent', () => {
    expect(describeOutputRuntimeStatus({ running: true, clients: 0 })).toEqual({
      state: 'service-running',
      label: '服務可用',
      tone: 'accent',
      detail: '等待 Browser Source 連線。',
    });
  });

  it.each([
    ['renderer_loading', '控制面板正在重新載入，等待目前播放資料。'],
    ['renderer_crashed', '播放器資料來源已中斷，請重新啟動應用程式。'],
    ['renderer_destroyed', '播放器資料來源已中斷，請重新啟動應用程式。'],
  ])('explains the %s unavailable reason', (reason, detail) => {
    expect(
      describeOutputRuntimeStatus({
        running: true,
        observed: {
          sourceSynchronization: 'unavailable',
          unavailableReason: reason,
        },
      }).detail,
    ).toBe(detail);
  });
});

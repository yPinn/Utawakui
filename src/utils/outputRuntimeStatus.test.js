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
      detail: '按「啟動」開始輸出。',
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
      label: '無法取得播放內容',
      tone: 'danger',
      detail: '已啟動，正在等待播放內容。',
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
      label: '同步中',
      tone: 'warning',
      detail: '正在讀取播放內容。',
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
      label: '等待連線',
      tone: 'accent',
      detail: '到「工作台」複製網址，或直接拖進直播軟體。',
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
      detail: '2 個 Browser Source 已連線。',
    });
  });

  it('keeps a safe legacy fallback when source diagnostics are absent', () => {
    expect(describeOutputRuntimeStatus({ running: true, clients: 0 })).toEqual({
      state: 'service-running',
      label: '已啟動',
      tone: 'accent',
      detail: '等待 Browser Source 連線。',
    });
  });

  it.each([
    ['renderer_loading', '應用程式重新載入中，請稍候。'],
    ['renderer_crashed', '無法取得播放內容，請重新啟動應用程式。'],
    ['renderer_destroyed', '無法取得播放內容，請重新啟動應用程式。'],
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

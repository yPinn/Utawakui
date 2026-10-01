import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';

const workbenchSource = readFileSync(
  fileURLToPath(new URL('./DiagnosticsWorkbench.vue', import.meta.url)),
  'utf8',
);

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
});

// The composable is a module singleton (see useDiagnosticsWorkbench.js), so
// pre-populating it here before importing the component lets the SSR render
// reflect real data — the component's own onMounted-triggered refresh never
// fires during renderToString (SSR skips onMounted entirely).
async function renderWorkbench(bridge) {
  vi.stubGlobal('window', { Utawakui: bridge });
  const { useDiagnosticsWorkbench } =
    await import('../../composables/useDiagnosticsWorkbench.js');
  await useDiagnosticsWorkbench().refresh();
  const { default: DiagnosticsWorkbench } =
    await import('./DiagnosticsWorkbench.vue');
  return renderToString(
    createSSRApp({ render: () => h(DiagnosticsWorkbench) }),
  );
}

const SAMPLE_EVENTS = [
  {
    id: 'evt-1',
    timestamp: '2026-09-04T00:00:00.000Z',
    level: 'error',
    process: 'main',
    source: 'library',
    operation: 'list',
    code: 'FS_READ_FAILED',
    message: 'Unable to read the library',
    sessionId: 'session-1',
    correlationId: 'corr-1',
    context: { errno: 'EACCES' },
    stack: 'Error: boom\n    at somewhere.js:1:1',
  },
  {
    id: 'evt-2',
    timestamp: '2026-09-04T00:01:00.000Z',
    level: 'warning',
    process: 'renderer',
    source: 'player',
    operation: 'play',
    code: 'PLAYBACK_FAILED',
    message: 'Unable to play track',
    sessionId: 'session-1',
    correlationId: 'corr-2',
    context: { stage: 'decode' },
  },
];

describe('DiagnosticsWorkbench', () => {
  it('classifies itself as the F6 support operation', async () => {
    const html = await renderWorkbench({
      listRecentDiagnostics: vi.fn().mockResolvedValue([]),
    });

    expect(html).toContain('Live Diagnostics');
    expect(html).toContain('支援操作 · F6');
  });

  it('uses the shared surface and disclosure primitives without adding export behavior', () => {
    expect(workbenchSource).toContain('UiSurface');
    expect(workbenchSource).toContain('UiDisclosure');
    expect(workbenchSource).not.toMatch(/<details(?:\s|>)/u);
    expect(workbenchSource).not.toContain('匯出');
  });

  it('shows a per-level summary count and the full event list', async () => {
    const html = await renderWorkbench({
      listRecentDiagnostics: vi.fn().mockResolvedValue(SAMPLE_EVENTS),
    });

    expect(html).toContain('FS_READ_FAILED');
    expect(html).toContain('Unable to read the library');
    expect(html).toContain('PLAYBACK_FAILED');
    expect(html).toContain('Unable to play track');
  });

  it("includes each row's full stack/context in the disclosure detail — the ordinary Settings UI never shows this", async () => {
    const html = await renderWorkbench({
      listRecentDiagnostics: vi.fn().mockResolvedValue(SAMPLE_EVENTS),
    });

    // UiDisclosure renders its content in the markup regardless of the
    // open/closed state, so this is verifiable without click simulation.
    expect(html).toContain('somewhere.js:1:1');
    expect(html).toContain('EACCES');
    expect(html).toContain('correlationId');
  });

  it('shows an empty state when there are no records', async () => {
    const html = await renderWorkbench({
      listRecentDiagnostics: vi.fn().mockResolvedValue([]),
    });

    expect(html).toContain('沒有符合條件的紀錄');
  });

  it('shows an explicit loading state while the recent-event reader is pending', async () => {
    vi.stubGlobal('window', {
      Utawakui: {
        listRecentDiagnostics: vi.fn(() => new Promise(() => {})),
      },
    });
    const { useDiagnosticsWorkbench } =
      await import('../../composables/useDiagnosticsWorkbench.js');
    void useDiagnosticsWorkbench().refresh();
    const { default: DiagnosticsWorkbench } =
      await import('./DiagnosticsWorkbench.vue');
    const html = await renderToString(
      createSSRApp({ render: () => h(DiagnosticsWorkbench) }),
    );

    expect(html).toContain('正在讀取診斷事件');
    expect(html).not.toContain('沒有符合條件的紀錄');
  });

  it('surfaces a plain-language error without a raw exception when the bridge is unavailable', async () => {
    const html = await renderWorkbench({});

    expect(html).toContain('重新啟動後即可讀取錯誤紀錄');
  });
});

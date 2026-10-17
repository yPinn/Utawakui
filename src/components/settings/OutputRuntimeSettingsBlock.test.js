import { readFileSync } from 'node:fs';
import { createSSRApp, h, reactive } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({ value: null }));
const spout = vi.hoisted(() => ({ value: null }));

vi.mock('../../composables/useOutputRuntimeContext.js', () => ({
  useOutputRuntimeContext: () => runtime.value,
}));
vi.mock('../../composables/output/useSpoutOutput.js', () => ({
  useSpoutOutput: () => spout.value,
}));

const { default: OutputRuntimeSettingsBlock } =
  await import('./OutputRuntimeSettingsBlock.vue');
const source = readFileSync(
  new URL('./OutputRuntimeSettingsBlock.vue', import.meta.url),
  'utf8',
);

function createRuntime(overrides = {}) {
  return {
    state: reactive({
      status: { running: false },
      settings: { autoStart: true, port: 8700, displayDelayMs: 0 },
      suggestedPorts: [],
      isStarting: false,
      isStopping: false,
      isSavingSettings: false,
      error: '',
      ...overrides,
    }),
    start: vi.fn(),
    stop: vi.fn(),
    updateSettings: vi.fn(),
    refreshStatus: vi.fn(),
  };
}

function createSpout(lifecycle = 'stopped', supported = true) {
  return {
    state: reactive({
      status: {
        supported,
        desired: { frameRateProfile: 'standard' },
        observed: { lifecycle },
        error: null,
      },
      isConfiguring: false,
      isStarting: false,
      isStopping: false,
      error: '',
    }),
    refresh: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
    setFrameRateProfile: vi.fn(),
  };
}

function render() {
  return renderToString(
    createSSRApp({ render: () => h(OutputRuntimeSettingsBlock) }),
  );
}

describe('OutputRuntimeSettingsBlock', () => {
  beforeEach(() => {
    runtime.value = createRuntime();
    spout.value = createSpout();
  });

  it('shows the local service with start, auto-start, port and delay', async () => {
    const html = await render();

    expect(html).toContain('本機輸出服務');
    expect(html).toContain('按「啟動」開始輸出。');
    expect(html).toContain('自動啟動');
    expect(html).toContain('id="output-runtime-port"');
    expect(html).toContain('value="8700"');
    expect(html).toContain('畫面延遲（毫秒）');
    expect(html).toContain('畫面比聲音快就調大，慢就調小。');
    expect(html).not.toContain('可用連接埠');
    expect(html).toMatch(/<details\b(?![^>]*\bopen)[^>]*>/);
    expect(html).toContain('連接埠與畫面同步設定');
  });

  it('offers available ports when the configured port is taken', async () => {
    runtime.value = createRuntime({ suggestedPorts: [8701, 8702] });
    const html = await render();

    expect(html).toContain('連接埠被占用');
    expect(html).toContain('請選擇下方可用的連接埠。');
    expect(html).toContain('aria-label="可用連接埠"');
    expect(html).toContain('8701');
    expect(html).toMatch(/<details\b[^>]*\bopen/);
  });

  it('describes Spout2 as a transparent experimental sender', async () => {
    const html = await render();

    expect(html).toContain('Spout2 輸出');
    expect(html).toContain('Utawakui.Lyrics · 1920 × 1080 · 透明背景');
    expect(html).toContain('30 FPS');
    expect(html).toContain('60 FPS');
  });

  it('locks frame rate while Spout2 is sending and offers stop', async () => {
    spout.value = createSpout('sending');
    const html = await render();

    expect(html).toMatch(/role="radiogroup"[^>]*aria-label="Spout2 幀率"/);
    expect(html).toMatch(/role="radio"[^>]*disabled/);
    expect(html).toContain('停止');
  });

  it('explains unsupported platforms instead of the sender surface', async () => {
    spout.value = createSpout('stopped', false);
    const html = await render();

    expect(html).toContain('僅支援 Windows x64。');
    expect(html).not.toContain('Utawakui.Lyrics · 1920');
  });

  it('commits text fields on change or Enter and skips unchanged values', () => {
    expect(source).toContain('@change="commitSettings()"');
    expect(source).toContain('@keydown.enter.prevent="commitSettings()"');
    expect(source).toContain('next.displayDelayMs === currentDelay');
    expect(source).not.toContain('type="number"');
  });
});

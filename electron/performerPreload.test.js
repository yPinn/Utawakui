import Module from 'node:module';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const electron = vi.hoisted(() => ({
  contextBridge: { exposeInMainWorld: vi.fn() },
  ipcRenderer: {
    invoke: vi.fn(() => Promise.resolve()),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

const originalArgv = [...process.argv];
const originalModuleLoad = Module._load;

async function loadPerformerBridge(args = []) {
  vi.resetModules();
  process.argv = ['electron', 'app', ...args];
  Module._load = function load(request, parent, isMain) {
    if (request === 'electron') return electron;
    return originalModuleLoad.call(this, request, parent, isMain);
  };
  try {
    await import('./performerPreload.js');
  } finally {
    Module._load = originalModuleLoad;
  }
  return electron.contextBridge.exposeInMainWorld.mock.calls.findLast(
    ([name]) => name === 'UtawakuiPerformer',
  )[1];
}

const RESEARCH = '--performer-research-enabled=1';
const REVIEW = '--guide-segment-review-enabled=1';
const RESEARCH_METHODS = [
  'beginMicrophoneResearch',
  'endMicrophoneResearch',
  'analyzeCurrentGuide',
  'cancelCurrentGuide',
  'analyzeLiveVocal',
  'cancelLiveVocal',
];
const REVIEW_METHODS = [
  'loadGuideReview',
  'cancelGuideReview',
  'markGuideReview',
];

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  process.argv = [...originalArgv];
  Module._load = originalModuleLoad;
  vi.resetModules();
});

describe('performer preload research bridge', () => {
  it('hides research and review methods unless their launch flags are set', async () => {
    const plain = await loadPerformerBridge();
    for (const name of [...RESEARCH_METHODS, ...REVIEW_METHODS])
      expect(plain).not.toHaveProperty(name);

    // Review needs research too; the review flag alone exposes nothing.
    const reviewOnly = await loadPerformerBridge([REVIEW]);
    for (const name of [...RESEARCH_METHODS, ...REVIEW_METHODS])
      expect(reviewOnly).not.toHaveProperty(name);

    const research = await loadPerformerBridge([RESEARCH]);
    for (const name of RESEARCH_METHODS) expect(research).toHaveProperty(name);
    for (const name of REVIEW_METHODS)
      expect(research).not.toHaveProperty(name);
  });

  it('forwards research calls to their fixed channels with positional payloads', async () => {
    const bridge = await loadPerformerBridge([RESEARCH, REVIEW]);
    const samples = new Float32Array([0.1, -0.2]);

    await bridge.beginMicrophoneResearch();
    await bridge.endMicrophoneResearch('lease-1');
    await bridge.analyzeCurrentGuide('req-1');
    await bridge.cancelCurrentGuide('req-1');
    await bridge.analyzeLiveVocal('req-2', samples);
    await bridge.cancelLiveVocal('req-2');
    await bridge.loadGuideReview('req-3', 1200);
    await bridge.cancelGuideReview('req-3');
    await bridge.markGuideReview('req-3', 1000, 1500, 'breath');

    expect(electron.ipcRenderer.invoke.mock.calls).toEqual([
      ['performer-mic:begin'],
      ['performer-mic:end', 'lease-1'],
      ['performer-pitch:analyze', 'req-1'],
      ['performer-pitch:cancel', 'req-1'],
      ['performer-pitch:analyze-live', 'req-2', samples],
      ['performer-pitch:cancel-live', 'req-2'],
      ['performer-review:load', 'req-3', 1200],
      ['performer-review:cancel', 'req-3'],
      ['performer-review:mark', 'req-3', 1000, 1500, 'breath'],
    ]);
  });

  it('strips lyrics offset intents to action, revision and track id', async () => {
    const bridge = await loadPerformerBridge();
    await bridge.adjustLyricsOffset({
      action: 'nudge',
      revision: 2,
      trackId: 't',
      path: 'private',
    });
    await bridge.control(null);

    expect(electron.ipcRenderer.invoke.mock.calls).toEqual([
      [
        'performer-view:adjust-lyrics-offset',
        { action: 'nudge', revision: 2, trackId: 't' },
      ],
      [
        'performer-view:control',
        { action: undefined, revision: undefined, trackId: undefined },
      ],
    ]);
  });

  it('forwards window state payloads without the event object', async () => {
    const bridge = await loadPerformerBridge();
    const callback = vi.fn();
    const cleanup = bridge.onWindowState(callback);
    const listener = electron.ipcRenderer.on.mock.calls.find(
      ([channel]) => channel === 'performer-view:window-state',
    )[1];

    listener({ sender: 'private' }, { fullScreen: true });
    expect(callback).toHaveBeenCalledWith({ fullScreen: true });
    cleanup();
    expect(electron.ipcRenderer.removeListener).toHaveBeenCalledWith(
      'performer-view:window-state',
      listener,
    );
  });
});

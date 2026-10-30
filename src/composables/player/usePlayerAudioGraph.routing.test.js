import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePlayerAudioGraph } from './usePlayerAudioGraph.js';

const pitch = vi.hoisted(() => ({ nodes: [], create: null }));
vi.mock('../../utils/pitchProcessorLoader.js', () => ({
  loadPitchProcessor: async () => pitch.create,
}));

function deferred() {
  return Promise.withResolvers();
}

class Node {
  constructor(context) {
    this.context = context;
    this.edges = new Set();
    this.stream = {};
    this.gain = {
      value: 1,
      setTargetAtTime(value) {
        this.value = value;
      },
      setValueAtTime(value) {
        this.value = value;
      },
      cancelScheduledValues() {},
    };
    this.connect = vi.fn((node) => {
      this.edges.add(node);
      return node;
    });
    this.disconnect = vi.fn((node) => {
      if (node) {
        if (!this.edges.delete(node))
          throw new DOMException('Missing edge', 'InvalidAccessError');
      } else this.edges.clear();
    });
  }
}

class Context extends EventTarget {
  static instances = [];
  static waits = new Map();
  static rejects = new Set();
  static resumeWaits = new Map();
  static constructionFailures = new Set();
  constructor(options = {}) {
    super();
    if (Context.constructionFailures.has(options.sinkId))
      throw Error('construction failed');
    this.options = options;
    this.sinkId = options.sinkId ?? '';
    this.state = 'suspended';
    this.currentTime = 0;
    this.gains = [];
    this.mergers = [];
    this.bridges = [];
    this.streams = [];
    this.elements = [];
    this.destination = new Node(this);
    this.resume = vi.fn(async () => {
      await Context.resumeWaits.get(this.options.sinkId)?.promise;
      if (this.state === 'closed') throw Error('context closed');
      if (Context.rejects.has(this.sinkId)) throw Error('native unavailable');
      if (this.keepSuspended) return;
      this.state = 'running';
    });
    this.close = vi.fn(async () => {
      this.state = 'closed';
    });
    this.setSinkId = vi.fn(async (id) => {
      this.state = 'suspended';
      this.dispatchEvent(new Event('statechange'));
      await Context.waits.get(id)?.promise;
      if (Context.rejects.has(id)) throw Error('native unavailable');
      this.sinkId = id;
      this.state = 'running';
      this.dispatchEvent(new Event('sinkchange'));
      this.dispatchEvent(new Event('statechange'));
    });
    Context.instances.push(this);
  }
  createGain() {
    const n = new Node(this);
    this.gains.push(n);
    return n;
  }
  createMediaElementSource() {
    const n = new Node(this);
    this.elements.push(n);
    return n;
  }
  createChannelSplitter() {
    return new Node(this);
  }
  createChannelMerger() {
    const n = new Node(this);
    this.mergers.push(n);
    return n;
  }
  createMediaStreamDestination() {
    const n = new Node(this);
    n.tracks = [{ stop: vi.fn() }];
    n.stream.getTracks = () => n.tracks;
    this.bridges.push(n);
    return n;
  }
  createMediaStreamSource(stream) {
    const n = new Node(this);
    n.stream = stream;
    this.streams.push(n);
    return n;
  }
}

const fixtures = [];
function fixture(options = {}) {
  const audio = {
    playbackRate: 1,
    defaultPlaybackRate: 1,
    currentTime: 24,
    play: vi.fn(),
    pause: vi.fn(),
  };
  const state = {
    volume: 0,
    isMuted: false,
    captureVolume: 0.3,
    guideVocalOn: true,
    guideVocalValue: 0.7,
    captureGuideVocalOn: false,
    captureGuideVocalValue: 0.2,
    transposeSemitones: 0,
    pitchCents: 0,
    tempoRate: 1,
    isPlaying: false,
  };
  const graph = usePlayerAudioGraph({
    audio,
    state,
    reportPlayerError: () => 'bounded failure',
    monitorBridgeReturn: false,
    ...options,
  });
  graph.routeAudioGraph(true);
  graph.prepareCaptureDevice('capture');
  const f = { audio, state, graph };
  fixtures.push(f);
  return f;
}
const terminalGains = (ctx) =>
  ctx.gains.filter((n) => n.edges.has(ctx.destination));
const flush = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};

beforeEach(() => {
  Context.instances = [];
  Context.waits = new Map();
  Context.rejects = new Set();
  Context.resumeWaits = new Map();
  Context.constructionFailures = new Set();
  pitch.nodes = [];
  pitch.create = vi.fn(async (context) => {
    const n = new Node(context);
    n.schedule = vi.fn(async () => {});
    pitch.nodes.push(n);
    return n;
  });
  vi.stubGlobal('AudioContext', Context);
});
afterEach(() => {
  fixtures.splice(0).forEach(({ graph }) => graph.cleanup());
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('default-context monitor relay', () => {
  const setup = () => fixture({ monitorBridgeReturn: undefined });

  it('opens only the default monitor gate while capture and its native sink stay untouched', async () => {
    const { graph, audio, state } = setup();
    await graph.resume();
    const source = Context.instances[0];
    const captureGate = terminalGains(source)[1];
    const captureMix = source.gains[6];
    const sourceEdges = [...source.elements[0].edges];
    const wait = deferred();
    Context.resumeWaits.set('', wait);
    graph.setVolume(0.5);
    graph.setVolume(0.6);
    await flush();
    expect(Context.instances).toHaveLength(2);
    const relay = Context.instances[1];
    expect(relay.sinkId).toBe('');
    expect(terminalGains(relay)[0].gain.value).toBe(0);
    expect(captureGate.gain.value).toBe(1);
    expect(captureGate.edges.has(source.destination)).toBe(true);
    expect(source.sinkId).toBe('capture');
    expect(source.setSinkId).toHaveBeenCalledTimes(1);
    expect(source.elements).toHaveLength(1);
    expect(relay.elements).toHaveLength(0);
    expect([...source.elements[0].edges]).toEqual(sourceEdges);
    expect(source.bridges).toHaveLength(1);
    expect(relay.streams).toHaveLength(1);
    expect(relay.streams[0].stream).toBe(source.bridges[0].stream);
    expect(source.gains[2].edges.has(source.bridges[0])).toBe(true);
    expect(source.gains[3].edges.has(source.bridges[0])).toBe(true);
    expect(captureMix.edges.has(source.bridges[0])).toBe(false);
    expect(state.audioControlApplication.ok).toBe(false);
    wait.resolve();
    await flush();
    expect(terminalGains(relay)[0].gain.value).toBe(1);
    expect(terminalGains(source).map((n) => n.gain.value)).toEqual([0, 1]);
    expect(source.gains[1].gain.value).toBe(0.6);
    expect(source.setSinkId).toHaveBeenCalledTimes(1);
    expect(source.close).not.toHaveBeenCalled();
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.pause).not.toHaveBeenCalled();
    expect(audio.currentTime).toBe(24);
    const applied = await graph.resume();
    expect(applied.ok).toBe(true);
    expect(graph.isPlaybackReady(applied)).toBe(true);
    expect(Context.instances).toHaveLength(2);
    expect(source.setSinkId).toHaveBeenCalledTimes(1);
    expect(captureGate.gain.value).toBe(1);
  });

  it('keeps monitor/capture gain and DSP separate without processing the relay twice', async () => {
    const { graph, state } = setup();
    state.transposeSemitones = 2;
    state.pitchCents = 25;
    await graph.resume();
    const source = Context.instances[0];
    const captureNode = pitch.nodes[1];
    graph.setVolume(0.5);
    await flush();
    const relay = Context.instances[1];
    expect(pitch.nodes).toHaveLength(2);
    expect(pitch.nodes.every((n) => n.context === source)).toBe(true);
    expect(pitch.nodes[1]).toBe(captureNode);
    graph.setCaptureVolume(0.8);
    graph.setCaptureGuideVocalOn(true);
    graph.setCaptureGuideVocalValue(0.9);
    graph.setGuideVocalValue(0.4);
    expect(source.gains[0].gain.value).toBe(0.4);
    expect(source.gains[5].gain.value).toBe(0.9);
    expect(source.gains[7].gain.value).toBe(0.8);
    expect(relay.gains.every((n) => n.gain.value === 1)).toBe(true);
    expect((await graph.setTransposeSemitones(3)).ok).toBe(true);
    expect(Context.instances).toHaveLength(2);
    expect(source.setSinkId).toHaveBeenCalledTimes(1);
    pitch.nodes.forEach((n) =>
      expect(n.schedule).toHaveBeenLastCalledWith({
        active: true,
        semitones: 3.25,
      }),
    );
  });

  it.each(['mute', 'cancel', 'source', 'cleanup', 'timeout'])(
    'cleans only a preparing relay on %s and never promotes its late native result',
    async (action) => {
      vi.useFakeTimers();
      const { graph, state } = setup();
      await graph.resume();
      const source = Context.instances[0];
      const captureGate = terminalGains(source)[1];
      const wait = deferred();
      Context.resumeWaits.set('', wait);
      graph.setVolume(0.5);
      await flush();
      const relay = Context.instances[1];
      if (action === 'mute') graph.setMuted(true);
      if (action === 'cancel') graph.cancelAudioControlApplication();
      if (action === 'source') graph.routeAudioGraph(false);
      if (action === 'cleanup') graph.cleanup();
      if (action === 'timeout') await vi.advanceTimersByTimeAsync(10001);
      await flush();
      expect(relay.close).toHaveBeenCalledOnce();
      expect(source.setSinkId).toHaveBeenCalledTimes(1);
      if (action !== 'cleanup') {
        expect(source.close).not.toHaveBeenCalled();
        expect(captureGate.gain.value).toBe(1);
        expect(state.captureDeviceId).toBe('capture');
        expect(state.captureError).toBeNull();
      }
      if (action === 'timeout') expect(state.monitorOutputError).toBeTruthy();
      wait.resolve();
      await flush();
      expect(relay.close).toHaveBeenCalledOnce();
      expect(relay.streams[0].edges.size).toBe(0);
      expect(source.setSinkId).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['resume', 'sink', 'suspended'])(
    'fails the relay safely on %s without clearing healthy capture',
    async (action) => {
      const { graph, state } = setup();
      await graph.resume();
      const source = Context.instances[0];
      const wait = deferred();
      Context.resumeWaits.set('', wait);
      graph.setVolume(0.5);
      await flush();
      const relay = Context.instances[1];
      if (action === 'resume') Context.rejects.add('');
      if (action === 'sink') relay.sinkId = 'wrong';
      if (action === 'suspended') relay.keepSuspended = true;
      wait.resolve();
      await flush();
      expect(state.monitorOutputError).toBeTruthy();
      expect(state.captureError).toBeNull();
      expect(state.captureDeviceId).toBe('capture');
      expect(relay.close).toHaveBeenCalledOnce();
      expect(terminalGains(source).map((n) => n.gain.value)).toEqual([0, 1]);
      expect(source.setSinkId).toHaveBeenCalledTimes(1);
      Context.rejects.clear();
      Context.resumeWaits.clear();
      graph.setVolume(0.6);
      await flush();
      expect(state.monitorOutputError).toBeNull();
      expect(terminalGains(Context.instances.at(-1))[0].gain.value).toBe(1);
    },
  );

  it('retires only the monitor relay on mute and on unexpected monitor context loss', async () => {
    const { graph, state } = setup();
    await graph.resume();
    graph.setVolume(0.5);
    await flush();
    const source = Context.instances[0],
      relay = Context.instances[1];
    relay.state = 'interrupted';
    relay.dispatchEvent(new Event('statechange'));
    await flush();
    expect(state.monitorOutputError).toBeTruthy();
    expect(state.captureError).toBeNull();
    expect(relay.close).toHaveBeenCalledOnce();
    expect(source.sinkId).toBe('capture');
    expect(terminalGains(source).map((n) => n.gain.value)).toEqual([0, 1]);
    graph.setMuted(true);
    expect((await graph.resume()).ok).toBe(true);
    graph.setMuted(false);
    await flush();
    const fresh = Context.instances.at(-1);
    graph.setVolume(0);
    await flush();
    expect(fresh.close).toHaveBeenCalledOnce();
    expect(source.setSinkId).toHaveBeenCalledTimes(1);
  });

  it.each(['device', 'bgm'])(
    'retires a pending relay before a newer %s native transaction',
    async (action) => {
      const { graph } = setup();
      await graph.resume();
      const wait = deferred();
      Context.resumeWaits.set('', wait);
      graph.setVolume(0.5);
      await flush();
      const relay = Context.instances[1];
      const input = graph.registerCaptureInput({}, vi.fn());
      if (action === 'device') await graph.applyCaptureDevice('new');
      else expect(await graph.prepareCaptureOutput()).toBe(true);
      expect(relay.close).toHaveBeenCalledOnce();
      expect(Context.instances[0].sinkId).toBe('');
      expect(Context.instances.at(-1).sinkId).toBe(
        action === 'device' ? 'new' : 'capture',
      );
      input.setEnabled(true);
      wait.resolve();
      await flush();
      expect(terminalGains(Context.instances.at(-1))[0].gain.value).toBe(1);
      input.release();
    },
  );

  it('retains the live relay across controls and source routing only retires its own edges', async () => {
    const { graph } = setup();
    graph.routeAudioGraph(false);
    await graph.resume();
    graph.setVolume(0.5);
    await flush();
    const source = Context.instances[0],
      relay = Context.instances[1];
    expect((await graph.setTempoRate(1.1)).ok).toBe(true);
    expect(relay.close).not.toHaveBeenCalled();
    graph.routeAudioGraph(true);
    expect(relay.close).toHaveBeenCalledOnce();
    expect(source.close).not.toHaveBeenCalled();
    expect((await graph.resume()).ok).toBe(true);
    expect(source.setSinkId).toHaveBeenCalledTimes(1);
    graph.cleanup();
    await flush();
    expect(source.close).toHaveBeenCalledOnce();
  });

  it('replaces a stale monitor-on candidate for changed controls and quick off/on', async () => {
    const { graph } = setup();
    await graph.resume();
    const wait = deferred();
    Context.resumeWaits.set('', wait);
    graph.setVolume(0.5);
    await flush();
    const stale = Context.instances[1];
    graph.setMuted(true);
    Context.resumeWaits.clear();
    graph.setMuted(false);
    await flush();
    const active = Context.instances.at(-1);
    expect(active).not.toBe(stale);
    expect((await graph.setTransposeSemitones(2)).ok).toBe(true);
    wait.resolve();
    await flush();
    expect(stale.close).toHaveBeenCalledOnce();
    expect(active.close).not.toHaveBeenCalled();
    expect(terminalGains(active)[0].gain.value).toBe(1);
    expect(Context.instances[0].setSinkId).toHaveBeenCalledTimes(1);
  });

  it('does not keep an application-owned relay past the parent operation deadline', async () => {
    vi.useFakeTimers();
    const { graph, state } = setup();
    await graph.resume();
    graph.setVolume(0.5);
    graph.cancelAudioControlApplication();
    await flush();
    const source = Context.instances[0];
    const sourceWait = deferred(),
      relayWait = deferred();
    source.resume.mockImplementationOnce(async () => {
      await sourceWait.promise;
    });
    Context.resumeWaits.set('', relayWait);
    const start = graph.resume();
    await vi.advanceTimersByTimeAsync(6000);
    sourceWait.resolve();
    await flush();
    const relay = Context.instances.at(-1);
    expect(relay.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(4001);
    expect((await start).status).toBe('timeout');
    expect(relay.close).toHaveBeenCalledOnce();
    expect(state.monitorOutputError).toBeTruthy();
    relayWait.resolve();
    await flush();
    expect(source.setSinkId).toHaveBeenCalledTimes(1);
    expect(terminalGains(source)[1].gain.value).toBe(1);
  });

  it.each(['monitor', 'capture'])(
    'rejects promotion if %s DSP fails while the relay resumes',
    async (lane) => {
      const { graph, state } = setup();
      state.transposeSemitones = 2;
      await graph.resume();
      const wait = deferred();
      Context.resumeWaits.set('', wait);
      graph.setVolume(0.5);
      await flush();
      pitch.nodes[lane === 'monitor' ? 0 : 1].onprocessorerror();
      wait.resolve();
      await flush();
      expect(Context.instances[1].close).toHaveBeenCalledOnce();
      expect(state.monitorOutputError).toBeTruthy();
      expect(Context.instances[0].sinkId).toBe('capture');
      expect(terminalGains(Context.instances[0])[0].gain.value).toBe(0);
    },
  );

  it('retires a live relay before BGM input activation, keeping monitor and programme edges separate', async () => {
    const { graph } = setup();
    await graph.resume();
    graph.setVolume(0.5);
    await flush();
    const relay = Context.instances[1];
    const unavailable = vi.fn();
    const stream = {};
    const input = graph.registerCaptureInput(stream, unavailable);
    input.setEnabled(true);
    expect(unavailable).toHaveBeenCalledOnce();
    expect(relay.streams.every((n) => n.stream !== stream)).toBe(true);
    expect(await graph.prepareCaptureOutput()).toBe(true);
    input.setEnabled(true);
    expect(unavailable).toHaveBeenCalledOnce();
    expect(relay.close).toHaveBeenCalledOnce();
    expect(Context.instances[0].sinkId).toBe('');
    input.release();
  });

  it.each(['cancel', 'controls'])(
    'does not let late capture DSP initialization apply a stale relay after %s',
    async (action) => {
      const { graph, state } = setup();
      await graph.resume();
      state.transposeSemitones = 2;
      const factoryWait = deferred();
      const create = pitch.create.getMockImplementation();
      let captureNode;
      pitch.create.mockImplementation(async (context) => {
        const node = await create(context);
        if (pitch.nodes.length === 2) {
          captureNode = node;
          await factoryWait.promise;
        }
        return node;
      });
      graph.setVolume(0.5);
      await flush();
      expect(captureNode).toBeDefined();
      let newer;
      if (action === 'cancel') graph.cancelAudioControlApplication();
      else newer = graph.setTransposeSemitones(3);
      factoryWait.resolve();
      await flush();
      if (newer) {
        expect((await newer).ok).toBe(true);
        expect(
          captureNode.schedule.mock.calls.every(([x]) => x.semitones === 3),
        ).toBe(true);
      } else expect(captureNode.schedule).not.toHaveBeenCalled();
      expect(Context.instances[0].sinkId).toBe('capture');
      expect(terminalGains(Context.instances[0])[1].gain.value).toBe(1);
    },
  );

  it('does not reapply capture dry/wet after a cancelled relay DSP acknowledgement', async () => {
    const { graph, state } = setup();
    state.transposeSemitones = 2;
    await graph.resume();
    const captureNode = pitch.nodes[1];
    const wait = deferred();
    captureNode.schedule.mockImplementationOnce(() => wait.promise);
    const dry = Context.instances[0].gains[8].gain;
    const gainApply = vi.spyOn(dry, 'setTargetAtTime');
    graph.setVolume(0.5);
    await flush();
    graph.cancelAudioControlApplication();
    gainApply.mockClear();
    wait.resolve();
    await flush();
    expect(gainApply).not.toHaveBeenCalled();
    expect(Context.instances[1].close).toHaveBeenCalledOnce();
  });

  it('lets a newer resume replace an application-owned relay without waiting for its old native resume', async () => {
    const { graph } = setup();
    await graph.resume();
    graph.setVolume(0.5);
    graph.cancelAudioControlApplication();
    await flush();
    const wait = deferred();
    Context.resumeWaits.set('', wait);
    const first = graph.resume();
    await flush();
    const stale = Context.instances.at(-1);
    Context.resumeWaits.clear();
    const second = graph.resume();
    expect((await first).status).toBe('cancelled');
    expect((await second).ok).toBe(true);
    expect(stale.close).toHaveBeenCalledOnce();
    wait.resolve();
    await flush();
    expect(Context.instances[0].setSinkId).toHaveBeenCalledTimes(1);
    expect(terminalGains(Context.instances.at(-1))[0].gain.value).toBe(1);
  });

  it('confirms capture dry bypass before opening the relay for a reset target', async () => {
    const { graph, state } = setup();
    state.transposeSemitones = 2;
    await graph.resume();
    const source = Context.instances[0];
    const wait = deferred();
    Context.resumeWaits.set('', wait);
    graph.setVolume(0.5);
    await flush();
    const reset = graph.resetPitchTempo();
    await flush();
    const relay = Context.instances.at(-1);
    const gate = terminalGains(relay)[0].gain;
    const open = vi
      .spyOn(gate, 'setValueAtTime')
      .mockImplementation((value) => {
        if (value === 1) {
          expect(source.gains[8].gain.value).toBe(1);
          expect(source.gains[9].gain.value).toBe(0);
        }
        gate.value = value;
      });
    wait.resolve();
    expect((await reset).ok).toBe(true);
    expect(open).toHaveBeenCalledWith(1, relay.currentTime);
  });

  it.each(['pending-cancel', 'live-mute', 'live-cleanup'])(
    'stops only its own stream tracks exactly once on %s',
    async (action) => {
      const { graph } = setup();
      await graph.resume();
      const source = Context.instances[0];
      const wait = deferred();
      if (action === 'pending-cancel') Context.resumeWaits.set('', wait);
      graph.setVolume(0.5);
      await flush();
      const track = source.bridges[0].tracks[0];
      if (action === 'pending-cancel') graph.cancelAudioControlApplication();
      else if (action === 'live-mute') graph.setVolume(0);
      else graph.cleanup();
      await flush();
      expect(track.stop).toHaveBeenCalledOnce();
      if (action !== 'live-cleanup')
        expect(source.close).not.toHaveBeenCalled();
      wait.resolve();
      graph.cleanup();
      await flush();
      expect(track.stop).toHaveBeenCalledOnce();
    },
  );

  it.each(['off', 'device', 'source', 'cleanup'])(
    'withdraws a failed relay error when its scope is superseded by %s',
    async (action) => {
      const { graph, state, audio } = setup();
      await graph.resume();
      Context.rejects.add('');
      graph.setVolume(0.5);
      await flush();
      expect(state.monitorOutputError).toBeTruthy();
      Context.rejects.clear();
      if (action === 'off') await graph.applyCaptureDevice(null);
      if (action === 'device') await graph.applyCaptureDevice('new');
      if (action === 'source') graph.routeAudioGraph(false);
      if (action === 'cleanup') graph.cleanup();
      expect(state.monitorOutputError).toBeNull();
      expect((await graph.retryMonitorOutput()).status).toBe('cancelled');
      expect(audio.play).not.toHaveBeenCalled();
      expect(audio.pause).not.toHaveBeenCalled();
    },
  );
});

describe('capture-only output routing and staged monitor-return opt-out', () => {
  it('uses one element source and no programme bridges, preserving capture mix and master', async () => {
    const { graph, state, audio } = fixture();
    const result = await graph.resume();
    expect(result.ok).toBe(true);
    expect(graph.isPlaybackReady(result)).toBe(true);
    expect(Context.instances).toHaveLength(1);
    const ctx = Context.instances[0];
    expect(ctx.sinkId).toBe('capture');
    expect(ctx.elements).toHaveLength(1);
    expect(ctx.bridges).toHaveLength(0);
    expect(ctx.streams).toHaveLength(0);
    expect(
      terminalGains(ctx)
        .map((n) => n.gain.value)
        .sort(),
    ).toEqual([0, 1]);
    expect(state.captureDeviceId).toBe('capture');
    expect(audio.currentTime).toBe(24);
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.pause).not.toHaveBeenCalled();
  });

  it.each([
    { volume: 0.5, isMuted: true },
    { volume: 0, captureVolume: 0 },
  ])(
    'accepts explicit monitor silence but keeps selected capture required: %j',
    async (values) => {
      const { graph, state } = fixture();
      Object.assign(state, values);
      expect((await graph.resume()).ok).toBe(true);
      expect(Context.instances).toHaveLength(1);
      expect(state.captureDeviceId).toBe('capture');
    },
  );

  it.each([0.5, 0.00001])(
    'retains distinct monitor/capture mixes even for default sink at volume %s',
    async (volume) => {
      const { graph, state } = fixture();
      state.volume = volume;
      graph.prepareCaptureDevice('default');
      expect((await graph.resume()).ok).toBe(true);
      expect(Context.instances).toHaveLength(2);
      expect(Context.instances[0].sinkId).toBe('');
      expect(Context.instances[1].sinkId).toBe('default');
    },
  );

  it('can disable the optimization at construction without changing device or controls', async () => {
    const { graph } = fixture({ captureOnlyDirect: false });
    expect((await graph.resume()).ok).toBe(true);
    expect(Context.instances).toHaveLength(2);
    expect(Context.instances[0].setSinkId).not.toHaveBeenCalled();
  });

  it('keeps monitor-only lazy and free of unused bridges', async () => {
    const { graph } = fixture();
    graph.prepareCaptureDevice(null);
    expect(Context.instances).toHaveLength(0);
    expect((await graph.resume()).ok).toBe(true);
    expect(Context.instances[0].bridges).toHaveLength(0);
  });

  it('preserves independent guide gains and two acknowledged pitch lanes in one context', async () => {
    const { graph, state } = fixture();
    Object.assign(state, {
      transposeSemitones: 2,
      pitchCents: 25,
      tempoRate: 1.1,
    });
    expect((await graph.resume()).ok).toBe(true);
    expect(pitch.nodes).toHaveLength(2);
    expect(pitch.nodes[0]).not.toBe(pitch.nodes[1]);
    expect(pitch.nodes[0].context).toBe(pitch.nodes[1].context);
    pitch.nodes.forEach((n) =>
      expect(n.schedule).toHaveBeenLastCalledWith({
        active: true,
        semitones: 2.25,
      }),
    );
    graph.setCaptureGuideVocalOn(true);
    graph.setCaptureGuideVocalValue(0.8);
    graph.setCaptureVolume(0.6);
    expect(state.guideVocalValue).toBe(0.7);
    expect(state.volume).toBe(0);
    expect(Context.instances).toHaveLength(1);
  });

  it('handles original stereo without routing it through the monitor master', async () => {
    const { graph } = fixture();
    graph.routeAudioGraph(false);
    expect((await graph.resume()).ok).toBe(true);
    const ctx = Context.instances[0];
    expect(ctx.elements[0].edges.size).toBe(2);
    expect(ctx.bridges).toHaveLength(0);
    graph.routeAudioGraph(true);
    expect(ctx.elements[0].edges.size).toBe(1);
  });

  it('leaves direct mode before monitor becomes audible and never closes the borrowed context', async () => {
    const { graph, audio } = fixture();
    await graph.resume();
    const ctx = Context.instances[0];
    const wait = deferred();
    Context.waits.set('', wait);
    graph.setVolume(0.5);
    await flush();
    expect(terminalGains(ctx).every((n) => n.gain.value === 0)).toBe(true);
    expect(ctx.close).not.toHaveBeenCalled();
    wait.resolve();
    await flush();
    expect(ctx.sinkId).toBe('');
    expect(Context.instances).toHaveLength(2);
    expect(Context.instances[1].sinkId).toBe('capture');
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.pause).not.toHaveBeenCalled();
  });

  it('prepares one silent unattached candidate while retaining the selected direct capture', async () => {
    const { graph, state, audio } = fixture();
    await graph.resume();
    const ctx = Context.instances[0];
    const oldGate = terminalGains(ctx).find((n) => n.gain.value === 1);
    const wait = deferred();
    Context.resumeWaits.set('capture', wait);
    graph.setVolume(0.5);
    graph.setVolume(0.6);
    await flush();
    expect(Context.instances).toHaveLength(2);
    const candidate = Context.instances[1];
    expect(candidate.options).toEqual({ sinkId: 'capture' });
    expect(terminalGains(candidate).map((n) => n.gain.value)).toEqual([0]);
    expect(candidate.streams).toHaveLength(0);
    expect(ctx.bridges).toHaveLength(0);
    expect(oldGate.gain.value).toBe(1);
    expect(terminalGains(ctx)[0].gain.value).toBe(0);
    expect(ctx.setSinkId).toHaveBeenCalledTimes(1);
    expect(state.captureDeviceId).toBe('capture');
    expect(state.audioControlApplication.ok).toBe(false);
    graph.setCaptureVolume(0.65);
    graph.setCaptureGuideVocalOn(true);
    graph.setCaptureGuideVocalValue(0.8);
    wait.resolve();
    await flush();
    expect(ctx.sinkId).toBe('');
    expect(oldGate.edges.size).toBe(0);
    expect(candidate.streams).toHaveLength(2);
    expect(terminalGains(candidate)[0].gain.value).toBe(1);
    expect(candidate.gains[0].gain.value).toBe(0.8);
    expect(candidate.gains[2].gain.value).toBe(0.65);
    expect(ctx.gains[1].gain.value).toBe(0.6);
    expect(ctx.close).not.toHaveBeenCalled();
    expect(audio.currentTime).toBe(24);
    expect(audio.play).not.toHaveBeenCalled();
    expect(audio.pause).not.toHaveBeenCalled();
  });

  it('waits for candidate DSP acknowledgement before touching the source sink', async () => {
    const { graph, state } = fixture();
    state.transposeSemitones = 2;
    await graph.resume();
    const ctx = Context.instances[0];
    const wait = deferred();
    const create = pitch.create.getMockImplementation();
    pitch.create.mockImplementation(async (context) => {
      const n = await create(context);
      if (context !== ctx) n.schedule.mockImplementation(() => wait.promise);
      return n;
    });
    graph.setVolume(0.5);
    await flush();
    expect(Context.instances).toHaveLength(2);
    const candidate = Context.instances[1];
    expect(pitch.nodes.at(-1).schedule).toHaveBeenCalledWith({
      active: true,
      semitones: 2,
    });
    expect(candidate.streams).toHaveLength(0);
    expect(ctx.sinkId).toBe('capture');
    expect(terminalGains(ctx).map((n) => n.gain.value)).toEqual([0, 1]);
    wait.resolve();
    await flush();
    expect(ctx.sinkId).toBe('');
    expect(candidate.gains[3].gain.value).toBe(0);
    expect(candidate.gains[4].gain.value).toBe(1);
    expect(terminalGains(candidate)[0].gain.value).toBe(1);
  });

  it.each(['mute', 'cancel', 'source', 'cleanup', 'timeout'])(
    'discards a preparing candidate on %s without a late promotion',
    async (action) => {
      vi.useFakeTimers();
      const { graph, state, audio } = fixture();
      await graph.resume();
      const ctx = Context.instances[0];
      const wait = deferred();
      Context.resumeWaits.set('capture', wait);
      graph.setVolume(0.5);
      await flush();
      const candidate = Context.instances[1];
      expect(candidate).toBeDefined();
      if (action === 'mute') graph.setMuted(true);
      if (action === 'cancel') graph.cancelAudioControlApplication();
      if (action === 'source') graph.routeAudioGraph(false);
      if (action === 'cleanup') graph.cleanup();
      if (action === 'timeout') await vi.advanceTimersByTimeAsync(10001);
      await flush();
      expect(candidate.close).toHaveBeenCalledOnce();
      if (action !== 'cleanup') {
        expect(ctx.close).not.toHaveBeenCalled();
        expect(ctx.sinkId).toBe('capture');
        expect(terminalGains(ctx).map((n) => n.gain.value)).toEqual([0, 1]);
        expect(state.captureDeviceId).toBe('capture');
      }
      wait.resolve();
      await flush();
      expect(candidate.streams).toHaveLength(0);
      expect(candidate.close).toHaveBeenCalledOnce();
      expect(ctx.setSinkId).toHaveBeenCalledTimes(1);
      expect(audio.play).not.toHaveBeenCalled();
      if (action === 'timeout') expect(state.captureError).toBeTruthy();
      else expect(state.captureError).toBeNull();
    },
  );

  it('retains healthy capture and its preference if candidate preparation fails', async () => {
    const { graph, state } = fixture();
    await graph.resume();
    const ctx = Context.instances[0];
    Context.rejects.add('capture');
    graph.setVolume(0.5);
    await flush();
    expect(ctx.sinkId).toBe('capture');
    expect(state.captureDeviceId).toBe('capture');
    expect(state.captureError).toBeTruthy();
    expect(terminalGains(ctx).map((n) => n.gain.value)).toEqual([0, 1]);
    expect(Context.instances[1].close).toHaveBeenCalledOnce();
    Context.rejects.clear();
    graph.setVolume(0.6);
    await flush();
    expect(ctx.sinkId).toBe('');
    expect(state.captureError).toBeNull();
  });

  it('keeps only the latest monitor-on intent across on/off/on while preparation is pending', async () => {
    const { graph } = fixture();
    await graph.resume();
    const wait = deferred();
    Context.resumeWaits.set('capture', wait);
    graph.setVolume(0.5);
    await flush();
    const stale = Context.instances[1];
    graph.setMuted(true);
    graph.setMuted(false);
    await flush();
    const latest = Context.instances[2];
    expect(stale.close).toHaveBeenCalledOnce();
    expect(
      terminalGains(Context.instances[0]).map((n) => n.gain.value),
    ).toEqual([0, 1]);
    wait.resolve();
    await flush();
    expect(stale.streams).toHaveLength(0);
    expect(latest.close).not.toHaveBeenCalled();
    expect(terminalGains(latest)[0].gain.value).toBe(1);
    expect(Context.instances[0].setSinkId).toHaveBeenCalledTimes(2);
  });

  it.each(['device', 'bgm'])(
    'does not let an unfinished candidate block a newer %s selection',
    async (action) => {
      const { graph, state } = fixture();
      await graph.resume();
      const wait = deferred();
      Context.resumeWaits.set('capture', wait);
      graph.setVolume(0.5);
      await flush();
      const candidate = Context.instances[1];
      Context.resumeWaits.delete('capture');
      const lost = vi.fn();
      const lease = graph.registerCaptureInput({}, lost);
      if (action === 'device') await graph.applyCaptureDevice('new');
      else expect(await graph.prepareCaptureOutput()).toBe(true);
      const active = Context.instances.at(-1);
      expect(active).not.toBe(candidate);
      expect(state.captureDeviceId).toBe(
        action === 'device' ? 'new' : 'capture',
      );
      lease.setEnabled(true);
      expect(lost).not.toHaveBeenCalled();
      wait.resolve();
      await flush();
      expect(candidate.close).toHaveBeenCalledOnce();
      expect(active.close).not.toHaveBeenCalled();
      expect(terminalGains(active)[0].gain.value).toBe(1);
      lease.release();
    },
  );

  it('replaces stale preparation for new controls and confirms only the latest target', async () => {
    const { graph, state } = fixture();
    await graph.resume();
    const wait = deferred();
    Context.resumeWaits.set('capture', wait);
    graph.setVolume(0.5);
    await flush();
    const stale = Context.instances[1];
    Context.resumeWaits.delete('capture');
    const result = await graph.setTransposeSemitones(3);
    expect(result.ok).toBe(true);
    expect(state.transposeSemitones).toBe(3);
    const active = Context.instances.at(-1);
    expect(active).not.toBe(stale);
    expect(
      pitch.nodes.filter((n) => n.context === active)[0].schedule,
    ).toHaveBeenLastCalledWith({ active: true, semitones: 3 });
    wait.resolve();
    await flush();
    expect(stale.close).toHaveBeenCalledOnce();
    expect(terminalGains(active)[0].gain.value).toBe(1);
  });

  it('keeps a cancelled native commit silent until it settles and a newer selection takes over', async () => {
    const { graph, state } = fixture();
    await graph.resume();
    const wait = deferred();
    Context.waits.set('', wait);
    graph.setVolume(0.5);
    await flush();
    const candidate = Context.instances[1];
    const selection = graph.applyCaptureDevice('new');
    await flush();
    expect(candidate.close).toHaveBeenCalledOnce();
    expect(Context.instances[0].close).not.toHaveBeenCalled();
    expect(
      terminalGains(Context.instances[0]).every((n) => n.gain.value === 0),
    ).toBe(true);
    wait.resolve();
    await selection;
    expect(state.captureDeviceId).toBe('new');
    expect(candidate.streams).toHaveLength(0);
    expect(terminalGains(Context.instances.at(-1))[0].gain.value).toBe(1);
  });

  it.each(['controls', 'mute', 'timeout', 'cancel'])(
    'reconciles %s while the prepared native commit is unsettled',
    async (action) => {
      vi.useFakeTimers();
      const { graph, state, audio } = fixture();
      await graph.resume();
      const wait = deferred();
      Context.waits.set('', wait);
      graph.setVolume(0.5);
      await flush();
      const candidate = Context.instances[1];
      expect(Context.instances[0].setSinkId).toHaveBeenLastCalledWith('');
      let controls;
      if (action === 'controls') controls = graph.setTransposeSemitones(3);
      if (action === 'mute') graph.setMuted(true);
      if (action === 'cancel') graph.cancelAudioControlApplication();
      if (action === 'timeout') await vi.advanceTimersByTimeAsync(10001);
      await flush();
      expect(candidate.close).toHaveBeenCalledOnce();
      expect(
        terminalGains(Context.instances[0]).every((n) => n.gain.value === 0),
      ).toBe(true);
      wait.resolve();
      await flush();
      expect(candidate.streams).toHaveLength(0);
      expect(Context.instances[0].sinkId).toBe('');
      if (controls) {
        expect((await controls).ok).toBe(true);
        expect(terminalGains(Context.instances.at(-1))[0].gain.value).toBe(1);
      } else if (action === 'mute') {
        expect(state.captureDeviceId).toBe('capture');
        expect(terminalGains(Context.instances.at(-1))[0].gain.value).toBe(1);
      } else {
        expect(
          terminalGains(Context.instances[0]).every((n) => n.gain.value === 0),
        ).toBe(true);
        expect((await graph.resume()).ok).toBe(true);
      }
      expect(audio.play).not.toHaveBeenCalled();
    },
  );

  it('joins prepared monitor return on resume instead of starting another selection', async () => {
    const { graph } = fixture();
    await graph.resume();
    const wait = deferred();
    Context.resumeWaits.set('capture', wait);
    graph.setVolume(0.5);
    await flush();
    const candidate = Context.instances[1];
    const resumed = graph.resume();
    await flush();
    expect(Context.instances).toHaveLength(2);
    expect(candidate.close).not.toHaveBeenCalled();
    wait.resolve();
    expect((await resumed).ok).toBe(true);
    expect(Context.instances).toHaveLength(2);
    expect(candidate.close).not.toHaveBeenCalled();
  });

  it('keeps direct capture intact if a second native context cannot be constructed', async () => {
    const { graph, state } = fixture();
    await graph.resume();
    Context.constructionFailures.add('capture');
    graph.setVolume(0.5);
    await flush();
    expect(Context.instances).toHaveLength(1);
    expect(
      terminalGains(Context.instances[0]).map((n) => n.gain.value),
    ).toEqual([0, 1]);
    expect(state.captureDeviceId).toBe('capture');
    expect(state.captureError).toBeTruthy();
  });

  it('keeps a failed source restore closed and retains the requested capture preference', async () => {
    const { graph, state } = fixture();
    await graph.resume();
    const lost = vi.fn();
    graph.registerCaptureInput({}, lost);
    Context.rejects.add('');
    graph.setVolume(0.5);
    await flush();
    expect(state.captureDeviceId).toBe('capture');
    expect(state.captureError).toBeTruthy();
    expect(lost).toHaveBeenCalledOnce();
    expect(Context.instances[1].close).toHaveBeenCalledOnce();
    expect(
      terminalGains(Context.instances[0]).every((n) => n.gain.value === 0),
    ).toBe(true);
  });

  it('replaces controls even after setSinkId settles while source resume is still pending', async () => {
    const { graph } = fixture();
    await graph.resume();
    const ctx = Context.instances[0];
    const wait = deferred();
    ctx.resume.mockImplementationOnce(async () => {
      await wait.promise;
    });
    graph.setVolume(0.5);
    await flush();
    expect(ctx.sinkId).toBe('');
    const stale = Context.instances[1];
    const controls = graph.setTransposeSemitones(3);
    await flush();
    expect(stale.close).toHaveBeenCalledOnce();
    wait.resolve();
    expect((await controls).ok).toBe(true);
    expect(Context.instances.at(-1)).not.toBe(stale);
    expect(terminalGains(Context.instances.at(-1))[0].gain.value).toBe(1);
  });

  it('disconnects a late candidate worklet without touching the borrowed source context', async () => {
    const { graph, state } = fixture();
    state.transposeSemitones = 2;
    await graph.resume();
    const wait = deferred();
    const ctx = Context.instances[0];
    const node = new Node(null);
    node.schedule = vi.fn();
    pitch.create.mockImplementationOnce(async () => {
      await wait.promise;
      return node;
    });
    graph.setVolume(0.5);
    await flush();
    graph.cancelAudioControlApplication();
    wait.resolve();
    await flush();
    expect(node.disconnect).toHaveBeenCalledOnce();
    expect(node.schedule).not.toHaveBeenCalled();
    expect(ctx.close).not.toHaveBeenCalled();
    expect(ctx.sinkId).toBe('capture');
  });

  it.each(['candidate-dsp', 'native-bind'])(
    'does not promote after the monitor processor fails during %s',
    async (phase) => {
      const { graph, state } = fixture();
      state.transposeSemitones = 2;
      await graph.resume();
      const ctx = Context.instances[0];
      const monitorNode = pitch.nodes[0];
      const wait = deferred();
      if (phase === 'native-bind') Context.waits.set('', wait);
      else {
        const create = pitch.create.getMockImplementation();
        pitch.create.mockImplementationOnce(async (context) => {
          const node = await create(context);
          node.schedule.mockImplementation(() => wait.promise);
          return node;
        });
      }
      graph.setVolume(0.5);
      await flush();
      const candidate = Context.instances[1];
      monitorNode.onprocessorerror();
      wait.resolve();
      await flush();
      expect(candidate.close).toHaveBeenCalledOnce();
      expect(candidate.streams).toHaveLength(0);
      expect(state.captureError).toBeTruthy();
      expect(terminalGains(ctx)[0].gain.value).toBe(0);
      if (phase === 'candidate-dsp') {
        expect(ctx.sinkId).toBe('capture');
        expect(terminalGains(ctx)[1].gain.value).toBe(1);
      }
    },
  );

  it.each(['resume', 'dsp', 'sink', 'suspended', 'processor'])(
    'keeps output closed on a candidate %s failure',
    async (action) => {
      const { graph, state } = fixture();
      state.transposeSemitones = 2;
      await graph.resume();
      const create = pitch.create.getMockImplementation();
      const wait = deferred();
      Context.resumeWaits.set('capture', wait);
      pitch.create.mockImplementation(async (context) => {
        const n = await create(context);
        if (context !== Context.instances[0] && action === 'dsp')
          n.schedule.mockRejectedValue(Error('schedule failed'));
        return n;
      });
      graph.setVolume(0.5);
      await flush();
      const candidate = Context.instances[1];
      if (action === 'resume') Context.rejects.add('capture');
      if (action === 'sink') candidate.sinkId = 'wrong';
      if (action === 'suspended') candidate.keepSuspended = true;
      if (action === 'processor') {
        pitch.create.mockImplementationOnce(async (context) => {
          const n = await create(context);
          n.schedule.mockImplementationOnce(async () => n.onprocessorerror());
          return n;
        });
      }
      wait.resolve();
      await flush();
      expect(candidate.close).toHaveBeenCalledOnce();
      expect(Context.instances[0].sinkId).toBe('capture');
      expect(
        terminalGains(Context.instances[0]).map((n) => n.gain.value),
      ).toEqual([0, 1]);
      expect(graph.isPlaybackReady(state.audioControlApplication)).toBe(false);
      expect(state.captureError).toBeTruthy();
    },
  );

  it('pins BGM preparation to legacy and retains a disabled input lease across both routes', async () => {
    const { graph } = fixture();
    const lost = vi.fn();
    const input = graph.registerCaptureInput({}, lost);
    await graph.resume();
    expect(Context.instances).toHaveLength(1);
    expect(await graph.prepareCaptureOutput()).toBe(true);
    expect(Context.instances).toHaveLength(2);
    input.setEnabled(true);
    expect(lost).not.toHaveBeenCalled();
    input.setEnabled(false);
    expect((await graph.resume()).ok).toBe(true);
    expect(Context.instances[0].sinkId).toBe('capture');
    input.setEnabled(true);
    expect(lost).toHaveBeenCalledOnce();
    input.release();
  });

  it('prepares legacy when BGM arrives before a queued direct selection has created its graph', async () => {
    const { graph } = fixture();
    const singing = graph.resume();
    const bgm = graph.prepareCaptureOutput();
    await singing;
    expect(await bgm).toBe(true);
    expect(Context.instances[0].sinkId).toBe('');
    expect(Context.instances.at(-1).sinkId).toBe('capture');
  });

  it('does not enable a selected capture when its native restore to default fails', async () => {
    const { graph, state } = fixture();
    await graph.resume();
    Context.rejects.add('');
    await graph.applyCaptureDevice(null);
    expect(state.captureError).toBeTruthy();
    expect(
      terminalGains(Context.instances[0]).every((n) => n.gain.value === 0),
    ).toBe(true);
    expect(await graph.prepareCaptureOutput()).toBe(false);
  });

  it('uses legacy when source sink selection is unsupported', async () => {
    const original = Context.prototype;
    const { graph } = fixture();
    graph.prepareCaptureDevice(null);
    await graph.resume();
    Context.instances[0].setSinkId = undefined;
    graph.prepareCaptureDevice('capture');
    expect((await graph.resume()).ok).toBe(true);
    expect(Context.instances).toHaveLength(2);
    expect(Object.getPrototypeOf(Context.instances[0])).toBe(original);
  });

  it('falls back once on direct binding failure only after restoring the default source sink', async () => {
    const { graph } = fixture();
    const first = graph.resume();
    await flush();
    await first;
    // An explicit selection still follows legacy even when the monitor is silent.
    await graph.applyCaptureDevice('second');
    const ctx = Context.instances[0];
    ctx.setSinkId.mockImplementationOnce(async () => {
      throw Error('direct rejected');
    });
    const result = await graph.resume();
    expect(result.ok).toBe(true);
    expect(ctx.sinkId).toBe('');
    expect(Context.instances.at(-1).sinkId).toBe('second');
  });

  it('cancels a start promptly and reconciles a late native binding without reopening its gates', async () => {
    const { graph, audio } = fixture();
    const wait = deferred();
    Context.waits.set('capture', wait);
    const start = graph.resume();
    await flush();
    graph.cancelAudioControlApplication();
    expect((await start).status).toBe('cancelled');
    wait.resolve();
    await flush();
    expect(Context.instances[0].sinkId).toBe('');
    expect(
      terminalGains(Context.instances[0]).every((n) => n.gain.value === 0),
    ).toBe(true);
    expect(audio.play).not.toHaveBeenCalled();
  });

  it('blocks the next start behind an unsettled native call, and respects the latest capture choice', async () => {
    const { graph } = fixture();
    const wait = deferred();
    Context.waits.set('capture', wait);
    const old = graph.resume();
    await flush();
    const selection = graph.applyCaptureDevice('new');
    expect((await old).status).toBe('cancelled');
    let done = false;
    selection.then(() => {
      done = true;
    });
    await flush();
    expect(done).toBe(false);
    wait.resolve();
    await selection;
    expect(Context.instances[0].sinkId).toBe('');
    expect(Context.instances.at(-1).sinkId).toBe('new');
  });

  it('restores default if monitor is enabled after binding but before source resume settles', async () => {
    const { graph } = fixture();
    const binding = deferred(),
      resumed = deferred();
    Context.waits.set('capture', binding);
    const old = graph.resume();
    await flush();
    const ctx = Context.instances[0];
    ctx.resume.mockImplementationOnce(async () => {
      await resumed.promise;
      ctx.state = 'running';
    });
    binding.resolve();
    await flush();
    expect(ctx.sinkId).toBe('capture');
    graph.setVolume(0.5);
    expect((await old).ok).toBe(false);
    resumed.resolve();
    await flush();
    expect(ctx.sinkId).toBe('');
    expect(Context.instances.at(-1).sinkId).toBe('capture');
    expect(terminalGains(ctx).some((n) => n.gain.value === 1)).toBe(true);
  });

  it('times out logically while a native sink request remains owned and muted', async () => {
    vi.useFakeTimers();
    const { graph, state } = fixture();
    const wait = deferred();
    Context.waits.set('capture', wait);
    const start = graph.resume();
    await flush();
    await vi.advanceTimersByTimeAsync(10001);
    expect((await start).status).toBe('timeout');
    expect(state.audioControlApplication.ok).toBe(false);
    wait.resolve();
    await flush();
    expect(Context.instances[0].sinkId).toBe('');
    expect(state.audioControlApplication.status).toBe('timeout');
  });

  it('invalidates lost direct output without sending capture to default, then supports explicit reselection', async () => {
    const { graph, state } = fixture();
    const lost = vi.fn();
    graph.registerCaptureInput({}, lost);
    const result = await graph.resume();
    const ctx = Context.instances[0];
    ctx.sinkId = '';
    ctx.dispatchEvent(new Event('sinkchange'));
    expect(graph.isPlaybackReady(result)).toBe(false);
    expect(state.captureDeviceId).toBeNull();
    expect(lost).toHaveBeenCalledOnce();
    await flush();
    expect(ctx.close).not.toHaveBeenCalled();
    graph.setVolume(0.5);
    expect(terminalGains(ctx).some((n) => n.gain.value === 1)).toBe(true);
    await graph.applyCaptureDevice('replacement');
    expect(Context.instances.at(-1).sinkId).toBe('replacement');
  });

  it('closes direct capture edges before shared source teardown', async () => {
    const { graph } = fixture();
    await graph.resume();
    graph.cleanup();
    await flush();
    expect(Context.instances[0].close).toHaveBeenCalledOnce();
    expect(Context.instances[0].mergers.every((n) => n.edges.size === 0)).toBe(
      true,
    );
  });

  it('disconnects late pitch nodes and native binding after teardown without recreating output', async () => {
    const { graph } = fixture();
    const wait = deferred();
    Context.waits.set('capture', wait);
    const start = graph.resume();
    await flush();
    graph.cleanup();
    expect((await start).ok).toBe(false);
    wait.resolve();
    await flush();
    expect(Context.instances).toHaveLength(1);
    expect(Context.instances[0].close).toHaveBeenCalledOnce();
    expect(
      (
        await graph.applyAudioControls({
          transposeSemitones: 0,
          pitchCents: 0,
          tempoRate: 1,
          monitorGuideVocalEnabled: true,
        })
      ).ok,
    ).toBe(false);
  });

  it('discards an old direct pitch node without closing or disconnecting its ready legacy replacement', async () => {
    const { graph, state } = fixture();
    state.transposeSemitones = 2;
    const late = deferred();
    const create = pitch.create.getMockImplementation();
    pitch.create
      .mockImplementationOnce(create)
      .mockImplementationOnce(() => late.promise);
    const old = graph.resume();
    await flush();
    expect(pitch.create).toHaveBeenCalledTimes(2);
    await graph.applyCaptureDevice('replacement');
    const replacement = Context.instances.at(-1);
    expect(replacement.sinkId).toBe('replacement');
    const orphan = new Node(Context.instances[0]);
    orphan.schedule = vi.fn();
    late.resolve(orphan);
    expect((await old).ok).toBe(false);
    await flush();
    expect(orphan.disconnect).toHaveBeenCalledOnce();
    expect(replacement.close).not.toHaveBeenCalled();
    const result = await graph.applyAudioControls({
      transposeSemitones: 2,
      pitchCents: 0,
      tempoRate: 1,
      monitorGuideVocalEnabled: true,
    });
    expect(graph.isPlaybackReady(result)).toBe(true);
    expect(terminalGains(replacement).map((n) => n.gain.value)).toEqual([1]);
  });
});

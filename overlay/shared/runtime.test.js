import { describe, expect, it, vi } from 'vitest';
import {
  buildWebSocketUrl,
  createOverlayConnection,
  parseOutputMessage,
} from './runtime.mjs';

class FakeWebSocket {
  static instances = [];

  constructor(url, protocols) {
    this.url = url;
    this.protocols = protocols;
    this.listeners = new Map();
    this.close = vi.fn();
    FakeWebSocket.instances.push(this);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  emit(type, detail = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(detail);
  }
}

function snapshot(revision, overrides = {}) {
  return {
    version: 2,
    revision,
    generatedAt: '2026-08-22T00:00:00.000Z',
    displayDelayMs: 0,
    playback: { track: null },
    queue: { items: [] },
    lyrics: { lines: [], activeLineIndex: -1 },
    ...overrides,
  };
}

describe('overlay WebSocket runtime', () => {
  it('builds same-host ws and wss URLs', () => {
    expect(
      buildWebSocketUrl({ protocol: 'http:', host: '127.0.0.1:8700' }),
    ).toBe('ws://127.0.0.1:8700/ws');
    expect(buildWebSocketUrl({ protocol: 'https:', host: 'localhost' })).toBe(
      'wss://localhost/ws',
    );
  });

  it('parses only supported state envelopes', () => {
    expect(
      parseOutputMessage(
        JSON.stringify({ type: 'state.snapshot', snapshot: snapshot(1) }),
      ),
    ).toMatchObject({ type: 'state.snapshot', snapshot: { revision: 1 } });
    expect(parseOutputMessage('{bad json')).toBeNull();
    expect(
      parseOutputMessage(
        JSON.stringify({ type: 'command', snapshot: snapshot(1) }),
      ),
    ).toBeNull();
    expect(
      parseOutputMessage(
        JSON.stringify({
          type: 'overlay.config.changed',
          overlayConfig: {
            version: 2,
            revision: 3,
            slots: { lyrics: { templateId: 'focus-line' } },
          },
        }),
      ),
    ).toMatchObject({
      type: 'overlay.config.changed',
      overlayConfig: { revision: 3 },
    });
    expect(
      parseOutputMessage(
        JSON.stringify({
          type: 'music-structure.document',
          bootId: 'boot-1',
          sourceEpoch: 'epoch-1',
          sourceStatus: 'ready',
          revision: 2,
          document: {
            documentId: 'music-1',
            trackId: 'track-1',
            sourceRevision: 'source-1',
            sourceDurationMs: 90000,
            level: 'M1',
            tempo: { bpm: 120, confidence: 0.8 },
            beats: [],
            sections: [],
          },
        }),
      ),
    ).toMatchObject({
      type: 'music-structure.document',
      revision: 2,
      document: { documentId: 'music-1', level: 'M1' },
    });

    const splitStateMessage = (overrides = {}) => ({
      type: 'state.snapshot',
      bootId: 'boot-1',
      sourceEpoch: 'epoch-1',
      sourceStatus: 'ready',
      revision: 1,
      state: {
        generatedAt: '2026-08-23T00:00:00.000Z',
        displayDelayMs: 0,
        playback: {},
        lyrics: {
          documentId: null,
          documentRevision: 0,
          offsetMs: 0,
          activeLineId: null,
          activeSegmentId: null,
        },
        queue: { documentId: 'queue-1', documentRevision: 1 },
        musicStructure: { documentId: null, documentRevision: 0 },
        ...overrides,
      },
    });
    expect(
      parseOutputMessage(
        JSON.stringify(
          splitStateMessage({
            musicStructure: { documentId: null, documentRevision: 7 },
          }),
        ),
      ),
    ).toBeNull();
    expect(
      parseOutputMessage(
        JSON.stringify(
          splitStateMessage({
            queue: { documentId: '', documentRevision: 1 },
          }),
        ),
      ),
    ).toBeNull();
  });

  it('accepts resnapshots, ignores stale updates, and reconnects', () => {
    FakeWebSocket.instances = [];
    const scheduled = [];
    const snapshots = [];
    const configs = [];
    const statuses = [];
    const connection = createOverlayConnection({
      location: { protocol: 'http:', host: '127.0.0.1:8700' },
      WebSocketImpl: FakeWebSocket,
      onSnapshot: (value) => snapshots.push(value.revision),
      kind: 'lyrics',
      onConfig: (value) => configs.push(value?.templateId ?? null),
      onStatus: (value) => statuses.push(value),
      schedule: (callback, delay) => {
        scheduled.push({ callback, delay });
        return scheduled.length;
      },
      cancelSchedule: vi.fn(),
    });

    connection.start();
    const first = FakeWebSocket.instances[0];
    expect(first.url).toBe('ws://127.0.0.1:8700/ws');
    expect(first.protocols).toBe('utawakui.output.v3');
    first.emit('open');
    first.emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        snapshot: snapshot(3),
        overlayConfig: {
          version: 2,
          revision: 1,
          slots: { lyrics: { templateId: 'focus-line' } },
        },
      }),
    });
    first.emit('message', {
      data: JSON.stringify({ type: 'state.changed', snapshot: snapshot(2) }),
    });
    first.emit('message', {
      data: JSON.stringify({ type: 'state.changed', snapshot: snapshot(4) }),
    });
    first.emit('message', {
      data: JSON.stringify({
        type: 'overlay.config.changed',
        overlayConfig: {
          version: 2,
          revision: 2,
          slots: { lyrics: { templateId: 'karaoke-stack' } },
        },
      }),
    });
    expect(snapshots).toEqual([3, 4]);
    expect(configs).toEqual(['focus-line', 'karaoke-stack']);

    first.emit('close');
    expect(scheduled[0].delay).toBe(500);
    expect(statuses).toEqual(['connecting', 'connected', 'reconnecting']);
    scheduled[0].callback();
    expect(FakeWebSocket.instances).toHaveLength(2);

    const second = FakeWebSocket.instances[1];
    second.emit('message', {
      data: JSON.stringify({ type: 'state.snapshot', snapshot: snapshot(4) }),
    });
    expect(snapshots).toEqual([3, 4, 4]);

    connection.stop();
    expect(second.close).toHaveBeenCalledOnce();
  });

  it('reassembles an initial split state as soon as later documents resolve', () => {
    FakeWebSocket.instances = [];
    const received = [];
    const configs = [];
    const connection = createOverlayConnection({
      location: { protocol: 'http:', host: '127.0.0.1:8700' },
      WebSocketImpl: FakeWebSocket,
      kind: 'lyrics',
      onSnapshot: (value) => received.push(value),
      onConfig: (value) => configs.push(value?.templateId ?? null),
      schedule: setTimeout,
      cancelSchedule: clearTimeout,
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
    });

    connection.start();
    const socket = FakeWebSocket.instances[0];
    socket.emit('message', {
      data: JSON.stringify({
        type: 'overlay.config.snapshot',
        overlayConfig: {
          version: 2,
          revision: 4,
          slots: { lyrics: { templateId: 'karaoke-stack' } },
        },
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        bootId: 'boot-1',
        sourceEpoch: 'epoch-1',
        sourceStatus: 'ready',
        revision: 7,
        state: {
          generatedAt: '2026-08-23T00:00:00.000Z',
          displayDelayMs: 0,
          playback: {
            status: 'playing',
            positionMs: 1200,
            durationMs: 90000,
            rate: 1,
            track: { id: 'track-1', title: 'Song' },
          },
          lyrics: {
            documentId: 'lyrics-1',
            documentRevision: 2,
            offsetMs: 100,
            activeLineId: 'line-2',
            activeSegmentId: null,
          },
          queue: { documentId: 'queue-current', documentRevision: 3 },
        },
      }),
    });
    expect(received).toEqual([]);

    socket.emit('message', {
      data: JSON.stringify({
        type: 'lyrics.document',
        bootId: 'boot-1',
        sourceEpoch: 'epoch-1',
        sourceStatus: 'ready',
        revision: 2,
        document: {
          documentId: 'lyrics-1',
          trackId: 'track-1',
          granularity: 'T1',
          source: { language: 'ja' },
          lines: [
            {
              lineId: 'line-1',
              text: 'first',
              startMs: 0,
              endMs: 1000,
              endInferred: true,
            },
            { lineId: 'line-2', text: 'second', startMs: 1000, endMs: null },
          ],
          reading: {
            lines: [
              {
                lineId: 'line-1',
                text: 'first',
                segments: [{ text: 'first' }],
              },
              {
                lineId: 'line-2',
                text: 'second',
                segments: [{ text: 'second', reading: 'せかんど' }],
              },
            ],
          },
        },
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'queue.document',
        bootId: 'boot-1',
        sourceEpoch: 'epoch-1',
        sourceStatus: 'ready',
        revision: 3,
        document: {
          documentId: 'queue-current',
          sourceName: 'Setlist',
          items: [
            {
              state: 'current',
              track: { id: 'track-1', title: 'Song' },
            },
          ],
        },
      }),
    });

    expect(configs).toEqual(['karaoke-stack']);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      version: 2,
      revision: 7,
      playback: { positionMs: 1200 },
      queue: { sourceName: 'Setlist' },
      lyrics: {
        activeLineIndex: 1,
        lines: [{ text: 'first', endInferred: true }, { text: 'second' }],
        reading: {
          lines: [
            { lineId: 'line-1', text: 'first', segments: [{ text: 'first' }] },
            {
              lineId: 'line-2',
              text: 'second',
              segments: [{ text: 'second', reading: 'せかんど' }],
            },
          ],
        },
      },
    });
    connection.stop();
  });

  it('delivers the latest unresolved split state when its documents arrive', () => {
    FakeWebSocket.instances = [];
    const received = [];
    const connection = createOverlayConnection({
      location: {
        protocol: 'http:',
        host: '127.0.0.1:8700',
        search: '',
      },
      WebSocketImpl: FakeWebSocket,
      onSnapshot: (snapshot) => received.push(snapshot),
      schedule: setTimeout,
      cancelSchedule: clearTimeout,
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
    });

    connection.start();
    const socket = FakeWebSocket.instances[0];
    socket.emit('open');
    const identity = {
      bootId: 'boot-1',
      sourceEpoch: 'epoch-1',
      sourceStatus: 'ready',
    };
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        ...identity,
        revision: 7,
        state: {
          generatedAt: '2026-08-23T00:00:00.000Z',
          displayDelayMs: 0,
          playback: { status: 'playing', positionMs: 1200, rate: 1 },
          lyrics: {
            documentId: 'lyrics-1',
            documentRevision: 2,
            offsetMs: 0,
            activeLineId: 'line-1',
            activeSegmentId: null,
          },
          queue: { documentId: 'queue-1', documentRevision: 3 },
        },
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        ...identity,
        revision: 8,
        state: {
          generatedAt: '2026-08-23T00:00:00.000Z',
          displayDelayMs: 0,
          playback: { status: 'playing', positionMs: 1300, rate: 1 },
          lyrics: {
            documentId: 'lyrics-1',
            documentRevision: 2,
            offsetMs: 0,
            activeLineId: 'line-1',
            activeSegmentId: 'segment-1',
          },
          queue: { documentId: 'queue-1', documentRevision: 3 },
        },
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'lyrics.document',
        ...identity,
        revision: 2,
        document: {
          documentId: 'lyrics-1',
          trackId: 'track-1',
          lines: [{ lineId: 'line-1', text: 'secret lyric text' }],
        },
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'queue.document',
        ...identity,
        revision: 3,
        document: { documentId: 'queue-1', sourceName: '', items: [] },
      }),
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      revision: 8,
      playback: { positionMs: 1300 },
      lyrics: { activeLineIndex: 0 },
    });

    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        ...identity,
        revision: 9,
        state: {
          generatedAt: '2026-08-23T00:00:00.000Z',
          displayDelayMs: 0,
          playback: { status: 'playing', positionMs: 1400, rate: 1 },
          lyrics: {
            documentId: 'lyrics-1',
            documentRevision: 2,
            offsetMs: 0,
            activeLineId: 'line-1',
            activeSegmentId: 'segment-2',
          },
          queue: { documentId: 'queue-1', documentRevision: 3 },
        },
      }),
    });
    expect(received.map(({ revision }) => revision)).toEqual([8, 9]);
    connection.stop();
  });

  it('does not write synchronization console logs', () => {
    FakeWebSocket.instances = [];
    const logger = { info: vi.fn() };
    const connection = createOverlayConnection({
      location: {
        protocol: 'http:',
        host: '127.0.0.1:8700',
        search: '',
      },
      WebSocketImpl: FakeWebSocket,
      logger,
      schedule: setTimeout,
      cancelSchedule: clearTimeout,
    });

    connection.start();
    FakeWebSocket.instances[0].emit('open');

    expect(logger.info).not.toHaveBeenCalled();
    connection.stop();
  });

  it('keeps delayed delivery scheduling stable during clock-only updates', () => {
    FakeWebSocket.instances = [];
    const received = [];
    const scheduled = [];
    const baseTime = Date.parse('2026-08-23T00:00:00.000Z');
    const connection = createOverlayConnection({
      location: {
        protocol: 'http:',
        host: '127.0.0.1:8700',
        search: '',
      },
      WebSocketImpl: FakeWebSocket,
      onSnapshot: (snapshot) => received.push(snapshot),
      schedule: (callback, delay) => {
        scheduled.push({ callback, delay });
        return scheduled.length;
      },
      cancelSchedule: vi.fn(),
      now: () => baseTime + 100,
    });

    connection.start();
    const socket = FakeWebSocket.instances[0];
    const identity = {
      bootId: 'boot-1',
      sourceEpoch: 'epoch-1',
      sourceStatus: 'ready',
    };
    socket.emit('message', {
      data: JSON.stringify({
        type: 'lyrics.document',
        ...identity,
        revision: 2,
        document: {
          documentId: 'lyrics-1',
          trackId: 'track-1',
          lines: [{ lineId: 'line-1', text: 'hidden content' }],
        },
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'queue.document',
        ...identity,
        revision: 3,
        document: { documentId: 'queue-1', sourceName: '', items: [] },
      }),
    });
    const state = (revision, generatedAt, activeSegmentId) => ({
      type: 'state.snapshot',
      ...identity,
      revision,
      state: {
        generatedAt,
        displayDelayMs: 1000,
        playback: { status: 'playing', positionMs: revision * 100, rate: 1 },
        lyrics: {
          documentId: 'lyrics-1',
          documentRevision: 2,
          offsetMs: 0,
          activeLineId: 'line-1',
          activeSegmentId,
        },
        queue: { documentId: 'queue-1', documentRevision: 3 },
      },
    });

    socket.emit('message', {
      data: JSON.stringify(state(7, '2026-08-23T00:00:00.000Z', 'segment-1')),
    });
    socket.emit('message', {
      data: JSON.stringify(state(8, '2026-08-23T00:00:00.100Z', 'segment-2')),
    });
    expect(scheduled.map(({ delay }) => delay)).toEqual([900, 1000]);

    scheduled[0].callback();

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      revision: 7,
      lyrics: { activeLineIndex: 0 },
    });
    connection.stop();
  });

  it('requires the referenced music-structure revision and preserves optional confidence', () => {
    FakeWebSocket.instances = [];
    const received = [];
    const connection = createOverlayConnection({
      location: { protocol: 'http:', host: '127.0.0.1:8700' },
      WebSocketImpl: FakeWebSocket,
      onSnapshot: (value) => received.push(value),
      schedule: setTimeout,
      cancelSchedule: clearTimeout,
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
    });

    connection.start();
    const socket = FakeWebSocket.instances[0];
    const identity = {
      bootId: 'boot-1',
      sourceEpoch: 'epoch-1',
      sourceStatus: 'ready',
    };
    socket.emit('message', {
      data: JSON.stringify({
        type: 'lyrics.document',
        ...identity,
        revision: 1,
        document: {
          documentId: 'lyrics-1',
          trackId: 'track-1',
          source: { language: 'en' },
          lines: [],
        },
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'queue.document',
        ...identity,
        revision: 1,
        document: { documentId: 'queue-1', sourceName: '', items: [] },
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'music-structure.document',
        ...identity,
        revision: 3,
        document: {
          documentId: 'music-1',
          trackId: 'track-1',
          sourceRevision: 'source-1',
          sourceDurationMs: 90000,
          level: 'M2',
          tempo: { bpm: 120, confidence: 0.72 },
          beats: [
            {
              timeMs: 1000,
              positionInBar: 1,
              downbeat: true,
              confidence: 0.81,
            },
          ],
          sections: [
            {
              sectionId: 'section-1',
              startMs: 0,
              endMs: 90000,
              role: 'chorus',
              confidence: 0.64,
            },
          ],
        },
      }),
    });

    const dynamicState = {
      generatedAt: '2026-08-23T00:00:00.000Z',
      displayDelayMs: 0,
      playback: {
        status: 'playing',
        positionMs: 1000,
        durationMs: 90000,
        rate: 1,
        track: { id: 'track-1', title: 'Song' },
      },
      lyrics: {
        documentId: 'lyrics-1',
        documentRevision: 1,
        offsetMs: 0,
        activeLineId: null,
        activeSegmentId: null,
      },
      queue: { documentId: 'queue-1', documentRevision: 1 },
      musicStructure: { documentId: 'music-1', documentRevision: 2 },
    };
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        ...identity,
        revision: 1,
        state: dynamicState,
      }),
    });
    expect(received).toEqual([]);

    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        ...identity,
        revision: 2,
        state: {
          ...dynamicState,
          musicStructure: { documentId: 'music-1', documentRevision: 3 },
        },
      }),
    });
    expect(received).toHaveLength(1);
    expect(received[0].musicStructure).toMatchObject({
      documentId: 'music-1',
      sourceDurationMs: 90000,
      tempo: { confidence: 0.72 },
      beats: [{ confidence: 0.81 }],
      sections: [{ role: 'chorus', confidence: 0.64 }],
    });

    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        ...identity,
        revision: 3,
        state: {
          ...dynamicState,
          musicStructure: { documentId: null, documentRevision: 0 },
        },
      }),
    });
    expect(received.at(-1).musicStructure).toBeNull();
    connection.stop();
  });

  it('drops cached music structure on reconnect even when the epoch is unchanged', () => {
    FakeWebSocket.instances = [];
    const reconnects = [];
    const received = [];
    const connection = createOverlayConnection({
      location: { protocol: 'http:', host: '127.0.0.1:8700' },
      WebSocketImpl: FakeWebSocket,
      onSnapshot: (value) => received.push(value),
      schedule: (callback, delay) => {
        reconnects.push({ callback, delay });
        return reconnects.length;
      },
      cancelSchedule: vi.fn(),
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
    });
    const identity = {
      bootId: 'boot-1',
      sourceEpoch: 'epoch-1',
      sourceStatus: 'ready',
    };
    const sendDocuments = (socket, includeMusic = true) => {
      socket.emit('message', {
        data: JSON.stringify({
          type: 'lyrics.document',
          ...identity,
          revision: 1,
          document: {
            documentId: 'lyrics-1',
            trackId: 'track-1',
            source: null,
            lines: [],
          },
        }),
      });
      socket.emit('message', {
        data: JSON.stringify({
          type: 'queue.document',
          ...identity,
          revision: 1,
          document: { documentId: 'queue-1', sourceName: '', items: [] },
        }),
      });
      if (includeMusic) {
        socket.emit('message', {
          data: JSON.stringify({
            type: 'music-structure.document',
            ...identity,
            revision: 1,
            document: {
              documentId: 'music-1',
              trackId: 'track-1',
              sourceRevision: 'source-1',
              sourceDurationMs: 10000,
              level: 'M1',
              tempo: null,
              beats: [],
              sections: [],
            },
          }),
        });
      }
    };
    const sendState = (socket, revision) =>
      socket.emit('message', {
        data: JSON.stringify({
          type: 'state.snapshot',
          ...identity,
          revision,
          state: {
            generatedAt: '2026-08-23T00:00:00.000Z',
            displayDelayMs: 0,
            playback: {
              status: 'paused',
              positionMs: 0,
              durationMs: 10000,
              rate: 1,
              track: { id: 'track-1', title: 'Song' },
            },
            lyrics: {
              documentId: 'lyrics-1',
              documentRevision: 1,
              offsetMs: 0,
              activeLineId: null,
              activeSegmentId: null,
            },
            queue: { documentId: 'queue-1', documentRevision: 1 },
            musicStructure: {
              documentId: 'music-1',
              documentRevision: 1,
            },
          },
        }),
      });

    connection.start();
    sendDocuments(FakeWebSocket.instances[0]);
    sendState(FakeWebSocket.instances[0], 1);
    expect(received).toHaveLength(1);
    FakeWebSocket.instances[0].emit('close');
    reconnects[0].callback();

    const second = FakeWebSocket.instances[1];
    sendDocuments(second, false);
    sendState(second, 1);
    expect(received).toHaveLength(1);
    connection.stop();
  });

  it('accepts lower revisions only after a new boot or source epoch', () => {
    FakeWebSocket.instances = [];
    const received = [];
    const connection = createOverlayConnection({
      location: { protocol: 'http:', host: '127.0.0.1:8700' },
      WebSocketImpl: FakeWebSocket,
      onSnapshot: (value) => received.push(value.revision),
      schedule: setTimeout,
      cancelSchedule: clearTimeout,
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
    });

    connection.start();
    const socket = FakeWebSocket.instances[0];
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.changed',
        bootId: 'boot-1',
        sourceEpoch: 'epoch-1',
        sourceStatus: 'ready',
        snapshot: snapshot(8),
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.changed',
        bootId: 'boot-1',
        sourceEpoch: 'epoch-1',
        sourceStatus: 'ready',
        snapshot: snapshot(2),
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.changed',
        bootId: 'boot-1',
        sourceEpoch: 'epoch-2',
        sourceStatus: 'ready',
        snapshot: snapshot(1),
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.changed',
        bootId: 'boot-2',
        sourceEpoch: 'epoch-1',
        sourceStatus: 'ready',
        snapshot: snapshot(0),
      }),
    });

    expect(received).toEqual([8, 1, 0]);
    connection.stop();
  });

  it('accepts a fresh initial snapshot after an explicit stop and restart', () => {
    FakeWebSocket.instances = [];
    const received = [];
    const connection = createOverlayConnection({
      location: { protocol: 'http:', host: '127.0.0.1:8700' },
      WebSocketImpl: FakeWebSocket,
      onSnapshot: (value) => received.push(value.revision),
      schedule: setTimeout,
      cancelSchedule: clearTimeout,
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
    });

    connection.start();
    FakeWebSocket.instances[0].emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        snapshot: snapshot(3),
      }),
    });
    connection.stop();
    connection.start();
    FakeWebSocket.instances[1].emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        snapshot: snapshot(3),
      }),
    });

    expect(received).toEqual([3, 3]);
    connection.stop();
  });

  it('delivers the safe empty snapshot when the source becomes unavailable', () => {
    FakeWebSocket.instances = [];
    const received = [];
    const connection = createOverlayConnection({
      location: { protocol: 'http:', host: '127.0.0.1:8700' },
      WebSocketImpl: FakeWebSocket,
      onSnapshot: (value) => received.push(value.revision),
      schedule: setTimeout,
      cancelSchedule: clearTimeout,
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
    });

    connection.start();
    const socket = FakeWebSocket.instances[0];
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.changed',
        bootId: 'boot-1',
        sourceEpoch: 'epoch-1',
        sourceStatus: 'ready',
        snapshot: snapshot(8),
      }),
    });
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.changed',
        bootId: 'boot-1',
        sourceEpoch: null,
        sourceStatus: 'unavailable',
        snapshot: snapshot(0),
      }),
    });

    expect(received).toEqual([8, 0]);
    connection.stop();
  });

  it('clears stale output while a split source is syncing', () => {
    FakeWebSocket.instances = [];
    const received = [];
    const connection = createOverlayConnection({
      location: { protocol: 'http:', host: '127.0.0.1:8700' },
      WebSocketImpl: FakeWebSocket,
      onSnapshot: (value) => received.push(value),
      schedule: setTimeout,
      cancelSchedule: clearTimeout,
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
    });

    connection.start();
    FakeWebSocket.instances[0].emit('message', {
      data: JSON.stringify({
        type: 'source.status',
        bootId: 'boot-1',
        sourceEpoch: null,
        sourceStatus: 'syncing',
      }),
    });

    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      version: 2,
      revision: 0,
      playback: { status: 'idle', track: null },
    });
    connection.stop();
  });

  it('delays snapshot delivery from generatedAt and clears queued state when compensation changes', () => {
    FakeWebSocket.instances = [];
    let nowMs = Date.parse('2026-08-22T00:00:00.100Z');
    const scheduled = new Map();
    const cancelled = [];
    const received = [];
    let nextTimerId = 0;
    const connection = createOverlayConnection({
      location: { protocol: 'http:', host: '127.0.0.1:8700' },
      WebSocketImpl: FakeWebSocket,
      now: () => nowMs,
      onSnapshot: (value) => received.push(value.revision),
      schedule: (callback, delay) => {
        nextTimerId += 1;
        scheduled.set(nextTimerId, { callback, delay });
        return nextTimerId;
      },
      cancelSchedule: (timerId) => {
        cancelled.push(timerId);
        scheduled.delete(timerId);
      },
    });

    connection.start();
    const socket = FakeWebSocket.instances[0];
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        snapshot: snapshot(1, {
          displayDelayMs: 500,
          generatedAt: '2026-08-22T00:00:00.000Z',
        }),
      }),
    });
    expect(received).toEqual([]);
    expect([...scheduled.values()][0].delay).toBe(400);

    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.changed',
        snapshot: snapshot(2, {
          displayDelayMs: 0,
          generatedAt: '2026-08-22T00:00:00.100Z',
        }),
      }),
    });
    expect(cancelled).toContain(1);
    expect(received).toEqual([2]);

    connection.stop();
  });

  it('reports trace-only instance readiness and the first painted live frame without content', async () => {
    FakeWebSocket.instances = [];
    const frameCallbacks = [];
    const fetchImpl = vi.fn(async () => ({ ok: true }));
    const connection = createOverlayConnection({
      location: {
        protocol: 'http:',
        host: '127.0.0.1:8700',
        search: '?startupTrace=1',
      },
      WebSocketImpl: FakeWebSocket,
      fetchImpl,
      performance: { timeOrigin: 1000, now: () => 250 },
      requestAnimationFrame: (callback) => frameCallbacks.push(callback),
      schedule: setTimeout,
      cancelSchedule: clearTimeout,
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
    });

    connection.start();
    const socket = FakeWebSocket.instances[0];
    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        snapshot: snapshot(1),
      }),
    });
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/v1/startup-trace',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          name: 'first-instance-ready',
          atUnixMs: 1250,
        }),
      }),
    );
    expect(frameCallbacks).toHaveLength(1);

    frameCallbacks.shift()();
    frameCallbacks.shift()();
    await Promise.resolve();
    expect(fetchImpl).toHaveBeenLastCalledWith(
      '/api/v1/startup-trace',
      expect.objectContaining({
        body: JSON.stringify({
          name: 'first-rendered-frame',
          atUnixMs: 1250,
        }),
      }),
    );
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('lyrics');

    socket.emit('message', {
      data: JSON.stringify({
        type: 'state.changed',
        snapshot: snapshot(2),
      }),
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    connection.stop();
  });

  it('never sends overlay telemetry without the explicit trace query', () => {
    FakeWebSocket.instances = [];
    const fetchImpl = vi.fn();
    const connection = createOverlayConnection({
      location: {
        protocol: 'http:',
        host: '127.0.0.1:8700',
        search: '',
      },
      WebSocketImpl: FakeWebSocket,
      fetchImpl,
      schedule: setTimeout,
      cancelSchedule: clearTimeout,
      now: () => Date.parse('2026-08-23T00:00:00.000Z'),
    });
    connection.start();
    FakeWebSocket.instances[0].emit('message', {
      data: JSON.stringify({
        type: 'state.snapshot',
        snapshot: snapshot(1),
      }),
    });
    expect(fetchImpl).not.toHaveBeenCalled();
    connection.stop();
  });
});

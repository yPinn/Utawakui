import { describe, expect, it, vi } from 'vitest';
import outputContract from '../../shared/outputContract.js';
import outputStreamContract from '../../shared/outputStreamContract.js';
import outputProjectionModule from './outputProjection.js';

const { createEmptyOutputSnapshot } = outputContract;
const { parseOutputStreamEnvelope } = outputStreamContract;
const {
  OUTPUT_PROJECTION_CONTRACT_VERSION,
  createOutputProjectionHub,
  parseOutputProjectionEnvelope,
} = outputProjectionModule;

const BOOT_ID = 'boot-current';
const SOURCE_ID = 'renderer-1';

function envelope(overrides = {}) {
  const revision = overrides.revision ?? 1;
  return {
    contractVersion: OUTPUT_PROJECTION_CONTRACT_VERSION,
    bootId: BOOT_ID,
    sourceEpoch: 'epoch-1',
    kind: 'full',
    revision,
    payload: createEmptyOutputSnapshot({
      revision,
      generatedAt: '2026-08-23T00:00:00.000Z',
    }),
    ...overrides,
  };
}

function streamEnvelope(stream, revision, payload, overrides = {}) {
  return {
    contractVersion: OUTPUT_PROJECTION_CONTRACT_VERSION,
    bootId: BOOT_ID,
    sourceEpoch: 'epoch-stream-1',
    stream,
    kind: 'full',
    revision,
    payload,
    ...overrides,
  };
}

const queuePayload = {
  document: {
    documentId: 'queue-current',
    sourceName: 'Set',
    items: [
      {
        state: 'current',
        track: { id: 'track-1', title: 'Song' },
      },
    ],
  },
};
const lyricsPayload = {
  document: {
    documentId: 'lyrics-1',
    trackId: 'track-1',
    granularity: 'T1',
    source: { language: 'ja' },
    lines: [
      {
        lineId: 'line-1',
        text: '歌詞',
        startMs: 1000,
        endMs: 2000,
      },
    ],
  },
};

function dynamicPayload(overrides = {}) {
  return {
    generatedAt: '2026-08-23T00:00:00.000Z',
    displayDelayMs: 0,
    playback: {
      status: 'playing',
      positionMs: 1200,
      durationMs: 180000,
      rate: 1,
      track: { id: 'track-1', title: 'Song' },
    },
    lyrics: {
      documentId: 'lyrics-1',
      documentRevision: 1,
      offsetMs: 0,
      activeLineId: 'line-1',
      activeSegmentId: null,
    },
    queue: { documentId: 'queue-current', documentRevision: 1 },
    ...overrides,
  };
}

describe('output projection envelope', () => {
  it('validates a v3 envelope while preserving the canonical v2 payload', () => {
    const value = envelope();

    expect(parseOutputProjectionEnvelope(value, BOOT_ID)).toEqual(value);
    expect(value.payload.version).toBe(2);
  });

  it.each([
    ['non-object root', null],
    ['unknown contract', { contractVersion: 99 }],
    ['stale boot', { bootId: 'boot-stale' }],
    ['missing epoch', { sourceEpoch: '' }],
    ['unsupported kind', { kind: 'delta' }],
    [
      'mismatched revision',
      {
        revision: 2,
        payload: createEmptyOutputSnapshot({
          revision: 1,
          generatedAt: '2026-08-23T00:00:00.000Z',
        }),
      },
    ],
    [
      'negative revision',
      {
        revision: -1,
        payload: createEmptyOutputSnapshot({
          revision: 0,
          generatedAt: '2026-08-23T00:00:00.000Z',
        }),
      },
    ],
    ['oversized epoch', { sourceEpoch: 'e'.repeat(201) }],
  ])('rejects %s without accepting partial data', (_label, changes) => {
    expect(() =>
      parseOutputProjectionEnvelope(
        changes === null ? null : envelope(changes),
        BOOT_ID,
      ),
    ).toThrow(TypeError);
  });

  it('validates stream envelopes through the split contract', () => {
    const value = streamEnvelope('state.snapshot', 1, dynamicPayload());
    expect(parseOutputStreamEnvelope(value, BOOT_ID)).toEqual(value);
  });
});

describe('output projection hub', () => {
  it('requires one full handshake before accepting monotonic updates', () => {
    const onChange = vi.fn();
    const hub = createOutputProjectionHub({
      bootId: BOOT_ID,
      onChange,
    });

    hub.connectSource(SOURCE_ID);
    expect(hub.getStatus()).toMatchObject({
      bootId: BOOT_ID,
      sourceEpoch: null,
      sourceSynchronization: 'syncing',
      revision: 0,
    });
    expect(hub.publish(envelope({ kind: 'update' }), SOURCE_ID)).toBe(false);

    expect(hub.publish(envelope(), SOURCE_ID)).toBe(true);
    expect(hub.connectSource(SOURCE_ID)).toMatchObject({
      sourceSynchronization: 'ready',
      sourceEpoch: 'epoch-1',
    });
    expect(hub.getStatus()).toMatchObject({
      sourceEpoch: 'epoch-1',
      sourceSynchronization: 'ready',
      revision: 1,
    });
    expect(hub.publish(envelope(), SOURCE_ID)).toBe(false);

    expect(
      hub.publish(envelope({ kind: 'update', revision: 2 }), SOURCE_ID),
    ).toBe(true);
    expect(
      hub.publish(envelope({ kind: 'update', revision: 2 }), SOURCE_ID),
    ).toBe(false);
    expect(
      hub.publish(envelope({ kind: 'update', revision: 1 }), SOURCE_ID),
    ).toBe(false);
  });

  it('fails closed for another renderer, stale epochs, and malformed data', () => {
    const hub = createOutputProjectionHub({ bootId: BOOT_ID });
    hub.connectSource(SOURCE_ID);
    expect(hub.publish(envelope(), SOURCE_ID)).toBe(true);

    expect(hub.publish(envelope({ revision: 2 }), 'renderer-stale')).toBe(
      false,
    );
    expect(
      hub.publish(
        envelope({
          sourceEpoch: 'epoch-2',
          kind: 'update',
          revision: 2,
        }),
        SOURCE_ID,
      ),
    ).toBe(false);
    expect(() =>
      hub.publish(envelope({ contractVersion: 99 }), SOURCE_ID),
    ).toThrow(TypeError);
    expect(hub.getStatus()).toMatchObject({
      sourceEpoch: 'epoch-1',
      sourceSynchronization: 'ready',
      revision: 1,
    });
  });

  it('invalidates a renderer lifetime and requires an unseen full epoch', () => {
    const hub = createOutputProjectionHub({ bootId: BOOT_ID });
    hub.connectSource(SOURCE_ID);
    expect(hub.publish(envelope(), SOURCE_ID)).toBe(true);

    hub.markUnavailable('renderer_reload', SOURCE_ID);
    expect(hub.getStatus()).toMatchObject({
      sourceEpoch: null,
      sourceSynchronization: 'unavailable',
      unavailableReason: 'renderer_reload',
      revision: 0,
    });

    hub.connectSource(SOURCE_ID);
    expect(hub.publish(envelope(), SOURCE_ID)).toBe(false);
    expect(
      hub.publish(envelope({ sourceEpoch: 'epoch-2', revision: 0 }), SOURCE_ID),
    ).toBe(true);
    expect(hub.markUnavailable('stale_renderer', 'renderer-stale')).toBe(false);
  });

  it('requires referenced content before a split state can enter ready', () => {
    const hub = createOutputProjectionHub({ bootId: BOOT_ID });
    hub.connectSource(SOURCE_ID);

    expect(
      hub.publish(
        streamEnvelope('state.snapshot', 1, dynamicPayload()),
        SOURCE_ID,
      ),
    ).toBe(false);
    expect(hub.getStatus().sourceSynchronization).toBe('syncing');

    expect(
      hub.publish(
        streamEnvelope('lyrics.document', 1, lyricsPayload),
        SOURCE_ID,
      ),
    ).toBe(true);
    expect(
      hub.publish(streamEnvelope('queue.document', 1, queuePayload), SOURCE_ID),
    ).toBe(true);
    expect(hub.getStatus().sourceSynchronization).toBe('syncing');

    expect(
      hub.publish(
        streamEnvelope('state.snapshot', 1, dynamicPayload()),
        SOURCE_ID,
      ),
    ).toBe(true);
    expect(hub.getStatus()).toMatchObject({
      sourceSynchronization: 'ready',
      sourceEpoch: 'epoch-stream-1',
      revision: 1,
    });
    expect(hub.getProjection()).toMatchObject({
      snapshot: {
        version: 2,
        revision: 1,
        lyrics: { lines: [{ text: '歌詞' }] },
      },
      streams: {
        lyrics: { revision: 1, document: { documentId: 'lyrics-1' } },
        queue: { revision: 1, document: { documentId: 'queue-current' } },
        state: { revision: 1, payload: { playback: { positionMs: 1200 } } },
      },
    });
  });

  it('tracks content and dynamic revisions independently', () => {
    const hub = createOutputProjectionHub({ bootId: BOOT_ID });
    hub.connectSource(SOURCE_ID);
    hub.publish(streamEnvelope('lyrics.document', 1, lyricsPayload), SOURCE_ID);
    hub.publish(streamEnvelope('queue.document', 1, queuePayload), SOURCE_ID);
    hub.publish(
      streamEnvelope('state.snapshot', 1, dynamicPayload()),
      SOURCE_ID,
    );

    expect(
      hub.publish(
        streamEnvelope('state.snapshot', 2, dynamicPayload(), {
          kind: 'update',
        }),
        SOURCE_ID,
      ),
    ).toBe(true);
    expect(
      hub.publish(
        streamEnvelope('queue.document', 1, queuePayload, { kind: 'update' }),
        SOURCE_ID,
      ),
    ).toBe(false);

    const nextQueue = {
      document: {
        ...queuePayload.document,
        items: [
          ...queuePayload.document.items,
          { state: 'queued', track: { id: 'track-2', title: 'Next' } },
        ],
      },
    };
    expect(
      hub.publish(
        streamEnvelope('queue.document', 2, nextQueue, { kind: 'update' }),
        SOURCE_ID,
      ),
    ).toBe(true);
    expect(
      hub.publish(
        streamEnvelope(
          'state.snapshot',
          3,
          dynamicPayload({
            queue: { documentId: 'queue-current', documentRevision: 2 },
          }),
          { kind: 'update' },
        ),
        SOURCE_ID,
      ),
    ).toBe(true);
    expect(hub.getProjection().snapshot.queue.items).toHaveLength(2);
  });

  it('allows a new epoch full state to reuse cached immutable content', () => {
    const hub = createOutputProjectionHub({ bootId: BOOT_ID });
    hub.connectSource(SOURCE_ID);
    hub.publish(streamEnvelope('lyrics.document', 1, lyricsPayload), SOURCE_ID);
    hub.publish(streamEnvelope('queue.document', 1, queuePayload), SOURCE_ID);
    hub.publish(
      streamEnvelope('state.snapshot', 1, dynamicPayload()),
      SOURCE_ID,
    );

    expect(
      hub.publish(
        streamEnvelope('state.snapshot', 0, dynamicPayload(), {
          sourceEpoch: 'epoch-stream-2',
        }),
        SOURCE_ID,
      ),
    ).toBe(true);
    expect(hub.getStatus()).toMatchObject({
      sourceEpoch: 'epoch-stream-2',
      revision: 2,
    });
    expect(hub.getProjection().streams.state.revision).toBe(0);

    const updatedLyrics = {
      document: {
        ...lyricsPayload.document,
        lines: [
          {
            ...lyricsPayload.document.lines[0],
            text: '更新',
          },
        ],
      },
    };
    expect(
      hub.publish(
        streamEnvelope('lyrics.document', 2, updatedLyrics, {
          sourceEpoch: 'epoch-stream-2',
          kind: 'update',
        }),
        SOURCE_ID,
      ),
    ).toBe(true);
    expect(
      hub.publish(
        streamEnvelope(
          'state.snapshot',
          1,
          dynamicPayload({
            lyrics: {
              ...dynamicPayload().lyrics,
              documentId: 'lyrics-1',
              documentRevision: 2,
            },
          }),
          { sourceEpoch: 'epoch-stream-2', kind: 'update' },
        ),
        SOURCE_ID,
      ),
    ).toBe(true);
    expect(hub.getProjection().streams.lyrics.revision).toBe(2);
  });
});

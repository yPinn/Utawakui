import { describe, expect, it, vi } from 'vitest';
import outputContract from '../../shared/outputContract.js';
import outputProjectionModule from './outputProjection.js';

const { createEmptyOutputSnapshot } = outputContract;
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
});

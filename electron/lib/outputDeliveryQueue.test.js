import { afterEach, describe, expect, it, vi } from 'vitest';
import lyricsTimingValues from '../../shared/lyricsTimingValues.json';
import musicStructureValues from '../../shared/musicStructureContractValues.json';
import outputDeliveryModule from './outputDeliveryQueue.js';

const { DEFAULT_MAX_PENDING_BYTES, createOutputClientDelivery } =
  outputDeliveryModule;

function createClient() {
  const sends = [];
  return {
    bufferedAmount: 0,
    readyState: 1,
    send: vi.fn((data, callback) => sends.push({ data, callback })),
    terminate: vi.fn(),
    sends,
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('output client delivery queue', () => {
  it('fits the largest legal split-content handshake behind one in-flight message', () => {
    const client = createClient();
    const delivery = createOutputClientDelivery({ client });

    expect(delivery.enqueue({ kind: 'config', data: 'in-flight' })).toBe(true);
    expect(
      delivery.enqueue({
        kind: 'content',
        data: 'l'.repeat(lyricsTimingValues.maxDocumentBytes),
      }),
    ).toBe(true);
    expect(
      delivery.enqueue({
        kind: 'content',
        data: 'm'.repeat(musicStructureValues.maxDocumentBytes),
      }),
    ).toBe(true);
    expect(
      delivery.enqueue({
        kind: 'semantic',
        data: 's'.repeat(256 * 1024),
      }),
    ).toBe(true);
    expect(client.terminate).not.toHaveBeenCalled();
    expect(DEFAULT_MAX_PENDING_BYTES).toBeGreaterThanOrEqual(
      delivery.getStats().queuedBytes,
    );
  });

  it('keeps one send in flight and replaces pending clock corrections', () => {
    const client = createClient();
    const delivery = createOutputClientDelivery({ client });

    expect(delivery.enqueue({ kind: 'clock', data: 'clock-1' })).toBe(true);
    delivery.enqueue({ kind: 'clock', data: 'clock-2' });
    delivery.enqueue({ kind: 'clock', data: 'clock-3' });

    expect(client.send).toHaveBeenCalledTimes(1);
    client.sends[0].callback();
    expect(client.send).toHaveBeenCalledTimes(2);
    expect(client.sends[1].data).toBe('clock-3');
    expect(delivery.getStats()).toMatchObject({
      deliveredMessages: 1,
      replacedMessages: 1,
      replacedBytes: Buffer.byteLength('clock-2'),
      disconnectedClients: 0,
    });
  });

  it('orders referenced content ahead of semantic state and drops older clock data', () => {
    const client = createClient();
    const delivery = createOutputClientDelivery({ client });

    delivery.enqueue({ kind: 'clock', data: 'in-flight' });
    delivery.enqueue({ kind: 'clock', data: 'stale-clock' });
    delivery.enqueue({ kind: 'semantic', data: 'semantic-state' });
    delivery.enqueue({ kind: 'content', data: 'lyrics-document' });

    client.sends[0].callback();
    expect(client.sends[1].data).toBe('lyrics-document');
    client.sends[1].callback();
    expect(client.sends[2].data).toBe('semantic-state');
    expect(delivery.getStats()).toMatchObject({
      droppedMessages: 1,
      droppedBytes: Buffer.byteLength('stale-clock'),
    });
  });

  it('terminates only this client when bounded discrete content cannot fit', () => {
    const client = createClient();
    const delivery = createOutputClientDelivery({
      client,
      maxPendingBytes: 10,
    });

    delivery.enqueue({ kind: 'clock', data: 'busy' });
    expect(
      delivery.enqueue({ kind: 'content', data: 'content-too-large' }),
    ).toBe(false);
    expect(client.terminate).toHaveBeenCalledOnce();
    expect(delivery.getStats()).toMatchObject({
      disconnectedClients: 1,
      disconnectReason: 'pending_limit',
    });
  });

  it('terminates a send that remains in flight beyond the deadline', () => {
    vi.useFakeTimers();
    const client = createClient();
    const delivery = createOutputClientDelivery({
      client,
      sendTimeoutMs: 100,
    });

    delivery.enqueue({ kind: 'semantic', data: 'state' });
    vi.advanceTimersByTime(100);

    expect(client.terminate).toHaveBeenCalledOnce();
    expect(delivery.getStats()).toMatchObject({
      disconnectedClients: 1,
      disconnectReason: 'send_timeout',
    });
  });

  it('uses a bounded deadline when transport buffered bytes stay high', () => {
    vi.useFakeTimers();
    const client = createClient();
    client.bufferedAmount = 1024;
    const delivery = createOutputClientDelivery({
      client,
      highWaterBytes: 100,
      sendTimeoutMs: 50,
    });

    expect(delivery.enqueue({ kind: 'clock', data: 'state' })).toBe(true);
    expect(client.send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);

    expect(client.terminate).toHaveBeenCalledOnce();
    expect(delivery.getStats().disconnectReason).toBe('backpressure_timeout');
  });

  it('does not let a slow client block an independent healthy client', () => {
    const slowClient = createClient();
    const healthyClient = createClient();
    const slowDelivery = createOutputClientDelivery({ client: slowClient });
    const healthyDelivery = createOutputClientDelivery({
      client: healthyClient,
    });

    slowDelivery.enqueue({ kind: 'clock', data: 'slow-1' });
    slowDelivery.enqueue({ kind: 'clock', data: 'slow-2' });
    healthyDelivery.enqueue({ kind: 'clock', data: 'healthy-1' });
    healthyClient.sends[0].callback();
    healthyDelivery.enqueue({ kind: 'clock', data: 'healthy-2' });

    expect(slowClient.send).toHaveBeenCalledTimes(1);
    expect(healthyClient.send).toHaveBeenCalledTimes(2);
    expect(healthyDelivery.getStats().deliveredMessages).toBe(1);
    expect(slowDelivery.getStats().deliveredMessages).toBe(0);
  });

  it('exposes aggregate counters and byte totals without payload content', () => {
    const client = createClient();
    const delivery = createOutputClientDelivery({ client });
    delivery.enqueue({ kind: 'semantic', data: 'private lyric text' });
    client.sends[0].callback();

    const serializedStats = JSON.stringify(delivery.getStats());
    expect(serializedStats).not.toContain('private lyric text');
    expect(delivery.getStats()).toMatchObject({
      deliveredMessages: 1,
      deliveredBytes: Buffer.byteLength('private lyric text'),
      queuedBytes: 0,
    });
  });
});

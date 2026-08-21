import { describe, expect, it, vi } from 'vitest';
import { createLatestAsyncPublisher } from './latestAsyncPublisher.js';

function deferred() {
  let resolve;
  const promise = new Promise((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('latest async publisher', () => {
  it('serializes sends and coalesces pending values to the latest state', async () => {
    const first = deferred();
    const send = vi
      .fn()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue(true);
    const publisher = createLatestAsyncPublisher(send);

    publisher.request('first');
    await Promise.resolve();
    publisher.request('second');
    publisher.request('latest');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenNthCalledWith(1, 'first');

    first.resolve(true);
    await publisher.whenIdle();
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(2, 'latest');
  });

  it('reports send failures without wedging later updates', async () => {
    const onError = vi.fn();
    const send = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(true);
    const publisher = createLatestAsyncPublisher(send, { onError });

    publisher.request('first');
    await publisher.whenIdle();
    publisher.request('second');
    await publisher.whenIdle();

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'offline',
      }),
    );
    expect(send).toHaveBeenLastCalledWith('second');
  });
});

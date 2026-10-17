import { describe, expect, it, vi } from 'vitest';
import previewSession from './previewSession.js';

const { preparePreviewSession } = previewSession;

describe('preview session preparation', () => {
  it('starts a read-only loopback query without waiting for initialization', async () => {
    let resolve;
    const pending = new Promise((done) => {
      resolve = done;
    });
    const get = vi.fn(() => pending);
    const session = { cookies: { get } };
    const preparation = preparePreviewSession(session);
    expect(get).toHaveBeenCalledExactlyOnceWith({ url: 'http://127.0.0.1' });
    let settled = false;
    preparation.then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);
    resolve([{ name: 'private', value: 'private' }]);
    await expect(preparation).resolves.toBeUndefined();
  });

  it('leaves later navigation available after an asynchronous failure', async () => {
    const session = {
      cookies: { get: vi.fn().mockRejectedValue(new Error('unavailable')) },
    };
    await expect(preparePreviewSession(session)).resolves.toBeUndefined();
  });

  it('contains synchronous teardown errors without affecting App startup', async () => {
    const session = {
      cookies: {
        get: () => {
          throw new Error('session closed');
        },
      },
    };
    await expect(preparePreviewSession(session)).resolves.toBeUndefined();
  });
});

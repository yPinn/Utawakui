import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import outputPortsModule from './outputPorts.js';

const { findAvailableOutputPorts, isOutputPortAvailable } = outputPortsModule;

function createFakeServer({ listenError = null, closeError = null } = {}) {
  const server = new EventEmitter();
  server.unref = vi.fn();
  server.listen = vi.fn((options, callback) => {
    if (listenError) server.emit('error', listenError);
    else callback();
  });
  server.close = vi.fn((callback) => callback(closeError));
  return server;
}

describe('output port availability', () => {
  it('reports a port available only after binding and closing it', async () => {
    const server = createFakeServer();

    await expect(
      isOutputPortAvailable(8700, {
        host: '127.0.0.1',
        createServer: () => server,
      }),
    ).resolves.toBe(true);
    expect(server.unref).toHaveBeenCalledOnce();
    expect(server.listen).toHaveBeenCalledWith(
      { host: '127.0.0.1', port: 8700, exclusive: true },
      expect.any(Function),
    );
    expect(server.close).toHaveBeenCalledOnce();
  });

  it.each(['EADDRINUSE', 'EACCES'])(
    'treats %s as an unavailable port',
    async (code) => {
      const server = createFakeServer({
        listenError: Object.assign(new Error(code), { code }),
      });

      await expect(
        isOutputPortAvailable(8700, { createServer: () => server }),
      ).resolves.toBe(false);
      expect(server.close).not.toHaveBeenCalled();
    },
  );

  it('rejects unexpected listen and close errors', async () => {
    const listenError = Object.assign(new Error('socket failure'), {
      code: 'ENETDOWN',
    });
    await expect(
      isOutputPortAvailable(8700, {
        createServer: () => createFakeServer({ listenError }),
      }),
    ).rejects.toBe(listenError);

    const closeError = new Error('close failure');
    await expect(
      isOutputPortAvailable(8700, {
        createServer: () => createFakeServer({ closeError }),
      }),
    ).rejects.toBe(closeError);
  });

  it('returns only bindable candidates in stable order and respects the limit', async () => {
    const probe = vi.fn(async (port) => port !== 8701 && port !== 8703);

    await expect(
      findAvailableOutputPorts([8701, 8702, 8703, 8704], {
        limit: 2,
        probe,
      }),
    ).resolves.toEqual([8702, 8704]);
    expect(probe).toHaveBeenCalledTimes(4);
  });
});

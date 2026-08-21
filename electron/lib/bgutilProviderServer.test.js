import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import {
  createBgutilProviderServer,
  findAvailableLoopbackPort,
} from './bgutilProviderServer.js';

function makeProcess() {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = vi.fn(() => {
    proc.emit('close', 0);
    return true;
  });
  return proc;
}

describe('createBgutilProviderServer', () => {
  it('starts the Rust provider bound to loopback and waits for /ping', async () => {
    const proc = makeProcess();
    const spawnImpl = vi.fn(() => proc);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '0.8.1' }),
    });
    const server = createBgutilProviderServer({
      executablePath: 'C:\\Runtime\\bgutil-pot.exe',
      port: 4417,
      spawnImpl,
      fetchImpl,
    });

    await expect(server.start()).resolves.toEqual({
      baseUrl: 'http://127.0.0.1:4417',
      version: '0.8.1',
    });

    expect(spawnImpl).toHaveBeenCalledWith(
      'C:\\Runtime\\bgutil-pot.exe',
      ['server', '--host', '127.0.0.1', '--port', '4417'],
      expect.objectContaining({ windowsHide: true }),
    );
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:4417/ping', {
      signal: expect.any(AbortSignal),
    });
  });

  it('reuses an already-running process', async () => {
    const proc = makeProcess();
    const spawnImpl = vi.fn(() => proc);
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ version: '0.8.1' }),
    });
    const server = createBgutilProviderServer({
      executablePath: 'C:\\Runtime\\bgutil-pot.exe',
      port: 4417,
      spawnImpl,
      fetchImpl,
    });

    await server.start();
    await server.start();

    expect(spawnImpl).toHaveBeenCalledTimes(1);
  });

  it('stops the owned provider process', async () => {
    const proc = makeProcess();
    const server = createBgutilProviderServer({
      executablePath: 'C:\\Runtime\\bgutil-pot.exe',
      port: 4417,
      spawnImpl: vi.fn(() => proc),
      fetchImpl: vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ version: '0.8.1' }),
      }),
    });

    await server.start();
    server.stop();

    expect(proc.kill).toHaveBeenCalled();
  });

  it('fails readiness when /ping never returns ok', async () => {
    const server = createBgutilProviderServer({
      executablePath: 'C:\\Runtime\\bgutil-pot.exe',
      port: 4417,
      spawnImpl: vi.fn(() => makeProcess()),
      fetchImpl: vi.fn().mockResolvedValue({ ok: false }),
      readinessAttempts: 1,
    });

    await expect(server.start()).rejects.toThrow(
      'bgutil provider did not become ready',
    );
  });
});

describe('findAvailableLoopbackPort', () => {
  it('returns the preferred loopback port when it is available', async () => {
    const port = await findAvailableLoopbackPort(0);

    expect(Number.isInteger(port)).toBe(true);
    expect(port).toBeGreaterThan(0);
  });
});

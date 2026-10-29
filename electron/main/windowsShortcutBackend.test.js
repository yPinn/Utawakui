import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { createWindowsShortcutBackend } from './windowsShortcutBackend.js';

const instance = 'a'.repeat(32),
  token = 'b'.repeat(32);
afterEach(() => vi.useRealTimers());
function fixture() {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.stdin = {
    write: vi.fn((text) => {
      const p = text.trimEnd().split('\t');
      queueMicrotask(() =>
        child.stdout.emit(
          'data',
          Buffer.from(`ack\t${instance}\t${p[1]}\tok\n`),
        ),
      );
      return true;
    }),
    end: vi.fn(() => queueMicrotask(() => child.emit('exit', 0))),
  };
  child.kill = vi.fn(() => {
    queueMicrotask(() => child.emit('exit', 1));
    return true;
  });
  const verifyHelper = vi.fn(() => 'C:/trusted/HotkeyHost.exe'),
    spawnProcess = vi.fn(() => {
      queueMicrotask(() =>
        child.stdout.emit('data', Buffer.from(`ready\t1\t${instance}\n`)),
      );
      return child;
    }),
    onFailure = vi.fn();
  const backend = createWindowsShortcutBackend({
    appPath: process.cwd(),
    platform: 'win32',
    arch: 'x64',
    verifyHelper,
    spawnProcess,
    onFailure,
  });
  return { backend, child, spawnProcess, verifyHelper, onFailure };
}
it('does not inspect or launch a helper for disabled or empty activation', async () => {
  const f = fixture();
  expect(await f.backend.isRegistered('Control+Shift+K')).toBe(false);
  expect(await f.backend.activate({ generation: 1, registrations: [] })).toBe(
    true,
  );
  await f.backend.shutdown();
  expect(f.spawnProcess).not.toHaveBeenCalled();
  expect(f.verifyHelper).not.toHaveBeenCalled();
});
it('launches a verified fixed executable without a shell, registers and fences event identity', async () => {
  const f = fixture(),
    callback = vi.fn();
  expect(await f.backend.register('Control+Shift+K', callback, token)).toBe(
    true,
  );
  expect(f.spawnProcess).toHaveBeenCalledWith(
    'C:/trusted/HotkeyHost.exe',
    [String(process.pid)],
    expect.objectContaining({ shell: false, windowsHide: true }),
  );
  expect(
    await f.backend.activate({
      generation: 2,
      registrations: [{ key: 'Control+Shift+K', registrationToken: token }],
    }),
  ).toBe(true);
  f.child.stdout.emit(
    'data',
    Buffer.from(`event\t${instance}\t${token}\t2\t1\n`),
  );
  expect(callback).toHaveBeenCalledWith({
    generation: 2,
    registrationToken: token,
  });
  f.child.stdout.emit(
    'data',
    Buffer.from(`event\t${instance}\t${token}\t2\t1\n`),
  );
  expect(callback).toHaveBeenCalledTimes(1);
  await f.backend.shutdown();
});
it('rejects stale source epochs without stamping delayed notifications as current', async () => {
  const f = fixture(),
    callback = vi.fn();
  await f.backend.register('Control+Shift+K', callback, token);
  await f.backend.activate({
    generation: 2,
    registrations: [{ key: 'Control+Shift+K', registrationToken: token }],
  });
  await f.backend.activate({
    generation: 3,
    registrations: [{ key: 'Control+Shift+K', registrationToken: token }],
  });
  f.child.stdout.emit(
    'data',
    Buffer.from(`event\t${instance}\t${token}\t2\t1\n`),
  );
  f.child.stdout.emit(
    'data',
    Buffer.from(`event\t${instance}\t${token}\t3\t2\n`),
  );
  expect(callback).toHaveBeenCalledTimes(1);
  expect(callback).toHaveBeenCalledWith({
    generation: 3,
    registrationToken: token,
  });
  await f.backend.shutdown();
});
it('fails closed on oversized output, revokes callbacks and confirms only its own child exit', async () => {
  const f = fixture(),
    callback = vi.fn();
  await f.backend.register('Control+Shift+K', callback, token);
  f.child.stdout.emit('data', Buffer.alloc(8193, 65));
  expect(f.onFailure).toHaveBeenCalledOnce();
  f.child.stdout.emit(
    'data',
    Buffer.from(`event\t${instance}\t${token}\t1\t1\n`),
  );
  expect(callback).not.toHaveBeenCalled();
  await f.backend.shutdown();
  expect(await f.backend.isRegistered('Control+Shift+K', token)).toBe(false);
});
it('revokes immediately on unexpected output EOF and catches read-side stream errors', async () => {
  for (const event of ['end', 'close', 'error']) {
    const f = fixture();
    await f.backend.register('Control+Shift+K', vi.fn(), token);
    f.child.stdout.emit(
      event,
      ...(event === 'error' ? [Error('private read failure')] : []),
    );
    expect(f.onFailure).toHaveBeenCalledOnce();
    await f.backend.shutdown();
  }
  const f = fixture();
  await f.backend.register('Control+Shift+K', vi.fn(), token);
  f.child.stderr.emit('error', Error('private stderr failure'));
  expect(f.onFailure).toHaveBeenCalledOnce();
  await f.backend.shutdown();
});
it('restarts only on explicit reset after failure and preserves a held-key refusal as a bounded expected result', async () => {
  const f = fixture();
  f.child.stdin.write.mockImplementationOnce((text) => {
    const p = text.trimEnd().split('\t');
    queueMicrotask(() =>
      f.child.stdout.emit(
        'data',
        Buffer.from(`ack\t${instance}\t${p[1]}\theld\n`),
      ),
    );
    return true;
  });
  await expect(
    f.backend.register('Control+Shift+K', vi.fn(), token),
  ).rejects.toMatchObject({ code: 'KEYBOARD_SHORTCUT_KEYS_HELD' });
  expect(f.onFailure).not.toHaveBeenCalled();
  expect(await f.backend.isRegistered('Control+Shift+K', token)).toBe(false);
  await f.backend.shutdown();
});
it('does not launch an invalid file and allows an explicit retry after verification is repaired', async () => {
  const f = fixture();
  f.verifyHelper.mockImplementationOnce(() => {
    throw Error('missing private path');
  });
  await expect(
    f.backend.register('Control+Shift+K', vi.fn(), token),
  ).rejects.toThrow();
  expect(f.spawnProcess).not.toHaveBeenCalled();
  await f.backend.reset();
  expect(await f.backend.register('Control+Shift+K', vi.fn(), token)).toBe(
    true,
  );
  await f.backend.shutdown();
});
it('handles split frames and fails closed on wrong helper instance', async () => {
  const f = fixture(),
    cb = vi.fn();
  await f.backend.register('Control+Shift+K', cb, token);
  await f.backend.activate({
    generation: 2,
    registrations: [{ key: 'Control+Shift+K', registrationToken: token }],
  });
  const frame = `event\t${instance}\t${token}\t2\t1\n`;
  f.child.stdout.emit('data', Buffer.from(frame.slice(0, 20)));
  expect(cb).not.toHaveBeenCalled();
  f.child.stdout.emit('data', Buffer.from(frame.slice(20)));
  expect(cb).toHaveBeenCalledOnce();
  f.child.stdout.emit(
    'data',
    Buffer.from(`event\t${'c'.repeat(32)}\t${token}\t2\t2\n`),
  );
  expect(f.onFailure).toHaveBeenCalledOnce();
  await f.backend.shutdown();
});
it('times out a missing ACK and terminates only its exact child if EOF is ignored', async () => {
  const f = fixture();
  await f.backend.register('Control+Shift+K', vi.fn(), token);
  vi.useFakeTimers();
  f.child.stdin.write.mockImplementation(() => true);
  f.child.stdin.end.mockImplementation(() => {});
  const pending = f.backend.isRegistered('Control+Shift+K', token);
  const rejection = expect(pending).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(3001);
  await rejection;
  expect(f.onFailure).toHaveBeenCalledOnce();
  const stopped = f.backend.shutdown();
  await vi.advanceTimersByTimeAsync(1501);
  await stopped;
  expect(f.child.kill).toHaveBeenCalled();
});
it('does not claim release when its exact child cannot be confirmed exited', async () => {
  const f = fixture();
  await f.backend.register('Control+Shift+K', vi.fn(), token);
  vi.useFakeTimers();
  f.child.stdin.end.mockImplementation(() => {});
  f.child.kill.mockReturnValue(false);
  const stopped = f.backend.shutdown();
  const rejected = expect(stopped).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(4001);
  await rejected;
  expect(f.backend.hasProcess()).toBe(true);
  await expect(
    f.backend.isRegistered('Control+Shift+K', token),
  ).rejects.toThrow();
  f.child.emit('exit', 0);
});
it('ignores delayed data, closure and errors from a replaced child session', async () => {
  const f = fixture();
  await f.backend.register('Control+Shift+K', vi.fn(), token);
  f.child.stdout.emit('end');
  await f.backend.reset();
  const replacement = fixture().child;
  f.spawnProcess.mockImplementationOnce(() => {
    queueMicrotask(() =>
      replacement.stdout.emit('data', Buffer.from(`ready\t1\t${instance}\n`)),
    );
    return replacement;
  });
  await f.backend.register('Control+Shift+K', vi.fn(), token);
  expect(f.onFailure).toHaveBeenCalledTimes(1);
  f.child.stdout.emit('close');
  f.child.stdout.emit('end');
  f.child.stdout.emit('error', Error('old stdout'));
  f.child.stdout.emit('data', Buffer.from('old corrupt data\n'));
  f.child.stderr.emit('error', Error('old stderr'));
  f.child.emit('error', Error('old child'));
  f.child.emit('exit', 1);
  expect(f.onFailure).toHaveBeenCalledTimes(1);
  expect(await f.backend.isRegistered('Control+Shift+K', token)).toBe(true);
  await f.backend.shutdown();
});
it('observes activation ACK before processing subsequent events in the same pipe chunk', async () => {
  const f = fixture(),
    cb = vi.fn();
  await f.backend.register('Control+Shift+K', cb, token);
  f.child.stdin.write.mockImplementationOnce((text) => {
    const p = text.trimEnd().split('\t');
    queueMicrotask(() =>
      f.child.stdout.emit(
        'data',
        Buffer.from(
          `ack\t${instance}\t${p[1]}\tok\nevent\t${instance}\t${token}\t2\t1\n`,
        ),
      ),
    );
    return true;
  });
  await f.backend.activate({
    generation: 2,
    registrations: [{ key: 'Control+Shift+K', registrationToken: token }],
  });
  expect(cb).toHaveBeenCalledWith({ generation: 2, registrationToken: token });
  await f.backend.shutdown();
});
it.each([
  ['unknown reply', 'ack\tINSTANCE\t999\tok\n'],
  ['invalid status', 'ack\tINSTANCE\t2\tarbitrary\n'],
  ['missing source fields', 'event\tINSTANCE\tTOKEN\n'],
  ['unsafe sequence', 'event\tINSTANCE\tTOKEN\t2\t9007199254740992\n'],
  ['zero sequence', 'event\tINSTANCE\tTOKEN\t2\t0\n'],
  ['control byte', '\u0001'],
  ['overlong frame', 'a'.repeat(8193) + '\n'],
])('fails closed on %s', async (_, frame) => {
  const f = fixture();
  await f.backend.register('Control+Shift+K', vi.fn(), token);
  f.child.stdout.emit(
    'data',
    Buffer.from(
      frame.replaceAll('INSTANCE', instance).replaceAll('TOKEN', token),
    ),
  );
  expect(f.onFailure).toHaveBeenCalledOnce();
  await f.backend.shutdown();
});
it('preserves refusal and token ownership across explicit register and release retries', async () => {
  const f = fixture();
  const reply = (status) => (text) => {
    const p = text.trimEnd().split('\t');
    queueMicrotask(() =>
      f.child.stdout.emit(
        'data',
        Buffer.from(`ack\t${instance}\t${p[1]}\t${status}\n`),
      ),
    );
    return true;
  };
  f.child.stdin.write.mockImplementationOnce(reply('occupied'));
  expect(await f.backend.register('Control+Shift+K', vi.fn(), token)).toBe(
    false,
  );
  expect(await f.backend.isRegistered('Control+Shift+K', token)).toBe(false);
  expect(await f.backend.register('Control+Shift+K', vi.fn(), token)).toBe(
    true,
  );
  const calls = f.child.stdin.write.mock.calls.length;
  expect(await f.backend.isRegistered('Control+Shift+K', 'c'.repeat(32))).toBe(
    false,
  );
  await f.backend.unregister('Control+Shift+K', 'c'.repeat(32));
  expect(f.child.stdin.write).toHaveBeenCalledTimes(calls);
  f.child.stdin.write.mockImplementationOnce(reply('unavailable'));
  await expect(
    f.backend.unregister('Control+Shift+K', token),
  ).rejects.toThrow();
  expect(await f.backend.isRegistered('Control+Shift+K', token)).toBe(true);
  await f.backend.unregister('Control+Shift+K', token);
  expect(await f.backend.isRegistered('Control+Shift+K', token)).toBe(false);
  await f.backend.shutdown();
});
it('bounds startup readiness and leaves invalid requests unable to launch a helper', async () => {
  const f = fixture();
  await expect(
    f.backend.register('Control+F12', vi.fn(), token),
  ).rejects.toThrow();
  await expect(
    f.backend.register('Control+Shift+K', vi.fn(), 'bad-token'),
  ).rejects.toThrow();
  expect(f.spawnProcess).not.toHaveBeenCalled();
  vi.useFakeTimers();
  f.spawnProcess.mockReturnValue(f.child);
  const pending = f.backend.register('Control+Shift+K', vi.fn(), token),
    rejected = expect(pending).rejects.toThrow();
  await vi.advanceTimersByTimeAsync(5001);
  await rejected;
  await f.backend.shutdown();
  expect(f.onFailure).toHaveBeenCalledOnce();
});
it('rejects unknown or excessive activation mappings without sending them to the helper', async () => {
  const f = fixture();
  for (const activation of [
    { generation: 0, registrations: [] },
    {
      generation: 1,
      registrations: [{ key: 'Control+Shift+K', registrationToken: token }],
    },
    { generation: 1, registrations: Array(21).fill({}) },
  ])
    await expect(f.backend.activate(activation)).rejects.toThrow();
  expect(f.spawnProcess).not.toHaveBeenCalled();
  await f.backend.register('Control+Shift+K', vi.fn(), token);
  await expect(
    f.backend.activate({
      generation: 2,
      registrations: Array(2).fill({
        key: 'Control+Shift+K',
        registrationToken: token,
      }),
    }),
  ).rejects.toThrow();
  await f.backend.shutdown();
});

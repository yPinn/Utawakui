import { expect, it, vi } from 'vitest';
import { createGuidePreparationQueue } from '../prototypes/reference-pitch/preparationQueue.cjs';
import { registerReferencePitch } from '../prototypes/reference-pitch/register.cjs';

it('shares one result and promotes a waiting current track before background tracks', async () => {
  let finish;
  const prepare = vi.fn((item) =>
    item.stamp === 'first'
      ? new Promise((resolve) => {
          finish = resolve;
        })
      : Promise.resolve(item.stamp),
  );
  const queue = createGuidePreparationQueue(prepare);
  const first = queue.enqueue({ stamp: 'first' });
  await Promise.resolve();
  const background = queue.enqueue({ stamp: 'background' });
  const pending = queue.enqueue({ stamp: 'current' });
  expect(queue.enqueue({ stamp: 'current' }, true)).toBe(pending);
  await Promise.resolve();
  expect(prepare).toHaveBeenCalledTimes(1);
  finish('first');
  await expect(Promise.all([first, background, pending])).resolves.toEqual([
    'first',
    'background',
    'current',
  ]);
  expect(prepare.mock.calls.map(([item]) => item.stamp)).toEqual([
    'first',
    'current',
    'background',
  ]);
});

it('restricts inspection and backfill to the main frame and rechecks the audio gate', async () => {
  const senderFrame = {};
  const sender = { mainFrame: senderFrame };
  const getScope = vi.fn();
  const handlers = new Map();
  const register = registerReferencePitch({
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    getMainWindow: () => ({ webContents: sender, isDestroyed: () => false }),
    getScope,
    listTracks: vi.fn(),
    requireGate() {
      throw new Error('Disabled');
    },
  });
  for (const action of ['inspect', 'backfill']) {
    const handler = handlers.get(`reference-pitch:${action}-guides`);
    await expect(handler({ sender, senderFrame: {} })).resolves.toEqual({
      status: 'unavailable',
    });
    await expect(handler({ sender, senderFrame })).resolves.toEqual({
      status: 'gate-disabled',
    });
  }
  await expect(register.enqueue('a-track')).resolves.toEqual({
    status: 'gate-disabled',
  });
  expect(getScope).not.toHaveBeenCalled();
});

it.each([false, true])(
  'registers segment review only when opted in (%s)',
  (enableGuideReview) => {
    const channels = new Set();
    registerReferencePitch({
      ipcMain: { handle: (name) => channels.add(name) },
      getPerformerSource: () => null,
      enableGuideReview,
    });
    expect(channels.has('performer-pitch:analyze')).toBe(true);
    expect(channels.has('performer-review:load')).toBe(enableGuideReview);
    expect(channels.has('performer-review:mark')).toBe(enableGuideReview);
  },
);

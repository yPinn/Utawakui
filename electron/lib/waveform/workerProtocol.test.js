import { expect, it } from 'vitest';
import { sendTerminal } from './workerProtocol.js';
it('keeps a 64 KiB terminal payload pending until IPC confirms drain', async () => {
  let acknowledge,
    closed = false;
  const value = { type: 'done', peaks: new Float32Array(16384) };
  const result = sendTerminal(
    {
      connected: true,
      send(message, callback) {
        expect(message).toBe(value);
        acknowledge = callback;
      },
    },
    value,
  ).then(() => {
    closed = true;
  });
  await Promise.resolve();
  expect(closed).toBe(false);
  acknowledge();
  await result;
  expect(closed).toBe(true);
});
it('does not attempt a terminal send after its parent has disconnected', async () => {
  await sendTerminal(
    {
      connected: false,
      send() {
        throw Error('disconnected');
      },
    },
    {},
  );
});

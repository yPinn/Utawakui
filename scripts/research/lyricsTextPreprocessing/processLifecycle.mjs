import { once } from 'node:events';

export function isAlive(child) {
  return !!child && child.exitCode === null && child.signalCode === null;
}

export async function terminateOwnedProcess(child) {
  if (!isAlive(child)) return;
  const closed = once(child, 'close');
  let timer;
  try {
    child.kill();
    await Promise.race([
      closed,
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error('server-did-not-exit')),
          3000,
        );
      }),
    ]);
    if (isAlive(child)) throw new Error('server-did-not-exit');
  } finally {
    clearTimeout(timer);
  }
}

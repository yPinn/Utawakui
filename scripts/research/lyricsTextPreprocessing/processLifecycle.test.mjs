import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { isAlive, terminateOwnedProcess } from './processLifecycle.mjs';

describe('owned research process termination', () => {
  it('treats signal termination as exited even when exitCode stays null', () => {
    expect(isAlive({ exitCode: null, signalCode: null })).toBe(true);
    expect(isAlive({ exitCode: null, signalCode: 'SIGTERM' })).toBe(false);
    expect(isAlive({ exitCode: 0, signalCode: null })).toBe(false);
    expect(isAlive(null)).toBe(false);
  });
  it('waits for an actual child to close and supports repeated cleanup', async () => {
    const child = spawn(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      { windowsHide: true },
    );
    await once(child, 'spawn');
    await terminateOwnedProcess(child);
    expect(isAlive(child)).toBe(false);
    await expect(terminateOwnedProcess(child)).resolves.toBeUndefined();
  });
});

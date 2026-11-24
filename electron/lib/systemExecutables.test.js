import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  system32Executable,
  windowsPowerShellPath,
} from './systemExecutables.js';

describe('system executables', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('resolves tools from System32 instead of by bare name', () => {
    vi.stubEnv('SystemRoot', 'D:\\Win');
    expect(system32Executable('where.exe')).toBe(
      'D:\\Win\\System32\\where.exe',
    );
    expect(windowsPowerShellPath()).toBe(
      'D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    );
  });

  it('falls back to the default Windows root, never to a PATH lookup', () => {
    vi.stubEnv('SystemRoot', '');
    expect(system32Executable('taskkill.exe')).toBe(
      'C:\\Windows\\System32\\taskkill.exe',
    );
  });
});

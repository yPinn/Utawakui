import { describe, expect, it, vi } from 'vitest';
import {
  parseChildProcessRows,
  selectDescendantPids,
  queryProcessTree,
} from './childProcessUsageSampler.js';

describe('parseChildProcessRows', () => {
  it('normalizes a single-row bare object into a one-element array', () => {
    const rows = parseChildProcessRows(
      JSON.stringify({
        ProcessId: 111,
        ParentProcessId: 42,
        KernelModeTime: 20_000_000,
        UserModeTime: 10_000_000,
        WorkingSetSize: 4096,
      }),
    );
    expect(rows).toEqual([
      { pid: 111, ppid: 42, cpuSeconds: 3, workingSetBytes: 4096 },
    ]);
  });

  it('parses a multi-row array and defaults missing numeric fields to 0', () => {
    const rows = parseChildProcessRows(
      JSON.stringify([
        { ProcessId: 1, ParentProcessId: 0 },
        { ProcessId: 2, ParentProcessId: 1, KernelModeTime: 10_000_000 },
      ]),
    );
    expect(rows).toEqual([
      { pid: 1, ppid: 0, cpuSeconds: 0, workingSetBytes: 0 },
      { pid: 2, ppid: 1, cpuSeconds: 1, workingSetBytes: 0 },
    ]);
  });

  it('drops rows without a finite ProcessId', () => {
    const rows = parseChildProcessRows(
      JSON.stringify([{ ParentProcessId: 1 }, { ProcessId: 5 }]),
    );
    expect(rows).toEqual([
      { pid: 5, ppid: null, cpuSeconds: 0, workingSetBytes: 0 },
    ]);
  });

  it('returns an empty array on malformed JSON', () => {
    expect(parseChildProcessRows('not json')).toEqual([]);
  });
});

describe('selectDescendantPids', () => {
  it('walks the process tree and excludes already-counted pids', () => {
    // Tree: root(1) -> electron-renderer(2, excluded) -> nothing
    //       root(1) -> python(3) -> ffmpeg(4)
    //       unrelated(5) -> other(6) is not reachable from root
    const rows = [
      { pid: 2, ppid: 1 },
      { pid: 3, ppid: 1 },
      { pid: 4, ppid: 3 },
      { pid: 6, ppid: 5 },
    ];
    expect(selectDescendantPids(rows, 1, [2])).toEqual([3, 4]);
  });

  it('returns an empty array when the root has no descendants', () => {
    expect(selectDescendantPids([{ pid: 9, ppid: 8 }], 1, [])).toEqual([]);
  });

  it('does not loop forever on a cyclic parent reference', () => {
    const rows = [
      { pid: 2, ppid: 1 },
      { pid: 1, ppid: 2 },
    ];
    expect(selectDescendantPids(rows, 1, [])).toEqual([2]);
  });
});

describe('queryProcessTree', () => {
  it('resolves to the parsed rows on a successful PowerShell run', async () => {
    const execFileImpl = vi.fn((command, args, options, callback) => {
      callback(null, JSON.stringify([{ ProcessId: 10, ParentProcessId: 1 }]));
    });

    const rows = await queryProcessTree({ execFileImpl });

    expect(rows).toEqual([
      { pid: 10, ppid: 1, cpuSeconds: 0, workingSetBytes: 0 },
    ]);
    const [, args, options] = execFileImpl.mock.calls[0];
    expect(args).toContain('-NoProfile');
    expect(args.at(-1)).toContain('Get-CimInstance Win32_Process');
    expect(options).toMatchObject({ windowsHide: true });
  });

  it('resolves to an empty array and logs when the process errors out', async () => {
    const error = vi.fn();
    const execFileImpl = vi.fn((command, args, options, callback) => {
      callback(new Error('boom'), '');
    });

    const rows = await queryProcessTree({ execFileImpl, logger: { error } });

    expect(rows).toEqual([]);
    expect(error).toHaveBeenCalledOnce();
  });
});

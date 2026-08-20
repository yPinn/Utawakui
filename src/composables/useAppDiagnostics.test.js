import { afterEach, describe, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.resetModules();
  vi.useRealTimers();
});

async function loadDiagnostics() {
  const { useAppDiagnostics } = await import('./useAppDiagnostics.js');
  return useAppDiagnostics();
}

describe('useAppDiagnostics', () => {
  it('records normalized errors newest first', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-08-20T00:00:00.000Z'));
    const diagnostics = await loadDiagnostics();

    const first = diagnostics.recordError(new Error('first'), {
      id: 'first-id',
      source: 'feature-dependencies',
    });
    const second = diagnostics.recordError('second', {
      id: 'second-id',
      severity: 'warning',
      source: 'separation',
    });

    expect(first.message).toBe('first');
    expect(second.message).toBe('second');
    expect(diagnostics.state.records.map((record) => record.id)).toEqual([
      'second-id',
      'first-id',
    ]);
    expect(diagnostics.recentRecords.value).toHaveLength(2);
  });

  it('caps records to the latest 100', async () => {
    const diagnostics = await loadDiagnostics();

    for (let i = 0; i < 105; i += 1) {
      diagnostics.recordError(`error-${i}`, { id: `id-${i}` });
    }

    expect(diagnostics.state.records).toHaveLength(100);
    expect(diagnostics.state.records[0].id).toBe('id-104');
    expect(diagnostics.state.records[99].id).toBe('id-5');
  });

  it('clears records through an explicit action', async () => {
    const diagnostics = await loadDiagnostics();
    diagnostics.recordError('error', { id: 'id' });

    diagnostics.clearRecords();

    expect(diagnostics.state.records).toEqual([]);
  });
});

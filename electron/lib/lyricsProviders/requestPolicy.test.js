import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createLyricsRequestBudget,
  getLyricsRequestPolicy,
} from './requestPolicy.js';

afterEach(() => vi.useRealTimers());

describe('shared lyrics request policy', () => {
  it('caps physical background sends per provider per minute without charging denied attempts', async () => {
    const fetch = vi.fn();
    const policy = getLyricsRequestPolicy('netease', fetch, { now: () => 0 });
    for (let index = 0; index < 12; index++) {
      await policy.run(
        ['background', index],
        async ({ charge }) => {
          charge();
          return { status: 'ok' };
        },
        { priority: 'background', automatic: true },
      );
    }
    const budget = createLyricsRequestBudget('netease', { automatic: true });
    await expect(
      policy.run(
        ['overload'],
        async ({ charge }) => {
          charge();
          return { status: 'ok' };
        },
        { priority: 'background', budget },
      ),
    ).rejects.toMatchObject({ reason: 'request-budget-exhausted' });
    expect(budget.attempts).toBe(0);
    budget.dispose();
    await expect(
      policy.run(['interactive'], async ({ charge }) => {
        charge();
        return { status: 'ok' };
      }),
    ).resolves.toMatchObject({ status: 'ok' });
  });
  it('rejects unknown providers and invalid budget limits', () => {
    expect(() => getLyricsRequestPolicy('constructor', vi.fn())).toThrow(
      /provider/,
    );
    expect(() => createLyricsRequestBudget('constructor')).toThrow(/provider/);
    for (const maxAttempts of [0, -1, NaN, Infinity, 17])
      expect(() =>
        createLyricsRequestBudget('lrclib', { maxAttempts }),
      ).toThrow(/budget/);
  });

  it('expires only the exhausted subscriber when another caller can fund a retry', async () => {
    const policy = getLyricsRequestPolicy('lrclib', vi.fn());
    const first = createLyricsRequestBudget('lrclib', { maxAttempts: 1 });
    const second = createLyricsRequestBudget('lrclib', { maxAttempts: 2 });
    const start = async ({ charge }) => {
      charge();
      charge();
      return { status: 'ok' };
    };
    const one = policy.run(['shared'], start, { budget: first });
    const two = policy.run(['shared'], start, { budget: second });
    await expect(one).rejects.toMatchObject({
      reason: 'request-budget-exhausted',
    });
    await expect(two).resolves.toMatchObject({ status: 'ok' });
    expect(first.attempts).toBe(1);
    expect(second.attempts).toBe(2);
    first.dispose();
    second.dispose();
  });

  it('invalidates pre-save discovery writers without discarding their current callers', async () => {
    const policy = getLyricsRequestPolicy('lrclib', vi.fn());
    let finish;
    const old = policy.run(
      ['search'],
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    await policy.run(['get', 42], async () => ({ status: 'ok' }), {
      fresh: true,
    });
    finish({ status: 'ok', value: 'old' });
    await old;
    const next = vi.fn(async () => ({ status: 'ok', value: 'new' }));
    await policy.run(['search'], next);
    expect(next).toHaveBeenCalledOnce();
  });

  it('bounds pending flights and releases capacity after completion', async () => {
    const policy = getLyricsRequestPolicy('lrclib', vi.fn());
    const releases = [];
    const jobs = Array.from({ length: 32 }, (_, i) =>
      policy.run([i], () => new Promise((resolve) => releases.push(resolve))),
    );
    await expect(policy.run(['overflow'], vi.fn())).rejects.toMatchObject({
      name: 'QueueFullError',
    });
    await vi.waitFor(() => expect(releases).toHaveLength(2));
    for (let index = 0; index < 32; index += 1) {
      await vi.waitFor(() => expect(releases[index]).toBeTypeOf('function'));
      releases[index]({ status: 'ok' });
    }
    await Promise.all(jobs);
    await expect(
      policy.run(['replacement'], async () => ({ status: 'ok' })),
    ).resolves.toMatchObject({ status: 'ok' });
  });
  it('shares a sustained start rate across clients on the same transport and isolates providers', async () => {
    vi.useFakeTimers();
    const fetch = vi.fn();
    const first = getLyricsRequestPolicy('lrclib', fetch);
    const second = getLyricsRequestPolicy('lrclib', fetch);
    expect(first).toBe(second);
    const starts = [];
    const jobs = [first, second, first].map((policy, i) =>
      policy.scheduler.schedule(() => starts.push([i, Date.now()])),
    );
    await vi.advanceTimersByTimeAsync(0);
    const other = getLyricsRequestPolicy(
      'betterlyrics',
      fetch,
    ).scheduler.schedule(() => starts.push(['other', Date.now()]));
    await vi.advanceTimersByTimeAsync(2000);
    await Promise.all([...jobs, other]);
    const own = starts.filter(([id]) => id !== 'other').map(([, time]) => time);
    expect(own[1] - own[0]).toBe(1000);
    expect(own[2] - own[1]).toBe(1000);
    expect(starts.find(([id]) => id === 'other')[1]).toBe(own[0]);
  });

  it('coalesces normalized requests, clones cached values and expires successful cache entries', async () => {
    vi.useFakeTimers();
    const policy = getLyricsRequestPolicy('lrclib', vi.fn());
    const start = vi.fn(async ({ charge }) => {
      charge();
      return { status: 'ok', records: [{ id: 42 }] };
    });
    const first = createLyricsRequestBudget('lrclib');
    const second = createLyricsRequestBudget('lrclib');
    const [a, b] = await Promise.all([
      policy.run(['search', { title: 'Song', artist: 'Singer' }], start, {
        budget: first,
      }),
      policy.run(['search', { artist: 'Singer', title: 'Song' }], start, {
        budget: second,
      }),
    ]);
    expect(start).toHaveBeenCalledOnce();
    a.records[0].id = 99;
    expect(b.records[0].id).toBe(42);
    expect(
      (await policy.run(['search', { artist: 'Singer', title: 'Song' }], start))
        .records[0].id,
    ).toBe(42);
    await vi.advanceTimersByTimeAsync(30_001);
    await policy.run(['search', { title: 'Song', artist: 'Singer' }], start);
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('enforces actual attempt limits including retries', async () => {
    const policy = getLyricsRequestPolicy('lrclib', vi.fn());
    const budget = createLyricsRequestBudget('lrclib');
    const result = policy.run(
      ['test'],
      async ({ charge }) => {
        charge();
        charge();
        charge();
        return { status: 'ok' };
      },
      { budget },
    );
    await expect(result).rejects.toMatchObject({
      reason: 'request-budget-exhausted',
    });
    expect(budget.attempts).toBe(2);
  });

  it('detaches only the cancelled subscriber and keeps work needed by another caller', async () => {
    const policy = getLyricsRequestPolicy('lrclib', vi.fn());
    const controller = new AbortController();
    let finish;
    let signal;
    const start = vi.fn((context) => {
      signal = context.signal;
      context.charge();
      return new Promise((resolve) => {
        finish = resolve;
      });
    });
    const first = policy.run(['same'], start, { signal: controller.signal });
    const second = policy.run(['same'], start);
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    expect(signal.aborted).toBe(false);
    finish({ status: 'ok' });
    await second;
    expect(start).toHaveBeenCalledOnce();
  });

  it('does not allow an abandoned flight to refill cache or absorb a replacement', async () => {
    const policy = getLyricsRequestPolicy('lrclib', vi.fn());
    const controller = new AbortController();
    let finish;
    const first = policy.run(
      ['same'],
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      { signal: controller.signal },
    );
    await vi.waitFor(() => expect(finish).toBeTypeOf('function'));
    controller.abort();
    await expect(first).rejects.toMatchObject({ name: 'AbortError' });
    await policy.run(['same'], async () => ({ status: 'ok', value: 'new' }));
    finish({ status: 'ok', value: 'old' });
    await Promise.resolve();
    expect(await policy.run(['same'], vi.fn())).toEqual({
      status: 'ok',
      value: 'new',
    });
  });

  it('fresh validation bypasses discovery and invalidates older cache writers', async () => {
    const policy = getLyricsRequestPolicy('lrclib', vi.fn());
    await policy.run(['record', 42], async () => ({
      status: 'ok',
      value: 'old',
    }));
    const fresh = vi.fn(async () => ({ status: 'ok', value: 'current' }));
    expect(await policy.run(['record', 42], fresh, { fresh: true })).toEqual({
      status: 'ok',
      value: 'current',
    });
    const search = vi.fn(async () => ({ status: 'ok', value: 'rediscovered' }));
    await policy.run(['record', 42], search);
    expect(search).toHaveBeenCalledOnce();
    await policy.run(['record', 42], fresh, { fresh: true });
    expect(fresh).toHaveBeenCalledTimes(2);
  });

  it('retains successful discovery when fresh verification fails temporarily', async () => {
    const policy = getLyricsRequestPolicy('lrclib', vi.fn());
    await policy.run(['search'], async () => ({
      status: 'ok',
      value: 'preview',
    }));
    await policy.run(
      ['record'],
      async () => ({ status: 'error', reason: 'service-unavailable' }),
      { fresh: true },
    );
    const unnecessary = vi.fn();
    expect(await policy.run(['search'], unnecessary)).toEqual({
      status: 'ok',
      value: 'preview',
    });
    expect(unnecessary).not.toHaveBeenCalled();
  });

  it('never caches failure or partial results and bounds cache by bytes', async () => {
    const policy = getLyricsRequestPolicy('lrclib', vi.fn(), {
      cacheMaxBytes: 10,
    });
    const start = vi.fn(async () => ({ status: 'ok', payload: 'oversized' }));
    await policy.run(['large'], start);
    await policy.run(['large'], start);
    expect(start).toHaveBeenCalledTimes(2);
    const fail = vi.fn(async () => ({
      status: 'error',
      reason: 'rate-limited',
    }));
    await policy.run(['error'], fail);
    await policy.run(['error'], fail);
    expect(fail).toHaveBeenCalledTimes(2);
  });

  it('expires an operation while queued, without sending a network attempt', async () => {
    vi.useFakeTimers();
    const policy = getLyricsRequestPolicy('lrclib', vi.fn());
    const budget = createLyricsRequestBudget('lrclib', { timeoutMs: 10 });
    const reply = policy.run(
      ['slow'],
      ({ signal }) =>
        new Promise((_resolve, reject) =>
          signal.addEventListener('abort', () => reject(signal.reason), {
            once: true,
          }),
        ),
      { budget },
    );
    const outcome = reply.catch((error) => error);
    await vi.advanceTimersByTimeAsync(11);
    expect(await outcome).toMatchObject({ name: 'TimeoutError' });
    expect(budget.attempts).toBe(0);
  });
});

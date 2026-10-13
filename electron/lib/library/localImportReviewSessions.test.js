import { describe, expect, it } from 'vitest';
import { createLocalImportReviewSessionStore } from './localImportReviewSessions.js';

const SESSION_ID = '11111111-1111-4111-8111-111111111111';

describe('local import review sessions', () => {
  it('keeps private candidates in memory and consumes a session once', () => {
    const store = createLocalImportReviewSessionStore({
      createId: () => SESSION_ID,
      now: () => 1_000,
    });
    const candidates = [
      {
        sourcePath: 'C:\\Users\\Singer\\Private\\song.wma',
        sourceFormat: 'wma',
      },
    ];

    expect(store.create(candidates)).toBe(SESSION_ID);
    expect(store.has(SESSION_ID)).toBe(true);
    expect(store.consume(SESSION_ID)).toEqual(candidates);
    expect(store.has(SESSION_ID)).toBe(false);
    expect(store.consume(SESSION_ID)).toBeNull();
  });

  it('expires sessions and rejects malformed renderer ids', () => {
    let now = 5_000;
    const store = createLocalImportReviewSessionStore({
      createId: () => SESSION_ID,
      now: () => now,
      ttlMs: 1_000,
    });
    store.create([
      { sourcePath: 'C:\\Music\\song.aiff', sourceFormat: 'aiff' },
    ]);

    expect(store.has('../private')).toBe(false);
    now = 6_001;
    expect(store.has(SESSION_ID)).toBe(false);
    expect(store.consume(SESSION_ID)).toBeNull();
  });
});

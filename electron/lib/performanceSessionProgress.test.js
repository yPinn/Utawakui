import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createPerformanceSessionPlanStore } from './performanceSessionPlan.js';

describe('local arrangement progress, without OBS', () => {
  let directory;
  let store;
  const tracks = new Map([['song', { id: 'song', title: 'Song' }]]);
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'arrangement-progress-'));
    store = createPerformanceSessionPlanStore({ directory });
  });
  afterEach(() => fs.rmSync(directory, { recursive: true, force: true }));
  const change = (item, progress) =>
    store.setProgress(
      {
        itemId: item.itemId,
        expectedProgressRevision: item.progressRevision,
        progress,
      },
      tracks,
    );

  it('atomically drags one queued occurrence by target identity while preserving current and results', () => {
    for (let i = 0; i < 6; i++) store.appendLibraryTrack('song', tracks);
    let items = store.getProjected(tracks).items;
    change(change(items[0], 'playing').items[0], 'completed');
    items = store.getProjected(tracks).items;
    change(items[1], 'playing');
    change(items[2], 'skipped');
    const before = store.getProjected(tracks);
    const moved = store.reorderItem(
      {
        itemId: items[5].itemId,
        targetItemId: items[3].itemId,
        position: 'before',
      },
      tracks,
    );
    expect(
      moved.items
        .filter((item) => item.progress === 'queued')
        .map((item) => item.itemId),
    ).toEqual([items[5].itemId, items[3].itemId, items[4].itemId]);
    expect(moved.items.slice(0, 3)).toEqual(before.items.slice(0, 3));
    expect(
      moved.items.find((item) => item.itemId === items[5].itemId)
        .progressRevision,
    ).toBe(0);
    const restored = store.reorderItem(
      {
        itemId: items[5].itemId,
        targetItemId: items[4].itemId,
        position: 'after',
      },
      tracks,
    );
    expect(
      restored.items
        .filter((item) => item.progress === 'queued')
        .map((item) => item.itemId),
    ).toEqual(items.slice(3).map((item) => item.itemId));
  });
  it('rejects invalid, current or result drag targets without changing the document', () => {
    for (let i = 0; i < 3; i++) store.appendLibraryTrack('song', tracks);
    const items = store.getProjected(tracks).items;
    change(items[0], 'playing');
    change(items[2], 'skipped');
    const before = store.getProjected(tracks);
    for (const intent of [
      {
        itemId: items[0].itemId,
        targetItemId: items[1].itemId,
        position: 'before',
      },
      {
        itemId: items[1].itemId,
        targetItemId: items[0].itemId,
        position: 'before',
      },
      {
        itemId: items[1].itemId,
        targetItemId: items[2].itemId,
        position: 'after',
      },
      { itemId: 'missing', targetItemId: items[1].itemId, position: 'before' },
      {
        itemId: items[1].itemId,
        targetItemId: items[1].itemId,
        position: 'url',
      },
    ]) {
      expect(() => store.reorderItem(intent, tracks)).toThrow();
      expect(store.getProjected(tracks)).toEqual(before);
    }
    expect(
      store.reorderItem(
        {
          itemId: items[1].itemId,
          targetItemId: items[1].itemId,
          position: 'before',
        },
        tracks,
      ),
    ).toEqual(before);
  });

  it('migrates old items to queued, persists completion and requeues a new occurrence', () => {
    const item = store.appendLibraryTrack('song', tracks).items[0];
    expect(item.progress).toBe('queued');
    const playing = change(item, 'playing').items[0];
    const completed = change(playing, 'completed').items[0];
    expect(completed.progress).toBe('completed');
    const restored = createPerformanceSessionPlanStore({
      directory,
    }).getProjected(tracks);
    expect(restored.items[0].progress).toBe('completed');
    const duplicated = store.duplicateItem(completed.itemId, tracks).items[1];
    expect(duplicated.progress).toBe('queued');
    expect(duplicated.itemId).not.toBe(completed.itemId);
  });

  it('rejects completion before start, stale callbacks and unknown states atomically', () => {
    const item = store.appendLibraryTrack('song', tracks).items[0];
    expect(() => change(item, 'completed')).toThrow();
    const playing = change(item, 'playing').items[0];
    expect(() => change(item, 'completed')).toThrow();
    expect(() => change(playing, 'anything')).toThrow();
    expect(store.getProjected(tracks).items[0].progress).toBe('playing');
  });

  it('reorder does not invalidate the independent progress revision', () => {
    const first = store.appendLibraryTrack('song', tracks).items[0];
    store.appendLibraryTrack('song', tracks);
    const playing = change(first, 'playing').items[0];
    store.moveItem({ itemId: first.itemId, offset: 1 }, tracks);
    expect(change(playing, 'completed').items[1].progress).toBe('completed');
  });

  it('keeps current and completed labels stable; a requeued copy can be edited', () => {
    const item = store.appendLibraryTrack('song', tracks).items[0];
    const playing = change(item, 'playing').items[0];
    const edit = {
      itemId: item.itemId,
      expectedRevision: item.revision,
      displayTitle: 'New label',
    };
    expect(() => store.updateItem(edit, tracks)).toThrow();
    change(playing, 'completed');
    expect(() => store.updateItem(edit, tracks)).toThrow();
    const copy = store.duplicateItem(item.itemId, tracks).items.at(-1);
    expect(
      store
        .updateItem(
          { ...edit, itemId: copy.itemId, expectedRevision: copy.revision },
          tracks,
        )
        .items.at(-1).displayTitle,
    ).toBe('New label');
    expect(store.getProjected(tracks).items[0].displayTitle).toBe('Song');
  });

  it('reorders the visible queue across results and appends repeated occurrences to its tail', () => {
    const first = store.appendLibraryTrack('song', tracks).items[0];
    const second = store.appendLibraryTrack('song', tracks).items[1];
    const third = store.appendLibraryTrack('song', tracks).items[2];
    change(second, 'skipped');
    const moved = store.moveItem({ itemId: first.itemId, offset: 1 }, tracks);
    expect(
      moved.items
        .filter((item) => item.progress === 'queued')
        .map((item) => item.itemId),
    ).toEqual([third.itemId, first.itemId]);
    expect(store.duplicateItem(second.itemId, tracks).items.at(-1).origin).toBe(
      'duplicate',
    );
  });

  it('migrates items with no progress fields and rejects malformed revision intents', () => {
    store.appendLibraryTrack('song', tracks);
    const file = path.join(directory, 'performance-session-plan.json');
    const document = JSON.parse(fs.readFileSync(file));
    delete document.items[0].progress;
    delete document.items[0].progressRevision;
    fs.writeFileSync(file, JSON.stringify(document));
    const restored = store.getProjected(tracks).items[0];
    expect(restored).toMatchObject({ progress: 'queued', progressRevision: 0 });
    for (const expectedProgressRevision of [-1, Infinity, '0', null]) {
      expect(() =>
        store.setProgress(
          {
            itemId: restored.itemId,
            expectedProgressRevision,
            progress: 'playing',
          },
          tracks,
        ),
      ).toThrow();
    }
  });

  it('allows one current occurrence, validates availability and distinguishes skip and interruption', () => {
    const first = store.appendLibraryTrack('song', tracks).items[0];
    const second = store.appendLibraryTrack('song', tracks).items[1];
    const playing = change(first, 'playing').items[0];
    expect(() => change(second, 'playing')).toThrow();
    change(playing, 'interrupted');
    expect(
      change(second, 'skipped').items.map((item) => item.progress),
    ).toEqual(['interrupted', 'skipped']);
    const third = store.appendLibraryTrack('song', tracks).items[2];
    expect(() =>
      store.setProgress(
        {
          itemId: third.itemId,
          expectedProgressRevision: 0,
          progress: 'playing',
        },
        new Map(),
      ),
    ).toThrow();
  });

  it('recovers an unclosed playing item once to interrupted and never restarts audio', () => {
    const item = store.appendLibraryTrack('song', tracks).items[0];
    change(item, 'playing');
    const restarted = createPerformanceSessionPlanStore({ directory });
    restarted.recoverProgress();
    expect(restarted.getProjected(tracks).items[0]).toMatchObject({
      progress: 'interrupted',
      progressRevision: 2,
    });
    restarted.recoverProgress();
    expect(restarted.getProjected(tracks).items[0].progressRevision).toBe(2);
  });

  it('blocks destructive edits of the current occurrence until transport releases it', () => {
    const item = store.appendLibraryTrack('song', tracks).items[0];
    change(item, 'playing');
    expect(() => store.removeItem(item.itemId, tracks)).toThrow();
    expect(() => store.clear(tracks)).toThrow();
    expect(() =>
      store.updateItem(
        {
          itemId: item.itemId,
          expectedRevision: item.revision,
          trackId: null,
          displayTitle: 'Changed',
        },
        tracks,
      ),
    ).toThrow();
  });
});

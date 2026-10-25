import { effectScope, shallowRef } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useLyricsVocalRoles } from './useLyricsVocalRoles.js';
const tick = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const makeDoc = (id) => ({
  documentId: id,
  source: { filename: 'main.lrc', sha256: 'a'.repeat(64) },
  lines: [
    { lineId: id + '-a', text: '(Sabrina 胡恂舞)' },
    { lineId: id + '-b', text: '唱下去' },
  ],
});
describe('saved vocal role owner', () => {
  it('paints name markers as sections and other rows as lines without editing text', async () => {
    const scope = effectScope(),
      document = shallowRef(makeDoc('one')),
      before = structuredClone(document.value),
      store = [];
    const bridge = {
      getLyricsVocalRoles: vi.fn(async () => ({
        revision: 0,
        assignments: store,
      })),
      saveLyricsVocalRoles: vi.fn(async (_t, _f, _d, revision, rows) => ({
        revision: revision + 1,
        assignments: rows,
      })),
    };
    const owner = scope.run(() =>
      useLyricsVocalRoles({
        document,
        trackId: () => 'track',
        getBridge: () => bridge,
      }),
    );
    await tick();
    expect(await owner.paint(['one-a'], 'female')).toBe(true);
    expect(owner.assignments.value).toEqual([
      { lineId: 'one-a', role: 'female', scope: 'section' },
    ]);
    expect(await owner.paint(['one-a', 'one-b'], 'group')).toBe(true);
    expect(owner.assignments.value).toEqual([
      { lineId: 'one-a', role: 'group', scope: 'section' },
      { lineId: 'one-b', role: 'group', scope: 'line' },
    ]);
    expect(await owner.paint(['one-a'], 'auto')).toBe(true);
    expect(owner.assignments.value).toEqual([
      { lineId: 'one-b', role: 'group', scope: 'line' },
    ]);
    expect(await owner.paint(['missing'], 'male')).toBe(false);
    expect(await owner.paint(['one-b'], 'solo')).toBe(false);
    expect(bridge.saveLyricsVocalRoles).toHaveBeenCalledTimes(3);
    expect(document.value).toEqual(before);
    scope.stop();
  });
  it('ignores late loads after switching source', async () => {
    let finish;
    const bridge = {
      getLyricsVocalRoles: vi.fn((_t, _f, id) =>
        id === 'one'
          ? new Promise((r) => (finish = r))
          : Promise.resolve({ revision: 0, assignments: [] }),
      ),
    };
    const scope = effectScope(),
      document = shallowRef(makeDoc('one'));
    const owner = scope.run(() =>
      useLyricsVocalRoles({
        document,
        trackId: () => 't',
        getBridge: () => bridge,
      }),
    );
    document.value = makeDoc('two');
    await tick();
    finish({
      revision: 1,
      assignments: [{ lineId: 'one-a', role: 'male', scope: 'line' }],
    });
    await tick();
    expect(owner.assignments.value).toEqual([]);
    expect(owner.status.value).toBe('ready');
    scope.stop();
  });
  it('does not apply a completed old save to the newly selected source', async () => {
    let finish;
    const bridge = {
      getLyricsVocalRoles: async () => ({ revision: 0, assignments: [] }),
      saveLyricsVocalRoles: () => new Promise((resolve) => (finish = resolve)),
    };
    const scope = effectScope(),
      document = shallowRef(makeDoc('one'));
    const owner = scope.run(() =>
      useLyricsVocalRoles({
        document,
        trackId: () => 't',
        getBridge: () => bridge,
      }),
    );
    await tick();
    const saving = owner.paint(['one-b'], 'male');
    expect(owner.saving.value).toBe(true);
    expect(owner.assignments.value).toEqual([
      { lineId: 'one-b', role: 'male', scope: 'line' },
    ]);
    document.value = makeDoc('two');
    await tick();
    finish({
      revision: 1,
      assignments: [{ lineId: 'one-b', role: 'male', scope: 'line' }],
    });
    expect(await saving).toBe(false);
    expect(owner.assignments.value).toEqual([]);
    expect(owner.saving.value).toBe(false);
    scope.stop();
  });
  it('keeps the last saved value when persistence fails', async () => {
    const scope = effectScope(),
      reportError = vi.fn(),
      document = shallowRef(makeDoc('one')),
      bridge = {
        getLyricsVocalRoles: async () => ({ revision: 0, assignments: [] }),
        saveLyricsVocalRoles: async () => {
          throw Error('private path');
        },
      };
    const owner = scope.run(() =>
      useLyricsVocalRoles({
        document,
        trackId: () => 't',
        getBridge: () => bridge,
        reportError,
      }),
    );
    await tick();
    expect(await owner.paint(['one-b'], 'male')).toBe(false);
    expect(owner.assignments.value).toEqual([]);
    expect(owner.error.value).not.toContain('private');
    expect(reportError).toHaveBeenCalledOnce();
    scope.stop();
  });
  it('waits for the source SHA before asking Main for saved roles', async () => {
    const bridge = {
      getLyricsVocalRoles: vi.fn(async () => ({
        revision: 0,
        assignments: [],
      })),
    };
    const scope = effectScope(),
      document = shallowRef({
        ...makeDoc('text-only'),
        source: { filename: 'main.lrc', sha256: null },
      });
    const owner = scope.run(() =>
      useLyricsVocalRoles({
        document,
        trackId: () => 't',
        getBridge: () => bridge,
      }),
    );
    await tick();
    expect(bridge.getLyricsVocalRoles).not.toHaveBeenCalled();
    expect(owner.status.value).toBe('idle');
    document.value = makeDoc('one');
    await tick();
    expect(bridge.getLyricsVocalRoles).toHaveBeenCalledOnce();
    expect(owner.status.value).toBe('ready');
    scope.stop();
  });
  it('asks Main only for the settled track and source of one selection change', async () => {
    const bridge = {
      getLyricsVocalRoles: vi.fn(async () => ({
        revision: 0,
        assignments: [],
      })),
    };
    const scope = effectScope(),
      trackId = shallowRef('first'),
      document = shallowRef(makeDoc('one'));
    scope.run(() =>
      useLyricsVocalRoles({ document, trackId, getBridge: () => bridge }),
    );
    await tick();
    trackId.value = 'second';
    document.value = makeDoc('two');
    await tick();
    expect(bridge.getLyricsVocalRoles.mock.calls).toEqual([
      ['first', 'main.lrc', 'one'],
      ['second', 'main.lrc', 'two'],
    ]);
    scope.stop();
  });
  it('shows strokes at once and coalesces clicks made during a save', async () => {
    const finishes = [];
    const bridge = {
      getLyricsVocalRoles: async () => ({ revision: 0, assignments: [] }),
      saveLyricsVocalRoles: vi.fn(
        (_t, _f, _d, revision, rows) =>
          new Promise((resolve) =>
            finishes.push(() =>
              resolve({ revision: revision + 1, assignments: rows }),
            ),
          ),
      ),
    };
    const scope = effectScope(),
      document = shallowRef({
        ...makeDoc('one'),
        lines: [...makeDoc('one').lines, { lineId: 'one-c', text: '再唱' }],
      });
    const owner = scope.run(() =>
      useLyricsVocalRoles({
        document,
        trackId: () => 't',
        getBridge: () => bridge,
      }),
    );
    await tick();
    const first = owner.paint(['one-b'], 'male');
    expect(owner.paint(['one-c'], 'female')).toBe(first);
    owner.paint(['one-a'], 'group');
    const painted = [
      { lineId: 'one-b', role: 'male', scope: 'line' },
      { lineId: 'one-c', role: 'female', scope: 'line' },
      { lineId: 'one-a', role: 'group', scope: 'section' },
    ];
    expect(owner.assignments.value).toEqual(painted);
    finishes.shift()();
    await tick();
    expect(owner.assignments.value).toEqual(painted);
    finishes.shift()();
    expect(await first).toBe(true);
    expect(bridge.saveLyricsVocalRoles.mock.calls.map((c) => c[3])).toEqual([
      0, 1,
    ]);
    expect(bridge.saveLyricsVocalRoles.mock.calls[1][4]).toEqual(painted);
    expect(owner.saving.value).toBe(false);
    scope.stop();
  });
  it('rolls an unsaved stroke back to the last saved roles', async () => {
    const bridge = {
      getLyricsVocalRoles: async () => ({
        revision: 2,
        assignments: [{ lineId: 'one-b', role: 'female', scope: 'line' }],
      }),
      saveLyricsVocalRoles: async () => {
        throw Error('disk full');
      },
    };
    const scope = effectScope(),
      document = shallowRef(makeDoc('one'));
    const owner = scope.run(() =>
      useLyricsVocalRoles({
        document,
        trackId: () => 't',
        getBridge: () => bridge,
      }),
    );
    await tick();
    const stroke = owner.paint(['one-b'], 'male');
    expect(owner.assignments.value[0].role).toBe('male');
    expect(await stroke).toBe(false);
    expect(owner.assignments.value).toEqual([
      { lineId: 'one-b', role: 'female', scope: 'line' },
    ]);
    expect(owner.error.value).toBeTruthy();
    scope.stop();
  });
});

import { effectScope, nextTick, reactive } from 'vue';
import { describe, expect, it, vi } from 'vitest';
import { useImportClipboardSuggestion } from './useImportClipboardSuggestion.js';

function setup(
  read = vi
    .fn()
    .mockResolvedValue('https://www.youtube.com/watch?v=abcdefghijk'),
  dismissed = new Set(),
) {
  const state = reactive({ active: true, input: '', busy: false });
  const setInput = vi.fn((value) => {
    state.input = value;
  });
  const scope = effectScope();
  const suggestion = scope.run(() =>
    useImportClipboardSuggestion({
      eligible: () => state.active && !state.input.trim() && !state.busy,
      read,
      setInput,
      dismissed,
    }),
  );
  return { state, setInput, scope, read, ...suggestion };
}

describe('import clipboard suggestion', () => {
  it('reads only on request and fills only after explicit acceptance', async () => {
    const view = setup();
    expect(view.read).not.toHaveBeenCalled();
    await view.check();
    expect(view.url.value).toContain('abcdefghijk');
    expect(view.setInput).not.toHaveBeenCalled();
    view.accept();
    expect(view.setInput).toHaveBeenCalledOnce();
    expect(view.url.value).toBe('');
    view.scope.stop();
  });

  it('keeps a dismissed link suppressed across consumers of the session set', async () => {
    const dismissed = new Set();
    const first = setup(undefined, dismissed);
    await first.check();
    first.dismiss();
    first.scope.stop();
    const second = setup(undefined, dismissed);
    await second.check();
    expect(second.url.value).toBe('');
    second.read.mockResolvedValue(
      'https://www.youtube.com/watch?v=lmnopqrstuv',
    );
    await second.check();
    expect(second.url.value).toContain('lmnopqrstuv');
    second.scope.stop();
  });

  it.each(['active', 'input', 'busy'])(
    'does not read when %s makes the field ineligible',
    async (key) => {
      const view = setup();
      view.state[key] =
        key === 'active' ? false : key === 'input' ? 'my draft' : true;
      await view.check();
      expect(view.read).not.toHaveBeenCalled();
      view.scope.stop();
    },
  );

  it.each(['input', 'busy', 'active', 'dispose'])(
    'ignores a late result after %s, even if eligibility returns',
    async (key) => {
      let complete;
      const view = setup(
        vi.fn(
          () =>
            new Promise((resolve) => {
              complete = resolve;
            }),
        ),
      );
      const pending = view.check();
      if (key === 'dispose') view.scope.stop();
      else {
        const original = view.state[key];
        view.state[key] = key === 'input' ? 'typed text' : !original;
        view.state[key] = original;
      }
      complete('https://www.youtube.com/watch?v=abcdefghijk');
      await pending;
      expect(view.url.value).toBe('');
      view.accept();
      expect(view.setInput).not.toHaveBeenCalled();
      view.scope.stop();
    },
  );

  it('clears an old suggestion when the next read is empty or fails', async () => {
    const view = setup();
    await view.check();
    view.read.mockResolvedValue('');
    await view.check();
    expect(view.url.value).toBe('');
    view.read.mockRejectedValue(new Error('private clipboard context'));
    await expect(view.check()).resolves.toBeUndefined();
    expect(view.url.value).toBe('');
    view.scope.stop();
  });

  it('clears the suggestion when typing or disabling and never overwrites a draft', async () => {
    const view = setup();
    await view.check();
    view.state.input = 'draft';
    await nextTick();
    expect(view.url.value).toBe('');
    view.accept();
    expect(view.setInput).not.toHaveBeenCalled();
    view.scope.stop();
  });

  it('does not let an older response replace a newer clipboard result', async () => {
    const resolvers = [];
    const view = setup(
      vi.fn(() => new Promise((resolve) => resolvers.push(resolve))),
    );
    const older = view.check();
    const newer = view.check();
    resolvers[1]('new');
    await newer;
    resolvers[0]('old');
    await older;
    expect(view.url.value).toBe('new');
    view.scope.stop();
  });
});

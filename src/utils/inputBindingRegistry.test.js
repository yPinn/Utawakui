import { describe, expect, it } from 'vitest';
import { APP_DESTINATIONS } from './appDestinationRegistry.js';
import {
  createKeyboardBindings,
  createPointerBindings,
  resolveKeyboardBinding,
  resolvePointerBinding,
} from './inputBindingRegistry.js';

const INTERNAL_VIEWS = {
  f5: 'music-analysis',
  f6: 'diagnostics-workbench',
};

function keyEvent(key, modifiers = {}) {
  return {
    key,
    ctrlKey: false,
    shiftKey: false,
    altKey: false,
    metaKey: false,
    ...modifiers,
  };
}

function overlaps(a, b) {
  return (
    a.key === b.key &&
    a.ctrl === b.ctrl &&
    a.alt === b.alt &&
    a.meta === b.meta &&
    (a.shift === null || b.shift === null || a.shift === b.shift)
  );
}

describe('keyboard binding registry', () => {
  const bindings = createKeyboardBindings({
    internalViewShortcuts: INTERNAL_VIEWS,
  });

  it('gives every binding a unique id and a user-facing label', () => {
    const ids = bindings.map((binding) => binding.id);

    expect(new Set(ids).size).toBe(ids.length);
    for (const binding of bindings) {
      expect(binding.label).toMatch(/\S/u);
      expect(['allow', 'ignore']).toContain(binding.editable);
      expect(binding.key).toBe(binding.key.toLowerCase());
    }
  });

  it('never binds the same input twice', () => {
    for (const [index, binding] of bindings.entries()) {
      for (const other of bindings.slice(index + 1)) {
        expect(
          overlaps(binding, other),
          `${binding.id} overlaps ${other.id}`,
        ).toBe(false);
      }
    }
  });

  it('derives destination shortcuts from the destination registry', () => {
    for (const destination of APP_DESTINATIONS) {
      const binding = bindings.find(
        (candidate) => candidate.view === destination.id,
      );

      expect(binding).toMatchObject({
        id: `view.${destination.id}`,
        key: destination.shortcut,
        ctrl: false,
        editable: 'allow',
        preventDefault: true,
        devOnly: false,
      });
      expect(binding.label).toContain(destination.label);
    }
  });

  it('keeps Settings on F9 and marks internal workbenches as dev-only', () => {
    expect(
      bindings.find((binding) => binding.view === 'settings'),
    ).toMatchObject({ key: 'f9', editable: 'allow', devOnly: false });

    const internal = bindings.filter((binding) => binding.devOnly);
    expect(internal.map((binding) => [binding.key, binding.view])).toEqual([
      ['f5', 'music-analysis'],
      ['f6', 'diagnostics-workbench'],
    ]);
    for (const binding of internal) {
      expect(binding).toMatchObject({
        editable: 'allow',
        preventDefault: true,
      });
    }
  });

  it('omits internal workbench bindings when none are provided', () => {
    const production = createKeyboardBindings();

    expect(production.some((binding) => binding.devOnly)).toBe(false);
    expect(production.some((binding) => binding.key === 'f5')).toBe(false);
  });

  it('describes the player shortcuts with their editable and default guards', () => {
    const byId = Object.fromEntries(
      bindings.map((binding) => [binding.id, binding]),
    );

    expect(byId['player.transpose-up']).toMatchObject({
      key: 'arrowup',
      ctrl: true,
      shift: false,
      editable: 'ignore',
      preventDefault: true,
    });
    expect(byId['player.tempo-up']).toMatchObject({
      key: 'arrowup',
      ctrl: true,
      shift: true,
    });
    expect(byId['player.volume-up']).toMatchObject({
      key: 'arrowup',
      ctrl: false,
      shift: null,
      preventDefault: true,
    });
    expect(byId['player.mute']).toMatchObject({
      key: 'm',
      editable: 'ignore',
      preventDefault: false,
    });
    expect(byId['player.guide-vocal']).toMatchObject({ key: 'g' });
    expect(byId['obs.marker']).toMatchObject({ key: 'k' });
  });

  it('binds history traversal to Alt+Arrow and the browser navigation keys', () => {
    const byId = Object.fromEntries(
      bindings.map((binding) => [binding.id, binding]),
    );
    const traversal = {
      ctrl: false,
      alt: true,
      editable: 'allow',
      preventDefault: true,
      noRepeat: true,
      skipIfHandled: true,
    };

    expect(byId['history.back']).toMatchObject({
      ...traversal,
      key: 'arrowleft',
      history: 'back',
    });
    expect(byId['history.forward']).toMatchObject({
      ...traversal,
      key: 'arrowright',
      history: 'forward',
    });
    expect(byId['history.back.browser-key']).toMatchObject({
      key: 'browserback',
      alt: false,
      editable: 'allow',
      preventDefault: true,
      noRepeat: true,
    });
    expect(byId['history.forward.browser-key']).toMatchObject({
      key: 'browserforward',
    });
  });

  it('leaves Alt off every binding except history traversal', () => {
    const withAlt = bindings.filter((binding) => binding.alt);

    expect(withAlt.map((binding) => binding.id)).toEqual([
      'history.back',
      'history.forward',
    ]);
    expect(bindings.some((binding) => binding.meta)).toBe(false);
  });

  it('is immutable', () => {
    expect(Object.isFrozen(bindings)).toBe(true);
    expect(bindings.every((binding) => Object.isFrozen(binding))).toBe(true);
  });
});

describe('resolveKeyboardBinding', () => {
  const bindings = createKeyboardBindings({
    internalViewShortcuts: INTERNAL_VIEWS,
  });

  it('matches keys case-insensitively', () => {
    expect(resolveKeyboardBinding(keyEvent('M'), bindings)?.id).toBe(
      'player.mute',
    );
    expect(resolveKeyboardBinding(keyEvent('F2'), bindings)?.id).toBe(
      'view.performance',
    );
  });

  it('selects Ctrl variants by Shift and ignores Shift for plain keys', () => {
    expect(
      resolveKeyboardBinding(keyEvent('ArrowUp', { ctrlKey: true }), bindings)
        ?.id,
    ).toBe('player.transpose-up');
    expect(
      resolveKeyboardBinding(
        keyEvent('ArrowDown', { ctrlKey: true, shiftKey: true }),
        bindings,
      )?.id,
    ).toBe('player.tempo-down');
    expect(
      resolveKeyboardBinding(keyEvent('ArrowUp', { shiftKey: true }), bindings)
        ?.id,
    ).toBe('player.volume-up');
  });

  it('resolves history traversal from Alt+Arrow and browser keys only', () => {
    expect(
      resolveKeyboardBinding(keyEvent('ArrowLeft', { altKey: true }), bindings)
        ?.id,
    ).toBe('history.back');
    expect(
      resolveKeyboardBinding(
        keyEvent('ArrowRight', { altKey: true, shiftKey: true }),
        bindings,
      )?.id,
    ).toBe('history.forward');
    expect(resolveKeyboardBinding(keyEvent('BrowserBack'), bindings)?.id).toBe(
      'history.back.browser-key',
    );
    expect(
      resolveKeyboardBinding(keyEvent('BrowserForward'), bindings)?.id,
    ).toBe('history.forward.browser-key');

    expect(resolveKeyboardBinding(keyEvent('ArrowLeft'), bindings)).toBe(null);
    expect(
      resolveKeyboardBinding(
        keyEvent('ArrowLeft', { altKey: true, ctrlKey: true }),
        bindings,
      ),
    ).toBe(null);
    expect(
      resolveKeyboardBinding(
        keyEvent('ArrowLeft', { altKey: true, metaKey: true }),
        bindings,
      ),
    ).toBe(null);
    expect(
      resolveKeyboardBinding(
        keyEvent('ArrowLeft', { metaKey: true }),
        bindings,
      ),
    ).toBe(null);
  });

  it('reserves every other Alt and Meta combination', () => {
    for (const modifiers of [
      { altKey: true },
      { metaKey: true },
      { altKey: true, ctrlKey: true },
    ]) {
      expect(resolveKeyboardBinding(keyEvent('F2', modifiers), bindings)).toBe(
        null,
      );
      expect(
        resolveKeyboardBinding(keyEvent('ArrowUp', modifiers), bindings),
      ).toBe(null);
    }
  });

  it('does not fall back to a plain binding while Ctrl is held', () => {
    expect(
      resolveKeyboardBinding(keyEvent('m', { ctrlKey: true }), bindings),
    ).toBe(null);
    expect(
      resolveKeyboardBinding(keyEvent('F2', { ctrlKey: true }), bindings),
    ).toBe(null);
  });

  it('returns null for unbound keys', () => {
    expect(resolveKeyboardBinding(keyEvent('x'), bindings)).toBe(null);
    expect(resolveKeyboardBinding(keyEvent(' '), bindings)).toBe(null);
    expect(resolveKeyboardBinding(keyEvent('F4'), bindings)).toBe(null);
  });
});

describe('pointer bindings', () => {
  const bindings = createPointerBindings();

  it('maps the side mouse buttons to history traversal', () => {
    expect(bindings.map((binding) => [binding.id, binding.button])).toEqual([
      ['history.back.mouse', 3],
      ['history.forward.mouse', 4],
    ]);
    expect(bindings.map((binding) => binding.history)).toEqual([
      'back',
      'forward',
    ]);
    for (const binding of bindings) {
      expect(binding.label).toMatch(/\S/u);
      expect(Object.isFrozen(binding)).toBe(true);
    }
    expect(Object.isFrozen(bindings)).toBe(true);
  });

  it('resolves by button and ignores the primary buttons', () => {
    expect(resolvePointerBinding({ button: 3 }, bindings)?.id).toBe(
      'history.back.mouse',
    );
    expect(resolvePointerBinding({ button: 4 }, bindings)?.id).toBe(
      'history.forward.mouse',
    );
    for (const button of [0, 1, 2, 5]) {
      expect(resolvePointerBinding({ button }, bindings)).toBe(null);
    }
  });

  it('keeps ids unique across keyboard and pointer bindings', () => {
    const ids = [
      ...createKeyboardBindings().map((binding) => binding.id),
      ...bindings.map((binding) => binding.id),
    ];

    expect(new Set(ids).size).toBe(ids.length);
  });
});

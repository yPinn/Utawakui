import { describe, expect, it } from 'vitest';

import { resolvePreviewKeyIntent } from './trackPreviewKeys.js';

const onStage = { closest: () => null };
const onButton = { closest: (selector) => (selector === 'button' ? {} : null) };

function key(name, extra = {}) {
  return resolvePreviewKeyIntent({ key: name, target: onStage, ...extra });
}

describe('resolvePreviewKeyIntent', () => {
  it('maps navigation, playback and mute keys', () => {
    expect(key('ArrowDown')).toEqual({ intent: 'next', isolate: true });
    expect(key('ArrowUp')).toEqual({ intent: 'previous', isolate: true });
    expect(key(' ')).toEqual({ intent: 'toggle', isolate: true });
    expect(key('m').intent).toBe('mute');
    expect(key('M').intent).toBe('mute');
  });

  it('leaves Escape and Tab to the modal dialog', () => {
    expect(key('Escape')).toEqual({ intent: null, isolate: false });
    expect(key('Tab')).toEqual({ intent: null, isolate: false });
  });

  it('leaves Space to a focused button', () => {
    expect(key(' ', { target: onButton })).toEqual({
      intent: null,
      isolate: true,
    });
  });

  it('isolates every other key, including modified ones, from global shortcuts', () => {
    expect(key('g')).toEqual({ intent: null, isolate: true });
    expect(key('k')).toEqual({ intent: null, isolate: true });
    expect(key('ArrowUp', { ctrlKey: true })).toEqual({
      intent: null,
      isolate: true,
    });
  });

  it('lets F-keys reach app view switching', () => {
    expect(key('F2')).toEqual({ intent: null, isolate: false });
  });
});

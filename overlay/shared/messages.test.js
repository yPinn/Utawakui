import { describe, expect, it } from 'vitest';
import { readLocaleCatalogs } from '../../electron/lib/localeCatalogs.js';
import {
  OVERLAY_MESSAGES,
  overlayText,
  setOverlayLanguage,
} from './messages.mjs';

function fakeDocument() {
  const text = { dataset: { ovlText: 'historyEmpty' }, textContent: '' };
  const label = {
    dataset: { ovlLabel: 'currentLabel' },
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = value;
    },
  };
  return {
    text,
    label,
    querySelectorAll: (selector) =>
      selector === '[data-ovl-text]' ? [text] : [label],
  };
}

describe('overlay messages', () => {
  it('covers every Output language with the same keys', () => {
    const locales = Object.keys(readLocaleCatalogs());
    expect(Object.keys(OVERLAY_MESSAGES).sort()).toEqual(locales.sort());
    const keys = Object.keys(OVERLAY_MESSAGES['zh-TW']).sort();
    for (const messages of Object.values(OVERLAY_MESSAGES))
      expect(Object.keys(messages).sort()).toEqual(keys);
  });

  it('fills marked text and labels and falls back to zh-TW', () => {
    const document = fakeDocument();
    expect(setOverlayLanguage(document, 'en-US')).toBe('en-US');
    expect(document.text.textContent).toBe('No songs sung yet');
    expect(document.label.attributes['aria-label']).toBe('Now singing');
    expect(overlayText('waitingNext')).toBe('Waiting for the next song');

    expect(setOverlayLanguage(document, 'fr-FR')).toBe('zh-TW');
    expect(document.text.textContent).toBe('尚無已唱歌曲');
  });
});

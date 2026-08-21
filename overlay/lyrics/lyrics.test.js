import { describe, expect, it } from 'vitest';
import { renderLyricsFrame } from './lyrics.mjs';

function element() {
  return {
    textContent: '',
    hidden: false,
    dataset: {},
    setAttribute(name, value) {
      this[name] = value;
    },
  };
}

describe('lyrics overlay renderer', () => {
  it('renders external lyrics as text and clears hidden state', () => {
    const elements = {
      root: element(),
      current: element(),
      next: element(),
    };
    const malicious = '<img src=x onerror=alert(1)>';

    renderLyricsFrame(elements, {
      revision: 2,
      visible: true,
      currentText: malicious,
      nextText: '下一句',
      language: 'zh-Hant',
    });

    expect(elements.current.textContent).toBe(malicious);
    expect(elements.next.textContent).toBe('下一句');
    expect(elements.root.hidden).toBe(false);
    expect(elements.root.lang).toBe('zh-Hant');
  });

  it('clears text when no lyric line is active', () => {
    const elements = {
      root: element(),
      current: element(),
      next: element(),
    };
    elements.current.textContent = 'stale';

    renderLyricsFrame(elements, {
      revision: 3,
      visible: false,
      currentText: '',
      nextText: '',
      language: '',
    });

    expect(elements.root.hidden).toBe(true);
    expect(elements.current.textContent).toBe('');
    expect(elements.next.textContent).toBe('');
  });
});

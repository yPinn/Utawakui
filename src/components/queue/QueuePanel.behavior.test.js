import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./QueuePanel.vue', import.meta.url),
  'utf8',
);
const rowSource = readFileSync(
  new URL('./QueueTrackButton.vue', import.meta.url),
  'utf8',
);
const sectionSource = readFileSync(
  new URL('./QueueSection.vue', import.meta.url),
  'utf8',
);

describe('QueuePanel shared Dock content', () => {
  it('is a content layer rather than a floating PlayerBarPanel', () => {
    expect(source).toContain(
      '<section class="queue-panel" aria-label="播放佇列">',
    );
    expect(source).toContain(
      "import AppRightDockHeader from '../layout/AppRightDockHeader.vue';",
    );
    expect(source).toContain('<AppRightDockHeader');
    expect(source).toContain('close-label="關閉播放佇列"');
    expect(source).toContain('@close="emit(\'close\')"');
    expect(source).not.toContain('class="queue-panel__header"');
    expect(source).not.toContain('PlayerBarPanel');
    expect(source).not.toContain('position: fixed');
  });

  it('uses the Dock height as one bounded scroll surface', () => {
    expect(source).toMatch(
      /\.queue-panel\s*\{[^}]*min-height:\s*0;[^}]*height:\s*100%;[^}]*flex-direction:\s*column;/su,
    );
    expect(source).toMatch(
      /\.queue-panel__scroll\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1;[^}]*overflow-y:\s*auto;/su,
    );
    expect(source).not.toContain('--ui-queue-panel-max-height');
  });

  it('keeps long Queue rows cheap until their pixels are needed', () => {
    expect(rowSource).not.toContain('UiMarqueeText');
    expect(rowSource).toContain('UiTextButton');
    expect(rowSource).toContain('overflow="ellipsis"');
    expect(sectionSource).toContain('overflow="ellipsis"');
    expect(rowSource).toContain('loading="lazy"');
    expect(rowSource).toContain('decoding="async"');
    expect(sectionSource).toContain('content-visibility: auto');
    expect(sectionSource).toContain('contain-intrinsic-block-size');
  });

  it('uses the current label type and radius roles without legacy aliases', () => {
    for (const queueSource of [sectionSource, rowSource]) {
      expect(queueSource).not.toContain('--ui-font-weight-strong');
      expect(queueSource).not.toContain('var(--ui-radius)');
    }
    expect(sectionSource).toMatch(
      /\.queue-section__title\s*\{[^}]*font-weight:\s*var\(--ui-font-weight-semibold\);[^}]*line-height:\s*var\(--ui-line-height-label\);/su,
    );
    expect(rowSource).toMatch(
      /\.queue-track__title\s*\{[^}]*font-weight:\s*var\(--ui-font-weight-semibold\);[^}]*line-height:\s*var\(--ui-line-height-label\);/su,
    );
  });
});

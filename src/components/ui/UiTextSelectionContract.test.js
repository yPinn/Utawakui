import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Selection ownership follows token-v2-component-review.md: interface labels
// and short states are non-selectable; user input and quotable copy are not.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

function ruleBody(source, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  return source.match(
    new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`, 'u'),
  )?.[1];
}

describe('production text selection contract', () => {
  it.each([
    ['./UiChip.vue', '.ui-chip'],
    ['./UiTabs.vue', '.ui-tabs__tab'],
    ['./UiField.vue', '.ui-field__label'],
    ['./UiBreadcrumb.vue', '.ui-breadcrumb'],
    ['../artists/ArtistIdentityCredits.vue', '.artist-identity-credits__count'],
    ['../artists/ArtistIdentityModal.vue', '.artist-identity-modal__status'],
    ['../bgm/BgmPlayer.vue', '.bgm-player__status'],
    ['../layout/AppConfirmationModal.vue', '.app-confirmation__meta'],
    ['../layout/AppFolderSection.vue', '.app-folder-section__meta'],
    [
      '../library/ReleaseCatalogBatchActions.vue',
      '.release-batch-actions__status',
    ],
    [
      '../playback/context/TrackCapabilityItem.vue',
      '.track-capability-matrix__copy',
    ],
  ])('keeps %s %s non-selectable', (path, selector) => {
    const body = ruleBody(read(path), selector);
    expect(body, selector).toContain('-webkit-user-select: none;');
    expect(body, selector).toContain('user-select: none;');
  });

  it.each([
    './UiHint.vue',
    './UiNotice.vue',
    './UiTextField.vue',
    './UiTextarea.vue',
    './UiMarqueeText.vue',
  ])('keeps %s content selectable', (path) => {
    expect(read(path)).not.toContain('user-select: none');
  });

  it('keeps field hint and error selectable while the label is not', () => {
    const body = ruleBody(read('./UiField.vue'), '.ui-field__message');
    expect(body).toBeDefined();
    expect(body).not.toContain('user-select: none');
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./ArtworkSearchResults.vue', import.meta.url),
  'utf8',
);

describe('ArtworkSearchResults behavior contract', () => {
  it('renders a compact single-column radio list with progressive previews', () => {
    expect(source).toContain('role="radiogroup"');
    expect(source).toContain('role="radio"');
    expect(source).toContain(':aria-checked=');
    expect(source).toContain('candidate.previewLoading');
    // Loading status comes from the shared UiArtworkLoading (role="status").
    expect(source).toContain(
      '<template v-if="candidate.previewLoading" #overlay>',
    );
    expect(source).toContain(
      '<UiArtworkLoading :label="`${display.title}封面載入中`" />',
    );
    expect(source).not.toMatch(/@keyframes|artwork-results__loading/u);
    expect(source).not.toContain('UiSkeleton');
    expect(source).toContain("emit('select', candidate.id)");
    expect(source).toContain('--artwork-result-thumb-size: 3rem');
    expect(source).toContain('size="var(--artwork-result-thumb-size)"');
    expect(source).toContain(
      'grid-template-columns: var(--artwork-result-thumb-size) minmax(0, 1fr)',
    );
  });

  it('projects only decision-useful copy without leaving the modal', () => {
    expect(source).toContain('projectArtworkCandidate');
    expect(source).toContain('v-if="display.reason"');
    expect(source).not.toContain('查看來源');
    expect(source).not.toContain('openSource');
    expect(source).not.toContain('ExternalLink');
    expect(source).not.toContain('matchKind');
    expect(source).not.toContain('reasonLabel');
    expect(source).not.toContain('MusicBrainz');
  });

  it('implements the complete radio keyboard model with one tab stop', () => {
    expect(source).toContain(':tabindex="radioTabIndex(candidate.id, index)"');
    expect(source).toContain('@keydown="handleRadioKeydown($event, index)"');
    expect(source).toContain("case 'ArrowDown':");
    expect(source).toContain("case 'ArrowUp':");
    expect(source).toContain("case 'Home':");
    expect(source).toContain("case 'End':");
    expect(source).toContain('focusCandidate(nextIndex)');
  });
});

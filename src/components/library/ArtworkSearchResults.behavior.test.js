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
    expect(source).toContain('class="artwork-results__loading"');
    expect(source).toContain('role="status"');
    expect(source).not.toContain('UiSkeleton');
    expect(source).toContain("emit('select', candidate.id)");
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
});

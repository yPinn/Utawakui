import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rule = (source, selector) => {
  const start = source.indexOf(`${selector} {`);
  return start < 0 ? '' : source.slice(start, source.indexOf('}', start));
};

// The dossier artwork, action rail, compact bar and track table share the
// paper content edge; any inline inset here would misalign them.
describe('Folder content edge', () => {
  it('gives the dossier block space only', () => {
    const body = rule(
      read('./AppFolderDossier.vue'),
      '.app-folder-dossier__body',
    );
    expect(body).toContain('padding-block: var(--ui-space-5);');
    expect(body).not.toMatch(/padding(-inline)?:/u);
  });

  it('keeps the compact bar Play on the rail Play edge', () => {
    const surface = rule(
      read('./AppFolderCompactBar.vue'),
      '.app-folder-compact-bar__surface',
    );
    expect(surface).toContain('padding-block: var(--ui-space-2);');
    expect(surface).not.toMatch(/padding(-inline)?:/u);
    expect(surface).toContain('inset-inline: 0;');
  });

  it('reads full notes from the top and centres only the compact stock', () => {
    const artifact = read('../ui/UiFolderArtifact.vue');
    expect(rule(artifact, '.ui-folder-artifact--note')).toContain(
      'align-content: start;',
    );
    expect(
      rule(artifact, '.ui-folder-artifact--note.ui-folder-artifact--compact'),
    ).toContain('align-content: center;');
  });
});

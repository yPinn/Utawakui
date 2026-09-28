import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

const componentSource = readFileSync(
  new URL('./PlayerBar.vue', import.meta.url),
  'utf8',
);
const tokenSource = readFileSync(
  new URL('../../styles/tokens.css', import.meta.url),
  'utf8',
);

function cssRule(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 's'))?.[1] ??
    ''
  );
}

describe('PlayerBar responsive metadata layout', () => {
  it('sizes now-playing independently from the collapsible playlist sidebar', () => {
    const trackRule = cssRule(componentSource, '.player-bar__track');

    expect(tokenSource).toMatch(/--ui-player-bar-track-width:\s*[^;]+;/);
    expect(tokenSource).toMatch(/--ui-player-bar-track-width-min:\s*[^;]+;/);
    expect(trackRule).toContain('var(--ui-player-bar-track-width)');
    expect(trackRule).toContain('var(--ui-player-bar-track-width-min)');
    expect(trackRule).not.toContain('--ui-playlist-sidebar-width');
  });

  it('aligns artwork to a shell-owned axis without consuming Playlist geometry', () => {
    expect(tokenSource).toContain('--ui-shell-leading-artwork-centerline:');
    expect(tokenSource).toMatch(
      /--ui-player-bar-padding-inline-start:\s*calc\([\s\S]*?var\(--ui-shell-leading-artwork-centerline\)[\s\S]*?\);/u,
    );
    expect(tokenSource).not.toMatch(
      /--ui-player-bar-padding-inline(?:-start)?:\s*[^;]*--ui-playlist-row/u,
    );
  });

  it('keeps secondary metadata on one clipped line', () => {
    const copyRule = cssRule(componentSource, '.player-bar__track-copy');
    const artistRule = cssRule(componentSource, '.player-bar__track-artist');

    expect(copyRule).toMatch(/overflow:\s*hidden/);
    expect(artistRule).toMatch(/overflow:\s*hidden/);
    expect(artistRule).toMatch(/text-overflow:\s*ellipsis/);
    expect(artistRule).toMatch(/white-space:\s*nowrap/);
  });

  it('delegates Queue visibility to the shell-owned right Dock', () => {
    expect(componentSource).toContain(
      "const emit = defineEmits(['artworkActivate', 'queueActivate']);",
    );
    expect(componentSource).toContain(
      'queueExpanded: { type: Boolean, default: false }',
    );
    expect(componentSource).toContain(':active="queueExpanded"');
    expect(componentSource).toContain(':aria-controls="queueControls"');
    expect(componentSource).toContain("emit('queueActivate')");
    expect(componentSource).not.toContain('isQueueOpen');
    expect(componentSource).not.toContain('<QueuePanel');
  });
});

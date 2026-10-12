import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiCollageThumb from './UiCollageThumb.vue';
import UiTrackThumb from './UiTrackThumb.vue';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const rule = (source, selector) =>
  source.match(
    new RegExp(
      `(?:^|\\n)${selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\{([^}]*)\\}`,
      'u',
    ),
  )?.[1] ?? '';

const base = read('../../styles/base.css');
const trackThumb = read('./UiTrackThumb.vue');
const collageThumb = read('./UiCollageThumb.vue');

async function render(component, props) {
  return renderToString(
    createSSRApp({
      render: () =>
        h(component, props, { overlay: () => h('i', { class: 'cue' }) }),
    }),
  );
}

describe('rounded artwork composite clip', () => {
  it('defines one no-op mask layer that composites before the radius clip', () => {
    expect(rule(base, '.ui-artwork-composite')).toContain(
      'mask-image: linear-gradient(#000 0 0);',
    );
  });

  it('keeps thumb roots as the sole clip and paints ground inside the layer', async () => {
    for (const [source, root, layers] of [
      [trackThumb, '.ui-track-thumb', '.ui-track-thumb__layers'],
      [collageThumb, '.ui-collage-thumb', '.ui-collage-thumb__layers'],
    ]) {
      const rootRule = rule(source, root);
      expect(rootRule).toMatch(/border-radius:/u);
      expect(rootRule).toContain('overflow: hidden;');
      expect(rootRule).not.toMatch(/(^|\n)\s*background:/u);
      expect(rule(source, layers)).toMatch(/background:/u);
      expect(rule(source, layers)).not.toMatch(/border-radius|overflow/u);
    }
    // Artwork-less folders draw their hairline ring on the layer, so that
    // ring alone follows the radius instead of being clipped square.
    const folderLayers = rule(
      collageThumb,
      '.ui-collage-thumb--folder .ui-collage-thumb__layers',
    );
    expect(folderLayers).toContain('border-radius: inherit;');
    expect(folderLayers).toContain('box-shadow: inset');

    const trackHtml = await render(UiTrackThumb, {
      track: { id: 't', title: 'A', thumbnailUrl: 'x.png' },
      size: 40,
    });
    const collageHtml = await render(UiCollageThumb, {
      coverUrl: 'x.png',
      size: 40,
    });
    for (const html of [trackHtml, collageHtml]) {
      expect(html).toMatch(
        /__layers ui-artwork-composite"[^>]*><img[^>]*>.*ui-artwork-overlay.*cue/su,
      );
    }
  });

  it('routes every overlay host through a composite layer', () => {
    const hosts = {
      '../playlists/TrackContextHero.vue':
        /<UiTrackThumb[\s\S]*?<template #overlay>/u,
      './UiTrackRow.vue':
        /<UiTrackThumb[\s\S]*?<template v-if="\$slots\.artworkOverlay" #overlay>/u,
      '../playlists/PlaylistDetailsModal.vue':
        /<UiCollageThumb[\s\S]*?:decorative="isAlbum"[\s\S]*?<template v-if="!isAlbum" #overlay>/u,
      '../library/LibraryEntityDossier.vue':
        /<UiCollageThumb[\s\S]*?radius="0"[\s\S]*?<template v-if="\$slots\['artwork-overlay'\]" #overlay>/u,
      '../playlists/TrackPreviewOverlay.vue':
        /class="track-preview__artwork-layers ui-artwork-composite"[\s\S]*?<Transition[\s\S]*?<UiArtworkOverlay>/u,
    };
    for (const [path, pattern] of Object.entries(hosts)) {
      expect(read(path), path).toMatch(pattern);
    }
    expect(read('./UiTrackRow.vue')).not.toContain('<UiArtworkOverlay');
    expect(read('../playlists/PlaylistDetailsModal.vue')).not.toContain(
      '<UiArtworkOverlay',
    );
    expect(read('../library/LibraryEntityDossier.vue')).not.toContain(
      '<UiArtworkOverlay',
    );
  });

  it('drops duplicate clips on wrappers that no longer own the artwork', () => {
    expect(
      rule(read('./UiTrackRow.vue'), '.ui-track__artwork-action'),
    ).not.toMatch(/overflow:/u);
    expect(
      rule(read('../playlists/TrackContextHero.vue'), '.track-context-hero'),
    ).not.toMatch(/overflow:/u);
    expect(
      rule(
        read('../playlists/PlaylistDetailsModal.vue'),
        '.playlist-details__cover',
      ),
    ).not.toMatch(/overflow:|border-radius:/u);
  });

  it('gives hairline frames a border-coloured ground and radius-less thumbs', () => {
    const preview = read('../playlists/TrackPreviewOverlay.vue');
    const dossier = read('../layout/AppFolderDossier.vue');
    expect(
      rule(preview, '.track-preview__artwork,\n.track-preview__peek'),
    ).toContain('background: var(--ui-color-border);');
    // The peek's own rule must not reset the shared ground (button reset).
    const peekRule = preview.match(
      /\n\.track-preview__peek \{(?<body>[^}]*--track-preview-switch-offset[^}]*)\}/u,
    )?.groups?.body;
    expect(peekRule).toBeTruthy();
    expect(peekRule).not.toMatch(/background:/u);
    expect(preview.match(/<UiTrackThumb[^>]*radius="0"/gu)).toHaveLength(3);
    expect(preview).toMatch(
      /<UiTrackThumb\s+:key="track\.id"[\s\S]*?radius="0"/u,
    );
    expect(rule(dossier, '.app-folder-dossier__artwork')).toContain(
      'background: var(--ui-color-border);',
    );
  });
});

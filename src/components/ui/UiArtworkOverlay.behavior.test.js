import { readFileSync } from 'node:fs';
import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import UiArtworkOverlay from './UiArtworkOverlay.vue';

const source = readFileSync(
  new URL('./UiArtworkOverlay.vue', import.meta.url),
  'utf8',
);

describe('UiArtworkOverlay', () => {
  it('renders one plane around caller content', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(UiArtworkOverlay, null, {
            default: () => h('button', { class: 'cue' }, 'Play'),
          }),
      }),
    );
    expect(html).toMatch(
      /^<span class="ui-artwork-overlay"[^>]*>.*cue.*<\/span>$/su,
    );
  });

  it('bleeds one hairline past the host clip so that clip is the only edge', () => {
    expect(source).toMatch(
      /\.ui-artwork-overlay\s*\{[^}]*position:\s*absolute;[^}]*inset:\s*calc\(-1 \* var\(--ui-border-width\)\);[^}]*pointer-events:\s*none;/su,
    );
    expect(source).not.toMatch(/border-radius/u);
    expect(source).not.toMatch(/overflow:/u);
  });

  it('stretches content into the plane and lets it take pointer input', () => {
    expect(source).toMatch(
      /\.ui-artwork-overlay > :slotted\(\*\)\s*\{[^}]*grid-area:\s*1 \/ 1;[^}]*pointer-events:\s*auto;/su,
    );
  });

  it('is mounted only inside composite artwork layers', () => {
    for (const host of [
      '../ui/UiCollageThumb.vue',
      '../ui/UiTrackThumb.vue',
      '../track/TrackPreviewOverlay.vue',
    ]) {
      const hostSource = readFileSync(new URL(host, import.meta.url), 'utf8');
      expect(hostSource, host).toMatch(
        /ui-artwork-composite"[^>]*>[\s\S]*?<UiArtworkOverlay/u,
      );
    }
  });
});

import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoArtworkRamp from './DemoArtworkRamp.vue';
import { ARTWORK_SIZE } from '../../constants/ui.js';

describe('DemoArtworkRamp', () => {
  it('renders every ramp step from its CSS token with a named role', async () => {
    const html = await renderToString(createSSRApp(DemoArtworkRamp));

    for (const [step, dip] of Object.entries(ARTWORK_SIZE)) {
      expect(html).toContain(`data-artwork-step="${step}"`);
      expect(html).toContain(`width:var(--ui-artwork-size-${step})`);
      expect(html).toContain(`${dip / 16}rem · ${dip} DIP`);
    }
    expect(html).toContain('曲目編輯封面（寬版）');
    expect(html).toContain('曲目編輯封面（窄版）');
    expect(html).not.toContain('undefined');
  });
});

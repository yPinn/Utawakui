import { renderToString } from '@vue/server-renderer';
import { createSSRApp, h } from 'vue';
import { describe, expect, it } from 'vitest';
import ObsSlotWorkbench from './ObsSlotWorkbench.vue';

const appearanceOptions = {
  fontFamily: [{ id: 'sans', label: '無襯線' }],
  fontScale: [{ id: 'medium', label: '標準' }],
  fontWeight: [{ id: 'bold', label: '粗體' }],
  alignment: [{ id: 'left', label: '靠左' }],
  surface: [{ id: 'transparent', label: '透明' }],
};

describe('ObsSlotWorkbench template appearance compatibility', () => {
  it('hides controls that a fixed-identity template does not support', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(ObsSlotWorkbench, {
            preset: {
              id: 'karaoke-stack',
              name: 'Classic KTV',
              kind: 'lyrics',
              editableAppearanceKeys: ['fontScale'],
            },
            activeKind: 'lyrics',
            outputSlot: {
              templateId: 'karaoke-stack',
              settings: {
                fontFamily: 'sans',
                fontScale: 'medium',
                fontWeight: 'bold',
                alignment: 'left',
                surface: 'transparent',
                captureSize: 'full',
              },
            },
            appearanceOptions,
          }),
      }),
    );

    expect(html).toContain('字級');
    expect(html).not.toContain('output-appearance-fontFamily');
    expect(html).not.toContain('output-appearance-fontWeight');
    expect(html).not.toContain('output-appearance-alignment');
    expect(html).not.toContain('output-appearance-surface');
  });
});

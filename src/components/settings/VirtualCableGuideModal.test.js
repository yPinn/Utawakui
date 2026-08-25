import fs from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import VirtualCableGuideModal from './VirtualCableGuideModal.vue';

describe('VirtualCableGuideModal', () => {
  it('renders vendor choices without embedding external URLs', async () => {
    const context = {};
    await renderToString(
      createSSRApp(VirtualCableGuideModal, { open: true }),
      context,
    );
    const html = context.teleports?.body ?? '';

    expect(html).toContain('VB-CABLE');
    expect(html).toContain('VoiceMeeter');
    expect(html).toContain('前往官網下載');
    expect(html).not.toContain('https://');
  });

  it('sends only a bounded external target id through preload', () => {
    const source = fs.readFileSync(
      new URL('./VirtualCableGuideModal.vue', import.meta.url),
      'utf8',
    );

    expect(source).toContain('openExternalTarget(targetId)');
    expect(source).toContain('openDownload(tool.id)');
    expect(source).not.toContain('openExternalUrl');
    expect(source).not.toMatch(/\burl\s*:/u);
  });
});

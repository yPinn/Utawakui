import { createSSRApp, h } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it, vi } from 'vitest';
import { t } from '../utils/i18n.js';
import {
  attachClientRender,
  findAll,
  mount,
  trigger,
} from '../components/ui/uiTestHost.js';

vi.mock('../components/ui/UiIconButton.vue', () => ({
  default: {
    props: ['label', 'disabled'],
    emits: ['click'],
    setup:
      (props, { emit }) =>
      () =>
        h(
          'button',
          { 'data-label': props.label, onClick: () => emit('click') },
          props.label,
        ),
  },
}));

vi.mock('../components/ui/UiButtonGroup.vue', () => ({
  default: {
    setup:
      (_props, { slots }) =>
      () =>
        h('div', slots.default?.()),
  },
}));

import CompanionRemoteControls from './CompanionRemoteControls.vue';

attachClientRender(
  CompanionRemoteControls,
  './CompanionRemoteControls.vue',
  import.meta.url,
);

describe('CompanionRemoteControls', () => {
  it('emits each bounded command from its button', () => {
    const commands = [];
    const mounted = mount(CompanionRemoteControls, {
      onCommand: (command) => commands.push(command),
    });
    const buttons = findAll(mounted.root, (node) => node.props?.['data-label']);
    expect(buttons).toHaveLength(5);
    for (const button of buttons) trigger(button, 'onClick');
    expect(commands).toEqual([
      'player.transpose-down',
      'player.transpose-up',
      'player.volume-down',
      'player.volume-up',
      'player.mute',
    ]);
    mounted.app.unmount();
  });

  it('exposes fixed tempos and a separated monitor mix as buttons', async () => {
    const html = await renderToString(
      createSSRApp({
        render: () =>
          h(CompanionRemoteControls, {
            tempoRate: 0.9,
            guideVocal: { enabled: false, available: true },
          }),
      }),
    );
    for (const label of [
      '0.75×',
      '0.9×',
      '1×',
      '1.1×',
      '1.25×',
      '純伴奏',
      '加導唱',
    ])
      expect(html).toContain(label);
    expect(html).toMatch(
      /aria-pressed="true"[^>]*>\s*(?:<!--[\s\S]*?-->\s*)*0\.9×/u,
    );
    expect(html).not.toContain('type="range"');
  });

  it('places the original key action beside the key heading', async () => {
    const html = await renderToString(
      createSSRApp({ render: () => h(CompanionRemoteControls) }),
    );
    const [keyHeader, volumeHeader] =
      html.match(/<header[^>]*>[\s\S]*?<\/header>/gu) ?? [];
    expect(keyHeader).toContain(t('companion.remote.originalKey'));
    expect(volumeHeader).not.toContain('<button');
  });
});

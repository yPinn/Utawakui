import { h } from 'vue';
import { describe, expect, it, vi } from 'vitest';
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
    expect(buttons).toHaveLength(7);
    for (const button of buttons) trigger(button, 'onClick');
    expect(commands).toEqual([
      'player.previous',
      'player.next',
      'player.transpose-down',
      'player.transpose-up',
      'player.volume-down',
      'player.volume-up',
      'player.mute',
    ]);
    mounted.app.unmount();
  });
});

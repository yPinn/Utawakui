import { h, nextTick, shallowRef } from 'vue';
import { expect, it, vi } from 'vitest';
import LyricsCorrectionPanel from './LyricsCorrectionPanel.vue';
import { mount } from '../ui/uiTestHost.js';

it('keeps the saved text when the source refresh finishes after the save', async () => {
  const lines = shallowRef([{ lineId: 'cue', text: 'Original' }]);
  const updated = [{ lineId: 'cue', text: 'Corrected' }];
  const save = vi.fn(async () => ({
    timing: { document: { lines: updated } },
  }));
  const component = { ...LyricsCorrectionPanel, render: () => null };
  const { app } = mount({
    render: () =>
      h(component, { authored: true, lines: lines.value, save, fork: vi.fn() }),
  });
  try {
    const panel = app._instance.subTree.component.subTree.component.setupState;
    panel.text = 'Corrected';
    await panel.saveLine();
    lines.value = updated;
    await nextTick();
    expect(panel.text).toBe('Corrected');
    expect(panel.dirty).toBe(false);
  } finally {
    app.unmount();
  }
});

import { expect, it, vi } from 'vitest';
import UiButton from './UiButton.vue';
import UiFilePickerButton from './UiFilePickerButton.vue';
import UiTooltipSurface from './tooltip/UiTooltipSurface.vue';
import { attachClientRender, findAll, mount, trigger } from './uiTestHost.js';

attachClientRender(UiButton, './UiButton.vue', import.meta.url);
attachClientRender(
  UiTooltipSurface,
  './tooltip/UiTooltipSurface.vue',
  import.meta.url,
);
attachClientRender(
  UiFilePickerButton,
  './UiFilePickerButton.vue',
  import.meta.url,
);

it('opens the hidden picker and emits the same file on successive selections', () => {
  const onSelect = vi.fn();
  const { app, root } = mount(UiFilePickerButton, { accept: '.wav', onSelect });
  const [picker] = findAll(root, (node) => node.type === 'input');
  const [button] = findAll(root, (node) => node.type === 'button');
  picker.click = vi.fn();
  expect(picker.props).toMatchObject({
    type: 'file',
    hidden: '',
    accept: '.wav',
  });
  trigger(button, 'onClick');
  expect(picker.click).toHaveBeenCalledOnce();

  const file = { name: 'vocals.wav' };
  const target = { files: [file], value: file.name };
  trigger(picker, 'onChange', { target });
  expect(target.value).toBe('');
  target.value = file.name;
  trigger(picker, 'onChange', { target });
  trigger(picker, 'onChange', { target: { files: [] } });
  expect(onSelect.mock.calls).toEqual([[file], [file]]);
  app.unmount();
});

import { nextTick } from 'vue';
import { afterEach, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import LibraryTagWriteback from './LibraryTagWriteback.vue';
import UiButton from '../ui/UiButton.vue';
import UiCheckbox from '../ui/UiCheckbox.vue';
import UiField from '../ui/UiField.vue';
import UiSelect from '../ui/UiSelect.vue';
import UiHint from '../ui/UiHint.vue';
for (const [component, file] of [
  [LibraryTagWriteback, './LibraryTagWriteback.vue'],
  [UiButton, '../ui/UiButton.vue'],
  [UiCheckbox, '../ui/UiCheckbox.vue'],
  [UiField, '../ui/UiField.vue'],
  [UiSelect, '../ui/UiSelect.vue'],
  [UiHint, '../ui/UiHint.vue'],
])
  attachClientRender(component, file, import.meta.url);
afterEach(() => vi.unstubAllGlobals());
it('allows a title-only local track to preview without a hidden artist selection', async () => {
  const bridge = {
    getLibraryTagOptions: vi.fn(async () => ({
      status: 'ready',
      supported: true,
      values: { title: 'Only title' },
      current: { title: 'Old' },
      releases: [],
      history: [],
    })),
    previewLibraryTags: vi.fn(async () => ({
      status: 'ready',
      previewId: 'p',
      fields: [{ field: 'title', before: ['Old'], after: 'Only title' }],
    })),
    commitLibraryTags: vi.fn(async () => ({ status: 'saved' })),
  };
  vi.stubGlobal('window', { Utawakui: bridge });
  const view = mount(LibraryTagWriteback, { trackId: 't' });
  trigger(findAll(view.root, (n) => n.type === 'details')[0], 'onToggle', {
    target: { open: true },
  });
  await vi.waitFor(() =>
    expect(textContent(view.root)).toContain('Only title'),
  );
  const button = findAll(
    view.root,
    (n) => n.type === 'button' && textContent(n) === '預覽變更',
  )[0];
  trigger(button, 'onClick');
  await nextTick();
  expect(bridge.previewLibraryTags).toHaveBeenCalledWith({
    trackId: 't',
    fields: ['title'],
  });
  await vi.waitFor(() =>
    expect(textContent(view.root)).toContain('確認回寫音檔'),
  );
  expect(bridge.commitLibraryTags).not.toHaveBeenCalled();
  const confirm = findAll(
    view.root,
    (n) => n.type === 'button' && textContent(n) === '確認回寫音檔',
  )[0];
  expect(String(confirm.props.class)).toContain('ui-btn--accent');
  trigger(confirm, 'onClick');
  await vi.waitFor(() =>
    expect(bridge.commitLibraryTags).toHaveBeenCalledExactlyOnceWith({
      previewId: 'p',
    }),
  );
  view.app.unmount();
});

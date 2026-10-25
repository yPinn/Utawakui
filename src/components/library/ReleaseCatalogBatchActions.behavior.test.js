import { nextTick, reactive } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachClientRender,
  findAll,
  mount,
  textContent,
  trigger,
} from '../ui/uiTestHost.js';
import ReleaseCatalogBatchActions from './ReleaseCatalogBatchActions.vue';
import UiIconButton from '../ui/UiIconButton.vue';
const workflow = vi.hoisted(() => ({
  snapshot: null,
  error: '',
  inspect: vi.fn(),
  start: vi.fn(),
  stop: vi.fn(),
  retry: vi.fn(),
}));
vi.mock('../../composables/useReleaseCatalogBatchDownloads.js', () => ({
  useReleaseCatalogBatchDownloads: () => ({
    ...workflow,
    snapshotFor: () => workflow.snapshot,
    errorFor: () => workflow.error,
    busyFor: () => false,
  }),
}));
attachClientRender(
  ReleaseCatalogBatchActions,
  './ReleaseCatalogBatchActions.vue',
  import.meta.url,
);
attachClientRender(UiIconButton, '../ui/UiIconButton.vue', import.meta.url);
const collection = {
  id: 'album',
  releaseLibraryEpoch: 1,
  resolvedRelease: { revision: 3 },
};
const buttons = (view) => findAll(view.root, (node) => node.type === 'button');
const named = (view, label) =>
  buttons(view).find((node) => textContent(node).includes(label));
afterEach(() => {
  workflow.snapshot = null;
  workflow.error = '';
  vi.clearAllMocks();
});
describe('album batch action icons', () => {
  it('uses the shared icon primitive with the download count in its accessible label', async () => {
    workflow.snapshot = reactive({
      downloadableCount: 11,
      active: false,
      total: 0,
    });
    const view = mount(ReleaseCatalogBatchActions, { collection });
    expect(workflow.inspect).toHaveBeenCalledWith(collection);
    const button = named(view, '下載未下載曲目（11）');
    expect(button.props.class).toContain('ui-icon-btn');
    trigger(button, 'onClick');
    await nextTick();
    expect(workflow.start).toHaveBeenCalledWith(collection);
    view.app.unmount();
  });
  it('projects stop, completion and retry without replacing the shared button style', async () => {
    workflow.snapshot = reactive({
      downloadableCount: 2,
      active: true,
      phase: 'running',
      total: 11,
      completed: 3,
      failed: 1,
      unlinked: 1,
    });
    const view = mount(ReleaseCatalogBatchActions, { collection });
    trigger(named(view, '停止尚未開始的專輯下載'), 'onClick');
    expect(workflow.stop).toHaveBeenCalledWith(collection);
    workflow.snapshot.active = false;
    await nextTick();
    trigger(named(view, '重試失敗項目（2）'), 'onClick');
    expect(workflow.retry).toHaveBeenCalledWith(collection);
    expect(
      buttons(view).every((button) =>
        button.props.class.includes('ui-icon-btn'),
      ),
    ).toBe(true);
    view.app.unmount();
  });
  it('keeps recovery accessible through an icon and announces the bounded error', () => {
    workflow.error = '專輯下載狀態未完成，請重新讀取後再試。';
    const view = mount(ReleaseCatalogBatchActions, { collection });
    const button = named(view, '重新讀取專輯下載狀態');
    expect(button.props.class).toContain('ui-icon-btn--intent-danger');
    trigger(button, 'onClick');
    expect(workflow.inspect).toHaveBeenCalledTimes(2);
    expect(
      findAll(view.root, (node) => node.props.role === 'alert'),
    ).toHaveLength(1);
    view.app.unmount();
  });
});

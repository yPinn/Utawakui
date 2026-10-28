import { reactive, nextTick } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';
import LyricsTimingReviewTool from './LyricsTimingReviewTool.vue';
import { mount } from '../ui/uiTestHost.js';

let app;
afterEach(() => app?.unmount());
function setup(extra = {}) {
  const review = {
    state: reactive({
      status: 'unconfirmed',
      coverage: { timed: 2, total: 3, segmented: 1 },
    }),
    refresh: vi.fn(),
    revoke: vi.fn(),
  };
  const onConfirm = vi.fn();
  const props = reactive({
    review,
    contextKey: 'a/main.lrc',
    onConfirm,
    ...extra,
  });
  const mounted = mount(
    { ...LyricsTimingReviewTool, render: () => null },
    props,
  );
  app = mounted.app;
  return {
    props,
    review,
    onConfirm,
    vm: app._instance.subTree.component.setupState,
  };
}
describe('timing review affordances', () => {
  it('requires explicit acknowledgement and refreshes on opening', () => {
    const f = setup();
    expect(f.vm.canConfirm).toBe(false);
    f.vm.confirm();
    expect(f.onConfirm).not.toHaveBeenCalled();
    f.vm.toggle();
    expect(f.review.refresh).toHaveBeenCalledOnce();
    f.vm.checked = true;
    f.vm.confirm();
    expect(f.onConfirm).toHaveBeenCalledOnce();
  });
  it('does not borrow confirmation for estimated display and reports pending changes', async () => {
    const f = setup({ estimated: true });
    f.vm.checked = true;
    expect(f.vm.statusText).toContain('分析顯示不適用');
    expect(f.vm.canConfirm).toBe(false);
    f.props.estimated = false;
    f.props.offsetPending = true;
    await nextTick();
    expect(f.vm.statusText).toContain('尚未儲存');
    f.props.hasDraft = true;
    f.props.canSave = false;
    await nextTick();
    f.vm.checked = true;
    expect(f.vm.canConfirm).toBe(false);
    f.props.canSave = true;
    await nextTick();
    expect(f.vm.canConfirm).toBe(true);
  });
  it('clears acknowledgement when the draft, context or receipt changes', async () => {
    const f = setup({ hasDraft: true, canSave: true, editRevision: {} });
    f.vm.checked = true;
    f.props.editRevision = {};
    await nextTick();
    expect(f.vm.checked).toBe(false);
    f.vm.checked = true;
    f.props.contextKey = 'b/main.lrc';
    await nextTick();
    expect(f.vm.checked).toBe(false);
    f.vm.checked = true;
    f.review.state.revision = 'r1';
    await nextTick();
    expect(f.vm.checked).toBe(false);
  });
  it('keeps revoke and refresh behind the rightmost menu and enforces their disabled states', async () => {
    const f = setup();
    f.review.state.status = 'confirmed';
    await nextTick();
    f.vm.selectAction({ id: 'revoke' });
    expect(f.review.revoke).toHaveBeenCalledOnce();
    f.props.hasDraft = true;
    await nextTick();
    f.vm.selectAction({ id: 'revoke' });
    expect(f.review.revoke).toHaveBeenCalledOnce();
    f.vm.selectAction({ id: 'refresh' });
    expect(f.review.refresh).toHaveBeenCalledOnce();
    f.review.state.isBusy = true;
    await nextTick();
    f.vm.selectAction({ id: 'refresh' });
    expect(f.review.refresh).toHaveBeenCalledOnce();
  });
  it.each([
    'not-applicable',
    'corrupt',
    'unsupported',
    'unusable',
    'unavailable',
  ])('refuses %s', async (status) => {
    const f = setup();
    f.review.state.status = status;
    await nextTick();
    f.vm.checked = true;
    expect(f.vm.canConfirm).toBe(false);
    f.vm.confirm();
    expect(f.onConfirm).not.toHaveBeenCalled();
  });
});

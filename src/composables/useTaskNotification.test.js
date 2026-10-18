import { afterEach, expect, it, vi } from 'vitest';
afterEach(() => vi.resetModules());

it('keeps progress navigation visible, replaces the same attempt once, and ignores late updates', async () => {
  const { useTaskNotification } = await import('./useTaskNotification.js');
  const { useAppNotifications } = await import('./useAppNotifications.js');
  const owner = useAppNotifications();
  const action = vi.fn();
  const task = useTaskNotification({
    key: 'download',
    title: '下載中',
    action,
  });
  const id = owner.items.value[0].id;
  await owner.runAction(id);
  expect(action).toHaveBeenCalledOnce();
  expect(owner.items.value[0].id).toBe(id);
  task.progress('驗證中', 100);
  task.finish({ title: '已下載' });
  task.finish({ title: '重複完成' });
  task.progress('過期進度', 40);
  expect(owner.items.value).toHaveLength(1);
  expect(owner.items.value[0]).toMatchObject({
    id,
    title: '已下載',
    lifecycle: 'transient',
    progress: null,
  });
});

it('does not resurrect dismissed progress or overwrite a newer attempt', async () => {
  const { useTaskNotification } = await import('./useTaskNotification.js');
  const { useAppNotifications } = await import('./useAppNotifications.js');
  const owner = useAppNotifications();
  const old = useTaskNotification({ key: 'task', title: '舊工作' });
  owner.dismiss(owner.items.value[0].id);
  old.progress('不該重現', 20);
  expect(owner.items.value).toHaveLength(0);
  useTaskNotification({ key: 'task', title: '新工作' });
  old.finish({ title: '舊工作完成' });
  expect(owner.items.value[0].title).toBe('新工作');
  owner.dismiss(owner.items.value[0].id);
  // The newer attempt may already have finished and been dismissed.
  expect(old.finish({ title: '過期結果' })).toBe(false);
});

it('can report a dismissed attempt once and quietly discard a declined operation', async () => {
  const { useTaskNotification } = await import('./useTaskNotification.js');
  const owner = (
    await import('./useAppNotifications.js')
  ).useAppNotifications();
  const task = useTaskNotification({ key: 'task', title: '下載中' });
  owner.dismiss(owner.items.value[0].id);
  expect(task.finish({ title: '未完成', tone: 'danger' })).toBe(true);
  expect(owner.items.value[0].lifecycle).toBe('persistent');
  const declined = useTaskNotification({ key: 'declined', title: '準備中' });
  declined.discard();
  expect(declined.progress('不應顯示')).toBe(false);
  expect(owner.items.value).toHaveLength(1);
});

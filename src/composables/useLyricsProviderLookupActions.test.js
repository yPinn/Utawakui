import { afterEach, describe, expect, it, vi } from 'vitest';
import { useAppNotifications } from './useAppNotifications.js';
import { useLyricsProviderLookupActions } from './useLyricsProviderLookupActions.js';

const notifications = useAppNotifications();
afterEach(() => {
  for (const item of notifications.items.value) notifications.clear(item.key);
  vi.unstubAllGlobals();
});

describe('research lookup notifications', () => {
  it('requires a confirmed main-process result before announcing success', async () => {
    const bridge = {
      runLyricsProviderReviewLookupAction: vi
        .fn()
        .mockResolvedValue({ completed: false }),
    };
    await expect(
      useLyricsProviderLookupActions({ bridge }).run('c', 'copy-candidate-id'),
    ).resolves.toBe(false);
    expect(notifications.items.value[0].tone).toBe('danger');
  });
  it.each([
    ['copy-candidate-id', '候選 ID 已複製'],
    ['copy-recording-mbid', 'Recording MBID 已複製'],
    ['copy-artist-title', '歌手＋歌名已複製'],
    ['open-musicbrainz-recording', '已開啟 MusicBrainz'],
  ])(
    'sends only the bounded candidate and %s action',
    async (action, title) => {
      const bridge = {
        runLyricsProviderReviewLookupAction: vi
          .fn()
          .mockResolvedValue({ completed: true }),
      };
      const owner = useLyricsProviderLookupActions({ bridge });
      await expect(owner.run('candidate-1', action)).resolves.toBe(true);
      expect(
        bridge.runLyricsProviderReviewLookupAction,
      ).toHaveBeenCalledExactlyOnceWith({ candidateId: 'candidate-1', action });
      expect(notifications.items.value).toHaveLength(1);
      expect(notifications.items.value[0]).toMatchObject({
        title,
        tone: 'success',
        lifecycle: 'transient',
      });
    },
  );

  it('retains a bounded failure and retries its original candidate after another action', async () => {
    const bridge = {
      runLyricsProviderReviewLookupAction: vi
        .fn()
        .mockRejectedValueOnce(new Error('E:/private/corpus'))
        .mockResolvedValue({ completed: true }),
    };
    const owner = useLyricsProviderLookupActions({ bridge });
    await owner.run('candidate-1', 'copy-candidate-id');
    const failure = notifications.items.value[0];
    expect(failure).toMatchObject({
      tone: 'danger',
      lifecycle: 'persistent',
      actionLabel: '重試',
    });
    expect(JSON.stringify(failure)).not.toMatch(/private|candidate-1/);
    await owner.run('candidate-2', 'copy-artist-title');
    await notifications.runAction(failure.id);
    expect(
      bridge.runLyricsProviderReviewLookupAction.mock.calls.map(
        ([intent]) => intent,
      ),
    ).toEqual([
      { candidateId: 'candidate-1', action: 'copy-candidate-id' },
      { candidateId: 'candidate-2', action: 'copy-artist-title' },
      { candidateId: 'candidate-1', action: 'copy-candidate-id' },
    ]);
    expect(
      notifications.items.value.find((n) => n.key === failure.key).tone,
    ).toBe('success');
  });

  it.each(['resolve', 'reject'])(
    'ignores an old %s after another consumer retries the same action',
    async (outcome) => {
      let resolve, reject;
      const pending = new Promise((yes, no) => {
        resolve = yes;
        reject = no;
      });
      const bridge = {
        runLyricsProviderReviewLookupAction: vi
          .fn()
          .mockReturnValueOnce(pending)
          .mockResolvedValue({ completed: true }),
      };
      const first = useLyricsProviderLookupActions({ bridge }).run(
        'old',
        'copy-recording-mbid',
      );
      await useLyricsProviderLookupActions({ bridge }).run(
        'new',
        'copy-recording-mbid',
      );
      const id = notifications.items.value[0].id;
      if (outcome === 'resolve') resolve();
      else reject(new Error('private old response'));
      await first;
      expect(notifications.items.value).toHaveLength(1);
      expect(notifications.items.value[0]).toMatchObject({
        id,
        tone: 'success',
      });
    },
  );

  it('rejects unsupported intent without IPC and reports a missing bridge safely', async () => {
    const owner = useLyricsProviderLookupActions({ bridge: {} });
    for (const [id, action] of [
      ['', 'copy-candidate-id'],
      ['x'.repeat(257), 'copy-candidate-id'],
      ['c', 'arbitrary'],
    ]) {
      await expect(owner.run(id, action)).resolves.toBe(false);
    }
    expect(notifications.items.value).toHaveLength(0);
    await expect(owner.run('c', 'open-musicbrainz-recording')).resolves.toBe(
      false,
    );
    expect(notifications.items.value[0]).toMatchObject({
      tone: 'danger',
      actionLabel: '重試',
    });
  });

  it('uses the desktop bridge by default', async () => {
    const bridge = {
      runLyricsProviderReviewLookupAction: vi
        .fn()
        .mockResolvedValue({ completed: true }),
    };
    vi.stubGlobal('window', { Utawakui: bridge });
    await useLyricsProviderLookupActions().run('c', 'copy-candidate-id');
    expect(bridge.runLyricsProviderReviewLookupAction).toHaveBeenCalledOnce();
  });
});

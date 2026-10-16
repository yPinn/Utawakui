import { describe, expect, it } from 'vitest';
import {
  ACTION_MENU_SIZE_PX,
  actionMenuPresentation,
  actionMenuWidth,
} from './actionMenuModel.js';

const action = (id, label, extra = {}) => ({
  kind: 'action',
  id,
  label,
  value: id,
  ...extra,
});

describe('action menu model', () => {
  it('maps semantic sizes to the three supported menu widths', () => {
    expect(ACTION_MENU_SIZE_PX).toEqual({ sm: 184, md: 220, lg: 240 });
    expect(actionMenuWidth('sm')).toBe(184);
    expect(actionMenuWidth('md')).toBe(220);
    expect(actionMenuWidth('lg')).toBe(240);
  });

  it('drops empty groups and inserts stable separators only between groups', () => {
    const content = {
      kind: 'actions',
      groups: [
        { id: 'queue', items: [action('queue', '加入佇列')] },
        { id: 'empty', items: [] },
        {
          id: 'manage',
          items: [action('edit', '編輯歌曲'), action('delete', '刪除曲目')],
        },
      ],
      emptyText: '沒有可用操作',
    };

    const presentation = actionMenuPresentation(content);

    expect(presentation.entries.map((entry) => entry.id)).toEqual([
      'queue',
      'separator:queue:manage',
      'edit',
      'delete',
    ]);
    expect(presentation.focusableItems.map((item) => item.id)).toEqual([
      'queue',
      'edit',
      'delete',
    ]);
    expect(presentation.emptyText).toBe('');
  });

  it('keeps pinned actions fixed while filtering result groups by label and keywords', () => {
    const content = {
      kind: 'filterable-actions',
      search: {
        label: '搜尋播放清單',
        placeholder: '搜尋播放清單',
      },
      pinnedItems: [action('create', '建立新播放清單')],
      groups: [
        {
          id: 'destinations',
          items: [
            action('live', '演出曲目', { keywords: ['歌回', 'setlist'] }),
            action('practice', '練習清單'),
          ],
        },
      ],
      emptyText: '沒有可加入的播放清單',
      noResultsText: '找不到播放清單',
    };

    const byLabel = actionMenuPresentation(content, '練習');
    expect(byLabel.entries.map((entry) => entry.id)).toEqual([
      'create',
      'separator:pinned:destinations',
      'practice',
    ]);

    const byKeyword = actionMenuPresentation(content, 'SETLIST');
    expect(byKeyword.focusableItems.map((item) => item.id)).toEqual([
      'create',
      'live',
    ]);
  });

  it('distinguishes an empty dataset from a search with no matching results', () => {
    const base = {
      kind: 'filterable-actions',
      search: { label: '搜尋目的地', placeholder: '搜尋目的地' },
      pinnedItems: [action('create', '建立新播放清單')],
      emptyText: '沒有可加入的播放清單',
      noResultsText: '找不到播放清單',
    };

    expect(actionMenuPresentation({ ...base, groups: [] }, '').emptyText).toBe(
      '沒有可加入的播放清單',
    );
    expect(
      actionMenuPresentation(
        {
          ...base,
          groups: [{ id: 'destinations', items: [action('live', '演出曲目')] }],
        },
        '不存在',
      ).emptyText,
    ).toBe('找不到播放清單');
  });

  it('rejects the retired flat items schema instead of silently creating a second API', () => {
    expect(() =>
      actionMenuPresentation({
        items: [{ key: 'legacy', label: '舊格式' }],
      }),
    ).toThrow(/content\.kind/u);
  });
});

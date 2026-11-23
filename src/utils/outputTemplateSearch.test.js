import { describe, expect, it } from 'vitest';
import { getOutputWorkbenchData } from '../constants/outputTemplates.js';
import {
  filterOutputTemplates,
  outputTemplateSearchKey,
} from './outputTemplateSearch.js';

const { templateGroups } = getOutputWorkbenchData();

function search(kind, query) {
  const { templates } = templateGroups.find((group) => group.kind === kind);
  return filterOutputTemplates(templates, outputTemplateSearchKey(query)).map(
    ({ id }) => id,
  );
}

describe('Output template search', () => {
  it.each(['英文', '英語', 'Ｅｎｇｌｉｓｈ'])(
    'matches language recommendations for %s',
    (query) => {
      expect(search('lyrics', query)).toEqual([
        'karaoke-stack',
        'live-stage',
        'fisheye-lens',
        'phantom-thieves',
      ]);
      expect(search('setlist', query)).toEqual([]);
    },
  );

  it('supports combining words from a name, displayed fact, and language', () => {
    expect(search('lyrics', '經典 英文 獨立字幕')).toEqual(['karaoke-stack']);
    expect(search('lyrics', '英文 直書')).toEqual([]);
    expect(search('now-playing', '進度條')).toEqual(['cover-player']);
  });
});

import fs from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(filename) {
  return fs.readFileSync(new URL(filename, import.meta.url), 'utf8');
}

describe('lyrics provider corpus review workbench contract', () => {
  it('keeps one state owner and delegates strata, list, and form presentation', () => {
    const view = source('../../views/LyricsProviderReviewView.vue');
    const workbench = source('./LyricsProviderReviewWorkbench.vue');

    expect(view).toContain('<LyricsProviderReviewWorkbench');
    expect(workbench).toContain('useLyricsProviderCorpusReview');
    expect(workbench).toContain('<LyricsProviderReviewStrata');
    expect(workbench).toContain('<LyricsProviderReviewCandidateList');
    expect(workbench).toContain('<LyricsProviderReviewForm');
    expect(workbench).toContain(
      ':approval-blocker="review.approvalBlocker.value"',
    );
    expect(workbench).toContain(':approval-field="review.approvalField.value"');
    expect(workbench).toContain('onMounted(review.load)');
    expect(workbench).toContain('aria-live="polite"');
  });

  it('uses five label-led strata plus explicit decision and reach filters', () => {
    const strata = source('./LyricsProviderReviewStrata.vue');

    expect(strata).toContain('role="tablist"');
    expect(strata).toContain(':aria-selected=');
    expect(strata).toContain('待審');
    expect(strata).toContain('已核准');
    expect(strata).toContain('已拒絕');
    expect(strata).toContain('主流');
    expect(strata).toContain('長尾');
    expect(strata).toContain('<UiSearchBox');
    expect(strata).toContain('placeholder="搜尋歌名、歌手或 ID"');
    expect(strata).not.toMatch(/stratum--(?:red|blue|green|yellow|purple)/i);
  });

  it('renders a keyboard-selectable dense queue with textual status labels', () => {
    const list = source('./LyricsProviderReviewCandidateList.vue');

    expect(list).toContain('viewport-tag="ol"');
    expect(list).toContain('<button');
    expect(list).toContain(':aria-pressed=');
    expect(list).toContain('candidate.reference.artist');
    expect(list).toContain('candidate.reference.title');
    expect(list).toContain('decisionLabel');
    expect(list).toContain('catalogReachLabel');
  });

  it('compares source and confirmed metadata, collapses evidence, and exposes only bounded decisions', () => {
    const form = source('./LyricsProviderReviewForm.vue');

    expect(form).toContain('候選資料（來源）');
    expect(form).toContain('確認資料');
    expect(form).toContain('<details');
    expect(form).toContain('<summary>來源證據</summary>');
    expect(form).toContain('MBID');
    expect(form).toContain('拒絕並下一首');
    expect(form).toContain('核准並下一首');
    expect(form).toContain('approvalBlocker');
    expect(form).toContain('approvalField');
    expect(form).toContain('lyrics-review-approval-blocker');
    expect(form).toContain('role="status"');
    expect(form).toContain('useTemplateRef');
    expect(form).toContain('ref="review-form"');
    expect(form).toContain('@submit.prevent="submitApproval"');
    expect(form).toContain('control?.focus()');
    expect(form).toContain('review-form__control--invalid');
    expect(form).toContain('前往未完成欄位');
    expect(form).toContain(':disabled="saving"');
    expect(form).not.toContain('saving || !canApprove');
    expect(form).toContain('每次決定會立即儲存');
    expect(form).toContain('確認為 2010 年或之後發行');
    expect(form).toContain('release-before-2010');
    expect(form).not.toContain('older-release');
    expect(form).not.toContain('v-html');
    expect(form).not.toContain('path');
    expect(form).not.toContain('providerId');
  });

  it('explains internal and external IDs and exposes fixed lookup actions', () => {
    const form = source('./LyricsProviderReviewForm.vue');

    expect(form).toContain('查證輔助');
    expect(form).toContain('候選 ID（本批資料）');
    expect(form).toContain('只用於這批 F7 審核資料');
    expect(form).toContain('Recording MBID（MusicBrainz 錄音 ID）');
    expect(form).toContain('開啟 MusicBrainz');
    expect(form).toContain('複製歌手＋歌名');
    expect(form).toContain('useClipboardFeedback');
    expect(form).toContain('runLyricsProviderReviewLookupAction');
    expect(form).toContain('aria-live="polite"');
    expect(form).toMatch(/\.review-form__selectable[^}]*user-select:\s*text/s);
    expect(form).not.toContain('navigator.clipboard');
  });

  it('stacks at the established narrow breakpoint and preserves reduced motion', () => {
    const workbench = source('./LyricsProviderReviewWorkbench.vue');
    const list = source('./LyricsProviderReviewCandidateList.vue');
    const form = source('./LyricsProviderReviewForm.vue');

    expect(workbench).toContain('container-type: inline-size');
    expect(workbench).toContain('@container (max-width: 900px)');
    expect(workbench).toMatch(/grid-template-columns:\s*minmax\(18rem, 38%\)/);
    expect(list).toContain('<UiScrollRegion');
    expect(list).toContain('viewport-tag="ol"');
    expect(form).toMatch(
      /\.review-form__header > div:first-child\s*\{[^}]*min-width:\s*0;/s,
    );
    expect(workbench).toContain('@media (prefers-reduced-motion: reduce)');
  });
});

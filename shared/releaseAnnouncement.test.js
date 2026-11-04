import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import announcement from './releaseAnnouncement.json';
import packageJson from '../package.json';

describe('release announcement', () => {
  it('stays in sync with the shipped package version', () => {
    // A forgotten update here would silently show last release's summary
    // as if it described the one the user just installed.
    expect(announcement.version).toBe(packageJson.version);
  });

  it('keeps each summary a short, bounded plain-text paragraph', () => {
    expect(Object.keys(announcement.summary)).toEqual(['zh-TW', 'en-US']);
    // One or two sentences, matching release-notes-template.md's guidance —
    // never a rendered list or markdown, just a short line for the modal.
    for (const [locale, limit] of [
      ['zh-TW', 120],
      ['en-US', 320],
    ]) {
      const summary = announcement.summary[locale];
      expect(typeof summary).toBe('string');
      expect(summary.trim().length).toBeGreaterThan(0);
      expect(summary.length).toBeLessThanOrEqual(limit);
    }
  });

  it('uses the release-note introductions as the bundled summaries', () => {
    const releaseNotes = fs.readFileSync(
      new URL(`../docs/releases/v${announcement.version}.md`, import.meta.url),
      'utf8',
    );
    const versionPattern = announcement.version.replaceAll('.', '\\.');
    const introduction = releaseNotes.match(
      new RegExp(
        `^# Utawakui v${versionPattern} 公開測試版\\r?\\n\\r?\\n([\\s\\S]*?)\\r?\\n\\r?\\n## `,
      ),
    )?.[1];

    expect(introduction?.replace(/\s+/gu, ' ').trim()).toBe(
      announcement.summary['zh-TW'],
    );

    const englishIntroduction = releaseNotes.match(
      new RegExp(
        `^## Utawakui v${versionPattern} Public Test\\r?\\n\\r?\\n([\\s\\S]*?)\\r?\\n\\r?\\n## `,
        'mu',
      ),
    )?.[1];
    expect(englishIntroduction?.replace(/\s+/gu, ' ').trim()).toBe(
      announcement.summary['en-US'],
    );
  });
});

import { describe, expect, it } from 'vitest';
import announcement from './releaseAnnouncement.json';
import packageJson from '../package.json';

describe('release announcement', () => {
  it('stays in sync with the shipped package version', () => {
    // A forgotten update here would silently show last release's summary
    // as if it described the one the user just installed.
    expect(announcement.version).toBe(packageJson.version);
  });

  it('keeps the summary a short, bounded plain-text sentence', () => {
    expect(typeof announcement.summary).toBe('string');
    expect(announcement.summary.trim().length).toBeGreaterThan(0);
    // One or two sentences, matching release-notes-template.md's guidance —
    // never a rendered list or markdown, just a short line for the modal.
    expect(announcement.summary.length).toBeLessThanOrEqual(120);
  });
});

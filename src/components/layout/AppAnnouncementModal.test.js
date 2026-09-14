import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import AppAnnouncementModal from './AppAnnouncementModal.vue';
import { useAppAnnouncement } from '../../composables/useAppAnnouncement.js';
import announcement from '../../../shared/releaseAnnouncement.json';

async function renderModal() {
  const context = {};
  await renderToString(createSSRApp(AppAnnouncementModal), context);
  return context.teleports?.body ?? '';
}

afterEach(() => {
  vi.unstubAllGlobals();
  useAppAnnouncement().dismiss();
});

describe('AppAnnouncementModal', () => {
  it('renders nothing when the announcement has not been opened', async () => {
    const html = await renderModal();
    expect(html).not.toContain('有什麼新變化');
  });

  it('shows the bundled version and summary once opened', async () => {
    useAppAnnouncement().reopen();
    const html = await renderModal();

    expect(html).toContain('有什麼新變化');
    expect(html).toContain(announcement.version);
    expect(html).toContain(announcement.summary);
    expect(html).toContain('ui-modal--notice');
  });
});

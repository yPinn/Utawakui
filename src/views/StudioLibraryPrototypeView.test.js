import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./StudioLibraryPrototypeView.vue', import.meta.url),
  'utf8',
);
const archiveFrameSource = readFileSync(
  new URL('../components/layout/AppArchiveFrame.vue', import.meta.url),
  'utf8',
);

describe('StudioLibraryPrototypeView development integration', () => {
  it('embeds only the dossier surface and follows the active app theme', () => {
    expect(source).toContain('useTemplateRef');
    expect(source).toContain('watch');
    expect(source).toContain(
      "import { useTheme } from '../composables/useTheme.js';",
    );
    expect(source).toContain("embed: 'dossier'");
    expect(source).toContain("clean: '1'");
    expect(source).toContain('const initialTheme = theme.value;');
    expect(source).toContain('theme: initialTheme');
    expect(source).not.toContain('computed(');
    expect(source).toContain('title="Studio Library dossier 開發預覽"');
    expect(source).not.toContain(['tokens', 'v2.css'].join('-'));
  });

  it('keeps the iframe URL stable while syncing theme and global shortcuts', () => {
    expect(source).toContain('ref="prototype-frame"');
    expect(source).toContain("type: 'utawakui-prototype-theme'");
    expect(source).toContain("data.type !== 'utawakui-app-shortcut'");
    expect(source).toContain(
      'event.source !== prototypeFrame.value?.contentWindow',
    );
    expect(source).toContain('event.origin !== window.location.origin');
    expect(source).toContain("window.addEventListener('message'");
    expect(source).toContain("window.removeEventListener('message'");
    expect(source).not.toContain("'f6'");
    expect(source).not.toContain('Array.from({ length: 10 }');
    expect(source).toContain("'f5'");
    expect(source).toContain("'f7'");
  });

  it('lets internal content keep the Setlist workflow tab visibly selected', () => {
    expect(archiveFrameSource).toContain('tabActiveView');
    expect(archiveFrameSource).toContain(
      ':active-view="tabActiveView || activeView"',
    );
  });
});

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(
  new URL('./SeparationToolbarPopover.vue', import.meta.url),
  'utf8',
);

describe('SeparationToolbarPopover', () => {
  it('projects native window density into bounded panel geometry', () => {
    expect(source).toContain(
      "import { useUiDensity } from '../../composables/useUiDensity.js'",
    );
    expect(source).toContain(
      "import { separationToolbarPanelStyle } from './separationToolbarLayout.js'",
    );
    expect(source).toContain('const { density } = useUiDensity()');
    expect(source).toContain(
      'computed(() => separationToolbarPanelStyle(density.value))',
    );
    expect(source).toContain('scroll-axis="vertical"');
    expect(source).toContain('scroll-aria-label="伴奏處理清單"');
  });

  it('keeps setup fixed and the complete queue in the one scroll body', () => {
    const headerIndex = source.indexOf('<template #header>');
    const listIndex = source.indexOf('<SeparationToolbarList');

    expect(headerIndex).toBeGreaterThan(-1);
    expect(listIndex).toBeGreaterThan(headerIndex);
    expect(source).toContain('label-hidden');
    expect(source).toContain('>加入<');
    expect(source).toContain('@move="move"');
    expect(source).toContain('@remove="remove"');
    expect(source).toContain('@cancel-active="cancelActive"');
    expect(source).toContain('@clear-completed="clearCompleted"');
    expect(source).not.toContain('<template #footer>');
    expect(source).not.toContain('查看全部');
    expect(source).not.toContain('openManager');
  });

  it('owns the persistent queue projection as the single accompaniment surface', () => {
    expect(source).toContain('useSeparationQueue');
    expect(source).toContain('separationQueueIndicator');
    expect(source).toContain('onMounted(initialize)');
    expect(source).toContain('onUnmounted(dispose)');
    expect(source).toContain('move,');
    expect(source).toContain('remove,');
    expect(source).toContain('clearCompleted,');
    expect(source).toContain('data-app-separation-trigger');
    expect(source).toContain('app-region: no-drag');
    expect(source).not.toContain('managerExpanded');
    expect(source).not.toContain("defineEmits(['openManager'])");
  });

  it('uses an icon-only trigger that explicitly toggles the controlled popover', () => {
    const triggerStart = source.indexOf('<template #trigger');
    const triggerEnd = source.indexOf('</template>', triggerStart);
    const triggerSource = source.slice(triggerStart, triggerEnd);

    expect(source).toContain('placement="bottom-end"');
    expect(triggerSource).toContain('<UiIconButton');
    expect(source).toContain('AudioWaveform,');
    expect(triggerSource).toContain(':icon="AudioWaveform"');
    expect(source).not.toContain('ListChecks');
    expect(source).toContain(
      "indicator.value.state === 'idle'\n    ? '伴奏處理'\n    : `伴奏處理；${indicator.value.label}`",
    );
    expect(triggerSource).toContain(':label="triggerLabel"');
    expect(triggerSource).toContain(':title="indicator.label"');
    expect(triggerSource).toContain('@click="isOpen = !isOpen"');
    expect(triggerSource).not.toContain('{{');
    expect(source).not.toContain('separationQueueTriggerText');
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function readSource(file) {
  return readFileSync(new URL(file, import.meta.url), 'utf8');
}

function productionSources(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(
      `${entry.name}${entry.isDirectory() ? '/' : ''}`,
      directory,
    );
    if (entry.isDirectory()) {
      if (child.pathname.endsWith('/components/demo/')) return [];
      return productionSources(child);
    }
    if (!/\.(?:js|vue)$/u.test(entry.name) || entry.name.endsWith('.test.js')) {
      return [];
    }
    return [[child, readFileSync(child, 'utf8')]];
  });
}

describe('new shared infra catalogue registration', () => {
  it('renders UiSeparator in the foundation catalogue', () => {
    const source = readSource('./DemoFoundations.vue');

    expect(source).toContain(
      "import UiSeparator from '../ui/UiSeparator.vue';",
    );
    expect(source).toContain("section.key === 'separator'");
    expect(source).toContain('<UiSeparator');
  });

  it('renders UiColorField in the input catalogue', () => {
    const source = readSource('./DemoInputs.vue');

    expect(source).toContain(
      "import UiColorField from '../ui/UiColorField.vue';",
    );
    expect(source).toContain("section.key === 'color-field'");
    expect(source).toContain('<UiColorField');
  });

  it('renders UiSegmentedControl in the navigation catalogue', () => {
    const source = readSource('./DemoNavigation.vue');

    expect(source).toContain(
      "import UiSegmentedControl from '../ui/UiSegmentedControl.vue';",
    );
    expect(source).toContain("section.key === 'segmented-control'");
    expect(source).toContain('<UiSegmentedControl');
  });

  it.each([
    ['./DemoFoundations.vue', 'UiKbd', 'kbd'],
    ['./DemoInputs.vue', 'UiRadioGroup', 'radio-group'],
    ['./DemoNavigation.vue', 'UiDisclosure', 'disclosure'],
    ['./DemoFeedback.vue', 'UiSkeleton', 'skeleton'],
    ['./DemoFeedback.vue', 'UiNotificationHost', 'notification-host'],
    ['./DemoOverlays.vue', 'UiTooltip', 'tooltip'],
    ['./DemoOverlays.vue', 'UiPopover', 'popover'],
  ])('renders %s in its pending catalogue section', (file, component, key) => {
    const source = readSource(file);

    expect(source).toContain(
      `import ${component} from '../ui/${component}.vue';`,
    );
    expect(source).toContain(`section.key === '${key}'`);
    expect(source).toContain(`<${component}`);
  });

  it('keeps the pending infra batch isolated from production consumers', () => {
    const pendingComponents = [
      'UiKbd',
      'UiSkeleton',
      'UiDisclosure',
      'UiRadioGroup',
      'UiTooltip',
      'UiPopover',
      'UiNotificationHost',
    ];
    const imports = productionSources(
      new URL('../../', import.meta.url),
    ).flatMap(([file, source]) =>
      pendingComponents
        .filter((component) => source.includes(`/ui/${component}.vue`))
        .map((component) => `${file.pathname}: ${component}`),
    );

    expect(imports).toEqual([]);
  });

  it('uses the popover interactive-panel anatomy in its catalogue sample', () => {
    const source = readSource('./DemoOverlays.vue');

    expect(source).toContain('<template #header>');
    expect(source).toContain('<template #footer>');
    expect(source).toContain('class="demo-popover-content"');
  });
});

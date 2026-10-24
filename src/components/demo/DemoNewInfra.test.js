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
      if (
        child.pathname.endsWith('/components/demo/') ||
        child.pathname.endsWith('/components/internal-tools/') ||
        child.pathname.endsWith('/components/lyrics-provider/')
      ) {
        return [];
      }
      return productionSources(child);
    }
    if (!/\.(?:js|vue)$/u.test(entry.name) || entry.name.endsWith('.test.js')) {
      return [];
    }
    if (
      child.pathname.endsWith('/components/settings/DiagnosticsWorkbench.vue')
    ) {
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
    [
      './DemoInputs.vue',
      'UiRadioGroup',
      'radio-group',
      'DemoRadioGroupAppearance',
    ],
    ['./DemoInputs.vue', 'UiSwitch', 'switch', 'DemoSwitchAppearance'],
    ['./DemoInputs.vue', 'UiCombobox', 'combobox', 'DemoComboboxAppearance'],
    ['./DemoNavigation.vue', 'UiDisclosure', 'disclosure'],
    ['./DemoNavigation.vue', 'UiBreadcrumb', 'breadcrumb'],
    ['./DemoFeedback.vue', 'UiSkeleton', 'skeleton'],
    [
      './DemoFeedback.vue',
      'UiNotificationHost',
      'notification-host',
      'DemoNoticeNotificationRecipe',
    ],
    ['./DemoOverlays.vue', 'UiTooltip', 'tooltip'],
    ['./DemoOverlays.vue', 'UiOverflowTooltip', 'tooltip'],
  ])(
    'renders %s in its catalogue section',
    (file, component, key, composition) => {
      const source = readSource(file);
      const owner = composition ? readSource(`./${composition}.vue`) : source;
      if (composition) {
        expect(source).toContain(
          `import ${composition} from './${composition}.vue';`,
        );
        expect(source).toContain(`<${composition}`);
      }
      expect(owner).toContain(
        `import ${component} from '../ui/${component}.vue';`,
      );
      expect(source).toContain(`section.key === '${key}'`);
      expect(owner).toContain(`<${component}`);
    },
  );

  it('keeps the pending infra batch isolated from production consumers', () => {
    // Settings adopted UiDisclosure and the shell adopted UiNotificationHost;
    // their production usage is checked below.
    const pendingComponents = ['UiKbd', 'UiSwitch', 'UiBreadcrumb'];
    const imports = productionSources(
      new URL('../../', import.meta.url),
    ).flatMap(([file, source]) =>
      pendingComponents
        .filter((component) => source.includes(`/ui/${component}.vue`))
        .map((component) => `${file.pathname}: ${component}`),
    );

    expect(imports).toEqual([]);
  });

  it.each([
    ['radio-group', 'UiRadioGroup'],
    ['skeleton', 'UiSkeleton'],
    ['combobox', 'UiCombobox'],
    ['tooltip', 'UiTooltip'],
    ['disclosure', 'UiDisclosure'],
    ['notification-host', 'UiNotificationHost'],
  ])('finds %s in the production component graph', (_key, component) => {
    const consumers = productionSources(
      new URL('../../', import.meta.url),
    ).filter(([, source]) => source.includes(`/ui/${component}.vue`));

    expect(consumers.length).toBeGreaterThan(0);
  });

  it('uses the popover interactive-panel anatomy in its catalogue sample', () => {
    const source = readSource('./DemoOverlays.vue');

    expect(source).toContain('<template #header>');
    expect(source).toContain('<template #footer>');
    expect(source).toContain('class="demo-popover-content"');
  });

  it('registers UiPopover in the catalogue IA', () => {
    const source = readSource('../../constants/uiDemoSections.js');

    expect(source).toMatch(
      /key: 'popover',[\s\S]*?components: \['UiPopover'\],/u,
    );
  });
});

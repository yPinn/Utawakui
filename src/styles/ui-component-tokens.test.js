import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const tokens = fs.readFileSync(path.join(dirname, 'tokens.css'), 'utf8');
const designGuide = fs.readFileSync(
  path.join(dirname, '..', '..', 'DESIGN.md'),
  'utf8',
);

const fieldTokens = [
  '--ui-field-height',
  '--ui-field-padding-block',
  '--ui-field-padding-inline',
  '--ui-field-radius',
  '--ui-field-bg',
  '--ui-field-bg-hover',
  '--ui-field-fg',
  '--ui-field-placeholder',
  '--ui-field-border',
  '--ui-field-border-hover',
  '--ui-field-border-invalid',
  '--ui-field-font-size',
  '--ui-field-font-weight',
  '--ui-field-line-height',
  '--ui-checkbox-size',
  '--ui-range-track-size',
  '--ui-range-thumb-size',
  '--ui-progress-track-size',
];

const typeRoles = {
  display: {
    size: '--ui-font-size-2xl',
    weight: '--ui-font-weight-bold',
    lineHeight: '--ui-line-height-display',
  },
  heading: {
    size: '--ui-font-size-xl',
    weight: '--ui-font-weight-bold',
    lineHeight: '--ui-line-height-heading',
  },
  title: {
    size: '--ui-font-size-lg',
    weight: '--ui-font-weight-semibold',
    lineHeight: '--ui-line-height-title',
  },
  body: {
    size: '--ui-font-size-md',
    weight: '--ui-font-weight-regular',
    lineHeight: '--ui-line-height-body',
  },
  'body-compact': {
    size: '--ui-font-size-sm',
    weight: '--ui-font-weight-regular',
    lineHeight: '--ui-line-height-label',
  },
  label: {
    size: '--ui-font-size-sm',
    weight: '--ui-font-weight-semibold',
    lineHeight: '--ui-line-height-label',
  },
  caption: {
    size: '--ui-font-size-sm',
    weight: '--ui-font-weight-regular',
    lineHeight: '--ui-line-height-caption',
  },
};

function declarations(css) {
  return new Map(
    [...css.matchAll(/(--ui-[\w-]+):\s*([^;]+);/gu)].map(([, name, value]) => [
      name,
      value.trim(),
    ]),
  );
}

function normalizedValue(value) {
  return value
    ?.replace(/\s+/gu, ' ')
    .replace(/\(\s+/gu, '(')
    .replace(/\s+\)/gu, ')');
}

function filesUnder(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const child = new URL(
      `${entry.name}${entry.isDirectory() ? '/' : ''}`,
      directory,
    );
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

const uiDirectory = new URL('../components/ui/', import.meta.url);
const componentFiles = filesUnder(uiDirectory)
  .filter((file) => file.pathname.endsWith('.vue'))
  .map((file) => ({
    name: file.pathname,
    source: fs.readFileSync(file, 'utf8'),
  }));

function componentSource(filename) {
  return componentFiles.find((file) => file.name.endsWith(`/${filename}`))
    ?.source;
}

describe('shared UI component token contract', () => {
  it('defines readable semantic type roles without coupling them to color', () => {
    const values = declarations(tokens);

    for (const [role, recipe] of Object.entries(typeRoles)) {
      expect(values.get(`--ui-type-${role}-size`), `${role} size`).toBe(
        `var(${recipe.size})`,
      );
      expect(values.get(`--ui-type-${role}-weight`), `${role} weight`).toBe(
        `var(${recipe.weight})`,
      );
      expect(
        values.get(`--ui-type-${role}-line-height`),
        `${role} line height`,
      ).toBe(`var(${recipe.lineHeight})`);
      expect(values.has(`--ui-type-${role}-color`), `${role} color`).toBe(
        false,
      );
    }

    for (const retiredRole of [
      'headline',
      'content',
      'control',
      'command',
      'input',
      'support',
    ]) {
      expect(
        [...values.keys()].some((name) =>
          name.startsWith(`--ui-type-${retiredRole}-`),
        ),
        retiredRole,
      ).toBe(false);
    }
  });

  it('uses semantic type roles at the shared primitive boundary', () => {
    expect(componentSource('UiPageHeader.vue')).toContain(
      'var(--ui-type-heading-size)',
    );
    expect(componentSource('UiModal.vue')).toContain(
      'var(--ui-type-heading-size)',
    );
    expect(componentSource('UiButton.vue')).toContain(
      'var(--ui-type-label-size)',
    );
    expect(componentSource('UiField.vue')).toContain(
      'var(--ui-type-caption-line-height)',
    );
    expect(componentSource('UiTextField.vue')).toContain(
      'var(--ui-field-font-size)',
    );
    expect(componentSource('UiSearchBox.vue')).toContain(
      'var(--ui-field-font-size)',
    );
  });

  it('derives both side panels from one shared content rhythm', () => {
    const values = declarations(tokens);

    expect(values.get('--ui-side-panel-content-inset')).toBe(
      'var(--ui-space-2)',
    );
    expect(values.get('--ui-side-panel-section-gap')).toBe('var(--ui-space-4)');
    expect(values.get('--ui-side-panel-content-gap')).toBe('var(--ui-space-2)');
    expect(values.get('--ui-side-panel-list-gap')).toBe('var(--ui-space-1)');
    expect(values.has('--ui-side-panel-scroll-content-inset-inline-end')).toBe(
      false,
    );
    expect(values.get('--ui-playlist-sidebar-padding-inline')).toBe(
      'var(--ui-side-panel-content-inset)',
    );
    expect(values.get('--ui-right-dock-content-inset')).toBe(
      'var(--ui-side-panel-content-inset)',
    );
    expect(
      normalizedValue(
        values.get('--ui-right-dock-track-row-state-surface-outset-inline'),
      ),
    ).toBe('var(--ui-side-panel-row-state-surface-outset-inline)');
  });

  it('keeps shell, Sidebar, Right Dock, and Player geometry on explicit roles', () => {
    const values = declarations(tokens);

    expect(values.get('--ui-right-dock-width')).toBe('17.5rem');
    expect(values.get('--ui-right-dock-rail-width')).toBe('2.5rem');
    expect(values.get('--ui-right-dock-track-row-min-height')).toBe('3.25rem');
    expect(values.get('--ui-right-dock-track-artwork-size')).toBe(
      'var(--ui-track-artwork-size-standard)',
    );
    expect(values.get('--ui-sidebar-row-min-height')).toBe('3.25rem');
    expect(values.get('--ui-sidebar-artwork-size')).toBe(
      'var(--ui-track-artwork-size-standard)',
    );
    expect(values.get('--ui-player-leading-padding-inline')).toContain(
      'var(--ui-shell-leading-artwork-centerline) - 1.5rem',
    );
    expect(values.get('--ui-inspector-width')).toBe(
      'var(--ui-right-dock-width)',
    );
    expect(values.get('--ui-inspector-rail-width')).toBe(
      'var(--ui-right-dock-rail-width)',
    );
  });

  it('defines a complete field component layer with valid aliases', () => {
    const values = declarations(tokens);

    for (const name of fieldTokens) {
      const value = values.get(name);
      const reference = value?.match(/^var\((--ui-[\w-]+)\)$/u)?.[1];

      expect(value, name).toMatch(/^var\(--ui-[\w-]+\)$/u);
      expect(values.has(reference), `${name} -> ${reference}`).toBe(true);
    }
    expect(values.get('--ui-field-hex-value-inline-size')).toContain('7ch');
    expect(values.get('--ui-field-font-size')).toBe(
      'var(--ui-type-body-compact-size)',
    );
    expect(values.get('--ui-field-font-weight')).toBe(
      'var(--ui-type-body-compact-weight)',
    );
    expect(values.get('--ui-field-line-height')).toBe(
      'var(--ui-type-body-compact-line-height)',
    );
    expect(values.get('--ui-textarea-font-size')).toBe(
      'var(--ui-type-body-compact-size)',
    );
    expect(values.get('--ui-textarea-font-weight')).toBe(
      'var(--ui-type-body-compact-weight)',
    );
    expect(values.get('--ui-textarea-line-height')).toBe(
      'var(--ui-type-body-line-height)',
    );
    expect(componentSource('UiTextarea.vue')).toContain(
      'var(--ui-textarea-font-size)',
    );
  });

  it('keeps icon-button and Tooltip contracts on shared semantic roles', () => {
    const values = declarations(tokens);

    expect(values.has('--ui-icon-button-size-sm')).toBe(false);
    expect(values.get('--ui-icon-button-size-md')).toBe(
      'var(--ui-control-height)',
    );
    expect(values.get('--ui-icon-button-size-lg')).toBe(
      'var(--ui-control-height-live)',
    );
    expect(values.get('--ui-tooltip-font-size')).toBe('var(--ui-font-size-sm)');
    expect(values.get('--ui-tooltip-font-weight')).toBe(
      'var(--ui-font-weight-regular)',
    );
    expect(values.get('--ui-tooltip-line-height')).toBe(
      'var(--ui-line-height-caption)',
    );
    expect(values.get('--ui-tooltip-shadow')).toBe('var(--ui-shadow-overlay)');
  });

  it('defines one floating-list and row recipe for menus and listboxes', () => {
    const values = declarations(tokens);

    expect(values.get('--ui-floating-list-bg')).toBe(
      'var(--ui-color-surface-raised)',
    );
    expect(values.get('--ui-floating-list-border')).toBe(
      'var(--ui-color-border)',
    );
    expect(values.get('--ui-floating-list-radius')).toBe('var(--ui-radius-lg)');
    expect(values.get('--ui-floating-list-shadow')).toBe(
      'var(--ui-shadow-overlay)',
    );
    expect(values.get('--ui-floating-list-padding')).toBe('var(--ui-space-2)');
    expect(values.get('--ui-action-menu-max-block-size')).toBe('20rem');
    expect(values.get('--ui-floating-row-min-height')).toBe('2rem');
    expect(values.get('--ui-floating-row-padding-block')).toBe(
      'var(--ui-space-1)',
    );
    expect(values.get('--ui-floating-row-padding-inline')).toBe(
      'var(--ui-space-2)',
    );
    expect(values.get('--ui-floating-row-radius')).toBe('var(--ui-radius-sm)');
    expect(values.get('--ui-floating-row-font-size')).toBe(
      'var(--ui-type-body-compact-size)',
    );
    expect(values.get('--ui-floating-row-font-weight')).toBe(
      'var(--ui-type-body-compact-weight)',
    );
    expect(values.get('--ui-floating-row-line-height')).toBe(
      'var(--ui-type-body-compact-line-height)',
    );
    expect(values.get('--ui-menu-item-height')).toBe(
      'var(--ui-floating-row-min-height)',
    );
  });

  it('keeps fixed archival material colors behind component aliases', () => {
    const values = declarations(tokens);
    const folderArtifact = componentSource('UiFolderArtifact.vue');

    expect(values.get('--ui-photo-frame-archival-bg')).toBe(
      'var(--ui-palette-neutral-950)',
    );
    expect(values.get('--ui-photo-frame-archival-border-color')).toBe(
      'var(--ui-photo-frame-archival-bg)',
    );
    expect(folderArtifact).not.toContain('--ui-palette-');
  });

  it('documents semantic type and recipe promotion boundaries', () => {
    expect(designGuide).toContain('### Semantic Type Recipes');
    for (const role of Object.keys(typeRoles)) {
      expect(designGuide, role).toContain(`--ui-type-${role}-*`);
    }
    expect(designGuide).toContain('Type recipes never own text color');
    expect(designGuide).toContain('### Text Intent Mapping');
    expect(designGuide).toContain('Description');
    expect(designGuide).toContain('Field value');
    expect(designGuide).toContain('Menu item');
    expect(designGuide).toContain('two production consumers');
  });

  it('satisfies every shared-component reference from the adopted token graph', () => {
    const globalNames = new Set(declarations(tokens).keys());
    const missing = componentFiles.flatMap(({ name, source }) => {
      const localNames = new Set(
        [...source.matchAll(/(--ui-[\w-]+)['"]?\s*:/gu)].map(
          (match) => match[1],
        ),
      );
      const references = [
        ...source.matchAll(/var\((--ui-[\w-]+)\)/gu),
        ...source.matchAll(/customLengthPixels\(\s*['"](--ui-[\w-]+)['"]/gu),
      ];
      return references
        .map((match) => match[1])
        .filter((token) => !globalNames.has(token) && !localNames.has(token))
        .map((token) => `${name}: ${token}`);
    });

    expect(missing).toEqual([]);
  });

  it('keeps authored component CSS scalable with only one-pixel utility exceptions', () => {
    const violations = componentFiles.flatMap(({ name, source }) => {
      const styles = [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gu)]
        .map((match) => match[1])
        .join('\n')
        .replace(/\/\*[\s\S]*?\*\//gu, '');

      return [...styles.matchAll(/(?<![\d.])(\d+(?:\.\d+)?)px\b/gu)]
        .filter((match) => Number(match[1]) !== 1)
        .map((match) => `${name}: ${match[0]}`);
    });

    expect(violations).toEqual([]);
  });

  it('keeps primitive spacing and radius declarations on the shared token scale', () => {
    const violations = componentFiles.flatMap(({ name, source }) =>
      [...source.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gu)].flatMap(
        ([, styles]) =>
          [
            ...styles.matchAll(
              /(?:^|\n)\s*((?:padding|margin|gap|border-radius)(?:-[a-z-]+)?):\s*([^;]+);/gu,
            ),
          ].flatMap((match) =>
            [...match[2].matchAll(/-?\d+(?:\.\d+)?(?:px|rem|em)\b/gu)]
              .map(([value]) => value)
              .filter(
                (value) => Number.parseFloat(value) !== 0 && value !== '-1px',
              )
              .map((value) => `${name}: ${match[1]}: ${value}`),
          ),
      ),
    );

    expect(violations).toEqual([]);
  });

  it('gives every continuously animated component OS and manual reduced-motion paths', () => {
    for (const name of [
      'UiButton.vue',
      'UiIconButton.vue',
      'UiDisclosure.vue',
      'UiMarqueeText.vue',
      'UiNotificationHost.vue',
      'UiRadioGroup.vue',
      'UiSkeleton.vue',
      'UiStatusIcon.vue',
      'UiSwitch.vue',
    ]) {
      const source = componentFiles.find((file) =>
        file.name.endsWith(`/${name}`),
      )?.source;
      expect(source, name).toContain('prefers-reduced-motion: reduce');
      expect(source, name).toContain("data-ui-motion='reduced'");
    }
  });

  it('derives action-menu geometry from the shared floating-row token', () => {
    const source = componentFiles.find((file) =>
      file.name.endsWith('/UiActionMenu.vue'),
    )?.source;

    expect(source).toContain(
      "customLengthPixels('--ui-floating-row-min-height', 2)",
    );
    expect(source).not.toContain('ROW_HEIGHT_REM');
  });
});

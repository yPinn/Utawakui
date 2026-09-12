import { readFileSync } from 'node:fs';
import { createSSRApp } from 'vue';
import { renderToString } from '@vue/server-renderer';
import { describe, expect, it } from 'vitest';
import DemoFieldAppearance from './DemoFieldAppearance.vue';
import DemoFieldValidationFeedback from './DemoFieldValidationFeedback.vue';

const appearanceSource = readFileSync(
  new URL('./DemoFieldAppearance.vue', import.meta.url),
  'utf8',
);
const feedbackSource = readFileSync(
  new URL('./DemoFieldValidationFeedback.vue', import.meta.url),
  'utf8',
);
const fieldSource = readFileSync(
  new URL('../ui/UiField.vue', import.meta.url),
  'utf8',
);

describe('DemoFieldValidationFeedback', () => {
  it('mounts after the shared shell review without widening the formal field API', async () => {
    const html = await renderToString(createSSRApp(DemoFieldAppearance));

    expect(appearanceSource).toContain(
      "import DemoFieldValidationFeedback from './DemoFieldValidationFeedback.vue'",
    );
    expect(appearanceSource).toContain('<DemoFieldValidationFeedback />');
    expect(html).toContain('data-field-validation-review="true"');
    expect(fieldSource).not.toContain('supportSpace');
    expect(fieldSource).not.toContain('--ui-field-message-space');
  });

  it('visualizes the validation responsibility flow in order without depending on Zod', async () => {
    const html = await renderToString(
      createSSRApp(DemoFieldValidationFeedback),
    );
    const flowSteps = [
      'Required／Schema／main response',
      'Form controller',
      'invalid＋localized error',
      'UiField support region',
    ];

    let previousIndex = -1;
    for (const step of flowSteps) {
      const index = html.indexOf(step);
      expect(index).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }

    expect(feedbackSource).not.toMatch(/from\s+['"]zod['"]/u);
    expect(html).toContain(
      'UI 只呈現已 mapping 的 localized issue；controller 決定觸發，UiField 負責 layout 與 ARIA。',
    );
    expect(html).not.toContain('Zod');
  });

  it('separates the candidate contract from current behavior', async () => {
    const html = await renderToString(
      createSSRApp(DemoFieldValidationFeedback),
    );
    const candidateIndex = html.indexOf('data-validation-source="candidate"');
    const currentIndex = html.indexOf('data-validation-source="current"');

    expect(candidateIndex).toBeGreaterThanOrEqual(0);
    expect(currentIndex).toBeGreaterThan(candidateIndex);
    expect(html).toContain('Auto 為預設');
    expect(html).toContain('Reserved 是父層候選策略');
    expect(html).toContain('現行僅有 Auto');
  });

  it('shows pristine, invalid, and corrected required-field timing', async () => {
    const html = await renderToString(
      createSSRApp(DemoFieldValidationFeedback),
    );
    const inputTag = (state) =>
      html.match(
        new RegExp('<input[^>]*id="demo-validation-' + state + '"[^>]*>', 'u'),
      )?.[0];

    expect(inputTag('pristine')).toContain('required');
    expect(inputTag('pristine')).not.toContain('aria-invalid');
    expect(html).not.toContain('demo-validation-pristine-error');
    expect(inputTag('invalid')).toContain('required');
    expect(inputTag('invalid')).toContain('aria-invalid="true"');
    expect(inputTag('invalid')).toContain(
      'aria-describedby="demo-validation-invalid-error"',
    );
    expect(html).toContain(
      'id="demo-validation-invalid-error" class="ui-field__message is-error" role="alert"',
    );
    expect(inputTag('corrected')).toContain('value="雨愛"');
    expect(inputTag('corrected')).not.toContain('aria-invalid');
    expect(html).not.toContain('demo-validation-corrected-error');
  });

  it('replaces hint with one actionable error message', async () => {
    const html = await renderToString(
      createSSRApp(DemoFieldValidationFeedback),
    );

    expect(html).toContain('id="demo-validation-replace-hint-hint"');
    expect(html).toContain('使用本機曲目的顯示名稱。');
    expect(html).toContain('id="demo-validation-replace-error-error"');
    expect(html).toContain('名稱不可只包含空白。');
    expect(html).not.toContain('demo-validation-replace-error-hint');
  });

  it('shows auto and layout-owned reserved space while allowing long messages to grow', async () => {
    const html = await renderToString(
      createSSRApp(DemoFieldValidationFeedback),
    );

    expect(html).toContain('data-validation-space="auto"');
    expect(html).toContain('data-validation-space="reserved"');
    expect(feedbackSource).toMatch(
      /\.demo-validation-reserved-frame:not\(\.has-message\)::after\s*\{[^}]*min-block-size:\s*1\.225rem;/su,
    );
    expect(feedbackSource).not.toMatch(
      /\.demo-validation-reserved-frame[^}]*\n\s*block-size:/su,
    );
    expect(html).toContain(
      '請縮短曲目顯示名稱，並移除檔案路徑、網址或其他不應直接顯示給操作員的技術資訊。',
    );
  });

  it('applies the same error language to text field, textarea, and select', async () => {
    const html = await renderToString(
      createSSRApp(DemoFieldValidationFeedback),
    );

    expect(html).toMatch(
      /<input[^>]*id="demo-validation-family-text"[^>]*aria-invalid="true"/u,
    );
    expect(html).toMatch(
      /<textarea[^>]*id="demo-validation-family-textarea"[^>]*aria-invalid="true"/u,
    );
    expect(html).toMatch(
      /<select[^>]*id="demo-validation-family-select"[^>]*aria-invalid="true"/u,
    );
    for (const id of ['text', 'textarea', 'select']) {
      expect(html).toContain(
        'id="demo-validation-family-' +
          id +
          '-error" class="ui-field__message is-error" role="alert"',
      );
    }
  });

  it('keeps the review responsive to the catalogue container', () => {
    expect(feedbackSource).toContain('container-type: inline-size;');
    expect(feedbackSource).toContain('@container (max-width: 48rem)');
  });
});

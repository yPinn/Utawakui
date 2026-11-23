import { UI_LOCALE } from './uiLocale.js';

const LANGUAGE_ALIASES = new Map(
  Object.entries({
    zh: ['zh', '中文', '中', '漢語', '汉语', 'chinese'],
    ja: ['ja', '日文', '日語', '日语', '日', '日本語', 'japanese'],
    en: ['en', '英文', '英語', '英语', '英', 'english'],
    ko: ['ko', '韓文', '韓語', '韩语', '韓', '한국어', 'korean'],
  }).flatMap(([language, aliases]) =>
    aliases.map((alias) => [alias, language]),
  ),
);

export function outputTemplateSearchKey(value) {
  return String(value ?? '')
    .normalize('NFKC')
    .trim()
    .toLocaleLowerCase(UI_LOCALE);
}

export function filterOutputTemplates(templates, query) {
  if (!query) return templates;
  const terms = query.split(/\s+/u);
  return templates.filter((template) => {
    const fields = [
      template.name,
      ...(template.facts ?? []).flatMap(({ label, value }) => [label, value]),
    ].map(outputTemplateSearchKey);
    const languages = template.recommendedLanguages ?? [];
    return terms.every((term) => {
      const language = LANGUAGE_ALIASES.get(term);
      return language
        ? languages.includes(language) || languages.includes('any')
        : fields.some((field) => field.includes(term));
    });
  });
}

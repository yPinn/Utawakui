import { readdirSync, readFileSync } from 'node:fs';

// Test-only: expands plain t('key') calls into zh-TW catalog text so
// copy-governance tests keep asserting wording after strings move to catalogs.
const CATALOG_DIR = new URL('../../shared/locales/zh-TW/', import.meta.url);

function flatten(messages, prefix, into) {
  for (const [key, value] of Object.entries(messages)) {
    if (value && typeof value === 'object')
      flatten(value, `${prefix}${key}.`, into);
    else into.set(`${prefix}${key}`, value);
  }
  return into;
}

const catalog = readdirSync(CATALOG_DIR)
  .filter((file) => file.endsWith('.json'))
  .reduce(
    (messages, file) =>
      flatten(
        JSON.parse(readFileSync(new URL(file, CATALOG_DIR), 'utf8')),
        `${file.slice(0, -'.json'.length)}.`,
        messages,
      ),
    new Map(),
  );

const KEY = "t\\(\\s*'([\\w.]+)'\\s*\\)";

export function expandCatalogText(source) {
  return source
    .replace(
      new RegExp(`:([\\w-]+)="\\s*${KEY}\\s*"`, 'gu'),
      (match, attribute, key) =>
        catalog.has(key) ? `${attribute}="${catalog.get(key)}"` : match,
    )
    .replace(new RegExp(`\\{\\{\\s*${KEY}\\s*\\}\\}`, 'gu'), (match, key) =>
      catalog.has(key) ? catalog.get(key) : match,
    )
    .replace(new RegExp(`\\b${KEY}`, 'gu'), (match, key) =>
      catalog.has(key) ? `'${catalog.get(key)}'` : match,
    );
}

export function readCatalogSource(url) {
  return expandCatalogText(readFileSync(url, 'utf8'));
}

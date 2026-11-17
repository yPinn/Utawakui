// Library search splits on spaces; every word must match some field.
export function librarySearchTerms(query) {
  return String(query ?? '')
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/u)
    .filter(Boolean);
}

export function matchesLibrarySearch(terms, { matchesTitle, texts }) {
  if (!terms.length) return true;
  const fields = texts.map((value) => String(value ?? '').toLocaleLowerCase());
  return terms.every(
    (term) =>
      matchesTitle(term) || fields.some((field) => field.includes(term)),
  );
}

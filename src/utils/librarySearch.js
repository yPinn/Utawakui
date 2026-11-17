// Library search splits on spaces; every word must match some field.
// NFKC folds full-width input such as "Ｊａｐａｎｅｓｅ".
const searchKey = (value) =>
  String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase();

export function librarySearchTerms(query) {
  return searchKey(query).trim().split(/\s+/u).filter(Boolean);
}

export function matchesLibrarySearch(terms, { matchesTitle, texts }) {
  if (!terms.length) return true;
  const fields = texts.map(searchKey);
  return terms.every(
    (term) =>
      matchesTitle(term) || fields.some((field) => field.includes(term)),
  );
}

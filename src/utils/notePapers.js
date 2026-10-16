// The user note stocks, in the order the editors' paper switch cycles them.
export const NOTE_PAPERS = Object.freeze([
  Object.freeze({ id: 'periwinkle', label: '藍紫' }),
  Object.freeze({ id: 'rose', label: '粉紅' }),
  Object.freeze({ id: 'canary', label: '鵝黃' }),
  Object.freeze({ id: 'kraft', label: '牛皮紙' }),
  Object.freeze({ id: 'ruled', label: '橫線紙' }),
]);

// Index of a saved stock, or a random one when the note has none yet.
export function notePaperIndex(id, random = Math.random) {
  const index = NOTE_PAPERS.findIndex((paper) => paper.id === id);
  return index >= 0 ? index : Math.floor(random() * NOTE_PAPERS.length);
}

export function nextNotePaperIndex(index) {
  return (index + 1) % NOTE_PAPERS.length;
}

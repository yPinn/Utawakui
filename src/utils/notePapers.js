import { t } from './i18n.js';
// The user note stocks, in the order the editors' paper switch cycles them.
export const NOTE_PAPERS = Object.freeze(
  ['periwinkle', 'rose', 'canary', 'kraft', 'ruled'].map((id) =>
    Object.freeze({
      id,
      get label() {
        return t(`folder.papers.${id}`);
      },
    }),
  ),
);

// Index of a saved stock, or a random one when the note has none yet.
export function notePaperIndex(id, random = Math.random) {
  const index = NOTE_PAPERS.findIndex((paper) => paper.id === id);
  return index >= 0 ? index : Math.floor(random() * NOTE_PAPERS.length);
}

export function nextNotePaperIndex(index) {
  return (index + 1) % NOTE_PAPERS.length;
}

import {
  normalizeOutputRecentColors,
  normalizeOutputSavedColors,
  prependOutputRecentColor,
  toggleOutputSavedColor,
} from '../../../shared/outputColorPreferences.mjs';

export function createOutputPreferencesController({
  getRecentColors,
  setRecentColors,
  getSavedColors,
  setSavedColors,
  setError,
  persistRecentColors,
  persistSavedColors,
  reportError,
}) {
  let recentSaveRevision = 0;
  let savedSaveRevision = 0;

  function apply(document = {}) {
    if (
      typeof document.preferences !== 'object' ||
      document.preferences === null ||
      Array.isArray(document.preferences)
    ) {
      return;
    }
    setRecentColors(
      normalizeOutputRecentColors(document.preferences.recentColors),
    );
    setSavedColors(
      normalizeOutputSavedColors(document.preferences.savedColors),
    );
  }

  async function saveRecentColor(color) {
    const [normalizedColor] = normalizeOutputRecentColors([color]);
    if (!normalizedColor) return false;

    const previousRecentColors = [...getRecentColors()];
    const recentColors = prependOutputRecentColor(
      previousRecentColors,
      normalizedColor,
    );
    if (
      recentColors.length === previousRecentColors.length &&
      recentColors.every(
        (recentColor, index) => recentColor === previousRecentColors[index],
      )
    ) {
      return true;
    }

    const revision = ++recentSaveRevision;
    setRecentColors(recentColors);
    setError('');
    try {
      const document = await persistRecentColors(recentColors);
      if (revision === recentSaveRevision) {
        setRecentColors(
          normalizeOutputRecentColors(document?.preferences?.recentColors),
        );
      }
      return true;
    } catch (error) {
      if (revision === recentSaveRevision) {
        setRecentColors(previousRecentColors);
        setError(reportError(error, 'recent'));
      }
      return false;
    }
  }

  async function toggleSavedColor(color) {
    const previousSavedColors = [...getSavedColors()];
    const savedColors = toggleOutputSavedColor(previousSavedColors, color);
    if (
      savedColors.length === previousSavedColors.length &&
      savedColors.every(
        (savedColor, index) => savedColor === previousSavedColors[index],
      )
    ) {
      return false;
    }

    const revision = ++savedSaveRevision;
    setSavedColors(savedColors);
    setError('');
    try {
      const document = await persistSavedColors(savedColors);
      if (revision === savedSaveRevision) {
        setSavedColors(
          normalizeOutputSavedColors(document?.preferences?.savedColors),
        );
      }
      return true;
    } catch (error) {
      if (revision === savedSaveRevision) {
        setSavedColors(previousSavedColors);
        setError(reportError(error, 'saved'));
      }
      return false;
    }
  }

  return { apply, saveRecentColor, toggleSavedColor };
}

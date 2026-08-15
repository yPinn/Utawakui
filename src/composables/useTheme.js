import { ref } from 'vue';

// Module-scope singleton, same pattern as useAppView.js/usePlayer.js — one
// theme applies to the whole shell, not per-component state.
const theme = ref(window.Utawakui?.initialUiTheme ?? 'dark');

function applyTheme() {
  // Set explicitly for both values (not just light) so the active theme is
  // always visible in devtools rather than implied by an absent attribute.
  document.documentElement.dataset.uiTheme = theme.value;
}

// Applied at module load, before any component mounts, so the first paint
// already matches the persisted theme — main.js passes it via
// preload.js's initialUiTheme specifically to avoid a dark-then-light flash.
applyTheme();

async function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark';
  applyTheme();
  await window.Utawakui?.setUiTheme(theme.value);
}

export function useTheme() {
  return { theme, toggleTheme };
}

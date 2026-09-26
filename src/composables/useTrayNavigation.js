import { useAppView } from './useAppView.js';

export function useTrayNavigation() {
  const { setActiveView } = useAppView();
  let disposed = false;
  const unsubscribe =
    typeof window !== 'undefined' && window.Utawakui?.onAppNavigation
      ? window.Utawakui.onAppNavigation((view) => {
          if (!disposed && view === 'settings') setActiveView('settings');
        })
      : () => undefined;

  function dispose() {
    if (disposed) return;
    disposed = true;
    unsubscribe();
  }

  return { dispose };
}

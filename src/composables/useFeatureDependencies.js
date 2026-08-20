import { reactive, readonly } from 'vue';

const state = reactive({
  byId: {},
  isLoading: false,
  preparingIds: new Set(),
  error: '',
});

let unsubscribeUpdates = null;

function hasBridge() {
  return (
    typeof window !== 'undefined' &&
    typeof window.Utawakui?.listFeatureDependencies === 'function' &&
    typeof window.Utawakui?.prepareFeatureDependency === 'function'
  );
}

function applyDependencies(dependencies = []) {
  state.byId = Object.fromEntries(
    dependencies.map((dependency) => [dependency.id, dependency]),
  );
}

async function refreshDependencies() {
  if (!hasBridge()) {
    state.error = '需要重新啟動應用程式才能讀取功能準備狀態。';
    return;
  }

  state.isLoading = true;
  try {
    applyDependencies(await window.Utawakui.listFeatureDependencies());
    state.error = '';
  } catch (err) {
    state.error = `讀取功能準備狀態失敗：${err.message}`;
  } finally {
    state.isLoading = false;
  }
}

async function prepareDependency(dependencyId) {
  if (!hasBridge() || state.preparingIds.has(dependencyId)) return;

  state.preparingIds.add(dependencyId);
  try {
    const dependency =
      await window.Utawakui.prepareFeatureDependency(dependencyId);
    state.byId = {
      ...state.byId,
      [dependency.id]: dependency,
    };
    state.error = '';
  } catch (err) {
    state.error = `準備項目失敗：${err.message}`;
  } finally {
    state.preparingIds.delete(dependencyId);
  }
}

if (
  typeof window !== 'undefined' &&
  typeof window.Utawakui?.onFeatureDependenciesUpdated === 'function'
) {
  unsubscribeUpdates =
    window.Utawakui.onFeatureDependenciesUpdated(applyDependencies);
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    unsubscribeUpdates?.();
  });
}

export function useFeatureDependencies() {
  return {
    state: readonly(state),
    refreshDependencies,
    prepareDependency,
  };
}

import { computed, readonly, ref } from 'vue';

const PUBLIC_LOAD_ERROR = Object.freeze({
  title: 'Benchmark 結果無法開啟',
  message: '請確認選擇的是有效的 run config，且結果屬於目前曲庫。',
  actionLabel: '重新選擇',
});

export function useMusicAnalysisBenchmarkReview(
  bridge = typeof window === 'undefined' ? null : window.Utawakui,
) {
  const dataset = ref(null);
  const selectedCaseId = ref(null);
  const loading = ref(false);
  const error = ref(null);

  const selectedCase = computed(
    () =>
      dataset.value?.cases.find(
        (benchmarkCase) => benchmarkCase.id === selectedCaseId.value,
      ) ?? null,
  );

  function selectCase(caseId) {
    if (!dataset.value?.cases.some((item) => item.id === caseId)) return;
    selectedCaseId.value = caseId;
  }

  async function open() {
    if (!bridge?.openMusicAnalysisBenchmarkReview || loading.value) return;
    loading.value = true;
    error.value = null;
    try {
      const nextDataset = await bridge.openMusicAnalysisBenchmarkReview();
      if (!nextDataset) return;
      dataset.value = nextDataset;
      selectedCaseId.value = nextDataset.cases[0]?.id ?? null;
    } catch {
      error.value = { ...PUBLIC_LOAD_ERROR };
    } finally {
      loading.value = false;
    }
  }

  return {
    dataset: readonly(dataset),
    selectedCaseId: readonly(selectedCaseId),
    selectedCase,
    loading: readonly(loading),
    error: readonly(error),
    open,
    selectCase,
  };
}

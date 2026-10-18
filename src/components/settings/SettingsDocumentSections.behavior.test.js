import fs from 'node:fs';
import { compile } from '@vue/compiler-dom';
import { compileScript, parse } from '@vue/compiler-sfc';
import * as Vue from 'vue';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEATURE_IDS } from '../../constants/featureGates.js';

const mocks = vi.hoisted(() => ({
  checkForAppUpdate: vi.fn(),
  chooseDownloadDir: vi.fn(),
  clearDiagnostics: vi.fn(),
  clearPlaybackHistory: vi.fn(),
  confirmAction: vi.fn(),
  detectSystemFfmpeg: vi.fn(),
  downloadAppUpdate: vi.fn(),
  enableFeature: vi.fn(),
  exportDiagnostics: vi.fn(),
  initializeMusicAnalysis: vi.fn(),
  initializePlaybackHistory: vi.fn(),
  initializeStorage: vi.fn(),
  installAppUpdate: vi.fn(),
  isFeatureEnabled: vi.fn(() => false),
  openDiagnosticsFolder: vi.fn(),
  openDownloadDir: vi.fn(),
  prepareDependency: vi.fn(),
  recordError: vi.fn(),
  refreshAppInfo: vi.fn(),
  refreshAppUpdateAutoCheck: vi.fn(),
  refreshAppUpdateStatus: vi.fn(),
  refreshConfirmations: vi.fn(),
  refreshDependencies: vi.fn(),
  refreshDiagnostics: vi.fn(),
  refreshImportConfig: vi.fn(),
  refreshObsSettings: vi.fn(),
  refreshSeparationPreference: vi.fn(),
  refreshWindowsPreference: vi.fn(),
  removeDependency: vi.fn(),
  repairDependency: vi.fn(),
  resetDownloadDir: vi.fn(),
  setAppUpdateAutoCheck: vi.fn(),
  disposeMusicAnalysis: vi.fn(),
  disposeStorage: vi.fn(),
  storageCleanup: vi.fn(),
}));

vi.mock('../../composables/useAppConfirmation.js', () => ({
  useAppConfirmation: () => ({ confirm: mocks.confirmAction }),
}));

vi.mock('../../composables/useAppDiagnostics.js', async () => {
  const { shallowRef } = await vi.importActual('vue');
  return {
    useAppDiagnostics: () => ({
      recentRecords: shallowRef([]),
      recordError: mocks.recordError,
    }),
  };
});

vi.mock('../../composables/useImportSession.js', async () => {
  const { reactive } = await vi.importActual('vue');
  return {
    useImportSession: () => ({
      state: reactive({
        downloadDir: 'C:\\Music',
        isDefaultDir: true,
        isDownloadDirAvailable: true,
      }),
      refreshConfig: mocks.refreshImportConfig,
      chooseDownloadDir: mocks.chooseDownloadDir,
      resetDownloadDir: mocks.resetDownloadDir,
      openDownloadDir: mocks.openDownloadDir,
    }),
  };
});

vi.mock('../../composables/useLibraryStorage.js', async () => {
  const { shallowRef } = await vi.importActual('vue');
  return {
    useLibraryStorage: () => ({
      storage: shallowRef(null),
      policy: shallowRef(null),
      loading: shallowRef(false),
      saving: shallowRef(false),
      cleaning: shallowRef(false),
      error: shallowRef(''),
      readError: shallowRef(''),
      saveError: shallowRef(''),
      refresh: vi.fn(),
      lastCleanup: shallowRef(null),
      initialize: mocks.initializeStorage,
      dispose: mocks.disposeStorage,
      setPolicy: vi.fn(),
      cleanup: mocks.storageCleanup,
    }),
  };
});

vi.mock('../../composables/usePlaybackHistory.js', async () => {
  const { reactive, shallowRef } = await vi.importActual('vue');
  return {
    usePlaybackHistory: () => ({
      state: reactive({ isInitialized: false, error: null }),
      recentItems: shallowRef([]),
      initialize: mocks.initializePlaybackHistory,
      clear: mocks.clearPlaybackHistory,
    }),
  };
});

vi.mock('../../composables/useFeatureGates.js', async () => {
  const { reactive } = await vi.importActual('vue');
  return {
    useFeatureGates: () => ({
      state: reactive({ isLoading: false, error: null }),
      isFeatureEnabled: mocks.isFeatureEnabled,
      refreshConfirmations: mocks.refreshConfirmations,
    }),
  };
});

vi.mock('../../composables/useFeatureDependencies.js', async () => {
  const { reactive } = await vi.importActual('vue');
  return {
    useFeatureDependencies: () => ({
      state: reactive({ byId: {}, error: null }),
      refreshDependencies: mocks.refreshDependencies,
      prepareDependency: mocks.prepareDependency,
      removeDependency: mocks.removeDependency,
      repairDependency: mocks.repairDependency,
    }),
  };
});

vi.mock('../../composables/useFeatureGatePresentation.js', async () => {
  const { shallowRef } = await vi.importActual('vue');
  return {
    useFeatureGatePresentation: () => ({
      featureGateRows: shallowRef([]),
      enableFeature: mocks.enableFeature,
      gateActionLabel: vi.fn(),
      isGateActionDisabled: vi.fn(() => false),
      DEPENDENCY_ADVANCED_ACTIONS: {
        REFRESH: 'refresh',
        REPAIR: 'repair',
        REMOVE: 'remove',
      },
    }),
  };
});

vi.mock('../../composables/useMusicAnalysisSettings.js', async () => {
  const { shallowRef } = await vi.importActual('vue');
  return {
    useMusicAnalysisSettings: () => ({
      capability: shallowRef(null),
      autoAnalyze: shallowRef(false),
      capabilityBusy: shallowRef(false),
      preferenceBusy: shallowRef(false),
      stageLabel: shallowRef(''),
      capabilityError: shallowRef(''),
      capabilityReadError: shallowRef(''),
      refreshCapability: vi.fn(),
      refreshPreference: vi.fn(),
      preferenceError: shallowRef(''),
      preferenceSaveError: shallowRef(''),
      preferenceReadError: shallowRef(''),
      preferenceLoaded: shallowRef(true),
      preferenceReading: shallowRef(false),
      initialize: mocks.initializeMusicAnalysis,
      dispose: mocks.disposeMusicAnalysis,
      setAutoAnalyze: vi.fn(),
      prepare: vi.fn(),
      repair: vi.fn(),
      remove: vi.fn(),
    }),
  };
});

vi.mock('../../composables/useSeparationSettings.js', async () => {
  const { shallowRef } = await vi.importActual('vue');
  return {
    useSeparationSettings: () => ({
      gpuAcceleration: shallowRef(false),
      preferenceBusy: shallowRef(false),
      preferenceError: shallowRef(''),
      preferenceSaveError: shallowRef(''),
      preferenceReadError: shallowRef(''),
      preferenceLoaded: shallowRef(true),
      preferenceReading: shallowRef(false),
      refreshPreference: mocks.refreshSeparationPreference,
      setGpuAcceleration: vi.fn(),
    }),
  };
});

vi.mock('../../composables/useObsIntegrationSettings.js', async () => {
  const { reactive, shallowRef } = await vi.importActual('vue');
  return {
    useObsIntegrationSettings: () => ({
      status: reactive({}),
      host: shallowRef('localhost'),
      port: shallowRef(4455),
      password: shallowRef(''),
      skipThresholdSeconds: shallowRef(5),
      hasStoredPassword: shallowRef(false),
      isSaving: shallowRef(false),
      error: shallowRef(''),
      readError: shallowRef(''),
      saveError: shallowRef(''),
      passwordError: shallowRef(''),
      connectionError: shallowRef(''),
      fieldErrors: shallowRef({}),
      validationAttempt: shallowRef(0),
      isLoading: shallowRef(false),
      refreshStatus: vi.fn(),
      refreshSettings: mocks.refreshObsSettings,
      save: vi.fn(),
      clearPassword: vi.fn(),
      retryConnect: vi.fn(),
    }),
  };
});

vi.mock('../../composables/useObsSessionExport.js', () => ({
  useObsSessionExport: () => ({ open: vi.fn() }),
}));

vi.mock('../../composables/useAppInfo.js', async () => {
  const { reactive } = await vi.importActual('vue');
  return {
    useAppInfo: () => ({
      state: reactive({ currentVersion: '0.4.0', error: null }),
      refreshAppInfo: mocks.refreshAppInfo,
    }),
  };
});

vi.mock('../../composables/useAppUpdate.js', async () => {
  const { reactive } = await vi.importActual('vue');
  return {
    useAppUpdate: () => ({
      state: reactive({
        currentVersion: '0.4.0',
        enabled: true,
        phase: 'idle',
        availableVersion: '',
        progress: null,
        downloadBytesPerSecond: 0,
        downloadEtaSeconds: 0,
        error: null,
        autoCheckEnabled: true,
        autoCheckBusy: false,
        autoCheckError: null,
      }),
      refreshAppUpdateStatus: mocks.refreshAppUpdateStatus,
      checkForAppUpdate: mocks.checkForAppUpdate,
      downloadAppUpdate: mocks.downloadAppUpdate,
      installAppUpdate: mocks.installAppUpdate,
      refreshAppUpdateAutoCheck: mocks.refreshAppUpdateAutoCheck,
      setAppUpdateAutoCheck: mocks.setAppUpdateAutoCheck,
    }),
  };
});

vi.mock('../../composables/useWindowsIntegrationSettings.js', async () => {
  const { shallowRef } = await vi.importActual('vue');
  return {
    useWindowsIntegrationSettings: () => ({
      windowCloseBehavior: shallowRef('quit'),
      preferenceBusy: shallowRef(false),
      preferenceError: shallowRef(''),
      preferenceSaveError: shallowRef(''),
      preferenceReadError: shallowRef(''),
      preferenceLoaded: shallowRef(true),
      preferenceReading: shallowRef(false),
      refreshPreference: mocks.refreshWindowsPreference,
      setWindowCloseBehavior: vi.fn(),
    }),
  };
});

vi.mock('../../composables/usePersistentDiagnostics.js', async () => {
  const { reactive } = await vi.importActual('vue');
  return {
    usePersistentDiagnostics: () => ({
      state: reactive({ recordCount: 0, isLoading: false, notice: null }),
      refresh: mocks.refreshDiagnostics,
      clear: mocks.clearDiagnostics,
      openFolder: mocks.openDiagnosticsFolder,
      exportBundle: mocks.exportDiagnostics,
    }),
  };
});

vi.mock('../../composables/useFeedbackReport.js', () => ({
  useFeedbackReport: () => ({ openReport: vi.fn() }),
}));

vi.mock('../../composables/useAppAnnouncement.js', () => ({
  useAppAnnouncement: () => ({
    version: '0.4.0',
    summary: '測試公告',
    reopen: vi.fn(),
  }),
}));

vi.mock('../../composables/usePlayer.js', async () => {
  const { reactive } = await vi.importActual('vue');
  return {
    usePlayer: () => ({
      state: reactive({ captureDeviceId: 'capture-device-1' }),
    }),
  };
});

vi.mock('../../composables/useAudioOutput.js', async () => {
  const { shallowRef } = await vi.importActual('vue');
  return {
    useAudioOutput: () => ({
      devices: shallowRef([
        { deviceId: 'capture-device-1', label: 'OBS Capture' },
      ]),
      captureErrorNotice: shallowRef(null),
    }),
  };
});

vi.mock('./SettingsSection.vue', async () => {
  const { h } = await vi.importActual('vue');
  return {
    default: {
      name: 'SettingsSectionStub',
      setup(_props, { slots }) {
        return () => h('section', null, slots.default?.());
      },
    },
  };
});

vi.mock('./AudioOutputSettingsBlock.vue', async () => {
  const { h } = await vi.importActual('vue');
  return {
    default: {
      name: 'AudioOutputSettingsBlockStub',
      props: {
        enabled: Boolean,
        deviceLabel: String,
        errorNotice: { type: [Object, String], default: null },
      },
      emits: ['select-device'],
      setup(props, { emit }) {
        return () =>
          h(
            'button',
            {
              id: 'select-capture-device',
              'data-device-label': props.deviceLabel,
              onClick: () => emit('select-device'),
            },
            '選擇裝置',
          );
      },
    },
  };
});

vi.mock('./CaptureDeviceModal.vue', async () => {
  const { h } = await vi.importActual('vue');
  return {
    default: {
      name: 'CaptureDeviceModalStub',
      props: { open: Boolean },
      emits: ['close'],
      setup(props, { emit }) {
        return () =>
          h(
            'button',
            {
              id: 'capture-device-modal',
              'data-open': String(props.open),
              onClick: () => emit('close'),
            },
            '關閉裝置選擇',
          );
      },
    },
  };
});

import { useFeatureGateAccess } from '../../composables/useFeatureGateAccess.js';
import { useAppView } from '../../composables/useAppView.js';
import SettingsApplicationSection from './SettingsApplicationSection.vue';
import SettingsAudioSection from './SettingsAudioSection.vue';
import SettingsCapabilitiesSection from './SettingsCapabilitiesSection.vue';
import SettingsLibrarySection from './SettingsLibrarySection.vue';
import SettingsSupportSection from './SettingsSupportSection.vue';

const { createRenderer, nextTick } = Vue;

function attachClientRender(component, filename) {
  const source = fs.readFileSync(new URL(filename, import.meta.url), 'utf8');
  const { descriptor } = parse(source, { filename });
  const script = compileScript(descriptor, { id: filename });
  const { code } = compile(descriptor.template.content, {
    mode: 'function',
    prefixIdentifiers: true,
    bindingMetadata: script.bindings,
  });
  component.render = new Function('Vue', code)(Vue);
}

attachClientRender(SettingsAudioSection, './SettingsAudioSection.vue');

function hostNode(type, text = '') {
  return { type, text, props: {}, children: [], parent: null };
}

const renderer = createRenderer({
  patchProp(element, key, _previousValue, nextValue) {
    element.props[key] = nextValue;
  },
  insert(child, parent, anchor = null) {
    child.parent = parent;
    if (!anchor) parent.children.push(child);
    else parent.children.splice(parent.children.indexOf(anchor), 0, child);
  },
  remove(child) {
    const index = child.parent?.children.indexOf(child) ?? -1;
    if (index >= 0) child.parent.children.splice(index, 1);
  },
  createElement(type) {
    return hostNode(type);
  },
  createText(text) {
    return hostNode('text', text);
  },
  createComment(text) {
    return hostNode('comment', text);
  },
  setText(node, text) {
    node.text = text;
  },
  setElementText(element, text) {
    element.children = [hostNode('text', text)];
  },
  parentNode(node) {
    return node.parent;
  },
  nextSibling(node) {
    const siblings = node.parent?.children ?? [];
    return siblings[siblings.indexOf(node) + 1] ?? null;
  },
  querySelector() {
    return null;
  },
  setScopeId() {},
  cloneNode(node) {
    return { ...node, props: { ...node.props }, children: [...node.children] };
  },
  insertStaticContent(content, parent) {
    const node = hostNode('static', content);
    this.insert(node, parent);
    return [node, node];
  },
});

function mountSetup(component) {
  const app = renderer.createApp({ ...component, render: () => null });
  app.provide(Vue.ssrContextKey, { modules: new Set() });
  app.mount(hostNode('root'));
  return app;
}

function findAll(node, predicate, matches = []) {
  if (predicate(node)) matches.push(node);
  for (const child of node.children ?? []) findAll(child, predicate, matches);
  return matches;
}

describe('Settings document section behavior', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.confirmAction.mockResolvedValue(true);
    mocks.refreshImportConfig.mockResolvedValue(undefined);
    mocks.clearPlaybackHistory.mockResolvedValue(undefined);
    mocks.storageCleanup.mockResolvedValue(undefined);
    mocks.refreshDependencies.mockResolvedValue(undefined);
    mocks.detectSystemFfmpeg.mockResolvedValue(null);
    vi.stubGlobal('window', {
      Utawakui: { detectSystemFfmpeg: mocks.detectSystemFfmpeg },
    });
  });

  afterEach(() => {
    useFeatureGateAccess().clearFeatureGateRequest();
    useAppView().clearSettingsSection();
    vi.unstubAllGlobals();
  });

  it('initializes and disposes the library owner and keeps destructive actions confirmed', async () => {
    const app = mountSetup(SettingsLibrarySection);
    await nextTick();

    expect(mocks.refreshImportConfig).toHaveBeenCalledOnce();
    expect(mocks.initializePlaybackHistory).toHaveBeenCalledOnce();
    expect(mocks.initializeStorage).toHaveBeenCalledOnce();

    await app._instance.setupState.handleClearPlaybackHistory();
    await app._instance.setupState.handleCleanupLibraryStorage();

    expect(mocks.confirmAction).toHaveBeenCalledTimes(2);
    expect(mocks.clearPlaybackHistory).toHaveBeenCalledOnce();
    expect(mocks.storageCleanup).toHaveBeenCalledOnce();

    mocks.confirmAction.mockResolvedValue(false);
    await app._instance.setupState.handleClearPlaybackHistory();
    await app._instance.setupState.handleCleanupLibraryStorage();

    expect(mocks.clearPlaybackHistory).toHaveBeenCalledOnce();
    expect(mocks.storageCleanup).toHaveBeenCalledOnce();

    app.unmount();
    expect(mocks.disposeStorage).toHaveBeenCalledOnce();
  });

  it('routes settings folder actions to notification feedback', async () => {
    const app = mountSetup(SettingsLibrarySection);
    await nextTick();
    app._instance.setupState.handleDownloadDirMenuSelect('choose');
    app._instance.setupState.handleDownloadDirMenuSelect('reset');
    expect(mocks.chooseDownloadDir).toHaveBeenCalledWith({
      notifyFailure: true,
    });
    expect(mocks.resetDownloadDir).toHaveBeenCalledWith({
      notifyFailure: true,
    });
    app.unmount();
  });

  it('derives the capture-device label and owns modal open and close events', async () => {
    const root = hostNode('root');
    const app = renderer.createApp(SettingsAudioSection);
    app.provide(Vue.ssrContextKey, { modules: new Set() });
    app.mount(root);

    const selectButton = findAll(
      root,
      (node) => node.props?.id === 'select-capture-device',
    )[0];
    const modalButton = findAll(
      root,
      (node) => node.props?.id === 'capture-device-modal',
    )[0];

    expect(selectButton.props['data-device-label']).toBe('OBS Capture');
    expect(modalButton.props['data-open']).toBe('false');

    selectButton.props.onClick();
    await nextTick();
    expect(modalButton.props['data-open']).toBe('true');

    modalButton.props.onClick();
    await nextTick();
    expect(modalButton.props['data-open']).toBe('false');

    app.unmount();
  });

  it('starts storage subscription before a pending folder read can outlive the section', async () => {
    let finish;
    mocks.refreshImportConfig.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    const app = mountSetup(SettingsLibrarySection);
    expect(mocks.initializeStorage).toHaveBeenCalledOnce();
    app.unmount();
    expect(mocks.disposeStorage).toHaveBeenCalledOnce();
    finish();
    await nextTick();
    expect(mocks.initializeStorage).toHaveBeenCalledOnce();
  });

  it('runs the application and support refresh lifecycles from their section owners', async () => {
    const applicationApp = mountSetup(SettingsApplicationSection);
    const supportApp = mountSetup(SettingsSupportSection);
    await nextTick();

    expect(mocks.refreshAppInfo).toHaveBeenCalledOnce();
    expect(mocks.refreshAppUpdateStatus).toHaveBeenCalledOnce();
    expect(mocks.refreshAppUpdateAutoCheck).toHaveBeenCalledOnce();
    expect(mocks.refreshWindowsPreference).toHaveBeenCalledOnce();
    expect(mocks.refreshDiagnostics).toHaveBeenCalledOnce();

    applicationApp.unmount();
    supportApp.unmount();
  });

  it('owns capability lifecycle and reveals one-shot section and feature targets', async () => {
    const sectionTarget = {
      scrollIntoView: vi.fn(),
      focus: vi.fn(),
    };
    const featureTarget = {
      scrollIntoView: vi.fn(),
      focus: vi.fn(),
    };
    const getElementById = vi.fn((id) => {
      if (id === 'settings-group-output') return sectionTarget;
      if (id === `settings-feature-${FEATURE_IDS.PUBLIC_OUTPUT_FLOW}`) {
        return featureTarget;
      }
      return null;
    });
    vi.stubGlobal('document', { getElementById });

    useAppView().openSettings('output');
    useFeatureGateAccess().requestFeatureSetup(FEATURE_IDS.PUBLIC_OUTPUT_FLOW);

    const app = mountSetup(SettingsCapabilitiesSection);
    await nextTick();
    await nextTick();

    expect(mocks.refreshConfirmations).toHaveBeenCalledOnce();
    expect(mocks.refreshDependencies).toHaveBeenCalledOnce();
    expect(mocks.initializeMusicAnalysis).toHaveBeenCalledOnce();
    expect(mocks.refreshSeparationPreference).toHaveBeenCalledOnce();
    expect(mocks.refreshObsSettings).toHaveBeenCalledOnce();
    // Setup alone has no visible document target; the optional hint is deferred.
    expect(mocks.detectSystemFfmpeg).not.toHaveBeenCalled();
    expect(getElementById).toHaveBeenCalledWith('settings-group-output');
    expect(getElementById).toHaveBeenCalledWith(
      `settings-feature-${FEATURE_IDS.PUBLIC_OUTPUT_FLOW}`,
    );

    for (const target of [sectionTarget, featureTarget]) {
      expect(target.scrollIntoView).toHaveBeenCalledWith({ block: 'start' });
      expect(target.focus).toHaveBeenCalledWith({ preventScroll: true });
    }

    app.unmount();
    expect(mocks.disposeMusicAnalysis).not.toHaveBeenCalled();
  });
});

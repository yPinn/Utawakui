'use strict';

const js = require('@eslint/js');
const pluginVue = require('eslint-plugin-vue');
const eslintConfigPrettier = require('eslint-config-prettier');
const globals = require('globals');

const I18N_MIGRATED = [
  'src/components/ui/**/*.{js,vue}',
  'src/components/layout/**/*.{js,vue}',
  'src/App.vue',
  'src/composables/{useAppConfirmation,useAppNotifications,useAppRightDock,usePanelView,useWindowCloseDecision}.js',
  'electron/main/{rendererRecovery,windowsTrayController}.js',
  'electron/main/windows/mainWindow.js',
  'src/components/settings/{SettingsApplicationSection,AppUpdateSettingsRow,WindowsBackgroundSettingsRow,SettingsSupportSection,DiagnosticsSettingsRow,AutoErrorReportingSettingsRow,FeedbackReportSettingsRow,FeedbackReportModal,AutoErrorReportModal}.vue',
  'src/composables/{useAppUpdate,useAutoErrorReport,useFeedbackReport}.js',
  'src/utils/appUpdateProgress.js',
  'src/constants/feedback.js',
  'electron/main/configHandlers.js',
  'src/components/settings/KeyboardShortcut*.vue',
  'src/composables/{useKeyboardShortcutSettings,useKeyboardShortcutRecorder}.js',
  'src/utils/{keyboardShortcutPresentation,keyboardShortcutSettingsPresentation,inputBindingRegistry}.js',
  'shared/{keyboardBindingDefinitions,keyboardShortcutContract}.mjs',
  'electron/main/keyboardShortcutHandlers.js',
  'src/components/settings/{SettingsLibrarySection,LibraryMetadataSettingsRow,LibraryStorageSettingsRow,PlaybackHistorySettingsRow,LibraryReconciliationModal,ReconciliationMetadataFields,ReconciliationMergePreview,LibraryTagWriteback}.vue',
  'src/composables/{useLibraryReconciliation,useLibraryTagWriteback,useLibraryMetadataMaintenance,useLibraryStorage,usePlaybackHistory}.js',
  'src/utils/{libraryReconciliation,format}.js',
  'electron/main/{libraryStorageHandlers,libraryMetadataHandlers}.js',
  'src/components/settings/{SettingsCapabilitiesSection,MusicAnalysisPreferenceRow,YoutubeBrowserCookiesRow,FfmpegSourceModal,MusicAnalysisSettingsRow,SeparationGpuSettingsRow,SettingsFeatureGateRow,SettingsDependencyList,SettingsDependencyActions}.vue',
  'src/composables/{useFeatureGatePresentation,useFeatureDependencies,useFeatureGateAccess,useFeatureGates,useMusicAnalysisSettings,useSeparationSettings,useYoutubeBrowserCookieSettings}.js',
  'electron/main/{featureDependencyHandlers,featureGateHandlers}.js',
  'src/components/settings/{ObsIntegrationSettingsBlock,OutputRuntimeSettingsBlock,ObsSessionExportModal}.vue',
  'src/composables/{useObsIntegrationSettings,useObsSessionExport,usePlaybackDockPreference}.js',
  'src/composables/output/useSpoutOutput.js',
  'src/utils/{outputRuntimeStatus,spoutOutputStatus,obsChapters}.js',
  'electron/main/{obsAdapter,spoutOutputRuntime,outputWindowHandlers}.js',
  'src/components/settings/{SettingsAudioSection,AudioOutputSettingsBlock,CaptureDeviceModal,VirtualCableGuideModal}.vue',
  'src/composables/useAudioOutput.js',
  'src/utils/audioDeviceLabel.js',
  'src/components/library/{LibraryBrowseContent,LibraryBrowseWorkspace,LibraryCollectionHeader,CollectionActionRail,LibraryFolderArtifactLayer,FolderAssetPreviewModal,LibrarySourceTracklist,LibraryAlbumCard,LibraryAlbumSupportingContent,LibraryEntityDossier,LibraryArtistIdentityController}.vue',
  'src/{pages/LibraryPage,views/StudioLibraryContextView}.vue',
  'src/composables/{useLibraryFolderObjects,useLibrary}.js',
  'src/composables/player/usePlayerLibrarySync.js',
  'src/utils/{releasePresentation,releaseDetailPresentation}.js',
  'src/components/library/{ReleaseInfoEditor,ReleaseInfoFields,ReleaseMembersPanel,ReleaseCatalogModal,ReleaseCatalogBatchActions,LibraryReleaseCatalog}.vue',
  'src/composables/{useReleaseOrganization,useReleaseCatalogDownloads,useReleaseCatalog,useReleaseCatalogBatchDownloads,useReleaseMembers}.js',
  'src/components/library/{WorkVersionEditor,WorkVersionFields,WorkVersionTrackRow,TrackMetadataFields,WorkLinkSearch,ArtworkPreviewPane,ArtworkSearchResults}.vue',
  'electron/main/libraryHandlers.js',
  'electron/main/library/{trackArtworkHandlers,artistPhotoHandlers,artistOrganizationHandlers,releaseHandlers,workOrganizationHandlers}.js',
  'electron/lib/{libraryLocation,library/importLocal}.js',
  'src/composables/{useLocalImport,useImportSession}.js',
  'src/composables/import/{useImportExecution,useImportSourceResolution,useImportResultNotification}.js',
  'src/utils/{downloadFailureDisplay,importCandidateDisplay,importBatch,importPlaylist}.js',
  'src/components/import/{ImportDockContent,ImportActivityMonitor,ImportCollectionExecutionList,ImportCollectionSelectionList,ImportReviewModal,ImportSourceField,ImportBatchReview,ImportCollectionTrackStatus,ImportSourceRow,ImportCollectionReview}.vue',
  'electron/main/importHandlers.js',
  'src/components/performance-session/*.vue',
  'src/components/performance/PerformanceWorkspace.vue',
  'src/pages/PerformancePage.vue',
  'electron/main/{performanceSessionPlanHandlers,performanceSessionHistoryHandlers}.js',
  'electron/lib/{performanceSessionPlan,performanceSessionArchive}.js',
  'src/composables/{usePerformanceSessionPlaybackController,usePerformanceSessionPlan,usePerformanceArchive,usePerformanceHistoryObserver}.js',
  'src/utils/{performanceArchivePresentation,performanceSessionSummary,performanceSessionOutput}.js',
  'src/components/playback/{PlayerBar,PlayerToolsPanel,PlayerPerformanceSettingsControls,PlayerBarArtwork,PlaybackPrimaryButton}.vue',
  'src/components/playback/context/{TrackContextPanel,TrackContextHero,TrackArtistPreview,TrackQueuePreview,TrackContextActions,TrackCapabilityMatrix}.vue',
  'src/components/bgm/{BgmPlayer,BgmPlayerTransport}.vue',
  'src/components/track/PlaybackTrackIdentity.vue',
  'src/bgm/sessionController.js',
  'src/composables/player/{usePlayerPerformanceSettings,usePlayerAudioStart}.js',
  'src/composables/{usePlayerPractice,usePlaybackResume,usePlayer}.js',
  'src/composables/analysis/useMusicAnalysisCapabilitySession.js',
  'src/components/queue/{QueuePanel,QueueTrackButton,RecentPlaybackList,RightDockTrackMenuButton,QueueSection}.vue',
  'src/components/output/previews/QueueBoardPreview.vue',
  'src/components/separation/separationQueuePresentation.js',
  'src/composables/{useSeparationQueueNotifications,useSeparationQueue}.js',
  'src/components/performer/*.vue',
  'src/composables/{usePerformerSelfView,usePerformerViewState}.js',
  'src/performer/PerformerApp.vue',
  'src/components/output/*.vue',
  'src/composables/{useOutputRuntime,useObsIntegration}.js',
  'src/composables/output/{useLocalFonts,useOutputClipboard,useOutputElementTarget,useOutputRuntimeStatus}.js',
  'src/constants/{outputPreviewLimitations,outputTemplates}.js',
  'src/utils/{outputPanelCopy,outputRoutes}.js',
  'electron/main/windows/outputWindow.js',
  'src/components/track/*.{js,vue}',
  'src/utils/{trackContextPresentation,artworkCandidateDisplay}.js',
  'src/composables/useTrackMetadataEditor.js',
  'src/components/{playlists,artists}/*.vue',
  'src/composables/{usePlaylists,useArtistIndex,useArtistPhotoCandidates,useWorkOrganization}.js',
  'src/utils/playlistMenu.js',
  'electron/main/{playlistsHandlers,folderPageObjectHandlers}.js',
  'src/composables/analysis/useMusicAnalysisCapability.js',
  'src/components/separation/{SeparationDockContent,SeparationToolbarList,SeparationPreparationList}.vue',
  'src/components/preparation/*.{js,vue}',
  'src/components/bgm/{bgmPresentation.js,BgmTrackPicker.vue,BgmCurrentSource.vue}',
  'src/composables/useSeparationPreparation.js',
  'src/bgm/{audioDeck,handoffCoordinator}.js',
  'src/components/lyrics/{LyricsAuthoringWorkspace,LyricsWaveformTool,LyricsTimingReviewTool,LyricsLoopControls,LyricsLoopTool}.vue',
  'src/components/lyrics/{LyricsSegmentEditor,LyricsLineTimingEditor,LyricsTimingToolbar,LyricsDocumentPanel,LyricsPhrasePreview,LyricsTextProcessing,LyricsAcousticPreview,LyricsExperimentalEstimate,LyricsPreparationBar,LyricsWorkspaceHeader}.vue',
  'src/composables/lyrics/{useLyricsTimingReview,useLyricsWaveform,useLyricsVocalRoles}.js',
  'src/composables/useLyricsTimingEditor.js',
  'src/composables/lyrics/{useLyricsAcquisition,useLyricsSourceDocuments}.js',
  'src/composables/{useLyrics,useLyricsReading}.js',
  'src/utils/{lrclibPresentation,lyricsIssueReport,lyricsSourcePresentation}.js',
  'electron/main/lyrics/{readingHandlers,documentHandlers}.js',
  'src/components/lyrics/{LyricsSourceControl,LyricsProviderRecordingGroup,LyricsManualImportPanel,LyricsTrackPickerModal,LyricsLrclibCandidateRow,LyricsLrclibSearchWorkspace,LyricsSourceManagerModal}.vue',
];
const CJK_TEXT = '/[\\p{Script=Han}\\p{Script=Hiragana}\\p{Script=Katakana}]/u';
const HARDCODED_UI_TEXT =
  'Hardcoded UI text: add it to shared/locales and read it with t() (AGENTS.md "UI Text And Locale").';

module.exports = [
  {
    ignores: [
      'coverage/**',
      'dist/**',
      'runtime/**',
      '.tmp/**',
      'release/**',
      'release-*/**',
      'node_modules/**',
      'tasks/**',
      'prototypes/**/.build/**',
    ],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'warn',
    },
  },
  js.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: [
      'electron/**/*.js',
      'shared/**/*.js',
      'scripts/**/*.{js,cjs}',
      '*.config.js',
    ],
    languageOptions: {
      sourceType: 'commonjs',
      globals: globals.node,
    },
  },
  {
    files: ['scripts/**/*.mjs', 'tools/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['electron/**/*.test.js', 'shared/**/*.test.js'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['overlay/**/*.mjs'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.browser,
    },
  },
  {
    files: ['overlay/**/*.test.js'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.node,
    },
  },
  {
    files: ['src/**/*.{js,vue}'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.browser,
    },
  },
  {
    // Cloudflare Workers runtime: ES modules, web-standard globals (fetch,
    // Request/Response, FormData, TextEncoder) — not Node, not a browser.
    files: ['services/**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: globals.worker,
    },
  },
  {
    // Migrated to shared/locales; scripts/uiLiteralRatchet.js guards the rest.
    files: I18N_MIGRATED,
    ignores: ['**/*.test.js'],
    rules: {
      'no-restricted-syntax': [
        'error',
        { selector: `Literal[value=${CJK_TEXT}]`, message: HARDCODED_UI_TEXT },
        {
          selector: `TemplateElement[value.raw=${CJK_TEXT}]`,
          message: HARDCODED_UI_TEXT,
        },
      ],
      'vue/no-restricted-syntax': [
        'error',
        {
          // Template text only; <script> and <style> bodies are not UI text.
          selector: `VElement[name!=/^(?:script|style)$/] > VText[value=${CJK_TEXT}]`,
          message: HARDCODED_UI_TEXT,
        },
        { selector: `VLiteral[value=${CJK_TEXT}]`, message: HARDCODED_UI_TEXT },
      ],
    },
  },
  eslintConfigPrettier,
];

import { t } from '../utils/i18n.js';
const COMMON = t('outputPanel.previewLimits.common');
const DETAILS = Object.freeze({
  'queue-board': t('outputPanel.previewLimits.queueBoard'),
  'receipt-setlist': t('outputPanel.previewLimits.receiptSetlist'),
  'ribbon-setlist': t('outputPanel.previewLimits.ribbonSetlist'),
  'karaoke-stack': t('outputPanel.previewLimits.karaokeStack'),
  'kinetic-pop': t('outputPanel.previewLimits.kineticPop'),
  'ornate-vertical': t('outputPanel.previewLimits.ornateVertical'),
  'chalkboard-vertical': t('outputPanel.previewLimits.chalkboardVertical'),
  'centered-vertical': t('outputPanel.previewLimits.centeredVertical'),
  'fisheye-lens': t('outputPanel.previewLimits.fisheyeLens'),
  'live-stage': t('outputPanel.previewLimits.liveStage'),
  'manga-frame': t('outputPanel.previewLimits.mangaFrame'),
  'art-card': t('outputPanel.previewLimits.artCard'),
  'ticket-stub': t('outputPanel.previewLimits.ticketStub'),
  'cover-player': t('outputPanel.previewLimits.coverPlayer'),
});

export function outputPreviewLimitations(templateId) {
  return [
    COMMON,
    Object.hasOwn(DETAILS, templateId)
      ? DETAILS[templateId]
      : t('outputPanel.previewLimits.fallback'),
  ];
}

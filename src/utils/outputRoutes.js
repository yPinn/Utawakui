const OUTPUT_PATH_BY_TEMPLATE = Object.freeze({
  'now-next': '/overlay/now-playing',
  'queue-board': '/overlay/setlist',
  'focus-line': '/overlay/lyrics',
  'karaoke-stack': '/overlay/lyrics',
});

export function outputPathForTemplate(templateId) {
  return OUTPUT_PATH_BY_TEMPLATE[templateId] ?? null;
}

export function buildOutputTemplateUrls(status, templateId) {
  const path = outputPathForTemplate(templateId);
  if (!status?.running || !status.httpUrl || !path) {
    return { obsUrl: null, previewUrl: null };
  }

  const obsUrl = new URL(path, status.httpUrl).toString();
  const previewUrl = new URL(obsUrl);
  previewUrl.searchParams.set('preview', '1');
  return { obsUrl, previewUrl: previewUrl.toString() };
}

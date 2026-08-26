const BUNDLED_THUMBNAIL_MODULES = import.meta.glob(
  '../assets/output-template-thumbnails/*.{avif,webp,png,jpg,jpeg}',
  {
    eager: true,
    import: 'default',
    query: '?url',
  },
);

const THUMBNAIL_PATH_PATTERN =
  /\/([a-z0-9]+(?:-[a-z0-9]+)*)\.(?:avif|webp|png|jpe?g)$/i;

export function buildOutputTemplateThumbnailRegistry(modules) {
  const registry = {};

  for (const [assetPath, assetUrl] of Object.entries(modules ?? {})) {
    const match = assetPath.match(THUMBNAIL_PATH_PATTERN);
    if (!match || typeof assetUrl !== 'string' || !assetUrl) continue;

    const templateId = match[1].toLowerCase();
    if (Object.hasOwn(registry, templateId)) {
      throw new Error(`Duplicate bundled thumbnail for ${templateId}`);
    }
    registry[templateId] = assetUrl;
  }

  return Object.freeze(registry);
}

const OUTPUT_TEMPLATE_THUMBNAILS = buildOutputTemplateThumbnailRegistry(
  BUNDLED_THUMBNAIL_MODULES,
);

export function getOutputTemplateThumbnail(templateId) {
  if (
    typeof templateId !== 'string' ||
    !Object.hasOwn(OUTPUT_TEMPLATE_THUMBNAILS, templateId)
  ) {
    return null;
  }
  return OUTPUT_TEMPLATE_THUMBNAILS[templateId];
}

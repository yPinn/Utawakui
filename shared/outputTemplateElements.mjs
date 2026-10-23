// Element declarations from ADR 0027. A template declares elements only once
// it consumes element-scoped properties; an element without `visible` cannot hide.
export const OUTPUT_TEMPLATE_ELEMENTS = Object.freeze({
  'cover-player': Object.freeze([
    Object.freeze({
      id: 'title',
      kind: 'text',
      label: '曲名',
      properties: Object.freeze(['fontWeight', 'fontSizeScale']),
    }),
    Object.freeze({
      id: 'artist',
      kind: 'text',
      label: '藝人',
      properties: Object.freeze(['fontWeight', 'fontSizeScale', 'visible']),
    }),
    Object.freeze({
      id: 'progress',
      kind: 'graphic',
      label: '進度',
      properties: Object.freeze(['visible']),
    }),
    Object.freeze({
      id: 'transport',
      kind: 'graphic',
      label: '播放鍵',
      properties: Object.freeze(['visible']),
    }),
  ]),
});

'use strict';

const { failure, record } = require('./documents');
const { hasControlCharacters } = require('../textGuards');

const TEXT_FIELDS = ['title', 'artist', 'album', 'albumArtist', 'releaseDate'];
const NUMBER_FIELDS = [
  'releaseYear',
  'trackNumber',
  'trackTotal',
  'discNumber',
  'discTotal',
];
const METADATA_FIELDS = [...TEXT_FIELDS, ...NUMBER_FIELDS];

function validateValue(field, value) {
  if (TEXT_FIELDS.includes(field)) {
    if (
      typeof value !== 'string' ||
      value.length > 200 ||
      hasControlCharacters(value) ||
      (field === 'title' && !value.trim())
    )
      throw failure();
    if (field === 'releaseDate' && value && !validDate(value)) throw failure();
    return value.trim();
  }
  if (value === null) return null;
  if (
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value > (field === 'releaseYear' ? 9999 : 5000)
  )
    throw failure();
  return value;
}
function validDate(value) {
  if (!/^[0-9]{4}(?:-[0-9]{2}(?:-[0-9]{2})?)?$/.test(value)) return false;
  const [year, month = 1, day = 1] = value.split('-').map(Number);
  const days = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return (
    year > 0 && month > 0 && month <= 12 && day > 0 && day <= days[month - 1]
  );
}
function validateFieldDecisions(value) {
  record(value, METADATA_FIELDS);
  if (!Object.keys(value).length) throw failure();
  for (const [field, decision] of Object.entries(value)) {
    record(decision, ['action', 'value']);
    if (
      !['keep', 'source', 'manual', 'clear', 'follow'].includes(
        decision.action,
      ) ||
      (decision.action !== 'manual' && Object.hasOwn(decision, 'value')) ||
      (decision.action === 'clear' && field === 'title')
    )
      throw failure();
    if (decision.action === 'manual') validateValue(field, decision.value);
  }
  return value;
}
function projectFields(entry, observed, providerFields = []) {
  return Object.fromEntries(
    METADATA_FIELDS.map((field) => {
      const origin = entry[`${field}Origin`] ?? 'unknown';
      const follows = origin === 'provider';
      const value = entry[field];
      return [
        field,
        {
          value: value ?? null,
          origin: follows ? 'source' : origin,
          observed: observed[field] ?? null,
          canFollow: providerFields.includes(field),
          observedKind: providerFields.includes(field)
            ? 'provider'
            : 'file-tags',
        },
      ];
    }),
  );
}
function applyFieldDecisions(
  entry,
  observed,
  input,
  { followFields = METADATA_FIELDS } = {},
) {
  const decisions = validateFieldDecisions(input);
  const next = { ...entry };
  for (const [field, decision] of Object.entries(decisions)) {
    if (decision.action === 'keep') continue;
    if (decision.action === 'follow' && !followFields.includes(field))
      throw failure('RECONCILIATION_SOURCE_MISSING');
    let value;
    if (decision.action === 'source' || decision.action === 'follow') {
      if (
        !Object.hasOwn(observed, field) ||
        observed[field] === undefined ||
        observed[field] === null
      )
        throw failure('RECONCILIATION_SOURCE_MISSING');
      value = validateValue(field, observed[field]);
    } else if (decision.action === 'clear')
      value = TEXT_FIELDS.includes(field) ? '' : null;
    else value = validateValue(field, decision.value);
    next[field] = value;
    next[`${field}Origin`] =
      decision.action === 'follow' ? 'provider' : 'manual';
  }
  if (
    (next.trackNumber &&
      next.trackTotal &&
      next.trackNumber > next.trackTotal) ||
    (next.discNumber && next.discTotal && next.discNumber > next.discTotal)
  )
    throw failure();
  return next;
}

module.exports = {
  METADATA_FIELDS,
  validateFieldDecisions,
  applyFieldDecisions,
  projectFields,
  validDate,
};

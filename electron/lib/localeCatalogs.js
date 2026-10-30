'use strict';

const fs = require('node:fs');
const path = require('node:path');

const LOCALES_DIR = path.join(__dirname, '../../shared/locales');

function subdirectories(directory) {
  return fs
    .readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

// One JSON file per namespace keeps parallel feature work out of one catalog.
function readLocaleCatalogs(directory = LOCALES_DIR) {
  return Object.fromEntries(
    subdirectories(directory).map((locale) => [
      locale,
      Object.fromEntries(
        fs
          .readdirSync(path.join(directory, locale))
          .filter((file) => file.endsWith('.json'))
          .sort()
          .map((file) => [
            path.basename(file, '.json'),
            JSON.parse(
              fs.readFileSync(path.join(directory, locale, file), 'utf8'),
            ),
          ]),
      ),
    ]),
  );
}

module.exports = { readLocaleCatalogs };

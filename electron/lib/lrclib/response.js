'use strict';

async function readJsonResponse(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

module.exports = { readJsonResponse };

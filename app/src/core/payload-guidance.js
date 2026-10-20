'use strict';

// What to tell someone when there is nothing to install from.
//
// This edition ships without any third-party binaries: the DLSS DLLs,
// Streamline, ReShade, RenoDX and DLSS5-Feeder are downloaded in the app's
// Components tab into %APPDATA%\dlss5-swapper\payload, and the DLSS 5 model
// (nvngx_dlssnr.dll) is imported there. A missing payload is therefore a step
// the person has not done yet, and the guidance points at that tab. The
// renderer translates the code `errPayloadMissing`; `message` is the English
// fallback.
//
// Kept apart from main.js so the wording is testable without Electron.
const path = require('node:path');

// The portable build of the original app unpacked itself here; kept for
// callers that still import the name.
const PORTABLE_DIR = 'DLSS5-Swapper';

function missingPayload({ userData = null, missing = [] } = {}) {
  const directory = userData ? path.join(userData, 'payload') : '%APPDATA%\\dlss5-swapper\\payload';
  const which = missing && missing.length ? ` Missing: ${missing.join(', ')}.` : '';
  return {
    code: 'errPayloadMissing',
    params: { dir: directory, missing: missing || [] },
    message: `The components this app installs into games (DLSS DLLs, ReShade, RenoDX, DLSS5-Feeder) are not set up yet.${which} Open the Components tab to download them and import the DLSS 5 DLL (nvngx_dlssnr.dll). They are stored in ${directory}. No game files were changed.`
  };
}

module.exports = { missingPayload, PORTABLE_DIR };

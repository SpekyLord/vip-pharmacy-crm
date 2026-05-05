#!/usr/bin/env node
/**
 * Phase O — Visit Photo Trust + Screenshot Block + Late-Log Cutoff
 * Static (no-DB) verification of the contract locked May 05 2026.
 *
 * Background
 * ──────────
 * Pre-Phase O the server trusted client-supplied photoMetadata.capturedAt,
 * which made back-dating fraud trivial (BDM logs Mon, sets capturedAt to
 * last Wed). Phase O moves EXIF extraction server-side via exifr, derives
 * Visit.visitDate from the earliest photo's DateTimeOriginal, and rejects
 * screenshots at upload (redirecting the BDM to /bdm/comm-log so Messenger
 * conversations get logged in the right surface).
 *
 * Asserted contract (each section is a separate static check):
 *
 *   1. backend/utils/photoMetadata.js exports extractMetadata +
 *      resolveAggregateVisitDate + daysBetween, requires exifr + sharp,
 *      uses the SCREENSHOT_ASPECT_RATIO_FLOOR threshold.
 *
 *   2. backend/utils/visitPhotoValidation.js exports getThresholds + DEFAULTS
 *      with all 5 keys (late_log_max_days_old, cross_week_soft_flag,
 *      screenshot_block_enabled, screenshot_redirect_path,
 *      require_exif_for_camera_source) and queries the
 *      VISIT_PHOTO_VALIDATION_RULES lookup category.
 *
 *   3. backend/middleware/upload.js processVisitPhotos:
 *      - imports extractMetadata + visitPhotoValidation
 *      - calls extractMetadata(file.buffer) BEFORE compression
 *      - returns 422 with code='SCREENSHOT_DETECTED' + redirect when
 *        screenshot_block_enabled and isLikelyScreenshot
 *      - attaches serverMeta to req.uploadedPhotos[]
 *      - forwards photoValidationRules to req
 *
 *   4. backend/controllers/visitController.js createVisit:
 *      - imports resolveAggregateVisitDate + daysBetween
 *      - resolves visitDateObj from server EXIF (not visitDate body field
 *        when EXIF is present)
 *      - returns 400 VISIT_PHOTO_TOO_OLD when EXIF age > late_log_max_days_old
 *      - returns 400 VISIT_PHOTO_FUTURE_DATED when EXIF date is > 1 day ahead
 *      - emits 'no_exif_timestamp' / 'gps_in_photo' / 'late_log_cross_week' flags
 *
 *   5. backend/erp/controllers/lookupGenericController.js SEED_DEFAULTS:
 *      - PHOTO_FLAG includes the 3 new codes
 *      - VISIT_PHOTO_VALIDATION_RULES seeded with insert_only_metadata + 5 metadata keys
 *
 *   6. exifr in backend/package.json dependencies (>=7.x)
 *
 *   7. frontend/src/components/employee/CameraCapture.jsx:
 *      - accepts initialPhotos prop
 *      - useEffect seeds from late-arriving initialPhotos (offline draft restore)
 *      - guarded by initialSeededRef so user-captured photos never get clobbered
 *
 *   8. frontend/src/components/employee/VisitLogger.jsx:
 *      - passes initialPhotos={photos} to CameraCapture
 *      - handles 422 SCREENSHOT_DETECTED → navigate to /bdm/comm-log
 *      - handles 400 VISIT_PHOTO_TOO_OLD / FUTURE_DATED / CAMERA_PHOTO_MISSING_EXIF
 *
 *   9. PageGuide 'new-visit' entry mentions Phase O (EXIF, screenshot, 14-day cutoff)
 *
 * Run: node backend/scripts/healthcheckPhaseOPhotoTrust.js
 * Exit code 0 = clean, 1 = issues found.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const BACKEND = path.join(ROOT, 'backend');
const FRONTEND = path.join(ROOT, 'frontend');

let issues = 0;

function warn(category, msg) {
  issues++;
  console.log(`  [${category}] ${msg}`);
}

function readSafe(filePath) {
  try { return fs.readFileSync(filePath, 'utf-8'); } catch { return null; }
}

console.log('Phase O — Visit Photo Trust + Screenshot Block Health Check');
console.log('═'.repeat(60));

// ── 1. backend/utils/photoMetadata.js ─────────────────────────────
console.log('\n1. backend/utils/photoMetadata.js — EXIF extraction + screenshot detection');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'utils', 'photoMetadata.js'));
  if (!file) {
    warn('PHOTO_META', 'backend/utils/photoMetadata.js not found');
  } else {
    if (!/require\(['"]exifr['"]\)/.test(file)) {
      warn('PHOTO_META', 'photoMetadata.js does not require exifr');
    }
    if (!/require\(['"]sharp['"]\)/.test(file)) {
      warn('PHOTO_META', 'photoMetadata.js does not require sharp');
    }
    if (!/extractMetadata\s*[=(:]/.test(file)) {
      warn('PHOTO_META', 'extractMetadata function not defined');
    }
    if (!/resolveAggregateVisitDate\s*[=(:]/.test(file)) {
      warn('PHOTO_META', 'resolveAggregateVisitDate function not defined');
    }
    if (!/daysBetween\s*[=(:]/.test(file)) {
      warn('PHOTO_META', 'daysBetween function not defined');
    }
    if (!/SCREENSHOT_ASPECT_RATIO_FLOOR/.test(file)) {
      warn('PHOTO_META', 'SCREENSHOT_ASPECT_RATIO_FLOOR constant missing');
    }
    // Phase O.1 — compressed-screenshot path floor (2.0). Without this,
    // frontend-compressed screenshots (460x1024 etc) slip through the raw
    // path because their dimensions don't match PHONE_RESOLUTIONS.
    if (!/SCREENSHOT_ASPECT_RATIO_COMPRESSED_FLOOR/.test(file)) {
      warn('PHOTO_META', 'SCREENSHOT_ASPECT_RATIO_COMPRESSED_FLOOR constant missing — compressed screenshots will slip through');
    }
    // Heuristic must combine raw + compressed paths via OR
    if (!/matchesRawScreenshot[\s\S]{0,100}\|\|[\s\S]{0,100}matchesCompressedScreenshot/.test(file)
      && !/matchesCompressedScreenshot[\s\S]{0,100}\|\|[\s\S]{0,100}matchesRawScreenshot/.test(file)) {
      warn('PHOTO_META', 'screenshot heuristic does not OR raw + compressed paths — UI bug will resurface');
    }
    if (!/PHONE_RESOLUTIONS/.test(file)) {
      warn('PHOTO_META', 'PHONE_RESOLUTIONS set missing');
    }
    // The trifecta — must AND no EXIF date AND no EXIF GPS AND screen-like dims
    if (!/!result\.exifPresent\s*&&\s*!result\.exifGpsPresent/.test(file)) {
      warn('PHOTO_META', 'screenshot heuristic missing the no-EXIF-date AND no-EXIF-GPS guard (would over-flag legit photos)');
    }
    // module.exports must include the helpers
    if (!/module\.exports\s*=\s*\{[\s\S]*extractMetadata[\s\S]*resolveAggregateVisitDate[\s\S]*daysBetween[\s\S]*\}/.test(file)) {
      warn('PHOTO_META', 'module.exports missing one of: extractMetadata, resolveAggregateVisitDate, daysBetween');
    }
  }
  if (issues === startIssues) console.log('  ✓ photoMetadata helper intact');
}

// ── 2. backend/utils/visitPhotoValidation.js ──────────────────────
console.log('\n2. backend/utils/visitPhotoValidation.js — lookup-driven thresholds');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'utils', 'visitPhotoValidation.js'));
  if (!file) {
    warn('PHOTO_RULES', 'backend/utils/visitPhotoValidation.js not found');
  } else {
    if (!/category:\s*['"]VISIT_PHOTO_VALIDATION_RULES['"]/.test(file)) {
      warn('PHOTO_RULES', "lookup query does not target category 'VISIT_PHOTO_VALIDATION_RULES'");
    }
    const requiredDefaults = [
      'late_log_max_days_old',
      'cross_week_soft_flag',
      'screenshot_block_enabled',
      'screenshot_redirect_path',
      'require_exif_for_camera_source',
    ];
    requiredDefaults.forEach((key) => {
      if (!new RegExp(`${key}\\s*:`).test(file)) {
        warn('PHOTO_RULES', `DEFAULTS missing key: ${key}`);
      }
    });
    if (!/getThresholds\s*[=(:]/.test(file)) {
      warn('PHOTO_RULES', 'getThresholds not exported');
    }
    if (!/invalidate\s*[=(:]/.test(file)) {
      warn('PHOTO_RULES', 'invalidate not exported');
    }
    if (!/_cache\.set/.test(file)) {
      warn('PHOTO_RULES', 'in-memory cache missing — every request would hit Mongo');
    }
  }
  if (issues === startIssues) console.log('  ✓ visitPhotoValidation thresholds + cache intact');
}

// ── 3. backend/middleware/upload.js processVisitPhotos ────────────
console.log('\n3. backend/middleware/upload.js — processVisitPhotos EXIF + screenshot 422');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'middleware', 'upload.js'));
  if (!file) {
    warn('UPLOAD', 'backend/middleware/upload.js not found');
  } else {
    if (!/require\(['"]\.\.\/utils\/photoMetadata['"]\)/.test(file)) {
      warn('UPLOAD', 'photoMetadata helper not imported');
    }
    if (!/require\(['"]\.\.\/utils\/visitPhotoValidation['"]\)/.test(file)) {
      warn('UPLOAD', 'visitPhotoValidation helper not imported');
    }
    // EXIF must be extracted from ORIGINAL buffer, BEFORE sharp re-encode
    if (!/extractMetadata\(file\.buffer\)/.test(file)) {
      warn('UPLOAD', 'extractMetadata must be called on file.buffer (the original, before compression)');
    }
    // Screenshot 422 contract
    if (!/code:\s*['"]SCREENSHOT_DETECTED['"]/.test(file)) {
      warn('UPLOAD', "422 response missing code: 'SCREENSHOT_DETECTED'");
    }
    if (!/res\.status\(422\)/.test(file)) {
      warn('UPLOAD', 'no 422 response in screenshot path — front-end error handler relies on status code');
    }
    if (!/redirect:\s*photoRules\.screenshot_redirect_path/.test(file)) {
      warn('UPLOAD', 'redirect payload missing — VisitLogger needs the path to navigate');
    }
    // The screenshot block must be guarded by the lookup flag
    if (!/photoRules\.screenshot_block_enabled\s*&&\s*serverMeta\.isLikelyScreenshot/.test(file)) {
      warn('UPLOAD', 'screenshot block must check screenshot_block_enabled (lookup-driven kill switch)');
    }
    // serverMeta must be attached for the controller
    if (!/serverMeta:\s*\{/.test(file)) {
      warn('UPLOAD', 'serverMeta not attached to req.uploadedPhotos[] entries — controller cannot read EXIF results');
    }
    if (!/req\.photoValidationRules\s*=\s*photoRules/.test(file)) {
      warn('UPLOAD', 'req.photoValidationRules not forwarded — controller would re-fetch lookup');
    }
  }
  if (issues === startIssues) console.log('  ✓ processVisitPhotos EXIF + screenshot 422 + req forwarding intact');
}

// ── 4. backend/controllers/visitController.js createVisit ─────────
console.log('\n4. backend/controllers/visitController.js — EXIF-derived visitDate + late-log cutoff');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'controllers', 'visitController.js'));
  if (!file) {
    warn('VISIT_CTRL', 'backend/controllers/visitController.js not found');
  } else {
    if (!/require\(['"]\.\.\/utils\/photoMetadata['"]\)/.test(file)) {
      warn('VISIT_CTRL', 'photoMetadata helper not imported');
    }
    if (!/resolveAggregateVisitDate/.test(file)) {
      warn('VISIT_CTRL', 'resolveAggregateVisitDate not used — visitDate would still be client-supplied');
    }
    if (!/daysBetween/.test(file)) {
      warn('VISIT_CTRL', 'daysBetween not used — late-log cutoff cannot fire');
    }
    if (!/code:\s*['"]VISIT_PHOTO_TOO_OLD['"]/.test(file)) {
      warn('VISIT_CTRL', "VISIT_PHOTO_TOO_OLD response code missing — late-log guard not wired");
    }
    if (!/code:\s*['"]VISIT_PHOTO_FUTURE_DATED['"]/.test(file)) {
      warn('VISIT_CTRL', "VISIT_PHOTO_FUTURE_DATED response code missing — clock-skew guard not wired");
    }
    if (!/'no_exif_timestamp'/.test(file)) {
      warn('VISIT_CTRL', "'no_exif_timestamp' flag not emitted");
    }
    if (!/'gps_in_photo'/.test(file)) {
      warn('VISIT_CTRL', "'gps_in_photo' flag not emitted");
    }
    if (!/'late_log_cross_week'/.test(file)) {
      warn('VISIT_CTRL', "'late_log_cross_week' flag not emitted");
    }
    // EXIF source check before applying the cutoff
    if (!/dateSource\s*===\s*['"]exif['"]/.test(file)) {
      warn('VISIT_CTRL', 'late-log cutoff must guard on dateSource === "exif" — fallback dates have no fraud risk');
    }
    // Phase O.1 — visitDate derivation must MERGE server EXIF + frontend
    // EXIF (parsedPhotoMeta[i].capturedAt) before passing to
    // resolveAggregateVisitDate. Frontend canvas-compression strips EXIF,
    // so server-only would be empty for in-app captures and the late-log
    // cutoff would never fire (silent fraud surface).
    if (!/mergedMetas/.test(file) || !/parsedPhotoMeta\[i\]\?\.capturedAt/.test(file)) {
      warn('VISIT_CTRL', 'visitDate derivation does not merge server EXIF + frontend EXIF — late-log cutoff would never fire post-compression');
    }
    // Phase O.1 — no_exif_timestamp flag must require BOTH server + frontend
    // EXIF to be missing. Otherwise it would fire on every visit (since
    // frontend canvas-compression always strips server-side EXIF) — pure noise.
    if (!/!sm\.exifPresent\s*&&\s*!hasFrontendExif/.test(file)) {
      warn('VISIT_CTRL', "no_exif_timestamp flag must require BOTH server-EXIF AND frontend-EXIF missing — otherwise every visit flags");
    }
    // Strict-EXIF posture early-reject (must be a for-loop, not forEach — return inside forEach is a bug)
    if (!/CAMERA_PHOTO_MISSING_EXIF/.test(file)) {
      warn('VISIT_CTRL', "CAMERA_PHOTO_MISSING_EXIF response code missing — strict-EXIF posture not wired");
    }
    if (/forEach[\s\S]{0,200}return\s+res\.status/.test(file)) {
      warn('VISIT_CTRL', 'return res.status(...) inside forEach() is a bug — forEach cannot short-circuit the parent function');
    }
  }
  if (issues === startIssues) console.log('  ✓ createVisit EXIF-derived visitDate + late-log + flags wired');
}

// ── 5. lookupGenericController SEED_DEFAULTS ──────────────────────
console.log('\n5. backend/erp/controllers/lookupGenericController.js — PHOTO_FLAG + VISIT_PHOTO_VALIDATION_RULES');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'erp', 'controllers', 'lookupGenericController.js'));
  if (!file) {
    warn('LOOKUP', 'backend/erp/controllers/lookupGenericController.js not found');
  } else {
    // PHOTO_FLAG must include the 3 new codes
    const newPhotoFlags = ['no_exif_timestamp', 'gps_in_photo', 'late_log_cross_week'];
    newPhotoFlags.forEach((flag) => {
      if (!new RegExp(`PHOTO_FLAG[\\s\\S]{0,500}'${flag}'`).test(file)) {
        warn('LOOKUP', `PHOTO_FLAG seed missing new code: '${flag}'`);
      }
    });
    // VISIT_PHOTO_VALIDATION_RULES seeded with all 5 metadata keys + insert_only_metadata
    if (!/VISIT_PHOTO_VALIDATION_RULES:\s*\[/.test(file)) {
      warn('LOOKUP', 'VISIT_PHOTO_VALIDATION_RULES not seeded in SEED_DEFAULTS');
    } else {
      // Locate the array body — match up to the closing ]
      const seedMatch = file.match(/VISIT_PHOTO_VALIDATION_RULES:\s*\[[\s\S]*?\]/);
      if (seedMatch) {
        const body = seedMatch[0];
        if (!/insert_only_metadata:\s*true/.test(body)) {
          warn('LOOKUP', 'VISIT_PHOTO_VALIDATION_RULES seed missing insert_only_metadata: true (admin tweaks would be overwritten on re-seed)');
        }
        const requiredKeys = [
          'late_log_max_days_old',
          'cross_week_soft_flag',
          'screenshot_block_enabled',
          'screenshot_redirect_path',
          'require_exif_for_camera_source',
        ];
        requiredKeys.forEach((key) => {
          if (!new RegExp(key).test(body)) {
            warn('LOOKUP', `VISIT_PHOTO_VALIDATION_RULES seed metadata missing key: ${key}`);
          }
        });
      }
    }
  }
  if (issues === startIssues) console.log('  ✓ Lookup seeds extended with Phase O flags + thresholds');
}

// ── 6. backend/package.json includes exifr ────────────────────────
console.log('\n6. backend/package.json — exifr dependency');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'package.json'));
  if (!file) {
    warn('DEPS', 'backend/package.json not found');
  } else {
    if (!/"exifr":\s*"[^"]*"/.test(file)) {
      warn('DEPS', 'exifr not listed in dependencies — npm install needed');
    } else {
      // Soft check on version; minor flexibility is fine
      const m = file.match(/"exifr":\s*"\^?([0-9]+)/);
      if (!m || Number(m[1]) < 7) {
        warn('DEPS', 'exifr version below 7.x — gps option API differs in older versions');
      }
    }
  }
  if (issues === startIssues) console.log('  ✓ exifr ^7 dependency present');
}

// ── 7. CameraCapture initialPhotos ────────────────────────────────
console.log('\n7. frontend/src/components/employee/CameraCapture.jsx — initialPhotos restoration');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(FRONTEND, 'src', 'components', 'employee', 'CameraCapture.jsx'));
  if (!file) {
    warn('CAMERA', 'CameraCapture.jsx not found');
  } else {
    if (!/initialPhotos/.test(file)) {
      warn('CAMERA', 'initialPhotos prop not declared — restored draft photos cannot show in the UI');
    }
    if (!/initialSeededRef/.test(file)) {
      warn('CAMERA', 'initialSeededRef guard missing — user-captured photos could be clobbered when initialPhotos arrives late');
    }
    if (!/photos\.length\s*===\s*0[\s\S]{0,200}initialPhotos/.test(file)
      && !/initialPhotos[\s\S]{0,200}photos\.length\s*===\s*0/.test(file)
      && !/photos\.length\s*>\s*0[\s\S]{0,200}initialSeededRef\.current\s*=\s*true/.test(file)) {
      warn('CAMERA', 'photos.length === 0 guard not present in initialPhotos seed effect — could overwrite captured photos');
    }
  }
  if (issues === startIssues) console.log('  ✓ CameraCapture initialPhotos seed + guard wired');
}

// ── 8. VisitLogger — passes initialPhotos + handles 422/400 codes ─
console.log('\n8. frontend/src/components/employee/VisitLogger.jsx — initialPhotos + Phase O error codes');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(FRONTEND, 'src', 'components', 'employee', 'VisitLogger.jsx'));
  if (!file) {
    warn('VISIT_LOGGER', 'VisitLogger.jsx not found');
  } else {
    if (!/initialPhotos\s*=\s*\{photos\}/.test(file)) {
      warn('VISIT_LOGGER', 'CameraCapture is not receiving initialPhotos={photos} — restored drafts will not display');
    }
    if (!/SCREENSHOT_DETECTED/.test(file)) {
      warn('VISIT_LOGGER', 'SCREENSHOT_DETECTED handler missing — 422 from server would surface as generic error');
    }
    if (!/VISIT_PHOTO_TOO_OLD/.test(file)) {
      warn('VISIT_LOGGER', 'VISIT_PHOTO_TOO_OLD handler missing — late-log error message would be generic');
    }
    if (!/VISIT_PHOTO_FUTURE_DATED/.test(file)) {
      warn('VISIT_LOGGER', 'VISIT_PHOTO_FUTURE_DATED handler missing — clock-skew error would be generic');
    }
    if (!/CAMERA_PHOTO_MISSING_EXIF/.test(file)) {
      warn('VISIT_LOGGER', 'CAMERA_PHOTO_MISSING_EXIF handler missing — strict-EXIF rejection would be generic');
    }
    // The screenshot redirect must include doctorId so CommLog pre-selects
    if (!/doctorId=\$\{doctor\._id\}/.test(file)) {
      warn('VISIT_LOGGER', 'screenshot redirect does not include doctorId — BDM would have to re-pick on Comm Log');
    }
  }
  if (issues === startIssues) console.log('  ✓ VisitLogger forwards initialPhotos + handles all 4 Phase O error codes');
}

// ── 9b. SMER bridge per-diem flag whitelist (downstream regression fix) ──
// Phase O introduces 3 NEW signal flags carried by legitimate visits. The pre-
// Phase-O bridge would have treated those as disqualifying and silently killed
// per-diem for every BDM using the in-app camera. This check asserts the fix
// (PERDIEM_DISQUALIFYING_FLAGS constant + $setIntersection in aggregation)
// stays in place — without it, Phase O ships a regression.
console.log('\n9b. backend/erp/services/smerCrmBridge.js — per-diem flag whitelist (Phase O regression guard)');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(BACKEND, 'erp', 'services', 'smerCrmBridge.js'));
  if (!file) {
    warn('SMER_BRIDGE', 'smerCrmBridge.js not found');
  } else {
    if (!/PERDIEM_DISQUALIFYING_FLAGS\s*=\s*\[/.test(file)) {
      warn('SMER_BRIDGE', 'PERDIEM_DISQUALIFYING_FLAGS constant missing — bridge would still treat any flag as disqualifying');
    }
    // The constant must include date_mismatch + duplicate_photo (the only
    // true fraud flags). It must NOT include the new Phase O signal flags.
    if (!/PERDIEM_DISQUALIFYING_FLAGS[\s\S]{0,200}'date_mismatch'/.test(file)) {
      warn('SMER_BRIDGE', "PERDIEM_DISQUALIFYING_FLAGS missing 'date_mismatch'");
    }
    if (!/PERDIEM_DISQUALIFYING_FLAGS[\s\S]{0,200}'duplicate_photo'/.test(file)) {
      warn('SMER_BRIDGE', "PERDIEM_DISQUALIFYING_FLAGS missing 'duplicate_photo'");
    }
    // Negative — Phase O signal flags must NOT be in the disqualifying list
    const phaseOSignalFlags = ['no_exif_timestamp', 'gps_in_photo', 'late_log_cross_week'];
    phaseOSignalFlags.forEach((flag) => {
      if (new RegExp(`PERDIEM_DISQUALIFYING_FLAGS[\\s\\S]{0,200}'${flag}'`).test(file)) {
        warn('SMER_BRIDGE', `Phase O signal flag '${flag}' must NOT be in PERDIEM_DISQUALIFYING_FLAGS — it would kill per-diem for legit visits`);
      }
    });
    // Aggregation must use $setIntersection, not the old $size === 0 against the raw photoFlags array
    if (!/\$setIntersection[\s\S]{0,200}PERDIEM_DISQUALIFYING_FLAGS/.test(file)) {
      warn('SMER_BRIDGE', 'aggregation pipeline does not use $setIntersection against PERDIEM_DISQUALIFYING_FLAGS');
    }
  }
  if (issues === startIssues) console.log('  ✓ SMER bridge whitelists fraud flags only (no_exif/gps_in_photo/late_log_cross_week stay countable)');
}

// ── 9. PageGuide 'new-visit' mentions Phase O ─────────────────────
console.log('\n9. frontend/src/components/common/PageGuide.jsx — new-visit banner mentions Phase O');
console.log('─'.repeat(60));
{
  const startIssues = issues;
  const file = readSafe(path.join(FRONTEND, 'src', 'components', 'common', 'PageGuide.jsx'));
  if (!file) {
    warn('BANNER', 'PageGuide.jsx not found');
  } else {
    // PageGuide banner must mention the screenshot redirect AND the 14-day cutoff AND EXIF
    const hasScreenshotMention = /screenshot/i.test(file);
    const hasExifMention = /EXIF/i.test(file);
    const has14DayMention = /14 days|14d/i.test(file);
    if (!hasScreenshotMention) {
      warn('BANNER', "'new-visit' banner does not mention screenshots being redirected to Comm Log");
    }
    if (!hasExifMention) {
      warn('BANNER', "'new-visit' banner does not mention EXIF / server-reads-photo-timestamp behavior");
    }
    if (!has14DayMention) {
      warn('BANNER', "'new-visit' banner does not mention the 14-day late-log cutoff");
    }
  }
  if (issues === startIssues) console.log('  ✓ PageGuide new-visit banner reflects Phase O (Rule #1)');
}

console.log('\n' + '═'.repeat(60));
if (issues > 0) {
  console.log(`✗ ${issues} issue(s) found. Phase O contract has drifted.`);
  process.exit(1);
} else {
  console.log('✓ Phase O — Visit Photo Trust contract intact end-to-end.');
  process.exit(0);
}

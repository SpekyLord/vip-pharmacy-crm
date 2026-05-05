/**
 * Photo Metadata Helper — Phase O (May 2026).
 *
 * Server-side EXIF extraction + screenshot detection for the Visit fraud
 * surface. The frontend already extracts EXIF in CameraCapture.jsx via
 * exifr and passes the result in `meta.capturedAt`, but the server CANNOT
 * trust client-supplied data — a hostile client posts whatever timestamp
 * it wants. This helper re-parses EXIF on the server from the actual photo
 * bytes so `photos[].capturedAt` and `visitDate` derivation are anchored
 * to the file itself.
 *
 * Two outputs per photo:
 *   - extractMetadata(buffer)       → { capturedAt, gps, dimensions, isLikelyScreenshot }
 *   - resolveAggregateVisitDate(metas, fallbackDate)
 *       Picks the earliest EXIF DateTimeOriginal across all photos in the
 *       upload (the visit happened when the first photo was taken). Falls
 *       back to caller-supplied date if no EXIF is present anywhere.
 *
 * Screenshot heuristic (conservative — prefer false-negative over
 * false-positive; Jake-Montero pattern shows screenshots will exist
 * regardless, the goal is to redirect them to CommLog):
 *
 *   isLikelyScreenshot = no EXIF DateTimeOriginal AND no EXIF GPS AND (
 *     (aspectRatio >= 1.85 AND matchesPhoneRes)   ← raw phone screenshot path
 *     OR aspectRatio >= 2.0                        ← compressed/unknown path
 *   )
 *
 * Two parallel signals so the heuristic survives both raw uploads AND
 * frontend-compressed uploads:
 *
 *   Raw path (raw phone screenshot, EXIF-less PNG):
 *     - no EXIF DateTimeOriginal AND no EXIF GPS lat/lng
 *     - aspect ratio >= 1.85 (filters 4:3 = 1.33 and 16:9 = 1.78 cameras)
 *     - width OR height matches a known phone resolution (1080/1170/1284/...)
 *
 *   Compressed path (added Phase O.1 May 05 2026 — UI smoke caught the gap):
 *     - no EXIF DateTimeOriginal AND no EXIF GPS lat/lng
 *     - aspect ratio >= 2.0 (more aggressive — covers 460x1024 etc)
 *     - PHONE_RESOLUTIONS check is dropped because frontend compressImage
 *       (CameraCapture.jsx → compressImage) caps at maxDim=1024, so
 *       1080x2400 → 460x1024 — neither dim matches any phone resolution
 *       even though the source clearly was a screenshot.
 *
 * Why 2.0 (not 1.85) for the compressed path: 4:3 selfies = 1.33,
 * 16:9 video frames = 1.78, even 9:18.5 portrait camera photos = 2.05.
 * Phone screens are typically 9:19.5 (~2.16) to 9:21 (~2.33). 2.0 is the
 * cleanest cutoff that catches all phone screenshots while letting wide-
 * angle landscape and portrait camera photos through.
 *
 * Sharp is already a backend dep (used for image compression in upload.js)
 * — we use sharp.metadata() for dimensions because it's faster than
 * reading EXIF for the dimension fields. exifr is a new dep, ~100KB pure
 * JS, supports JPEG / HEIC / TIFF / WebP / PNG.
 */

const exifr = require('exifr');
const sharp = require('sharp');

// Phone resolutions that strongly suggest a screenshot. Order by frequency.
// Both width AND height are checked — a portrait screenshot is e.g. 1080x2400
// (height matches), landscape is 2400x1080 (width matches).
const PHONE_RESOLUTIONS = new Set([
  720,   // older Android
  1080,  // most Android (FHD)
  1170,  // iPhone 13/14/15 standard
  1179,  // iPhone 15 Pro
  1242,  // iPhone Pro Max older (1242x2688 etc)
  1284,  // iPhone Pro Max
  1290,  // iPhone 15 Pro Max
  1440,  // QHD Android
]);

/**
 * Aspect ratio threshold above which a portrait/landscape photo starts to
 * look like a phone screen rather than a camera frame (4:3 = 1.33, 16:9 =
 * 1.78). Modern phone screens are taller — 9:19.5 = 2.16, 9:20 = 2.22.
 * Setting the floor at 1.85 catches modern screens while letting 16:9 video
 * frames + standard photos through. Used for the RAW path (must also match
 * a known phone resolution).
 */
const SCREENSHOT_ASPECT_RATIO_FLOOR = 1.85;

/**
 * More aggressive aspect floor used for the COMPRESSED path. Frontend
 * CameraCapture.compressImage caps the long side at 1024px before upload,
 * which means a 1080x2400 phone screenshot arrives as 460x1024 — neither
 * dim matches any phone resolution even though aspect (2.22) screams
 * screenshot. Compressed path drops the resolution check; 2.0 keeps the
 * false-positive rate near zero (4:3 cameras = 1.33, 16:9 = 1.78,
 * 9:18.5 cinema portrait = 2.05+ all clear of 2.0). Tuned May 05 2026
 * after a UI smoke caught a 1080x2400 PNG slipping through the raw path.
 */
const SCREENSHOT_ASPECT_RATIO_COMPRESSED_FLOOR = 2.0;

/**
 * Extract photo metadata from a raw image buffer. All fields are best-effort
 * — failures resolve to null/false so the caller can decide policy. Never
 * throws.
 *
 * @param {Buffer} buffer - raw image bytes (pre-compression)
 * @returns {Promise<{
 *   capturedAt: Date | null,
 *   gps: { latitude: number, longitude: number, altitude: number | null } | null,
 *   dimensions: { width: number, height: number } | null,
 *   isLikelyScreenshot: boolean,
 *   exifPresent: boolean,
 *   exifGpsPresent: boolean,
 * }>}
 */
async function extractMetadata(buffer) {
  const result = {
    capturedAt: null,
    gps: null,
    dimensions: null,
    isLikelyScreenshot: false,
    exifPresent: false,
    exifGpsPresent: false,
  };

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    return result;
  }

  // ── EXIF (timestamp + GPS) ──────────────────────────────────────────
  try {
    const exif = await exifr.parse(buffer, {
      pick: ['DateTimeOriginal', 'CreateDate', 'GPSLatitude', 'GPSLongitude', 'GPSAltitude'],
      gps: true,
      tiff: true,
      ifd0: true,
      exif: true,
    });
    if (exif) {
      // exifr normalizes DateTimeOriginal to a JS Date; CreateDate is the
      // fallback some apps use (ImageMagick, certain HEIC re-encoders).
      const ts = exif.DateTimeOriginal || exif.CreateDate;
      if (ts instanceof Date && !Number.isNaN(ts.getTime())) {
        result.capturedAt = ts;
        result.exifPresent = true;
      }
      // exifr returns `latitude` / `longitude` (lowercase, decimal degrees)
      // when gps:true is set — the GPSLatitude/GPSLongitude raw fields are
      // {ref, deg, min, sec} tuples that we don't want to recompute.
      if (Number.isFinite(exif.latitude) && Number.isFinite(exif.longitude)) {
        result.gps = {
          latitude: exif.latitude,
          longitude: exif.longitude,
          altitude: Number.isFinite(exif.GPSAltitude) ? exif.GPSAltitude : null,
        };
        result.exifGpsPresent = true;
        // Stripped-EXIF photos can have a date but no GPS (or vice versa);
        // exifPresent stays true if either signal is present.
        result.exifPresent = true;
      }
    }
  } catch (err) {
    // EXIF parse failures are non-fatal — fall through to dimensions check.
    // Common cause: PNG / WebP without metadata blocks.
  }

  // ── Dimensions (via sharp — fast, doesn't decode pixel data) ────────
  try {
    const meta = await sharp(buffer).metadata();
    if (meta.width && meta.height) {
      result.dimensions = { width: meta.width, height: meta.height };
    }
  } catch (err) {
    // Sharp failure is rare — maybe an unsupported format slipped through.
    // Without dimensions we can't run the screenshot check; return defaults.
    return result;
  }

  // ── Screenshot heuristic ────────────────────────────────────────────
  // Two parallel signals (raw OR compressed). See header comment for rationale.
  if (result.dimensions && !result.exifPresent && !result.exifGpsPresent) {
    const { width, height } = result.dimensions;
    const longSide = Math.max(width, height);
    const shortSide = Math.min(width, height);
    const aspectRatio = longSide / shortSide;
    const matchesPhoneRes = PHONE_RESOLUTIONS.has(width) || PHONE_RESOLUTIONS.has(height);

    const matchesRawScreenshot = aspectRatio >= SCREENSHOT_ASPECT_RATIO_FLOOR && matchesPhoneRes;
    const matchesCompressedScreenshot = aspectRatio >= SCREENSHOT_ASPECT_RATIO_COMPRESSED_FLOOR;

    if (matchesRawScreenshot || matchesCompressedScreenshot) {
      result.isLikelyScreenshot = true;
    }
  }

  return result;
}

/**
 * Pick the canonical visit date from an array of photo metadata objects.
 * Strategy: earliest EXIF DateTimeOriginal across the upload set. If no
 * photo carries EXIF, fall back to caller-supplied date (typically the
 * BDM's submit time). This makes Visit.visitDate a function of the actual
 * photo file, not the BDM's claim.
 *
 * @param {Array<{capturedAt: Date | null}>} metas - metadata.extractMetadata results
 * @param {Date} fallbackDate - used when no metas carry EXIF capturedAt
 * @returns {{ visitDate: Date, source: 'exif' | 'fallback' }}
 */
function resolveAggregateVisitDate(metas, fallbackDate) {
  const fb = fallbackDate instanceof Date && !Number.isNaN(fallbackDate.getTime())
    ? fallbackDate
    : new Date();

  if (!Array.isArray(metas) || metas.length === 0) {
    return { visitDate: fb, source: 'fallback' };
  }

  const exifDates = metas
    .map((m) => m?.capturedAt)
    .filter((d) => d instanceof Date && !Number.isNaN(d.getTime()));

  if (exifDates.length === 0) {
    return { visitDate: fb, source: 'fallback' };
  }

  // Earliest = first photo of the visit. Sorting is fine on small N (≤10).
  exifDates.sort((a, b) => a.getTime() - b.getTime());
  return { visitDate: exifDates[0], source: 'exif' };
}

/**
 * Days between two dates (positive = `later` is after `earlier`).
 * Used by the late-log policy at the controller boundary.
 */
function daysBetween(earlier, later) {
  if (!(earlier instanceof Date) || !(later instanceof Date)) return 0;
  const ms = later.getTime() - earlier.getTime();
  return ms / 86_400_000;
}

module.exports = {
  extractMetadata,
  resolveAggregateVisitDate,
  daysBetween,
  // Exposed for the healthcheck script — the screenshot heuristic is
  // tightly coupled to these constants and the contract verifier asserts
  // they exist.
  PHONE_RESOLUTIONS,
  SCREENSHOT_ASPECT_RATIO_FLOOR,
  SCREENSHOT_ASPECT_RATIO_COMPRESSED_FLOOR,
};

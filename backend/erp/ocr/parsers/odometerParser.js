/**
 * Odometer Parser — tuned for GPS Map Camera dashboard photos
 *
 * Real OCR text example:
 *   "100 120 80 140 160 180 200 20 20 60 40 733 ODO 855 75 km 220 km/h E
 *    ODO/TRIP DISP GPS Map Camera ... Lat 8.393593° Long 124.60959°
 *    Thursday, 26/03/2026 07:33 AM GMT +08:00"
 *
 * The actual odometer reading is near "ODO" label: "855 75" = 85575 (or 85675)
 * Must ignore: speedometer markings (20,40,60,80,100,120,140,160,180,200,220),
 *              GPS coordinates (8.393593, 124.60959), time (07:33)
 */

const {
  scoredField,
  getWordConfidencesForText,
} = require('../confidenceScorer');

// Speedometer markings to ignore
const SPEEDO_NUMBERS = new Set([0, 20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260]);

function parseOdometer(ocrResult, options = {}) {
  const { fullText, words = [] } = ocrResult;
  const validationFlags = [];

  let reading = null;
  let date = null;

  // Strategy 1: Find "ODO" or "TOTAL" label and extract the number near it
  // Car: "ODO 855 75" → 85575
  // Motorcycle: "TOTAL 26087 km"
  const odoMatch = fullText.toUpperCase().match(/\b(ODO|TOTAL)\b/);
  const odoIdx = odoMatch ? fullText.toUpperCase().indexOf(odoMatch[0]) : -1;
  if (odoIdx >= 0) {
    // Get text around ODO (±50 chars)
    const start = Math.max(0, odoIdx - 10);
    const end = Math.min(fullText.length, odoIdx + 60);
    const odoRegion = fullText.substring(start, end);

    // Find digit sequences near ODO, concatenate adjacent ones
    const labelLen = odoMatch[0].length;
    const afterOdo = odoRegion.substring(odoRegion.toUpperCase().indexOf(odoMatch[0]) + labelLen);
    const digitGroups = afterOdo.match(/\d+/g) || [];

    // Filter out speedo numbers and small numbers
    const candidates = digitGroups.filter(d => {
      const n = parseInt(d, 10);
      return !SPEEDO_NUMBERS.has(n) && n > 0;
    });

    if (candidates.length >= 2) {
      // Try concatenating first two groups: "855" + "75" = "85575"
      const concat = candidates[0] + candidates[1];
      const concatNum = parseInt(concat, 10);
      if (concatNum >= 10000 && concatNum <= 999999) {
        reading = concatNum;
      } else {
        // Use the largest single number
        reading = Math.max(...candidates.map(c => parseInt(c, 10)));
      }
    } else if (candidates.length === 1) {
      reading = parseInt(candidates[0], 10);
    }
  }

  // Strategy 2: If no ODO label found, look for 5-6 digit numbers
  // Ignore GPS coords, speedo markings, and years
  if (reading == null) {
    const allNums = [];
    for (const w of words) {
      const cleaned = (w.text || '').replace(/[,.\s]/g, '');
      if (/^\d{5,6}$/.test(cleaned)) {
        const n = parseInt(cleaned, 10);
        if (n >= 10000 && n <= 999999) allNums.push(n);
      }
    }
    if (allNums.length > 0) {
      // Prefer the largest 5-6 digit number (most likely the odometer)
      reading = Math.max(...allNums);
    }
  }

  // Extract date — look for date patterns in the text
  // GPS Map Camera format: "26/03/2026" or "Thursday, 26/03/2026 07:33 AM"
  const dateMatch = fullText.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{4})/);
  if (dateMatch) {
    date = dateMatch[1];
  }

  // Fallback: use EXIF datetime from photo metadata (works offline)
  if (!date && options.exifDateTime) {
    // EXIF format: "2026-03-26T07:33:00" → extract date part
    const exifDate = options.exifDateTime.split('T')[0];
    if (exifDate) {
      const [y, m, d] = exifDate.split('-');
      date = `${d}/${m}/${y}`;  // DD/MM/YYYY format
    }
  }

  if (reading == null) {
    validationFlags.push({
      type: 'NO_READING',
      message: 'Could not detect odometer reading — enter manually',
    });
  }

  return {
    reading: scoredField(reading, getWordConfidencesForText(words, String(reading || '')), reading != null),
    date: scoredField(date, getWordConfidencesForText(words, date), !!date),
    photo_timestamp: options.exifDateTime || null,
    validation_flags: validationFlags,
  };
}

module.exports = { parseOdometer };

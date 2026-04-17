/**
 * CSI (Charge Sales Invoice) Parser — v4 (9-sample tuned)
 *
 * Handles VIP Inc. and MG AND CO. invoices, printed and handwritten.
 * Tested against 9 real OCR samples covering:
 *   - 1-product and 3-product invoices
 *   - VIP format ("Invoice N", "CHARGE TO:") and MG format ("No.", "Charged to")
 *   - Printed and handwritten (ALL CAPS, garbled text)
 *   - Pharma products with (generic) and non-pharma items (gloves, masks)
 *   - Numbers on same line, separate lines, or in separate column block
 *   - Dash-decimal "720-00", dot-thousands "2.571.43", paren "14,801)"
 */

const {
  scoreField,
  getWordConfidencesForText,
  splitLines,
} = require('../confidenceScorer');

const {
  normalizeWords,
  detectCSIZones,
  findLandmark,
  findWordsInRect,
  buildSpatialLines,
  getLineIndicesInZone,
} = require('../spatialUtils');
const sharp = require('sharp');
const { detectText } = require('../visionClient');

// ═══════════════════════════════════════════════════════════
// AMOUNT PARSER
// ═══════════════════════════════════════════════════════════

function parseAmount(str) {
  if (!str) return null;
  let cleaned = String(str)
    .replace(/[₱P£#\s]/g, '')
    .replace(/[()]/g, '')
    .trim();
  if (!cleaned) return null;

  // Dash-decimal: "720-00" → "720.00", "3,857-14" → "3857.14"
  const dashMatch = cleaned.match(/^([\d.,]+)-(\d{1,2})$/);
  if (dashMatch) {
    cleaned = dashMatch[1].replace(/[.,]/g, '') + '.' + dashMatch[2];
    return parseFloat(cleaned) || null;
  }

  // Multiple dots = thousands: "2.571.43" → "2571.43", "27.000-00" handled above
  const dotCount = (cleaned.match(/\./g) || []).length;
  if (dotCount > 1) {
    const lastDot = cleaned.lastIndexOf('.');
    cleaned = cleaned.substring(0, lastDot).replace(/\./g, '') + '.' + cleaned.substring(lastDot + 1);
  } else {
    cleaned = cleaned.replace(/,/g, '');
  }

  cleaned = cleaned.replace(/,$/, '');
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function extractNumbers(line) {
  const nums = [];
  const re = /([\d][.\d,]*\d(?:-\d{1,2})?)/g;
  let m;
  while ((m = re.exec(line)) !== null) {
    const n = parseAmount(m[1]);
    if (n != null && n > 0) nums.push(n);
  }
  return nums;
}

function isBirLine(line) {
  return /BIR|Auth.*Print|Accreditation|FISHERMAN|AGREEMENT|Printer|Prop\.|Arevalo|PDalisay|Dalisay|Jalandoni|Pacifico|VALID.*CLAIM|DOCUMENT.*NOT|CamScanner/i.test(line);
}

function isSkipLine(line) {
  const t = line.trim();
  return /^(Item\s*Desc|Quantity|Unit\s*Cost|Price$|^Amount$|NOTE|CHARGE\s*SALES|VATable|VAT-Exempt|VAT\s*Amount|Zero-Rated|SC\/PWD|Solo\s*Parent|OSCA|Received\s*the|Cashier|Authorized|AGREEMENT|ARTICLES$|^U\/P$|^Qty$|^Unit$)/i.test(t);
}

function normalizeDigitString(value) {
  return String(value || '')
    .replace(/[Oo]/g, '0')
    .replace(/[Il|]/g, '1')
    .replace(/[^\d]/g, '');
}

function fixPartialYear(value) {
  if (!value) return value;
  return String(value)
    .replace(/\b(\d{3})\s*$/, (_, yr) => '2' + yr)
    .replace(/(\b\d{1,2}[\/\-\.]\d{1,2}[\/\-\.])(\d{2})\b/, (_, prefix, yr) => `${prefix}20${yr}`)
    .replace(/(,\s*)(\d{2})\b/, (_, sep, yr) => `${sep}20${yr}`)
    .replace(/(\b[A-Z][a-z]+\.?\s+\d{1,2},?\s+)(\d{2})\b/i, (_, prefix, yr) => `${prefix}20${yr}`);
}

function extractYearFromDate(value) {
  if (!value) return null;
  const match = String(value).match(/\b(20\d{2})\b/);
  return match ? match[1] : null;
}

function isLikelyDateYearFragment(invoiceNo, date) {
  if (!invoiceNo || !date) return false;
  const digits = normalizeDigitString(invoiceNo);
  const year = extractYearFromDate(date);
  if (!digits || !year) return false;
  return digits.length <= year.length && year.endsWith(digits);
}

function extractDateFromText(text) {
  if (!text) return null;

  const monthPattern = '(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
  const monthRe = new RegExp(`(${monthPattern}\\.?\\s+\\d{1,2},?\\s*\\d{2,4})`, 'i');
  const numericRe = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/;
  const raw = String(text).replace(/\s+/g, ' ').trim();

  const monthMatch = raw.match(monthRe);
  if (monthMatch) return fixPartialYear(monthMatch[1].trim());

  const numericMatch = raw.match(numericRe);
  if (numericMatch) return fixPartialYear(numericMatch[1].trim());

  const handwrittenMatch = raw.match(/Date\s*[:;]?\s*([A-Z]+\s+\d[\d,\s]*)/i);
  if (handwrittenMatch) return fixPartialYear(handwrittenMatch[1].replace(/\s+/g, ' ').trim());

  return null;
}

function findHeaderLabelWord(nWords, regex, { xMin = 0, yMax = 0.45 } = {}) {
  const candidates = nWords
    .filter((w) => {
      const text = String(w.text || '').trim();
      return regex.test(text) && w.cx >= xMin && w.cy <= yMax;
    })
    .sort((a, b) => a.cy - b.cy || b.cx - a.cx);

  return candidates[0] || null;
}

function extractInvoiceNoSpatial(nWords) {
  if (!nWords?.length) return null;

  const noWord =
    findHeaderLabelWord(nWords, /^No\.?$/i, { xMin: 0.55, yMax: 0.45 }) ||
    findHeaderLabelWord(nWords, /^No\.?$/i, { yMax: 0.45 }) ||
    findLandmark(nWords, /\bNo\.?\b/i)?.words?.[0];

  if (!noWord) return null;

  const dateWord =
    findHeaderLabelWord(nWords, /^Date$/i, { xMin: 0.55, yMax: 0.5 }) ||
    findHeaderLabelWord(nWords, /^Date$/i, { yMax: 0.5 });

  const candidateRegion = {
    xMin: Math.min(0.98, noWord.cx + 0.02),
    xMax: 0.98,
    yMin: Math.max(0, noWord.yMin - 0.02),
    yMax: Math.min(
      1,
      dateWord ? Math.max(noWord.yMax + 0.05, dateWord.yMax + 0.03) : noWord.yMax + 0.08
    ),
  };

  const numericCandidates = findWordsInRect(nWords, candidateRegion)
    .filter((w) => !/^Date$/i.test(String(w.text || '').trim()))
    .map((w) => {
      const digits = normalizeDigitString(w.text);
      const numericValue = parseInt(digits, 10);
      return { word: w, digits, numericValue };
    })
    .filter(({ digits, numericValue }) =>
      digits.length >= 3 &&
      digits.length <= 6 &&
      !(numericValue >= 2020 && numericValue <= 2040)
    )
    .map((candidate) => {
      const dx = Math.abs(candidate.word.cx - noWord.cx);
      const dy = Math.abs(candidate.word.cy - noWord.cy);
      const onNoLine = dy <= 0.03 ? 1 : 0;
      const onDateLine = dateWord && Math.abs(candidate.word.cy - dateWord.cy) <= 0.025 ? 1 : 0;
      const score = (onNoLine * 100) - (onDateLine * 60) - (dx * 160) - (dy * 120);
      return { ...candidate, score, dx, dy, onDateLine };
    })
    .sort((a, b) => b.score - a.score || a.dx - b.dx || a.dy - b.dy);

  if (numericCandidates.length > 0) {
    return numericCandidates[0].digits;
  }

  const regionText = findWordsInRect(nWords, candidateRegion).map((w) => w.text).join(' ');
  const fallbackMatch = regionText.match(/\b(\d{3,6})\b/);
  if (!fallbackMatch) return null;

  const fallbackValue = parseInt(fallbackMatch[1], 10);
  return fallbackValue >= 2020 && fallbackValue <= 2040 ? null : fallbackMatch[1];
}

function extractDateSpatial(nWords) {
  if (!nWords?.length) return null;

  const dateWord =
    findHeaderLabelWord(nWords, /^Date$/i, { xMin: 0.5, yMax: 0.5 }) ||
    findHeaderLabelWord(nWords, /^Date$/i, { yMax: 0.5 });

  if (!dateWord) return null;

  const primaryRegion = {
    xMin: Math.min(0.98, dateWord.cx + 0.02),
    xMax: 0.98,
    yMin: Math.max(0, dateWord.yMin - 0.02),
    yMax: Math.min(1, dateWord.yMax + 0.03),
  };

  const primaryText = buildSpatialLines(findWordsInRect(nWords, primaryRegion), null, 0.012)
    .map((line) => line.text)
    .join(' ');

  const primaryDate = extractDateFromText(primaryText);
  if (primaryDate) return primaryDate;

  const widerRegion = {
    xMin: 0.58,
    xMax: 0.98,
    yMin: Math.max(0, dateWord.yMin - 0.02),
    yMax: Math.min(1, dateWord.yMax + 0.05),
  };

  const widerText = buildSpatialLines(findWordsInRect(nWords, widerRegion), null, 0.012)
    .map((line) => line.text)
    .join(' ');

  return extractDateFromText(widerText);
}

function clampCropBox(metadata, region) {
  const left = Math.max(0, Math.min(metadata.width - 1, Math.floor(region.left)));
  const top = Math.max(0, Math.min(metadata.height - 1, Math.floor(region.top)));
  const width = Math.max(1, Math.min(metadata.width - left, Math.floor(region.width)));
  const height = Math.max(1, Math.min(metadata.height - top, Math.floor(region.height)));
  return { left, top, width, height };
}

function extractInvoiceNoFromCropLines(lines) {
  for (const line of lines) {
    const sameLine = line.match(/No\.?\s*[:.]?\s*(\d{3,6})/i);
    if (sameLine) return sameLine[1];
  }

  const joined = lines.join(' ');
  const inline = joined.match(/No\.?\s*[:.]?\s*(\d{3,6})/i);
  if (inline) return inline[1];

  for (let i = 0; i < lines.length; i++) {
    if (/^No\.?$/i.test(lines[i].trim()) && i + 1 < lines.length) {
      const next = lines[i + 1].trim().match(/^(\d{3,6})$/);
      if (next) return next[1];
    }
  }

  return null;
}

function extractDigitsFromFocusedCrop(lines) {
  for (const line of lines) {
    const digits = normalizeDigitString(line);
    if (digits.length >= 3 && digits.length <= 6) return digits;
  }

  const joinedDigits = normalizeDigitString(lines.join(' '));
  if (joinedDigits.length >= 3 && joinedDigits.length <= 6) return joinedDigits;
  return null;
}

async function detectTextFromCrop(baseImage, metadata, region, options = {}) {
  const cropBox = clampCropBox(metadata, region);
  let pipeline = baseImage.clone().extract(cropBox).grayscale().normalize();

  if (options.threshold != null) {
    pipeline = pipeline.threshold(options.threshold);
  }
  if (options.sharpen !== false) {
    pipeline = pipeline.sharpen();
  }

  const resizeMultiplier = options.resizeMultiplier || 3;
  const minWidth = options.minWidth || 1000;
  pipeline = pipeline.resize({
    width: Math.max(minWidth, Math.floor(cropBox.width * resizeMultiplier)),
    withoutEnlargement: false,
  });

  const cropBuffer = await pipeline.png().toBuffer();
  const cropOcr = await detectText(cropBuffer, { feature: 'TEXT_DETECTION' });

  return {
    cropBox,
    ocr: cropOcr,
    lines: splitLines(cropOcr.fullText),
  };
}

async function extractInvoiceNoFromHeaderCrop(imageBuffer) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) return null;

  try {
    const baseImage = sharp(imageBuffer, { failOn: 'none' }).rotate();
    const metadata = await baseImage.metadata();
    if (!metadata.width || !metadata.height) return null;

    const headerCrop = await detectTextFromCrop(baseImage, metadata, {
      left: metadata.width * 0.58,
      top: metadata.height * 0.08,
      width: metadata.width * 0.37,
      height: metadata.height * 0.20,
    }, {
      resizeMultiplier: 3,
      minWidth: 1200,
    });

    console.log('[CSI] header crop lines:', headerCrop.lines.slice(0, 10));

    const lineInvoiceNo = extractInvoiceNoFromCropLines(headerCrop.lines);
    if (lineInvoiceNo) {
      console.log('[CSI] invoiceNo via header crop line parse:', lineInvoiceNo);
    }

    const cropWords = normalizeWords(headerCrop.ocr.words || [], headerCrop.ocr.fullTextAnnotation);
    const spatialInvoiceNo = extractInvoiceNoSpatial(cropWords);
    if (spatialInvoiceNo) {
      console.log('[CSI] invoiceNo via header crop spatial parse:', spatialInvoiceNo);
    }

    const focusedCrop = await detectTextFromCrop(baseImage, metadata, {
      left: metadata.width * 0.73,
      top: metadata.height * 0.145,
      width: metadata.width * 0.17,
      height: metadata.height * 0.075,
    }, {
      threshold: 180,
      resizeMultiplier: 4,
      minWidth: 900,
    });

    console.log('[CSI] invoice value crop lines:', focusedCrop.lines.slice(0, 10));

    const focusedInvoiceNo = extractDigitsFromFocusedCrop(focusedCrop.lines);
    if (focusedInvoiceNo) {
      console.log('[CSI] invoiceNo via focused crop parse:', focusedInvoiceNo);
      return focusedInvoiceNo;
    }

    if (lineInvoiceNo) {
      return lineInvoiceNo;
    }
    if (spatialInvoiceNo) {
      return spatialInvoiceNo;
    }

    return null;
  } catch (error) {
    console.log('[CSI] header crop OCR failed:', error.message);
    return null;
  }
}

const CSI_LAYOUTS = {
  MG_HANDWRITTEN: 'MG_HANDWRITTEN',
  VIP_WHITE: 'VIP_WHITE',
  VIP_YELLOW: 'VIP_YELLOW',
  THIRD_PARTY_GENERIC: 'THIRD_PARTY_GENERIC',
  UNKNOWN: 'UNKNOWN',
};

const CSI_LAYOUT_CONFIG = {
  [CSI_LAYOUTS.MG_HANDWRITTEN]: {
    headerRight: { left: 0.58, top: 0.08, width: 0.37, height: 0.20 },
    invoiceValue: { left: 0.72, top: 0.14, width: 0.18, height: 0.06 },
    dateValue: { left: 0.66, top: 0.175, width: 0.25, height: 0.05 },
    headerLeft: { left: 0.02, top: 0.16, width: 0.62, height: 0.18 },
  },
  [CSI_LAYOUTS.VIP_WHITE]: {
    headerRight: { left: 0.62, top: 0.04, width: 0.33, height: 0.19 },
    invoiceValue: { left: 0.77, top: 0.055, width: 0.16, height: 0.06 },
    dateValue: { left: 0.74, top: 0.12, width: 0.21, height: 0.06 },
    headerLeft: { left: 0.03, top: 0.12, width: 0.68, height: 0.17 },
  },
  [CSI_LAYOUTS.VIP_YELLOW]: {
    headerRight: { left: 0.62, top: 0.04, width: 0.33, height: 0.19 },
    invoiceValue: { left: 0.77, top: 0.055, width: 0.16, height: 0.06 },
    dateValue: { left: 0.74, top: 0.12, width: 0.21, height: 0.06 },
    headerLeft: { left: 0.03, top: 0.12, width: 0.68, height: 0.17 },
  },
  [CSI_LAYOUTS.THIRD_PARTY_GENERIC]: {
    headerRight: { left: 0.56, top: 0.08, width: 0.38, height: 0.22 },
    invoiceValue: { left: 0.70, top: 0.10, width: 0.20, height: 0.08 },
    dateValue: { left: 0.65, top: 0.15, width: 0.25, height: 0.07 },
    headerLeft: { left: 0.03, top: 0.16, width: 0.65, height: 0.20 },
  },
};

function makeCsiField(value, source, { words = [], confidenceWords = null, regexMatched = false, confidenceOverride = null } = {}) {
  const confidence = confidenceOverride || scoreField(
    value,
    getWordConfidencesForText(confidenceWords || words, String(value ?? '')),
    regexMatched
  );

  return {
    value: value ?? null,
    confidence,
    source: source || 'UNKNOWN',
  };
}

function getFieldValue(field) {
  if (field == null) return null;
  if (typeof field === 'object' && 'value' in field) return field.value ?? null;
  return field;
}

function getFieldConfidence(field) {
  if (!field || typeof field !== 'object') return null;
  return field.confidence || null;
}

function pickPreferredField(...candidates) {
  const ordered = { HIGH: 3, MEDIUM: 2, LOW: 1 };
  return candidates
    .filter((candidate) => getFieldValue(candidate) != null && getFieldValue(candidate) !== '')
    .sort((a, b) => {
      const confA = ordered[getFieldConfidence(a)] || 0;
      const confB = ordered[getFieldConfidence(b)] || 0;
      return confB - confA;
    })[0] || null;
}

function isLikelyYellowPaper(rgb) {
  if (!rgb) return false;
  const { r, g, b } = rgb;
  const brightness = (r + g + b) / 3;
  return brightness > 120 && brightness < 245 && g - b > 12 && r - b > 16;
}

async function detectPaperTone(baseImage, metadata) {
  try {
    const sampleBox = clampCropBox(metadata, {
      left: metadata.width * 0.05,
      top: metadata.height * 0.05,
      width: metadata.width * 0.25,
      height: metadata.height * 0.18,
    });
    const stats = await baseImage.clone().extract(sampleBox).stats();
    const rgb = {
      r: stats.channels[0]?.mean || 0,
      g: stats.channels[1]?.mean || 0,
      b: stats.channels[2]?.mean || 0,
    };
    return { tone: isLikelyYellowPaper(rgb) ? 'yellow' : 'white', rgb };
  } catch {
    return { tone: 'unknown', rgb: null };
  }
}

async function prepareCsiImage(imageBuffer) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length === 0) return null;

  try {
    const rotated = sharp(imageBuffer, { failOn: 'none' }).rotate();
    const normalizedBuffer = await rotated
      .clone()
      .normalize()
      .modulate({ brightness: 1.04, saturation: 0.92 })
      .sharpen()
      .png()
      .toBuffer();

    const image = sharp(normalizedBuffer, { failOn: 'none' });
    const metadata = await image.metadata();
    const paperTone = await detectPaperTone(image, metadata);
    const preprocessing = {
      rotated: true,
      skew_corrected: false,
      crop_applied: false,
      normalized: true,
      paper_tone: paperTone.tone,
      paper_rgb: paperTone.rgb,
    };

    console.log('[CSI] preprocessing:', preprocessing);

    return {
      image,
      buffer: normalizedBuffer,
      metadata,
      paperTone: paperTone.tone,
      preprocessing,
    };
  } catch (error) {
    console.log('[CSI] preprocessing failed:', error.message);
    return null;
  }
}

function classifyCsiLayout(fullText, preparedImage = null) {
  const text = String(fullText || '').toLowerCase();
  const topLines = splitLines(fullText).slice(0, 6).join(' ').toLowerCase();

  if (/mg\s+and\s+co|milligrams?\s+and\s+co/.test(topLines)) {
    return CSI_LAYOUTS.MG_HANDWRITTEN;
  }

  if (/vios\s+integrated\s+projects|vip\s+inc/.test(topLines)) {
    return preparedImage?.paperTone === 'yellow'
      ? CSI_LAYOUTS.VIP_YELLOW
      : CSI_LAYOUTS.VIP_WHITE;
  }

  if (/charge\s+sales\s+invoice/i.test(text)) {
    return CSI_LAYOUTS.THIRD_PARTY_GENERIC;
  }

  return CSI_LAYOUTS.UNKNOWN;
}

function parseInvoiceNoFromTextLines(lines) {
  const fromLines = extractInvoiceNoFromCropLines(lines);
  if (fromLines) return fromLines;

  for (const line of lines) {
    const direct = line.match(/\b(?:Invoice\s*N[°o]?|No\.?)\s*[:.]?\s*(\d{3,6})\b/i);
    if (direct) return direct[1];
  }

  return extractDigitsFromFocusedCrop(lines);
}

function extractHospitalFromHeaderCropLines(lines) {
  const cropHospital = extractHospital(lines);
  if (cropHospital) return cropHospital;

  for (const line of lines) {
    const cleaned = line.replace(/^Charge\s*To\s*[:;]?\s*/i, '').trim();
    if (!cleaned) continue;
    if (/Hospital|Medical\s*Center|Clinic|Infirmary|Health\s*Care/i.test(cleaned)) {
      return cleaned;
    }
  }

  return null;
}

async function detectLayoutCrop(preparedImage, region, options = {}) {
  if (!preparedImage?.image || !preparedImage?.metadata) return null;

  try {
    const crop = await detectTextFromCrop(preparedImage.image, preparedImage.metadata, {
      left: preparedImage.metadata.width * region.left,
      top: preparedImage.metadata.height * region.top,
      width: preparedImage.metadata.width * region.width,
      height: preparedImage.metadata.height * region.height,
    }, options);

    const cropWords = normalizeWords(crop.ocr.words || [], crop.ocr.fullTextAnnotation);
    return { ...crop, cropWords };
  } catch (error) {
    console.log('[CSI] layout crop OCR failed:', error.message);
    return null;
  }
}

async function extractHeaderFieldsForLayout(layoutFamily, preparedImage, fallback = {}) {
  const config = CSI_LAYOUT_CONFIG[layoutFamily];
  if (!config || !preparedImage) return null;

  const rightCrop = await detectLayoutCrop(preparedImage, config.headerRight, {
    resizeMultiplier: 3,
    minWidth: 1100,
  });

  const invoiceCrop = config.invoiceValue
    ? await detectLayoutCrop(preparedImage, config.invoiceValue, {
        threshold: 180,
        resizeMultiplier: 4,
        minWidth: 900,
      })
    : null;

  const dateCrop = config.dateValue
    ? await detectLayoutCrop(preparedImage, config.dateValue, {
        resizeMultiplier: 3,
        minWidth: 900,
      })
    : null;

  const leftCrop = await detectLayoutCrop(preparedImage, config.headerLeft, {
    resizeMultiplier: 3,
    minWidth: 1200,
  });

  const rightLines = rightCrop?.lines || [];
  const rightWords = rightCrop?.cropWords || [];
  const invoiceLines = invoiceCrop?.lines || [];
  const invoiceWords = invoiceCrop?.cropWords || [];
  const dateLines = dateCrop?.lines || [];
  const dateWords = dateCrop?.cropWords || [];
  const leftLines = leftCrop?.lines || [];

  const invoiceValue =
    parseInvoiceNoFromTextLines(invoiceLines) ||
    parseInvoiceNoFromTextLines(rightLines) ||
    extractInvoiceNoSpatial(invoiceWords) ||
    extractInvoiceNoSpatial(rightWords);

  const dateValue =
    extractDateFromText(dateLines.join(' ')) ||
    extractDateFromText(rightLines.join(' ')) ||
    extractDateSpatial(dateWords) ||
    extractDateSpatial(rightWords);

  const hospitalValue = extractHospitalFromHeaderCropLines(leftLines);
  const termsValue = extractTerms(leftLines);

  return {
    invoice_no: invoiceValue
      ? makeCsiField(invoiceValue, `${layoutFamily}_HEADER_CROP`, {
          confidenceWords: invoiceWords.length ? invoiceWords : rightWords,
          regexMatched: true,
        })
      : fallback.invoice_no || null,
    date: dateValue
      ? makeCsiField(dateValue, `${layoutFamily}_DATE_CROP`, {
          confidenceWords: dateWords.length ? dateWords : rightWords,
          regexMatched: true,
        })
      : fallback.date || null,
    hospital: hospitalValue
      ? makeCsiField(hospitalValue, `${layoutFamily}_HEADER_LEFT_CROP`, {
          confidenceWords: leftCrop?.cropWords || [],
          regexMatched: true,
        })
      : fallback.hospital || null,
    terms: termsValue
      ? makeCsiField(termsValue, `${layoutFamily}_HEADER_LEFT_CROP`, {
          confidenceWords: leftCrop?.cropWords || [],
          regexMatched: true,
        })
      : fallback.terms || null,
  };
}

// ═══════════════════════════════════════════════════════════
// HEADER EXTRACTION
// ═══════════════════════════════════════════════════════════

function extractInvoiceNo(lines) {
  console.log('[CSI] extractInvoiceNo — first 25 lines:', lines.slice(0, 25));
  // VIP: "Invoice N 004764", "Invoice No 008277"
  for (const line of lines) {
    const m1 = line.match(/Invoice\s*N[°o]?\s*[:.]?\s*(\d{3,})/i);
    if (m1) { console.log('[CSI] invoiceNo via VIP pattern:', m1[1]); return m1[1]; }
    const genericN = line.match(/^(?:[N№]|N[°o]?)\s*[:.]?\s*(\d{3,6})$/i);
    if (genericN) { console.log('[CSI] invoiceNo via generic N pattern:', genericN[1]); return genericN[1]; }
  }
  // MG: "No. 425", "⚫ No. 426", ". No. 424" — but NOT BIR/accreditation/booklet lines
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isBirLine(line)) continue;
    if (/Accred|ATP|OCN|074AU|Bkl|Nos\.|Series/i.test(line)) continue;
    const m2 = line.match(/No\.?\s*(\d{3,})/i);
    if (m2) { console.log('[CSI] invoiceNo via No. pattern at line', i, ':', m2[1]); return m2[1]; }

    // "No." on its own line (with optional bullet/dot prefix) — check adjacent lines
    // Handles: "No.", ". No.", "• No.", "№", "No" — anything that is ONLY a No. label
    if (/^[^A-Za-z0-9]*N[o0]?\.?\s*$/i.test(line.trim())) {
      // Check previous line
      if (i > 0) {
        const prevNum = lines[i - 1].trim().match(/^(\d{3,6})$/);
        if (prevNum && !isBirLine(lines[i - 1]) && !/Accred|ATP|OCN|074AU|Bkl/i.test(lines[i - 1])) {
          return prevNum[1];
        }
      }
      // Check next line
      if (i + 1 < lines.length) {
        const nextNum = lines[i + 1].trim().match(/^(\d{3,6})$/);
        if (nextNum && !isBirLine(lines[i + 1]) && !/Accred|ATP|OCN|074AU|Bkl|Date/i.test(lines[i + 1])) {
          return nextNum[1];
        }
      }
    }
  }

  // MG fallback: number on the line immediately after "CHARGE SALES INVOICE" title
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    if (/CHARGE\s*SALES\s*INVOICE/i.test(lines[i])) {
      console.log('[CSI] Found CHARGE SALES INVOICE at line', i, ':', lines[i]);
      // Check same line for trailing number: "CHARGE SALES INVOICE No. 422"
      const sameM = lines[i].match(/(\d{3,6})\s*$/);
      if (sameM) { console.log('[CSI] invoiceNo via CSI same-line:', sameM[1]); return sameM[1]; }
      // Check next 3 lines for a short standalone number
      for (let j = i + 1; j <= Math.min(i + 3, lines.length - 1); j++) {
        console.log('[CSI]   checking line', j, ':', lines[j]);
        const nm = lines[j].trim().match(/^(\d{3,6})$/);
        if (nm && !isBirLine(lines[j]) && !/Accred|ATP|074AU/i.test(lines[j])) {
          console.log('[CSI] invoiceNo via CSI next-line:', nm[1]);
          return nm[1];
        }
      }
    }
  }

  // Final fallback: first standalone short number (3-6 digits, not a year) in the header
  // area ONLY — stop before hitting product table content (Batch/Lot lines or Qty/Unit headers)
  // NOTE: VAT Reg / TIN lines are SUPPLIER HEADER — do NOT break on them; only break on product table keywords
  console.log('[CSI] Trying final fallback for invoiceNo...');
  for (let i = 0; i < Math.min(20, lines.length); i++) {
    if (isBirLine(lines[i])) { console.log('[CSI]   line', i, 'is BIR, skip:', lines[i]); continue; }
    if (/Accred|ATP|OCN|074AU|Bkl|Batch|Lot\s*#|SC\/PWD|Qty|Unit|ARTICLES/i.test(lines[i])) {
      console.log('[CSI]   line', i, 'is table content, BREAK:', lines[i]); break;
    }
    const standalone = lines[i].trim().match(/^(\d{3,6})$/);
    if (standalone) {
      const n = parseInt(standalone[1], 10);
      if (n >= 2020 && n <= 2040) { console.log('[CSI]   line', i, 'is year, skip:', lines[i]); continue; }
      console.log('[CSI] invoiceNo via final fallback at line', i, ':', standalone[1]);
      return standalone[1];
    }
    console.log('[CSI]   line', i, 'no standalone number:', lines[i]);
  }

  console.log('[CSI] invoiceNo: NOT FOUND');
  return null;
}

function extractDate(lines) {
  const invoiceIdx = lines.findIndex((l) => /invoice|no\.?\s*\d/i.test(l));
  const candidates = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = String(lines[i] || '').trim();
    if (!raw) continue;
    if (/run\s*date|date\s*issued|bir|accreditation|auth\s*to\s*print|printer|fisherman|agreement/i.test(raw)) continue;

    const hasDateLabel = /\bdate\b/i.test(raw);
    const value = extractDateFromText(raw);
    if (!value) continue;

    let score = 0;
    if (hasDateLabel) score += 100;
    if (/[A-Za-z]{3,}/.test(value)) score += 30;
    if (i <= 30) score += 20; // Header/top area bias
    if (invoiceIdx >= 0) score += Math.max(0, 25 - Math.abs(i - invoiceIdx));

    candidates.push({ value, score });
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score);
    let best = fixPartialYear(candidates[0].value);
    // Fix 3-digit year: "March 31, 026" → "March 31, 2026"
    // Happens when OCR splits "2026" across lines and only "026" is captured
    best = fixPartialYear(best);
    return best;
  }

  return null;
}

function extractHospital(lines) {
  let chargedToValue = null;
  let chargedToIdx = -1;
  const chargeToRe = /(?:CHARGE[D]?|[CI]?ARGE[D]?)\s*(?:TO|T0)\s*[:;]?\s*(.*)/i;
  const hospitalKeywordRe = /Medical\s*Center|Hospital|Clinic|Infirmary|Health\s*Care|Cooperative/i;

  // Step 1: Find "Charged to" / "CHARGE TO:" and extract the name fragment
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(chargeToRe);
    if (!m) continue;
    chargedToValue = m[1].trim();
    chargedToIdx = i;
    break;
  }

  // OCR may miss the leading "C" and fail CHARGE TO detection.
  // Fall back to hospital keyword scan when no charge label is found.
  if (chargedToIdx < 0) {
    for (let i = 0; i < lines.length; i++) {
      const c = lines[i].trim();
      if (!hospitalKeywordRe.test(c)) continue;
      if (/MG\s*AND|MILLIGRAM|INCORPORATED|Lawaan|Balantang|Jaro|Iloilo\s*City|Mandurriao|VAT|TIN|Address|Business|Registered/i.test(c)) continue;
      if (c.length > 5 && c.length < 80) return c;
    }
    return null;
  }

  // Step 2: Search ALL lines (not just adjacent) for hospital/medical/clinic keywords
  // OCR two-column layout may put "Medical Center" many lines away from "Charged to"
  const hospitalSuffixes = [];
  for (let j = 0; j < lines.length; j++) {
    if (j === chargedToIdx) continue;
    const c = lines[j].trim();
    // Match lines that ARE hospital name parts
    if (/^(Medical\s*Center|Hospital|Clinic|Infirmary|Health\s*Care|Cooperative|Multi.?Purpose)/i.test(c)) {
      hospitalSuffixes.push({ idx: j, text: c });
    }
    // Also match "XXX Medical Center", "XXX Hospital" etc. as standalone
    if (hospitalKeywordRe.test(c) &&
        !/MG\s*AND|MILLIGRAM|INCORPORATED|Lawaan|Balantang|Jaro|Iloilo\s*City|Mandurriao|VAT|TIN/i.test(c)) {
      // This line itself IS a hospital name
      if (c.length > 5 && c.length < 80) {
        hospitalSuffixes.push({ idx: j, text: c });
      }
    }
  }

  // Step 3: Combine "Charged to" value with the closest hospital suffix
  if (chargedToValue && chargedToValue.length > 2 && !/^(Invoice|Date|TIN|$)/i.test(chargedToValue)) {
    // Check if the chargedToValue already contains a full hospital name
    if (/Hospital|Medical|Clinic|Infirmary|Health\s*Care|Cooperative/i.test(chargedToValue)) {
      return chargedToValue;
    }

    // Find the closest hospital suffix and combine
    if (hospitalSuffixes.length > 0) {
      // Sort by distance from chargedTo line
      hospitalSuffixes.sort((a, b) => Math.abs(a.idx - chargedToIdx) - Math.abs(b.idx - chargedToIdx));
      const suffix = hospitalSuffixes[0];
      // If the suffix starts with "Medical Center", "Hospital", etc., append to chargedToValue
      if (/^(Medical|Hospital|Clinic|Infirmary|Health|Cooperative|Multi)/i.test(suffix.text)) {
        return chargedToValue + ' ' + suffix.text;
      }
      // If the suffix is a full hospital name already, return it
      return suffix.text;
    }

    // No suffix found — return the raw value
    return chargedToValue;
  }

  // Step 3b: chargedToValue is empty but hospital keyword lines were found nearby — use the closest
  if (hospitalSuffixes.length > 0) {
    hospitalSuffixes.sort((a, b) => Math.abs(a.idx - chargedToIdx) - Math.abs(b.idx - chargedToIdx));
    return hospitalSuffixes[0].text;
  }

  // Step 4: Fallback — search for standalone hospital name lines
  for (let j = chargedToIdx + 1; j <= Math.min(chargedToIdx + 15, lines.length - 1); j++) {
    const c = lines[j].trim();
    if (/^(Invoice|Date|TIN|Registered|Business|TERMS|_?Terms|N[°o]?\s*\d|No\.|CHARGE|SC\/PWD|Qty|Unit|ARTICLES|Item\s*Desc|OSCA|Address)/i.test(c)) continue;
    if (/^(MG\s*AND|MILLIGRAM|B4\s*L7|Lawaan|Balantang|VAT\s*Reg|Vios|VIP\s*Inc)/i.test(c)) continue;
    if (/^[:;.\s_-]*$/.test(c)) continue;
    if (c.length < 3) continue;
    if (/^\d+$/.test(c)) continue;

    let hospital = c;
    // Check next lines for continuation
    for (let k = j + 1; k <= Math.min(j + 3, lines.length - 1); k++) {
      const next = lines[k].trim();
      if (/^(HOSPITAL|MEDICAL|CLINIC|CENTER|INFIRMARY|COOPERATIVE|MULTI.?PURPOSE|HEALTH\s*CARE)/i.test(next)) {
        hospital += ' ' + next;
      } else if (/Medical\s*Center|Health\s*Care/i.test(next)) {
        hospital += ' ' + next;
      } else break;
    }
    return hospital;
  }

  return null;
}

function extractTerms(lines) {
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/_?Terms\s*[:;]?\s*(.*)/i);
    if (!m) continue;
    const val = m[1].trim();
    // Filter out false positives like "Item Description / Nature of Service"
    if (/Item\s*Desc|Nature\s*of/i.test(val)) continue;
    if (val.length > 1 && val.length < 30 && !/^[:\s.]+$/.test(val)) return val;
    // Next line
    if (i + 1 < lines.length) {
      const next = lines[i + 1].trim();
      if (/^\d+\s*(days?|DAYS?)/i.test(next) || /^(30|60|90)\b/i.test(next)) {
        return next;
      }
    }
  }
  return null;
}

// ═══════════════════════════════════════════════════════════
// PRODUCT BLOCKS
// ═══════════════════════════════════════════════════════════

const RE_BATCH = /Batch\s*[#]?\s*(?:no|lot)?\.?\s*[:;]?\s*([A-Z0-9][\w+\s-]*\w)/i;
const RE_LOT = /LOT\s*[#]?\s*[:;]?\s*([A-Z0-9][\w\s-]*\w)/i;
const RE_PRODUCT_PARENS = /(.+?)\s*\(\s*([^)]+)\s*\)\s*(.+?)$/;
const RE_PRODUCT_BROKEN = /(.+?)\s+[C(]\s*([^)]+)\)\s*(.+?)$/i;

// Unit prefixes to strip from brand names
const UNIT_WORDS = /^(\d+\s*)?(?:vials?|pcs?|tabs?|caps?|boxes?|bottles?|amps?|units?|bots?|pairs?)\s+/i;

function extractProductBlocks(lines, tableLineIndices = null) {
  const blocks = [];
  const usedLines = new Set();

  for (let i = 0; i < lines.length; i++) {
    // Match "Batch no.", "Batch #", or "LOT #"
    const batchMatch = lines[i].match(RE_BATCH) || lines[i].match(RE_LOT);
    if (!batchMatch) continue;

    const batchLotNo = batchMatch[1].replace(/\s+/g, ' ').trim();
    usedLines.add(i);

    let brandName = null;
    let genericName = null;
    let dosage = null;

    // Search nearby lines for product name
    // When spatial data is available, search ALL table lines (not just ±4)
    // because OCR may insert many blank/irrelevant lines between the product name and batch line
    const nearby = [];
    if (tableLineIndices) {
      for (const j of tableLineIndices) {
        if (j === i || usedLines.has(j)) continue;
        nearby.push({ idx: j, line: lines[j].trim(), dist: Math.abs(j - i) });
      }
    } else {
      for (let j = Math.max(0, i - 4); j <= Math.min(lines.length - 1, i + 4); j++) {
        if (j === i || usedLines.has(j)) continue;
        nearby.push({ idx: j, line: lines[j].trim(), dist: Math.abs(j - i) });
      }
    }
    nearby.sort((a, b) => a.dist - b.dist);

    console.log(`[CSI] Batch at line ${i}: "${lines[i]}"`);
    console.log(`[CSI]   nearby lines (sorted):`, nearby.map(c => `[${c.idx}] "${c.line}"`));

    // Pre-pass: capture standalone unit-only qty lines ("50 vials", "100 pcs") BEFORE the
    // brand-name loop runs. Without this, the brand-name loop breaks on the first match and
    // never reaches qty lines that are farther from the batch anchor in the sorted nearby array.
    for (const c of nearby) {
      if (usedLines.has(c.idx)) continue;
      const unitOnlyMatch = c.line.match(/^(\d+)\s*(?:vials?|pcs?|tabs?|caps?|boxes?|bottles?|amps?|units?|bots?|pairs?)\s*$/i);
      if (unitOnlyMatch) {
        console.log(`[CSI]   pre-pass: captured qty ${unitOnlyMatch[1]} from line ${c.idx}: "${c.line}"`);
        if (!blocks._inlineQtys) blocks._inlineQtys = [];
        blocks._inlineQtys.push(parseInt(unitOnlyMatch[1], 10));
        usedLines.add(c.idx);
      }
    }
    console.log(`[CSI]   _inlineQtys after pre-pass:`, blocks._inlineQtys);

    for (const c of nearby) {
      if (usedLines.has(c.idx)) continue;
      if (c.line.length < 4) continue;
      if (RE_BATCH.test(c.line) || RE_LOT.test(c.line)) continue;
      if (/^Exp/i.test(c.line)) continue;
      if (isSkipLine(c.line)) continue;
      if (/^\d[\d.,\s]*$/.test(c.line)) continue;
      if (isBirLine(c.line)) continue;
      // Skip address/location/hospital continuation lines
      if (/^(San\s|Jose|aklan|Kalibo|Floilo|City|BS\s*AQUINO|Medical\s*Center|Antique$|HOSPITAL$|INFIRMARY$|CLINIC$|CENTER$|COOPERATIVE$)/i.test(c.line)) continue;
      // (unit-only lines already captured in the pre-pass above)

      // Split-line qty: OCR may place qty 1-2 lines before the brand candidate.
      // Case A: "50" / "vials Cefazovit..."  — lines[c.idx-1] is the qty directly
      // Case B: "50" / "viol" / "Onitaz..."  — lines[c.idx-1] is a bare unit word, lines[c.idx-2] is qty
      if (c.idx > 0 && !usedLines.has(c.idx - 1)) {
        const prev1 = lines[c.idx - 1].trim();
        const isUnitWordOnly = /^(?:vials?|pcs?|tabs?|caps?|boxes?|bottles?|amps?|units?|bots?|pairs?|viol)\s*$/i.test(prev1);
        const checkIdx = isUnitWordOnly ? c.idx - 2 : c.idx - 1;
        if (checkIdx >= 0 && !usedLines.has(checkIdx)) {
          const checkNum = lines[checkIdx].trim().match(/^(\d+)$/);
          if (checkNum) {
            const q = parseInt(checkNum[1], 10);
            if (q > 0 && q < 10000 && !(q >= 2020 && q <= 2040)) {
              if (!blocks._inlineQtys) blocks._inlineQtys = [];
              if (blocks._inlineQtys.length === 0) {
                console.log(`[CSI]   split-line qty: ${q} from line ${checkIdx} (unitWordBetween=${isUnitWordOnly})`);
                blocks._inlineQtys.push(q);
              }
              usedLines.add(checkIdx);
              if (isUnitWordOnly) usedLines.add(c.idx - 1);
            }
          }
        }
      }

      // Try parentheses match
      let pMatch = c.line.match(RE_PRODUCT_PARENS) || c.line.match(RE_PRODUCT_BROKEN);
      if (pMatch) {
        let rawBrand = pMatch[1].trim();
        genericName = pMatch[2].trim();
        let rawDosage = pMatch[3].trim();

        // Strip trailing quantity from dosage: "40 MG/ML 500" → dosage="40 MG/ML", inline qty=500
        // Pattern: dosage text followed by a standalone integer (the qty)
        const dosageQtyMatch = rawDosage.match(/^(.+?(?:mg|ml|mcg|iu|g)\s*(?:\/\s*\d*\s*(?:mg|ml|mcg|iu|g))?)\s+(\d+)\s*$/i);
        if (dosageQtyMatch) {
          rawDosage = dosageQtyMatch[1].trim();
          // Store the inline qty for later number assignment
          if (!blocks._inlineQtys) blocks._inlineQtys = [];
          blocks._inlineQtys.push(parseInt(dosageQtyMatch[2], 10));
        }
        dosage = rawDosage;

        // Strip unit prefix: "50 vials Onitaz" → "Onitaz", and save the qty
        const unitPrefixMatch = rawBrand.match(/^(\d+)\s*(?:vials?|pcs?|tabs?|caps?|boxes?|bottles?|amps?|units?|bots?|pairs?)\s+/i);
        if (unitPrefixMatch) {
          const prefixQty = parseInt(unitPrefixMatch[1], 10);
          if (!blocks._inlineQtys) blocks._inlineQtys = [];
          // Only push if we didn't already get qty from the split-line or dosage check
          if (blocks._inlineQtys.length === 0) {
            blocks._inlineQtys.push(prefixQty);
          }
        }
        rawBrand = rawBrand.replace(UNIT_WORDS, '').trim();
        brandName = rawBrand;
        usedLines.add(c.idx);
        break;
      }

      // No parens — non-pharma item or garbled text
      if (!/^(NOTE|CHARGE|TERMS|Date|Registered|Business|TIN|Invoice|Address|Charged|MG\s*AND|MILLIGRAM|VAT\s*Reg|B4\s*L7)/i.test(c.line)) {
        let raw = c.line;
        // Strip unit prefix and save qty for no-parens path too
        const unitPrefixMatch2 = raw.match(/^(\d+)\s*(?:vials?|pcs?|tabs?|caps?|boxes?|bottles?|amps?|units?|bots?|pairs?)\s+/i);
        if (unitPrefixMatch2) {
          const prefixQty = parseInt(unitPrefixMatch2[1], 10);
          if (!blocks._inlineQtys) blocks._inlineQtys = [];
          if (blocks._inlineQtys.length === 0) {
            blocks._inlineQtys.push(prefixQty);
          }
        }
        raw = raw.replace(UNIT_WORDS, '').trim();
        if (raw.length > 2) {
          brandName = raw;
          usedLines.add(c.idx);
          break;
        }
      }
    }

    // Find expiry within ±7 lines
    let expiryDate = null;
    for (let j = Math.max(0, i - 3); j <= Math.min(lines.length - 1, i + 7); j++) {
      if (j === i) continue;
      // Strict: date pattern after Exp
      const em = lines[j].match(/Exp(?:iry)?\.?\s*[-]?\s*(?:Date|dat|dab)?\s*[:;]?\s*(\d{1,2}[\/\-]\d{2,4}(?:[\/\-]\d{2,4})?)/i)
              || lines[j].match(/Exp(?:iry)?\.?\s*[-]?\s*(?:Date|dat|dab)?\s*[:;]?\s*(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/i)
              || lines[j].match(/Exp(?:iry)?\.?\s*[-]?\s*(?:Date|dat|dab)?\s*[:;]?\s*([A-Z][a-z]+\.?\s+\d{4})/i)
              || lines[j].match(/EXPIRY\s*DATE\s*[:;]?\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
      if (em) {
        expiryDate = em[1].trim();
        usedLines.add(j);
        break;
      }
    }

    // Check if an inline qty was extracted from the dosage line for this product
    let inlineQty = null;
    if (blocks._inlineQtys && blocks._inlineQtys.length > 0) {
      inlineQty = blocks._inlineQtys.shift();
    }

    console.log(`[CSI]   block pushed: brand="${brandName}" inlineQty=${inlineQty}`);
    blocks.push({
      batchLineIdx: i,
      brand_name: brandName,
      generic_name: genericName,
      dosage: dosage,
      batch_lot_no: batchLotNo,
      expiry_date: expiryDate,
      qty: inlineQty,  // pre-filled from dosage line if found
      unit_price: null,
      amount: null,
    });
  }

  return blocks;
}

function textFromWords(words) {
  return [...words]
    .sort((a, b) => a.cx - b.cx)
    .map((w) => w.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function wordsInColumn(lineWords, column) {
  if (!column) return [];
  return lineWords.filter((word) => word.cx >= column.xMin && word.cx <= column.xMax);
}

function extractBatchValue(text) {
  if (!text) return null;
  const match = text.match(RE_BATCH) || text.match(RE_LOT) || text.match(/Serial\s*[#:]?\s*([A-Z0-9-]{4,})/i);
  return match ? match[1].replace(/\s+/g, ' ').trim() : null;
}

function extractExpiryValue(text) {
  if (!text) return null;
  const match = text.match(/Exp(?:iry)?\.?\s*(?:Date)?\s*[:;]?\s*([A-Z][a-z]+\.?\s+\d{4}|\d{1,2}[\/-]\d{2,4}(?:[\/-]\d{2,4})?|\d{4}[\/-]\d{1,2}[\/-]\d{1,2})/i);
  return match ? match[1].trim() : null;
}

function parseFirstInteger(text) {
  const nums = extractNumbers(text);
  if (!nums.length) return null;
  const rounded = Math.round(nums[0]);
  return rounded > 0 ? rounded : null;
}

function normalizeDescription(text) {
  return String(text || '')
    .replace(/^\d+[.)]\s*/, '')
    .replace(/^\(?\d+\)?\s+/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseDescriptionFields(rawDescription) {
  const cleaned = normalizeDescription(rawDescription)
    .replace(/^Qty\s+/i, '')
    .replace(/^Unit\s+/i, '')
    .trim();

  if (!cleaned) {
    return { brand_name: null, generic_name: null, dosage: null };
  }

  const parensMatch = cleaned.match(RE_PRODUCT_PARENS) || cleaned.match(RE_PRODUCT_BROKEN);
  if (parensMatch) {
    return {
      brand_name: parensMatch[1].replace(UNIT_WORDS, '').trim(),
      generic_name: parensMatch[2].trim(),
      dosage: parensMatch[3].trim(),
    };
  }

  const dosageMatch = cleaned.match(/^(.*?)(\d+(?:\.\d+)?\s*(?:mg|mcg|g|gm|kg|ml|l|units?|iu)(?:\/\s*\d+(?:\.\d+)?\s*(?:mg|mcg|g|gm|ml|l))?)$/i);
  if (dosageMatch) {
    return {
      brand_name: dosageMatch[1].replace(UNIT_WORDS, '').trim(),
      generic_name: null,
      dosage: dosageMatch[2].trim(),
    };
  }

  return {
    brand_name: cleaned.replace(UNIT_WORDS, '').trim(),
    generic_name: null,
    dosage: null,
  };
}

function getLandmarkBounds(landmark) {
  if (!landmark?.words?.length) return null;
  const xs = landmark.words.map((word) => word.cx);
  return {
    xMin: Math.min(...xs),
    xMax: Math.max(...xs),
  };
}

function midpoint(a, b, fallback) {
  if (Number.isFinite(a) && Number.isFinite(b)) {
    return (a + b) / 2;
  }
  return fallback;
}

function detectTableColumnsForLayout(nWords, layoutFamily) {
  const qtyLandmark = findLandmark(nWords, /^qty$/i) || findLandmark(nWords, /quantity/i);
  const unitLandmark = findLandmark(nWords, /^unit$/i);
  const articlesLandmark = findLandmark(nWords, /articles|item\s*description|nature\s*of\s*service/i);
  const priceLandmark = findLandmark(nWords, /u\/p|unit\s*cost|unit\s*price|price/i);
  const amountLandmark = findLandmark(nWords, /^amount$/i);
  const qtyBounds = getLandmarkBounds(qtyLandmark);
  const unitBounds = getLandmarkBounds(unitLandmark);
  const articlesBounds = getLandmarkBounds(articlesLandmark);
  const priceBounds = getLandmarkBounds(priceLandmark);
  const amountBounds = getLandmarkBounds(amountLandmark);

  if (layoutFamily === CSI_LAYOUTS.MG_HANDWRITTEN) {
    const qtyUnitMid = midpoint(qtyBounds?.xMax, unitBounds?.xMin, 0.09);
    const unitDescMid = midpoint(unitBounds?.xMax, articlesBounds?.xMin, 0.16);
    const descPriceMid = midpoint(articlesBounds?.xMax, priceBounds?.xMin, 0.72);
    const priceAmountMid = midpoint(priceBounds?.xMax, amountBounds?.xMin, 0.84);
    return {
      qty: { xMin: 0.0, xMax: qtyUnitMid },
      unit: unitLandmark
        ? { xMin: Math.max(0, qtyUnitMid), xMax: unitDescMid }
        : null,
      description: {
        xMin: unitLandmark ? unitDescMid : (articlesBounds ? Math.max(0, articlesBounds.xMin - 0.02) : 0.14),
        xMax: descPriceMid,
      },
      unit_price: {
        xMin: descPriceMid,
        xMax: priceAmountMid,
      },
      amount: {
        xMin: priceAmountMid,
        xMax: 1,
      },
    };
  }

  if (layoutFamily === CSI_LAYOUTS.VIP_WHITE || layoutFamily === CSI_LAYOUTS.VIP_YELLOW) {
    return {
      description: { xMin: 0.05, xMax: 0.60 },
      qty: { xMin: 0.60, xMax: 0.69 },
      unit_price: { xMin: 0.69, xMax: 0.84 },
      amount: { xMin: 0.84, xMax: 1.0 },
    };
  }

  if (layoutFamily === CSI_LAYOUTS.THIRD_PARTY_GENERIC) {
    return {
      qty: { xMin: 0.02, xMax: 0.12 },
      unit: { xMin: 0.12, xMax: 0.23 },
      description: { xMin: 0.23, xMax: 0.66 },
      unit_price: { xMin: 0.66, xMax: 0.84 },
      amount: { xMin: 0.84, xMax: 1.0 },
    };
  }

  const descQtyMid = midpoint(articlesBounds?.xMax, qtyBounds?.xMin, 0.60);
  const qtyPriceMid = midpoint(qtyBounds?.xMax, priceBounds?.xMin, 0.72);
  const priceAmountMid = midpoint(priceBounds?.xMax, amountBounds?.xMin, 0.84);
  return {
    description: {
      xMin: 0.04,
      xMax: descQtyMid,
    },
    qty: {
      xMin: descQtyMid,
      xMax: qtyPriceMid,
    },
    unit_price: {
      xMin: qtyPriceMid,
      xMax: priceAmountMid,
    },
    amount: {
      xMin: priceAmountMid,
      xMax: 1,
    },
  };
}

function lineLooksLikeNoise(text) {
  return /^(?:note|total\s*sales|less\s*:|amount\s*net|total\s*amount|received|cashier|authorized|agreement|terms|tin|business\s*address|registered\s*name|charge\s*to|sc\/pwd|vatable|vat-exempt|zero-rated|vat\s*amount)/i.test(String(text || '').trim());
}

function lineLooksLikeReference(text) {
  return /^(?:po\s*#|p\.?o\.?\s*#|serial\s*#|customer['’]s\s*signature|received\s+the)/i.test(String(text || '').trim());
}

function extractLineItemsFromSpatialTable(nWords, zones, layoutFamily) {
  if (!nWords?.length || !zones?.tableBody) return [];

  const columns = detectTableColumnsForLayout(nWords, layoutFamily);
  const spatialLines = buildSpatialLines(findWordsInRect(nWords, zones.tableBody), null, 0.01);
  const items = [];
  let currentItem = null;

  for (const line of spatialLines) {
    const fullLineText = textFromWords(line.words);
    if (!fullLineText || lineLooksLikeNoise(fullLineText)) continue;

    const qtyText = textFromWords(wordsInColumn(line.words, columns.qty));
    const unitText = columns.unit ? textFromWords(wordsInColumn(line.words, columns.unit)) : '';
    const descriptionText = textFromWords(wordsInColumn(line.words, columns.description));
    const unitPriceText = textFromWords(wordsInColumn(line.words, columns.unit_price));
    const amountText = textFromWords(wordsInColumn(line.words, columns.amount));

    const qty = parseFirstInteger(qtyText);
    const unitPrice = extractNumbers(unitPriceText)[0] ?? null;
    const amount = extractNumbers(amountText)[0] ?? null;
    const batch = extractBatchValue(fullLineText);
    const expiry = extractExpiryValue(fullLineText);

    if (batch || expiry) {
      if (currentItem) {
        if (batch && !currentItem.batch_lot_no) currentItem.batch_lot_no = batch;
        if (expiry && !currentItem.expiry_date) currentItem.expiry_date = expiry;
      }
      continue;
    }

    if (lineLooksLikeReference(descriptionText || fullLineText) && amount == null && unitPrice == null) {
      continue;
    }

    const normalizedDescription = normalizeDescription(descriptionText);
    const alphaCount = normalizedDescription.replace(/[^A-Za-z]/g, '').length;
    const looksLikeProduct = alphaCount >= 3 && !lineLooksLikeNoise(normalizedDescription) && !lineLooksLikeReference(normalizedDescription);

    if (!looksLikeProduct) {
      continue;
    }

    const parsed = parseDescriptionFields(normalizedDescription);
    if (!parsed.brand_name) continue;

    currentItem = {
      brand_name: parsed.brand_name,
      generic_name: parsed.generic_name,
      dosage: parsed.dosage,
      batch_lot_no: null,
      expiry_date: null,
      qty,
      unit_price: unitPrice,
      amount,
      unit: unitText || null,
      source: 'SPATIAL_TABLE',
    };

    finalizeAssignedNumbers(currentItem);
    items.push(currentItem);
  }

  return items;
}

// ═══════════════════════════════════════════════════════════
// NUMBER ASSIGNMENT — the hardest part
// ═══════════════════════════════════════════════════════════

function findFooterStart(lines) {
  for (let i = 0; i < lines.length; i++) {
    if (/Total\s*Sales\s*\(?\s*VAT/i.test(lines[i])) return i;
  }
  return lines.length;
}

function inferQtyFromUnitPriceAndAmount(unitPrice, amount) {
  if (unitPrice == null || amount == null || unitPrice <= 0 || amount <= 0) return null;
  const qty = amount / unitPrice;
  const rounded = Math.round(qty);
  if (rounded <= 0 || rounded > 10000) return null;
  return Math.abs(qty - rounded) < 0.03 ? rounded : null;
}

function sameNumber(a, b) {
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.001;
}

function assignTwoNumbersToBlock(block, first, second) {
  if (first == null && second == null) return;
  if (first == null) {
    block.amount = second;
    return;
  }
  if (second == null) {
    block.amount = first;
    return;
  }

  if (block.qty != null) {
    block.unit_price = first;
    block.amount = second;
    return;
  }

  const inferredQty = inferQtyFromUnitPriceAndAmount(first, second);
  if (inferredQty != null) {
    block.unit_price = first;
    block.amount = second;
    return;
  }

  if (Number.isInteger(first) && first > 0 && first <= 1000 && second > first) {
    block.qty = first;
    block.amount = second;
    return;
  }

  if (second > first) {
    block.unit_price = first;
    block.amount = second;
    return;
  }

  block.amount = second;
}

function finalizeAssignedNumbers(block) {
  if (block.qty != null && block.unit_price != null && block.amount != null) {
    const expected = block.qty * block.unit_price;
    const tolerance = block.amount * 0.05;
    if (Math.abs(expected - block.amount) > tolerance && tolerance > 1) {
      const altExpected = block.qty * block.amount;
      if (Math.abs(altExpected - block.unit_price) < block.unit_price * 0.05) {
        const tmp = block.unit_price;
        block.unit_price = block.amount;
        block.amount = tmp;
      }
    }
  }

  if (block.qty == null && block.unit_price != null && block.amount != null) {
    block.qty = inferQtyFromUnitPriceAndAmount(block.unit_price, block.amount);
  }

  if (block.qty != null && block.amount != null && block.unit_price == null && block.qty > 0) {
    block.unit_price = parseFloat((block.amount / block.qty).toFixed(2));
  }

  if (block.qty != null && block.unit_price != null && block.amount == null) {
    block.amount = parseFloat((block.qty * block.unit_price).toFixed(2));
  }
}

/**
 * Collect product numbers from lines BEFORE "Total Sales".
 * Numbers may be:
 *   a) On same line as product: "3,000 ₤2.00 #6,000"
 *   b) On separate lines below product block: "50\n550.00\n27,500.00"
 *   c) In a separate column block (MG format): "799.11\n39,955.50\n720-00\n36,000.00\n540.00\n27.000-00"
 *
 * Strategy: collect all number-only lines before footer,
 *           then assign in order (every 3 numbers = qty, price, amount for next product)
 */
function assignProductNumbers(lines, blocks, footerIdx, tableLineIndices = null) {
  if (blocks.length === 0) return;

  // Step 1: Collect ALL number entries before footer
  const numEntries = [];

  // Track lines to skip (e.g., line after standalone "Exp:")
  const skipLines = new Set();
  for (let i = 0; i < footerIdx; i++) {
    // If this line is just "Exp:" or "Exp", skip the next line too (it's a date like "11/2027")
    if (/^\s*Exp(?:iry)?\.?\s*[-:]?\s*$/i.test(lines[i].trim()) && i + 1 < footerIdx) {
      skipLines.add(i + 1);
    }
  }

  // For number collection, use line-index range rather than exact spatial match,
  // because standalone number lines ("120") don't text-match to spatial lines.
  // Skip everything before the first table line (filters out header numbers like "5000" address).
  const tableStartIdx = tableLineIndices ? Math.min(...tableLineIndices) : 0;

  for (let i = 0; i < footerIdx; i++) {
    const line = lines[i].trim();
    if (skipLines.has(i)) continue;
    // Spatial filter: skip lines before the table body starts
    if (i < tableStartIdx) continue;
    // Skip payment terms values like "30 days" (can be mistaken as qty/price).
    if (/^\d+\s*(days?|DAYS?)\b/.test(line)) continue;
    if (i > 0 && /_?terms\s*[:;]?/i.test(lines[i - 1])) continue;

    // Skip TIN patterns
    if (/\d{3}[-\s]\d{3}[-\s]\d{3}/i.test(line)) continue;
    // Skip batch/expiry lines — including "Exp: 11/2027", "Exp. Date: 2029/11/29"
    if (RE_BATCH.test(line) || RE_LOT.test(line)) continue;
    if (/Exp(?:iry)?\.?\s*[-:]?\s*(?:Date)?/i.test(line)) continue;
    // Skip date-like patterns: "11/2027", "2029/11/29", "17/06/2027"
    if (/^\d{1,2}\/\d{2,4}$/.test(line) || /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(line)) continue;
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(line)) continue;
    // Skip label lines
    if (isSkipLine(line)) continue;
    if (isBirLine(line)) continue;
    // Skip entity header lines (MG AND CO address, TIN, etc.)
    if (/^(MG\s*AND|MILLIGRAM|B4\s*L7|Lawaan|VAT\s*Reg|Charged|Address|CHARGE\s*SALES|SC\/PWD|No\.$|Date\s|TIN$|Terms|OSCA|Medical\s*Center|San\s+Jose)/i.test(line)) continue;
    // Skip handwritten BDM annotations: "20 Pap", "480 AMP", "10 AMP", "270 Amps to follow", "PDH 124472"
    if (/^\d+\s+(?:Pap|AMP|amps?|vials?|pcs?|tabs?|boxes?)\b/i.test(line)) continue;
    if (/\b(?:LACKING|to\s*follow|detriped|roop|PDH)\b/i.test(line)) continue;
    // Skip lines with "Note:" annotations
    if (/^Note\s*:/i.test(line)) continue;
    // Skip lines that look like reference numbers with dates: "2307409 7/28"
    if (/^\d{5,}\s+\d{1,2}\/\d{1,2}/.test(line)) continue;
    // Skip lines with mixed large numbers and date fragments
    if (/^\d{6,}/.test(line)) continue;
    // Skip lines with substantial non-numeric text (>4 alpha chars)
    const alphaOnly = line.replace(/[\d₱P£#.,\-\s()/]/g, '').trim();
    if (alphaOnly.length > 4) continue;

    const nums = extractNumbers(line);
    for (const n of nums) {
      // Filter non-monetary
      if (n >= 2020 && n <= 2040 && Number.isInteger(n)) continue;
      if (n > 999999 && Number.isInteger(n)) continue;
      numEntries.push({ idx: i, value: n });
    }
  }

  if (numEntries.length === 0) { console.log('[CSI] assignProductNumbers: no numbers found'); return; }

  // Step 2: Account for products that already have qty (from inline extraction)
  // These products only need 2 numbers (price, amount) from the pool
  const values = numEntries.map(e => e.value);
  const productCount = blocks.length;
  const prefilledQtyCount = blocks.filter(b => b.qty != null).length;
  console.log(`[CSI] assignProductNumbers: pool=${JSON.stringify(values)} products=${productCount} prefilledQty=${prefilledQtyCount}`);

  // If some products have inline qty, assign differently
  if (prefilledQtyCount > 0) {
    let cursor = 0;
    for (let p = 0; p < productCount; p++) {
      if (blocks[p].qty != null) {
        if (sameNumber(values[cursor], blocks[p].qty) && cursor + 2 < values.length) {
          cursor += 1;
        }
        // Already has qty — take 2 from pool (price, amount)
        if (cursor + 1 < values.length) {
          blocks[p].unit_price = values[cursor];
          blocks[p].amount = values[cursor + 1];
          cursor += 2;
        } else if (cursor < values.length) {
          blocks[p].amount = values[cursor];
          cursor += 1;
        }
      } else {
        // Needs qty — take 3 from pool (qty, price, amount)
        if (cursor + 2 < values.length) {
          blocks[p].qty = values[cursor];
          blocks[p].unit_price = values[cursor + 1];
          blocks[p].amount = values[cursor + 2];
          cursor += 3;
        } else if (cursor + 1 < values.length) {
          assignTwoNumbersToBlock(blocks[p], values[cursor], values[cursor + 1]);
          cursor += 2;
        } else if (cursor < values.length) {
          blocks[p].amount = values[cursor];
          cursor += 1;
        }
      }
    }
  } else if (values.length >= productCount * 3) {
    // Perfect: 3 numbers per product
    for (let p = 0; p < productCount; p++) {
      blocks[p].qty = values[p * 3];
      blocks[p].unit_price = values[p * 3 + 1];
      blocks[p].amount = values[p * 3 + 2];
    }
  } else if (values.length > productCount * 2 && values.length < productCount * 3) {
    // Not enough for 3 per product, but more than 2 per product
    // Strategy: give 3 numbers to first product(s), 2 to the rest
    // E.g., 5 values for 2 products: [50, 540, 27000, 720, 36000] → product1 gets 3, product2 gets 2
    const extraNumbers = values.length - productCount * 2;
    let cursor = 0;
    for (let p = 0; p < productCount; p++) {
      if (p < extraNumbers) {
        // This product gets 3 numbers (qty, price, amount)
        blocks[p].qty = values[cursor];
        blocks[p].unit_price = values[cursor + 1];
        blocks[p].amount = values[cursor + 2];
        cursor += 3;
      } else {
        // This product gets 2 numbers (price + amount, qty missing from OCR)
        blocks[p].unit_price = values[cursor];
        blocks[p].amount = values[cursor + 1];
        cursor += 2;
      }
    }
  } else if (values.length >= productCount * 2) {
    // Exactly 2 numbers per product — commonly unit price + amount on MG forms.
    for (let p = 0; p < productCount; p++) {
      assignTwoNumbersToBlock(blocks[p], values[p * 2], values[p * 2 + 1]);
    }
  } else if (productCount === 1) {
    // Single product — take last 3 (or 2 or 1)
    if (values.length >= 3) {
      blocks[0].qty = values[values.length - 3];
      blocks[0].unit_price = values[values.length - 2];
      blocks[0].amount = values[values.length - 1];
    } else if (values.length === 2) {
      assignTwoNumbersToBlock(blocks[0], values[0], values[1]);
    } else {
      blocks[0].amount = values[0];
    }
  } else {
    // Fallback: distribute numbers by proximity to batch lines
    const remaining = [...numEntries];
    for (const block of blocks) {
      remaining.sort((a, b) => Math.abs(a.idx - block.batchLineIdx) - Math.abs(b.idx - block.batchLineIdx));
      const take = remaining.splice(0, Math.min(3, remaining.length));
      const tv = take.map(t => t.value);
      if (tv.length >= 3) {
        block.qty = tv[0]; block.unit_price = tv[1]; block.amount = tv[2];
      } else if (tv.length === 2) {
        assignTwoNumbersToBlock(block, tv[0], tv[1]);
      } else if (tv.length === 1) {
        block.amount = tv[0];
      }
    }
  }

  console.log('[CSI] assignProductNumbers after assignment:', blocks.map(b => ({ brand: b.brand_name, qty: b.qty, unit_price: b.unit_price, amount: b.amount })));

  // Step 3: Semantic validation — qty × unit_price should ≈ amount
  // If mismatch, try to fix by swapping or recomputing
  for (const block of blocks) {
    finalizeAssignedNumbers(block);
  }
}

// ═══════════════════════════════════════════════════════════
// FOOTER TOTALS
// ═══════════════════════════════════════════════════════════

function extractFooterTotals(lines, footerIdx) {
  const amounts = [];

  for (let i = footerIdx; i < lines.length; i++) {
    if (isBirLine(lines[i])) break;

    const nums = extractNumbers(lines[i]);
    for (const n of nums) {
      if (n >= 2020 && n <= 2040 && Number.isInteger(n)) continue;
      if (n > 999999 && Number.isInteger(n)) continue;
      if (n < 1) continue;
      amounts.push(n);
    }
  }

  let totalVatInc = null, lessVat = null, netOfVat = null, totalDue = null;

  if (amounts.length >= 4) {
    totalVatInc = amounts[0];
    lessVat = amounts[1];
    netOfVat = amounts[2];
    totalDue = amounts[amounts.length - 1];
  } else if (amounts.length === 3) {
    totalVatInc = amounts[0];
    lessVat = amounts[1];
    netOfVat = amounts[2];
    totalDue = amounts[0];
  } else if (amounts.length === 2) {
    totalVatInc = amounts[0];
    totalDue = amounts[1];
  } else if (amounts.length === 1) {
    totalDue = amounts[0];
  }

  // Sanity-check lessVat using arithmetic: totalVatInc - netOfVat should equal lessVat.
  // If lessVat is clearly wrong (e.g. OCR digit bleed: "6,750" → "61,750"),
  // recompute from the other two values which are harder to misread (larger numbers).
  if (totalVatInc != null && netOfVat != null) {
    const computed = parseFloat((totalVatInc - netOfVat).toFixed(2));
    const expected = totalVatInc * 12 / 112;
    const computedIsReasonable = Math.abs(computed - expected) / (expected || 1) < 0.05;
    const extractedIsWrong = lessVat == null || Math.abs(lessVat - expected) > Math.abs(computed - expected);
    if (computedIsReasonable && extractedIsWrong) {
      lessVat = computed;
    }
  }

  return { totalVatInc, lessVat, netOfVat, totalDue };
}

// ═══════════════════════════════════════════════════════════
// VALIDATION
// ═══════════════════════════════════════════════════════════

function validateFooter(totals) {
  const flags = [];
  const ti = totals.total_vat_inclusive?.value;
  const lv = totals.less_vat?.value;

  if (ti != null && lv != null) {
    const expected = ti * 12 / 112;
    if (Math.abs(lv - expected) > 2) {
      flags.push({
        type: 'FOOTER_MISMATCH',
        message: `VAT mismatch — extracted ${lv.toFixed(2)}, expected ${expected.toFixed(2)} (Total × 12/112). Please verify.`,
      });
    }
  }

  return flags;
}

function addValidationFlag(flags, type, message) {
  if (!flags.some((flag) => flag.type === type && flag.message === message)) {
    flags.push({ type, message });
  }
}

function validateLineItems(lineItems, totals) {
  const flags = [];
  const reviewReasons = new Set();

  lineItems.forEach((item, index) => {
    const brand = getFieldValue(item.brand_name);
    const qty = getFieldValue(item.qty);
    const price = getFieldValue(item.unit_price);
    const amount = getFieldValue(item.amount);

    if (!brand) {
      addValidationFlag(flags, 'UNPARSED_ITEM_BLOCK', `Line item ${index + 1} is missing a product description.`);
      reviewReasons.add('MISSING_PRODUCT');
    }

    if (qty == null) {
      addValidationFlag(flags, 'UNPARSED_ITEM_BLOCK', `Line item ${index + 1} is missing quantity.`);
      reviewReasons.add('MISSING_LINE_ITEM_QTY');
    }

    if (qty != null && price != null && amount != null) {
      const expected = qty * price;
      if (Math.abs(expected - amount) > Math.max(2, amount * 0.05)) {
        addValidationFlag(
          flags,
          'LINE_ITEM_ARITHMETIC_MISMATCH',
          `Line item ${index + 1} arithmetic mismatch: qty ${qty} × price ${price} != amount ${amount}.`
        );
        reviewReasons.add('LINE_ITEM_ARITHMETIC_MISMATCH');
      }
    }
  });

  const rowAmountSum = lineItems.reduce((sum, item) => sum + (getFieldValue(item.amount) || 0), 0);
  const totalDue = getFieldValue(totals.total_amount_due);
  const totalVatInclusive = getFieldValue(totals.total_vat_inclusive);
  const expectedTotal = totalVatInclusive != null ? totalVatInclusive : totalDue;

  if (rowAmountSum > 0 && expectedTotal != null && Math.abs(rowAmountSum - expectedTotal) > Math.max(2, expectedTotal * 0.03)) {
    addValidationFlag(
      flags,
      'TOTAL_MISMATCH',
      `Line item total ${rowAmountSum.toFixed(2)} does not match extracted invoice total ${expectedTotal.toFixed(2)}.`
    );
    reviewReasons.add('TOTAL_MISMATCH');
  }

  return { flags, reviewReasons: [...reviewReasons] };
}

function applyReviewFlags({ layoutFamily, invoiceField, dateField, hospitalField, lineItems, totals, validationFlags, reviewReasons }) {
  const reasons = new Set(reviewReasons || []);

  validationFlags.forEach((flag) => {
    if (flag.type === 'UNPARSED_ITEM_BLOCK') reasons.add('UNPARSED_ITEM_BLOCK');
    if (flag.type === 'FOOTER_MISMATCH') reasons.add('TOTAL_MISMATCH');
  });

  if (layoutFamily === CSI_LAYOUTS.UNKNOWN) {
    addValidationFlag(validationFlags, 'LAYOUT_UNKNOWN', 'CSI layout could not be classified. Please review all fields.');
    reasons.add('LAYOUT_UNKNOWN');
  }

  if (!getFieldValue(invoiceField) || getFieldConfidence(invoiceField) === 'LOW') {
    addValidationFlag(validationFlags, 'LOW_CONFIDENCE_INVOICE_NO', 'Invoice number is missing or low confidence.');
    reasons.add('LOW_CONFIDENCE_INVOICE_NO');
  }

  if (!getFieldValue(dateField) || getFieldConfidence(dateField) === 'LOW') {
    addValidationFlag(validationFlags, 'LOW_CONFIDENCE_DATE', 'Invoice date is missing or low confidence.');
    reasons.add('LOW_CONFIDENCE_DATE');
  }

  if (!getFieldValue(hospitalField) || getFieldConfidence(hospitalField) === 'LOW') {
    addValidationFlag(validationFlags, 'LOW_CONFIDENCE_HOSPITAL', 'Hospital/customer name is missing or low confidence.');
    reasons.add('LOW_CONFIDENCE_HOSPITAL');
  }

  const itemValidation = validateLineItems(lineItems, totals);
  itemValidation.flags.forEach((flag) => addValidationFlag(validationFlags, flag.type, flag.message));
  itemValidation.reviewReasons.forEach((reason) => reasons.add(reason));

  return {
    review_required: reasons.size > 0,
    review_reasons: [...reasons],
  };
}

// ═══════════════════════════════════════════════════════════
// SPATIAL EXTRACTION
// ═══════════════════════════════════════════════════════════

/**
 * Extract hospital name using spatial bounding box data.
 *
 * Strategy — search three regions around the "CHARGE TO" label:
 *   A. ABOVE the label (OCR sometimes reads the value before the label)
 *   B. Same Y-line, to the RIGHT of the label center
 *   C. BELOW the label (next line down)
 *
 * Prefer results containing hospital keywords (Hospital, Medical, Health Care, etc.).
 * If no keyword match, return null to fall through to line-based extraction.
 */
function extractHospitalSpatial(nWords, zones) {
  if (!zones || zones.chargeToY == null) return null;

  const { findLandmark: findLM } = require('../spatialUtils');
  const ctLandmark = findLM(nWords, /(?:charge[d]?|[ci]?arge[d]?)\s*(?:to|t0)/i);
  if (!ctLandmark) return null;

  const skipPatterns = /^(Invoice|Date|TIN|Registered|Business|TERMS|N[°o]?\s*\d|No\.|SC\/PWD|Qty|Unit|ARTICLES|Item|OSCA|Address|MG\s*AND|MILLIGRAM|B4\s*L7|Lawaan|Balantang|VAT|Vios|VIP|CHARGE|ARGE|SALES)/i;
  const hospitalKeywords = /Hospital|Medical|Clinic|Infirmary|Health\s*Care|Cooperative|Multi.?Purpose/i;

  // Collect candidate texts from all three regions
  const candidates = [];

  // Region A: ABOVE the label (OCR can place value text before the label)
  const aboveRegion = {
    xMin: 0.02, xMax: 0.65,
    yMin: ctLandmark.yMin - 0.03,
    yMax: ctLandmark.yMin - 0.002,
  };
  const aboveLines = buildSpatialLines(findWordsInRect(nWords, aboveRegion), null, 0.008);
  for (const line of aboveLines) {
    const text = line.text.trim();
    if (text.length >= 3 && !skipPatterns.test(text) && !/^[\d:.;\s_-]+$/.test(text)) {
      candidates.push(text);
    }
  }

  // Region B: Same Y-line, to the right of the label CENTER (not rightX edge)
  const sameLineRegion = {
    xMin: ctLandmark.cx + 0.08,
    xMax: 0.65,
    yMin: ctLandmark.yMin - 0.008,
    yMax: ctLandmark.yMax + 0.008,
  };
  const sameLineWords = findWordsInRect(nWords, sameLineRegion);
  if (sameLineWords.length > 0) {
    const text = [...sameLineWords].sort((a, b) => a.cx - b.cx).map(w => w.text).join(' ').trim();
    if (text.length >= 3 && !skipPatterns.test(text) && !/^[\d:.;\s_-]+$/.test(text)) {
      candidates.push(text);
    }
  }

  // Region C: Below the label
  const belowRegion = {
    xMin: 0.02, xMax: 0.65,
    yMin: ctLandmark.yMax + 0.003,
    yMax: ctLandmark.yMax + 0.05,
  };
  const belowLines = buildSpatialLines(findWordsInRect(nWords, belowRegion), null, 0.008);
  for (const line of belowLines) {
    const text = line.text.trim();
    if (text.length >= 3 && !skipPatterns.test(text) && !/^[\d:.;\s_-]+$/.test(text)) {
      candidates.push(text);
    }
  }

  // Prefer candidates with hospital keywords
  const withKeyword = candidates.find(c => hospitalKeywords.test(c));
  if (withKeyword) return withKeyword;

  // No keyword match — return null to let line-based extraction try
  return null;
}

// ═══════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════

async function parseCSI(ocrResult, options = {}) {
  const { fullText, words = [] } = ocrResult;
  const lines = splitLines(fullText);
  const validationFlags = [];
  const preparedImage = await prepareCsiImage(options.imageBuffer);
  const layoutFamily = classifyCsiLayout(fullText, preparedImage);

  // Spatial layer: normalize words and detect zones
  const nWords = normalizeWords(words, ocrResult.fullTextAnnotation);
  const zones = nWords.length > 10 ? detectCSIZones(nWords) : null;

  // Table line indices for spatial filtering (null = use all lines as before)
  const tableLineIndices = zones ? getLineIndicesInZone(lines, nWords, zones.tableBody) : null;

  const lineInvoiceNo = extractInvoiceNo(lines);
  const spatialInvoiceNo = extractInvoiceNoSpatial(nWords);
  const lineDate = extractDate(lines);
  const spatialDate = extractDateSpatial(nWords);
  const spatialHospital = zones ? extractHospitalSpatial(nWords, zones) : null;
  const lineHospital = extractHospital(lines);
  const lineTerms = extractTerms(lines);

  const lineInvoiceField = lineInvoiceNo
    ? makeCsiField(lineInvoiceNo, 'FULL_TEXT_LINE', { words, regexMatched: true })
    : null;
  const spatialInvoiceField = spatialInvoiceNo
    ? makeCsiField(spatialInvoiceNo, 'SPATIAL_HEADER', { words, regexMatched: true })
    : null;
  const lineDateField = lineDate
    ? makeCsiField(lineDate, 'FULL_TEXT_LINE', { words, regexMatched: true })
    : null;
  const spatialDateField = spatialDate
    ? makeCsiField(spatialDate, 'SPATIAL_HEADER', { words, regexMatched: true })
    : null;
  const spatialHospitalField = spatialHospital
    ? makeCsiField(spatialHospital, 'SPATIAL_HEADER', { words, regexMatched: true })
    : null;
  const lineHospitalField = lineHospital
    ? makeCsiField(lineHospital, 'FULL_TEXT_LINE', { words, regexMatched: true })
    : null;
  const lineTermsField = lineTerms
    ? makeCsiField(lineTerms, 'FULL_TEXT_LINE', { words, regexMatched: true })
    : null;

  const cropHeaderFields = preparedImage
    ? await extractHeaderFieldsForLayout(layoutFamily, preparedImage, {
        invoice_no: pickPreferredField(spatialInvoiceField, lineInvoiceField),
        date: pickPreferredField(spatialDateField, lineDateField),
        hospital: pickPreferredField(spatialHospitalField, lineHospitalField),
        terms: lineTermsField,
      })
    : null;

  const preferredDateField = pickPreferredField(
    cropHeaderFields?.date,
    spatialDateField,
    lineDateField
  );

  let preferredInvoiceField = pickPreferredField(
    cropHeaderFields?.invoice_no,
    spatialInvoiceField,
    lineInvoiceField
  );

  if (isLikelyDateYearFragment(getFieldValue(preferredInvoiceField), getFieldValue(preferredDateField))) {
    preferredInvoiceField = cropHeaderFields?.invoice_no || spatialInvoiceField || lineInvoiceField || null;
  }

  if (!preferredInvoiceField && layoutFamily === CSI_LAYOUTS.MG_HANDWRITTEN && options.imageBuffer) {
    const fallbackInvoice = await extractInvoiceNoFromHeaderCrop(options.imageBuffer);
    if (fallbackInvoice) {
      preferredInvoiceField = makeCsiField(fallbackInvoice, 'MG_HANDWRITTEN_HEADER_CROP', {
        words,
        regexMatched: true,
      });
    }
  }

  const preferredHospitalField = pickPreferredField(
    cropHeaderFields?.hospital,
    spatialHospitalField,
    lineHospitalField
  );
  const preferredTermsField = pickPreferredField(cropHeaderFields?.terms, lineTermsField);

  const footerIdx = findFooterStart(lines);
  let blocks = extractLineItemsFromSpatialTable(nWords, zones, layoutFamily);
  if (!blocks.length) {
    blocks = extractProductBlocks(lines, tableLineIndices);
    assignProductNumbers(lines, blocks, footerIdx, tableLineIndices);
  }
  const footer = extractFooterTotals(lines, footerIdx);

  const lineItems = blocks.map((b) => ({
    brand_name: makeCsiField(b.brand_name, `${b.source || 'LINE_BATCH_GROUP'}_DESCRIPTION`, { words, regexMatched: !!b.brand_name }),
    generic_name: makeCsiField(b.generic_name, `${b.source || 'LINE_BATCH_GROUP'}_DESCRIPTION`, { words, regexMatched: !!b.generic_name }),
    dosage: makeCsiField(b.dosage, `${b.source || 'LINE_BATCH_GROUP'}_DESCRIPTION`, { words, regexMatched: !!b.dosage }),
    batch_lot_no: makeCsiField(b.batch_lot_no, `${b.source || 'LINE_BATCH_GROUP'}_CONTINUATION`, { words, regexMatched: !!b.batch_lot_no }),
    expiry_date: makeCsiField(b.expiry_date, `${b.source || 'LINE_BATCH_GROUP'}_CONTINUATION`, { words, regexMatched: !!b.expiry_date }),
    qty: makeCsiField(b.qty, `${b.source || 'LINE_BATCH_GROUP'}_QTY`, { words, regexMatched: b.qty != null }),
    unit_price: makeCsiField(b.unit_price, `${b.source || 'LINE_BATCH_GROUP'}_PRICE`, { words, regexMatched: b.unit_price != null }),
    amount: makeCsiField(b.amount, `${b.source || 'LINE_BATCH_GROUP'}_AMOUNT`, { words, regexMatched: b.amount != null }),
  }));

  const totals = {
    total_vat_inclusive: makeCsiField(footer.totalVatInc, 'FOOTER_LINES', { words, regexMatched: footer.totalVatInc != null }),
    less_vat: makeCsiField(footer.lessVat, 'FOOTER_LINES', { words, regexMatched: footer.lessVat != null }),
    net_of_vat: makeCsiField(footer.netOfVat, 'FOOTER_LINES', { words, regexMatched: footer.netOfVat != null }),
    total_amount_due: makeCsiField(footer.totalDue, 'FOOTER_LINES', { words, regexMatched: footer.totalDue != null }),
  };

  validationFlags.push(...validateFooter(totals));

  if (!lineItems.length && lines.slice(0, footerIdx).some((line) => /batch|exp|vials?|pcs?|amps?|mask|gloves|cath|chemical|nebulizer|latex|cefazovit|onitaz/i.test(line))) {
    addValidationFlag(validationFlags, 'UNPARSED_ITEM_BLOCK', 'Unable to confidently parse CSI line items from the table body.');
  }

  const reviewState = applyReviewFlags({
    layoutFamily,
    invoiceField: preferredInvoiceField,
    dateField: preferredDateField,
    hospitalField: preferredHospitalField,
    lineItems,
    totals,
    validationFlags,
    reviewReasons: validationFlags
      .filter((flag) => flag.type === 'FOOTER_MISMATCH')
      .map(() => 'TOTAL_MISMATCH'),
  });

  return {
    layout_family: layoutFamily,
    preprocessing: preparedImage?.preprocessing || null,
    invoice_no: preferredInvoiceField || makeCsiField(null, 'UNKNOWN'),
    date: preferredDateField || makeCsiField(null, 'UNKNOWN'),
    hospital: preferredHospitalField || makeCsiField(null, 'UNKNOWN'),
    terms: preferredTermsField || makeCsiField(null, 'UNKNOWN'),
    line_items: lineItems,
    totals,
    validation_flags: validationFlags,
    review_required: reviewState.review_required,
    review_reasons: reviewState.review_reasons,
  };
}

module.exports = {
  parseCSI,
  extractProductBlocks,
};

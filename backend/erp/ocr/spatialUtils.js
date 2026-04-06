/**
 * Spatial OCR Utilities
 *
 * Converts Vision API word arrays into spatially-queryable structures.
 * All coordinates normalized to 0-1 range (fraction of page width/height).
 *
 * Used by document parsers to restrict extraction to specific document zones
 * (header, table body, footer) based on landmark word positions.
 */

// ═══════════════════════════════════════════════════════════
// COORDINATE HELPERS
// ═══════════════════════════════════════════════════════════

/**
 * Compute center point from a word's boundingBox vertices.
 */
function wordCenter(word) {
  const bb = word.boundingBox || [];
  if (bb.length === 0) return { cx: 0, cy: 0 };
  const cx = bb.reduce((s, v) => s + v.x, 0) / bb.length;
  const cy = bb.reduce((s, v) => s + v.y, 0) / bb.length;
  return { cx, cy };
}

/**
 * Normalize raw pixel bounding boxes to 0-1 range.
 * Attaches cx, cy center properties to each word.
 *
 * @param {object[]} words - Raw words from ocrResult.words (pixel coords)
 * @param {object|null} fullTextAnnotation - From ocrResult.fullTextAnnotation
 * @returns {object[]} Words with normalized boundingBox and cx, cy props
 */
function normalizeWords(words, fullTextAnnotation) {
  if (!words || words.length === 0) return [];

  // Extract page dimensions
  const pages = fullTextAnnotation?.pages || [];
  let pageW = pages[0]?.width || 0;
  let pageH = pages[0]?.height || 0;

  // Fallback: estimate from max coordinates
  if (!pageW || !pageH) {
    let maxX = 0, maxY = 0;
    for (const w of words) {
      for (const v of (w.boundingBox || [])) {
        if (v.x > maxX) maxX = v.x;
        if (v.y > maxY) maxY = v.y;
      }
    }
    if (!pageW) pageW = maxX || 1;
    if (!pageH) pageH = maxY || 1;
  }

  // Check if coordinates already look normalized (all < 2.0)
  const allSmall = words.every(w =>
    (w.boundingBox || []).every(v => v.x <= 2 && v.y <= 2)
  );
  const scaleX = allSmall ? 1 : pageW;
  const scaleY = allSmall ? 1 : pageH;

  return words.map(w => {
    const bb = (w.boundingBox || []).map(v => ({
      x: v.x / scaleX,
      y: v.y / scaleY,
    }));
    const cx = bb.length ? bb.reduce((s, v) => s + v.x, 0) / bb.length : 0;
    const cy = bb.length ? bb.reduce((s, v) => s + v.y, 0) / bb.length : 0;
    const yMin = bb.length ? Math.min(...bb.map(v => v.y)) : 0;
    const yMax = bb.length ? Math.max(...bb.map(v => v.y)) : 0;
    return { ...w, boundingBox: bb, cx, cy, yMin, yMax };
  });
}

// ═══════════════════════════════════════════════════════════
// SPATIAL QUERIES
// ═══════════════════════════════════════════════════════════

/**
 * Find all words whose center falls within a rectangular region.
 */
function findWordsInRect(nWords, { xMin = 0, xMax = 1, yMin = 0, yMax = 1 }) {
  return nWords.filter(w => w.cx >= xMin && w.cx <= xMax && w.cy >= yMin && w.cy <= yMax);
}

/**
 * Find a landmark phrase in the word array by text matching.
 * Returns position info of the first match, or null.
 *
 * @param {object[]} nWords - Normalized words
 * @param {string|RegExp} pattern - Text or regex to find
 * @returns {{words: object[], cy: number, yMin: number, yMax: number, cx: number}|null}
 */
function findLandmark(nWords, pattern) {
  const isRegex = pattern instanceof RegExp;
  const target = isRegex ? null : pattern.toLowerCase().replace(/\s+/g, ' ');

  // Build sliding windows of concatenated word text
  for (let i = 0; i < nWords.length; i++) {
    let concat = '';
    const matchWords = [];

    for (let j = i; j < Math.min(i + 6, nWords.length); j++) {
      const wText = (nWords[j].text || '').trim();
      if (!wText) continue;
      if (concat) concat += ' ';
      concat += wText;
      matchWords.push(nWords[j]);

      const test = isRegex ? pattern.test(concat) : concat.toLowerCase().includes(target);
      if (test && matchWords.length > 0) {
        const cy = matchWords.reduce((s, w) => s + w.cy, 0) / matchWords.length;
        const cx = matchWords.reduce((s, w) => s + w.cx, 0) / matchWords.length;
        const yMin = Math.min(...matchWords.map(w => w.yMin));
        const yMax = Math.max(...matchWords.map(w => w.yMax));
        return { words: matchWords, cy, cx, yMin, yMax };
      }
    }
  }

  return null;
}

// ═══════════════════════════════════════════════════════════
// SPATIAL LINE RECONSTRUCTION
// ═══════════════════════════════════════════════════════════

/**
 * Reconstruct text lines from spatially-close words using Y-coordinate clustering.
 *
 * @param {object[]} nWords - Normalized words
 * @param {object} [region] - Optional {xMin, xMax, yMin, yMax} filter
 * @param {number} [yTolerance=0.008] - Y-distance threshold for same-line grouping
 * @returns {Array<{y: number, text: string, words: object[]}>}
 */
function buildSpatialLines(nWords, region, yTolerance = 0.008) {
  let words = region ? findWordsInRect(nWords, region) : nWords;
  if (words.length === 0) return [];

  // Sort by Y then X
  const sorted = [...words].sort((a, b) => a.cy - b.cy || a.cx - b.cx);

  const lines = [];
  let currentLine = [sorted[0]];
  let currentY = sorted[0].cy;

  for (let i = 1; i < sorted.length; i++) {
    if (Math.abs(sorted[i].cy - currentY) <= yTolerance) {
      currentLine.push(sorted[i]);
    } else {
      // Sort current line left-to-right and emit
      currentLine.sort((a, b) => a.cx - b.cx);
      const avgY = currentLine.reduce((s, w) => s + w.cy, 0) / currentLine.length;
      lines.push({
        y: avgY,
        text: currentLine.map(w => w.text).join(' '),
        words: currentLine,
      });
      currentLine = [sorted[i]];
      currentY = sorted[i].cy;
    }
  }

  // Emit last line
  if (currentLine.length > 0) {
    currentLine.sort((a, b) => a.cx - b.cx);
    const avgY = currentLine.reduce((s, w) => s + w.cy, 0) / currentLine.length;
    lines.push({
      y: avgY,
      text: currentLine.map(w => w.text).join(' '),
      words: currentLine,
    });
  }

  return lines;
}

// ═══════════════════════════════════════════════════════════
// CSI ZONE DETECTION
// ═══════════════════════════════════════════════════════════

/**
 * Detect document zones for a CSI-format invoice using landmark word positions.
 *
 * @param {object[]} nWords - Normalized words
 * @returns {object|null} Zone definitions or null if critical landmarks missing
 */
function detectCSIZones(nWords) {
  if (!nWords || nWords.length < 10) return null;

  // Find key landmarks
  const itemDescLandmark =
    findLandmark(nWords, /item\s*desc/i) ||
    findLandmark(nWords, /nature\s*of\s*service/i) ||
    findLandmark(nWords, /articles/i);

  const totalSalesLandmark =
    findLandmark(nWords, /total\s*sales/i) ||
    findLandmark(nWords, /vatable\s*sales/i);

  // Critical landmarks — if both missing, can't define table zone
  if (!itemDescLandmark && !totalSalesLandmark) return null;

  const chargeToLandmark =
    findLandmark(nWords, /charge[d]?\s*to/i);

  const noteLandmark = findLandmark(nWords, /^note/i) || findLandmark(nWords, /NOTE/);
  const birLandmark =
    findLandmark(nWords, /bir\s*auth/i) ||
    findLandmark(nWords, /accreditation/i) ||
    findLandmark(nWords, /fisherman/i) ||
    findLandmark(nWords, /agreement/i);

  // Table boundaries
  const tableHeaderY = itemDescLandmark ? itemDescLandmark.yMax + 0.005 : 0.25;
  const totalSalesY = totalSalesLandmark ? totalSalesLandmark.yMin - 0.005 : 0.75;

  // Exclusion zone (NOTE, BIR — whichever comes first)
  const excludeY = Math.min(
    noteLandmark ? noteLandmark.yMin : 1.0,
    birLandmark ? birLandmark.yMin : 1.0
  );

  // Table body ends at whichever comes first: Total Sales or NOTE/BIR
  const tableBodyYMax = Math.min(totalSalesY, excludeY);

  // Column detection from header labels
  const qtyLandmark =
    findLandmark(nWords, /quantity/i) ||
    findLandmark(nWords, /^qty$/i);

  const priceLandmark =
    findLandmark(nWords, /unit\s*cost/i) ||
    findLandmark(nWords, /price/i) ||
    findLandmark(nWords, /u\/p/i);

  const amountLandmark = findLandmark(nWords, /^amount$/i);

  // Build column boundaries (X ranges)
  const columns = {};
  if (qtyLandmark) {
    const qtyX = qtyLandmark.cx;
    columns.description = { xMin: 0, xMax: qtyX - 0.02 };
    columns.quantity = { xMin: qtyX - 0.04, xMax: priceLandmark ? priceLandmark.cx - 0.02 : qtyX + 0.1 };
  }
  if (priceLandmark) {
    columns.unitCost = {
      xMin: priceLandmark.cx - 0.04,
      xMax: amountLandmark ? amountLandmark.cx - 0.02 : priceLandmark.cx + 0.12,
    };
  }
  if (amountLandmark) {
    columns.amount = { xMin: amountLandmark.cx - 0.04, xMax: 1.0 };
  }

  return {
    header: { yMin: 0, yMax: tableHeaderY },
    tableBody: { yMin: tableHeaderY, yMax: tableBodyYMax },
    footer: { yMin: totalSalesY, yMax: excludeY },
    exclude: { yMin: excludeY, yMax: 1.0 },
    chargeToY: chargeToLandmark ? chargeToLandmark.cy : null,
    columns: Object.keys(columns).length > 0 ? columns : null,
  };
}

// ═══════════════════════════════════════════════════════════
// LINE INDEX MAPPING
// ═══════════════════════════════════════════════════════════

/**
 * Map original fullText lines to spatial zones.
 * Returns a Set of line indices that fall within the given zone.
 *
 * @param {string[]} lines - Original lines from fullText.split('\n')
 * @param {object[]} nWords - Normalized words
 * @param {{yMin: number, yMax: number}} zone - Zone to filter by
 * @returns {Set<number>|null}
 */
function getLineIndicesInZone(lines, nWords, zone) {
  if (!zone || nWords.length === 0) return null;

  const spatialLines = buildSpatialLines(nWords);
  if (spatialLines.length === 0) return null;

  const indices = new Set();

  for (let i = 0; i < lines.length; i++) {
    const lineText = lines[i].trim().toLowerCase().replace(/\s+/g, '');
    if (!lineText || lineText.length < 2) continue;

    // Find the best matching spatial line by text overlap
    let bestMatch = null;
    let bestScore = 0;

    for (const sl of spatialLines) {
      const slText = sl.text.toLowerCase().replace(/\s+/g, '');
      if (!slText) continue;

      // Check both directions for substring containment
      let score = 0;
      if (slText === lineText) {
        score = 1.0;
      } else if (slText.includes(lineText)) {
        score = lineText.length / slText.length;
      } else if (lineText.includes(slText)) {
        score = slText.length / lineText.length;
      } else {
        // Check word-level overlap
        const lineWords = new Set(lines[i].trim().toLowerCase().split(/\s+/));
        const slWords = sl.text.toLowerCase().split(/\s+/);
        const overlap = slWords.filter(w => lineWords.has(w)).length;
        if (overlap > 0) score = overlap / Math.max(lineWords.size, slWords.length) * 0.5;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMatch = sl;
      }
    }

    if (bestMatch && bestScore > 0.3 && bestMatch.y >= zone.yMin && bestMatch.y <= zone.yMax) {
      indices.add(i);
    }
  }

  return indices.size > 0 ? indices : null;
}

module.exports = {
  wordCenter,
  normalizeWords,
  findWordsInRect,
  findLandmark,
  buildSpatialLines,
  detectCSIZones,
  getLineIndicesInZone,
};

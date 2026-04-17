/**
 * Shared OCR matching utilities for Sales, Collections, and other scan-to-fill flows.
 *
 * Used by: SalesEntry (CSI scan), CollectionSession (CR scan)
 */

// ── String helpers ──

export function normalizeStr(s) {
  return (s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Extract the value from a scored field (OCR returns {value, confidence} or plain string)
export function fieldVal(f) {
  if (f == null) return '';
  if (typeof f === 'object' && 'value' in f) return f.value ?? '';
  return String(f);
}

export function fieldConfidence(f) {
  return (f && typeof f === 'object' && 'confidence' in f) ? f.confidence : '';
}

// ── Hospital fuzzy matching ──

export function matchHospital(ocrName, hospitals) {
  if (!ocrName || !hospitals?.length) return null;
  const cleaned = normalizeStr(ocrName);
  if (!cleaned) return null;
  // Exact normalized match
  let match = hospitals.find(h => normalizeStr(h.hospital_name) === cleaned);
  if (match) return { hospital: match, confidence: 'HIGH' };
  // Substring match (OCR text contains hospital name or vice versa)
  match = hospitals.find(h => {
    const hn = normalizeStr(h.hospital_name);
    return cleaned.includes(hn) || hn.includes(cleaned);
  });
  if (match) return { hospital: match, confidence: 'MEDIUM' };
  // Word overlap scoring
  const ocrWords = cleaned.match(/.{2,}/g) || [];
  let best = null, bestScore = 0;
  for (const h of hospitals) {
    const hn = normalizeStr(h.hospital_name);
    let score = 0;
    for (const w of ocrWords) { if (hn.includes(w)) score++; }
    if (score > bestScore) { bestScore = score; best = h; }
  }
  if (best && bestScore >= 2) return { hospital: best, confidence: 'MEDIUM' };
  return null;
}

// ── Product fuzzy matching (CSI scan) ──

export function matchProduct(ocrBrand, ocrDosage, productOptions) {
  if (!ocrBrand || !productOptions?.length) return null;
  const cleaned = normalizeStr(ocrBrand);
  const dosage = normalizeStr(ocrDosage || '');
  if (!cleaned) return null;
  // Try brand+dosage combo first
  if (dosage) {
    const match = productOptions.find(p => {
      const pn = normalizeStr(p.brand_name);
      return pn === cleaned || (cleaned.includes(pn) && normalizeStr(p.label).includes(dosage));
    });
    if (match) return { product: match, confidence: 'HIGH' };
  }
  // Exact brand match
  let match = productOptions.find(p => normalizeStr(p.brand_name) === cleaned);
  if (match) return { product: match, confidence: 'HIGH' };
  // Substring brand match
  match = productOptions.find(p => {
    const pn = normalizeStr(p.brand_name);
    return cleaned.includes(pn) || pn.includes(cleaned);
  });
  if (match) return { product: match, confidence: 'MEDIUM' };
  return null;
}

// ── CSI matching (CR scan → open invoices) ──

export function matchCsis(extractedCsis, openCsis) {
  if (!extractedCsis?.length || !openCsis?.length) return [];

  return extractedCsis.map(ec => {
    const csiNo = normalizeStr(fieldVal(ec.csi_no));
    const ecAmount = parseFloat(fieldVal(ec.amount)) || 0;
    if (!csiNo) return { extracted: ec, matched: null, confidence: 'NONE' };

    // Try exact doc_ref match (strip leading zeros + non-digits)
    const stripped = csiNo.replace(/^0+/, '');
    let best = null;
    let bestConf = 'NONE';

    for (const csi of openCsis) {
      const ref = normalizeStr(csi.doc_ref || '').replace(/^0+/, '');
      if (!ref) continue;
      if (ref === stripped || ref === csiNo) {
        // Amount match check (within P1 tolerance)
        const amtMatch = ecAmount > 0 && Math.abs((csi.balance_due || csi.invoice_total || 0) - ecAmount) <= 1;
        best = csi;
        bestConf = amtMatch ? 'HIGH' : 'MEDIUM';
        break;
      }
      // Partial: ref ends with or starts with the CSI number
      if (!best && (ref.endsWith(stripped) || stripped.endsWith(ref))) {
        best = csi;
        bestConf = 'MEDIUM';
      }
    }
    return { extracted: ec, matched: best, confidence: bestConf };
  });
}

// ── Date normalization for CR dates ──

export function parseCrDate(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  const raw = String(dateStr).trim();

  // Try direct Date parse (handles "March 31, 2026", ISO, etc.)
  const d = new Date(raw);
  if (!isNaN(d) && d.getFullYear() > 2000) return d.toISOString().split('T')[0];

  // Try MM-DD-YY or MM-DD-YYYY (common in PH receipts)
  const m = raw.match(/(\d{1,2})[-/.\s]+(\d{1,2})[-/.\s]+(\d{2,4})/);
  if (m) {
    let year = parseInt(m[3]);
    if (year < 100) year += 2000;
    return `${year}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }

  return new Date().toISOString().split('T')[0];
}

// ── Review reason formatting ──

export function formatReviewReason(reason) {
  const map = {
    LOW_CONFIDENCE: 'Some fields have low OCR confidence — please double-check values',
    UNMATCHED_HOSPITAL: 'Hospital name could not be matched to master data',
    UNMATCHED_PRODUCT: 'One or more products could not be matched',
    UNMATCHED_CSI: 'One or more CSI numbers could not be matched to open invoices',
    AMOUNT_MISMATCH: 'Extracted amounts do not match expected values',
  };
  return map[reason] || reason;
}

/**
 * Gas Receipt Parser
 *
 * Handles two receipt formats:
 *   1. Shell credit card receipts — QTY field for liters, PRODUCT field for fuel type,
 *      no price_per_liter (computed from total/liters)
 *   2. Generic gas station receipts — may have handwritten table with Qty/Description/U.Price/Amount,
 *      or a "TOTAL AMOUNT DUE" footer
 *
 * When price_per_liter is not present, it is computed from total/liters
 * and flagged with price_computed: true.
 */

const {
  scoredField,
  getWordConfidencesForText,
  parseAmount,
  splitLines,
} = require('../confidenceScorer');

const RE_DATE = /(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/;

// Fuel type abbreviations and keywords
// Shell: SVP = V-Power, SVPD = V-Power Diesel, FuelSave
// Petron: XCS = Xtra Advance, Blaze 100, Turbo Diesel, Diesel Max
// Generic: ULG = Unleaded, DSL = Diesel
const FUEL_TYPE_MAP = {
  // Shell
  'svp': 'SHELL V-POWER',
  'svpd': 'SHELL V-POWER DIESEL',
  'svp95': 'SHELL V-POWER 95',
  'fuelsave': 'SHELL FUELSAVE',
  'fuelsave diesel': 'SHELL FUELSAVE DIESEL',
  // Petron
  'xcs': 'PETRON XCS',
  'ics': 'PETRON XCS',         // OCR may read XCS as ICS or *ICS
  '*ics': 'PETRON XCS',
  'blaze': 'PETRON BLAZE 100',
  'blaze 100': 'PETRON BLAZE 100',
  'turbo diesel': 'PETRON TURBO DIESEL',
  'diesel max': 'PETRON DIESEL MAX',
  'xtra advance': 'PETRON XTRA ADVANCE',
  // Caltex / Phoenix / Seaoil
  'silver': 'CALTEX SILVER',
  'gold': 'CALTEX GOLD',
  'platinum': 'CALTEX PLATINUM',
  // Generic
  'ulg': 'UNLEADED',
  'unleaded': 'UNLEADED',
  'dsl': 'DIESEL',
  'diesel': 'DIESEL',
  'premium': 'PREMIUM',
  'regular': 'REGULAR',
  'gasoline': 'GASOLINE',
};

const RE_SHELL = /\bshell\b/i;

// Shell-specific: PRODUCT line followed by fuel code (SVP, SVPD, etc.)
const RE_SHELL_PRODUCT = /(?:PRODUCT|PROD)\s*[:\s]*(\S+)/i;

// Shell-specific: QTY as liters
const RE_SHELL_QTY = /\bQTY\b\s*[:\s]*([\d.]+)/i;

// Generic: liters with unit suffix
const RE_LITERS = /(\d+[.,]?\d*)\s*(?:L\b|liter|litre|lit(?:er)?s?)/i;

// Generic: price per liter
const RE_PRICE_PER = /(?:price|rate|per|u[\/.]?\s*price)\s*(?:per\s+)?(?:liter|litre|L)?\s*[:\s]*[₱P]?\s*([\d,]+[.,]?\d*)/i;

// Total amount patterns (ordered by specificity)
const RE_TOTAL_DUE = /(?:total\s*amount\s*due|amount\s*due)\s*[:\s]*[₱P]?\s*([\d,]+[.,]?\d*)/i;
const RE_TOTAL = /(?:total|amount|amt)\s*[:\s]*[₱P]?\s*([\d,]+[.,]?\d*)/i;

// Fuel type regex for line scanning (avoid matching station names)
const RE_FUEL_KEYWORD = /\b(diesel|premium|unleaded|regular|gasoline|ulg|dsl|svp|svpd|svp95|fuelsave|xcs|blaze|turbo\s*diesel|diesel\s*max|xtra\s*advance|silver|gold|platinum)\b/i;
// Petron OCR mangling: *ICS, ICS → XCS
const RE_PETRON_FUEL = /[*]?ICS\b/i;

// Table row pattern: qty  description  u/price  amount (handwritten generic receipts)
// e.g., "40.240  ULG  67.90  2,732.16" or "40.240  ULG1  67.90"
const RE_TABLE_ROW = /([\d.,]+)\s+(?:[A-Za-z]+\d*)\s+([\d.,]+)\s+([\d.,]+)/;

function parseGasReceipt(ocrResult) {
  const { fullText, words = [] } = ocrResult;
  const lines = splitLines(fullText);
  const validationFlags = [];

  let date = null;
  let stationName = null;
  let fuelType = null;
  let liters = null;
  let pricePerLiter = null;
  let totalAmount = null;
  let priceComputed = false;
  const isShell = RE_SHELL.test(fullText);

  // --- Station name: first non-empty meaningful line ---
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 3 && !/^(date|time|terminal|card|ref|stan|aid|tvr|batch|appr|tc\s)/i.test(trimmed)) {
      stationName = trimmed;
      break;
    }
  }

  // --- Date extraction ---
  for (const line of lines) {
    const m = line.match(/DATE\s*[:\s]*([\d\/\-\.]+\d)/i);
    if (m) { date = m[1]; break; }
  }
  if (!date) {
    for (const line of lines) {
      const m = line.match(/\bDate\s*([\d\-\/\.]+)/i);
      if (m) { date = m[1]; break; }
    }
  }
  if (!date) {
    for (const line of lines) {
      const m = line.match(RE_DATE);
      if (m) { date = m[1]; break; }
    }
  }

  // --- Shell-specific parsing ---
  if (isShell) {
    // ── Shell POS receipt format: "40.071L X 58.190P/L" ──
    // This is a printed POS receipt (not the credit card slip)
    const posLineMatch = fullText.match(/([\d.,]+)\s*L\s*[Xx×]\s*([\d.,]+)\s*P\s*\/\s*L/i);

    if (posLineMatch) {
      // Shell POS format — has liters and price explicitly
      liters = parseFloat(posLineMatch[1].replace(',', '.'));
      pricePerLiter = parseFloat(posLineMatch[2].replace(',', '.'));

      // Fuel type: look for gasoline/diesel keywords near the POS line
      // OCR may mangle "Gasoline" → "FSSasoline", "FSSGasoline", etc.
      for (const line of lines) {
        if (/gasoline|asoline|diesel|premium|unleaded/i.test(line)) {
          if (/diesel/i.test(line)) { fuelType = 'DIESEL'; }
          else if (/premium/i.test(line)) { fuelType = 'PREMIUM'; }
          else { fuelType = 'GASOLINE'; }
          break;
        }
      }

      // Total: "TOTAL INVOICE" or "Gale Total" (OCR of "Sale Total")
      for (const line of lines) {
        const m = line.match(/(?:TOTAL\s*INVOICE|Sale\s*Total|Gale\s*Total)\s*[:\s]*[₱P]?\s*([\d,]+\.?\d*)/i);
        if (m) {
          const val = parseAmount(m[1]);
          if (val > 10 && val < 100000) { totalAmount = val; break; }
        }
      }
      // Fallback: look for repeated P amounts (Shell POS shows total multiple times)
      if (totalAmount == null) {
        const pAmounts = [];
        for (const line of lines) {
          const matches = line.matchAll(/P([\d,]+\.\d{2})/g);
          for (const m of matches) {
            const val = parseAmount(m[1]);
            if (val > 50 && val < 100000) pAmounts.push(val);
          }
        }
        // Most frequent amount is the total (Shell POS repeats it 3-4 times)
        if (pAmounts.length > 0) {
          const freq = {};
          pAmounts.forEach(v => { freq[v] = (freq[v] || 0) + 1; });
          totalAmount = parseFloat(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
        }
      }
    } else {
      // ── Shell credit card slip format: PRODUCT/SVP, QTY, PHP ──

      // Fuel type: find PRODUCT line, then check same line or next line for fuel code
      for (let i = 0; i < lines.length; i++) {
        if (/\bPRODUCT\b/i.test(lines[i])) {
          const m = lines[i].match(/PRODUCT\s*[:\s]*([A-Za-z]\w+)/i);
          if (m) {
            const code = m[1].trim().toLowerCase();
            fuelType = FUEL_TYPE_MAP[code] || m[1].trim().toUpperCase();
          } else if (i + 1 < lines.length) {
            // Fuel code on the next line (common in Shell credit card receipts)
            const nextTrimmed = lines[i + 1].trim().toLowerCase();
            if (FUEL_TYPE_MAP[nextTrimmed]) {
              fuelType = FUEL_TYPE_MAP[nextTrimmed];
            } else if (/^[A-Za-z]{2,10}$/i.test(lines[i + 1].trim())) {
              fuelType = lines[i + 1].trim().toUpperCase();
            }
          }
          break;
        }
      }
      // Fallback: standalone fuel code lines
      if (!fuelType) {
        for (const line of lines) {
          const trimmed = line.trim().toLowerCase();
          if (FUEL_TYPE_MAP[trimmed]) {
            fuelType = FUEL_TYPE_MAP[trimmed];
            break;
          }
        }
      }

      // Liters from QTY field — handles "QTY 4.363", "QTY\n4.363", and "QTY\n3 840" (space = decimal)
      for (let i = 0; i < lines.length; i++) {
        if (/\bQTY\b/i.test(lines[i])) {
          const sameLineMatch = lines[i].match(/QTY\s*[:\s]*([\d]+[.\s]\d+)/i);
          if (sameLineMatch) {
            liters = parseFloat(sameLineMatch[1].replace(/\s/g, '.'));
          } else {
            if (i + 1 < lines.length) {
              const nextLine = lines[i + 1].trim();
              const spaceDecimal = nextLine.match(/^(\d+)\s+(\d+)$/);
              if (spaceDecimal) {
                liters = parseFloat(spaceDecimal[1] + '.' + spaceDecimal[2]);
              } else {
                const simpleNum = nextLine.match(/^([\d.]+)$/);
                if (simpleNum) liters = parseFloat(simpleNum[1]);
              }
            }
          }
          break;
        }
      }

      // Total: collect ALL "PHP xxx.xx" amounts, prefer the one AFTER QTY line
      // Shell credit card receipts may show pre-auth (PHP 500.00) BEFORE the actual total
      const phpAmounts = [];
      let qtyLineIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/\bQTY\b/i.test(lines[i])) qtyLineIdx = i;
        const m = lines[i].match(/\bPHP\s*([\d,]+\.?\d*)/i);
        if (m) {
          const val = parseAmount(m[1]);
          if (val > 0 && val < 100000) phpAmounts.push({ val, idx: i });
        }
      }
      if (phpAmounts.length > 0) {
        const afterQty = phpAmounts.filter(a => a.idx > qtyLineIdx);
        if (afterQty.length > 0) {
          totalAmount = afterQty[0].val;
        } else {
          totalAmount = phpAmounts[phpAmounts.length - 1].val;
        }
      }
      // Fallback: AMOUNT line with number
      if (totalAmount == null) {
        for (const line of lines) {
          const m = line.match(/\bAMOUNT\s*[:\s]*([\d,]+\.?\d*)/i);
          if (m) {
            const val = parseAmount(m[1]);
            if (val > 10 && val < 100000) { totalAmount = val; break; }
          }
        }
      }
    }

  } else {
    // --- Generic / Petron / Caltex / other gas station receipt parsing ---

    // Fuel type: scan lines but SKIP station name line(s) to avoid false matches
    const stationNameLower = (stationName || '').toLowerCase();
    for (const line of lines) {
      // Skip station name, proprietor, address, TIN lines
      if (stationNameLower && line.toLowerCase().includes(stationNameLower.substring(0, 15))) continue;
      if (/proprietor|dealer|address|city|vat\s*reg|tin:|brgy/i.test(line)) continue;

      // Check for Petron OCR mangling: *ICS → XCS
      if (!fuelType && RE_PETRON_FUEL.test(line)) {
        fuelType = 'PETRON XCS';
        break;
      }
      const m = line.match(RE_FUEL_KEYWORD);
      if (m) {
        const code = m[1].toLowerCase().trim();
        fuelType = FUEL_TYPE_MAP[code] || m[1].toUpperCase();
        break;
      }
    }

    // ── POS receipt format: "4.34 Php54.09 Php234.86" ──
    // Petron/Caltex POS receipts use "Php" prefix on price and amount
    const posPhpMatch = fullText.match(/([\d.,]+)\s*Php\s*([\d.,]+)\s*Php\s*([\d.,]+)/i);
    if (posPhpMatch) {
      liters = parseFloat(posPhpMatch[1].replace(',', '.'));
      pricePerLiter = parseAmount(posPhpMatch[2]);
      totalAmount = parseAmount(posPhpMatch[3]);
    }

    // ── POS format: "40.071L X 58.190P/L" (non-Shell POS) ──
    if (liters == null) {
      const posLineMatch = fullText.match(/([\d.,]+)\s*L\s*[Xx×]\s*([\d.,]+)\s*P\s*\/\s*L/i);
      if (posLineMatch) {
        liters = parseFloat(posLineMatch[1].replace(',', '.'));
        pricePerLiter = parseFloat(posLineMatch[2].replace(',', '.'));
      }
    }

    // ── Handwritten table: "Qty  Description  U/Price  Amount" ──
    if (liters == null) {
      let tableHeaderIdx = -1;
      for (let i = 0; i < lines.length; i++) {
        if (/Qty\b.*(?:Description|Desc|Price|Amount)/i.test(lines[i]) ||
            /Qty\b.*Unit\b/i.test(lines[i]) ||
            /Description\b.*(?:Price|Amount)/i.test(lines[i])) {
          tableHeaderIdx = i;
          break;
        }
      }

      if (tableHeaderIdx >= 0) {
        for (let i = tableHeaderIdx + 1; i < Math.min(tableHeaderIdx + 5, lines.length); i++) {
          const line = lines[i].trim();
          if (!line || /^(total|vat|less|amount|zero|payment)/i.test(line)) break;

          // Extract all numbers (strip Php/P/₱ prefixes)
          const cleaned = line.replace(/Php|[₱]/gi, '');
          const numbers = [];
          const numRegex = /([\d,]+\.\d+|\d+\.\d+)/g;
          let nm;
          while ((nm = numRegex.exec(cleaned)) !== null) {
            const val = parseAmount(nm[1]);
            if (val != null && val > 0) numbers.push(val);
          }

          // Extract fuel type from description in this row
          const fuelMatch = line.match(RE_FUEL_KEYWORD);
          if (fuelMatch && !fuelType) {
            const code = fuelMatch[1].toLowerCase().trim();
            fuelType = FUEL_TYPE_MAP[code] || fuelMatch[1].toUpperCase();
          }
          // Also check Petron mangling
          if (!fuelType && RE_PETRON_FUEL.test(line)) {
            fuelType = 'PETRON XCS';
          }

          if (numbers.length >= 3) {
            if (liters == null) liters = numbers[0];
            if (pricePerLiter == null) pricePerLiter = numbers[1];
            if (totalAmount == null) totalAmount = numbers[2];
          } else if (numbers.length === 2) {
            if (liters == null) liters = numbers[0];
            if (totalAmount == null) totalAmount = numbers[1];
          }
          break;
        }
      }
    }

    // Explicit liters extraction if table parse didn't find it
    if (liters == null) {
      for (const line of lines) {
        const m = line.match(RE_LITERS);
        if (m) { liters = parseFloat(m[1].replace(',', '.')); break; }
      }
    }

    // Explicit price per liter if not found
    if (pricePerLiter == null) {
      for (const line of lines) {
        const m = line.match(RE_PRICE_PER);
        if (m) { pricePerLiter = parseAmount(m[1]); break; }
      }
    }

    // Total amount: try specific patterns first, then generic
    if (totalAmount == null) {
      // "Total (incl. VAT)" or "TOTAL AMOUNT DUE" with Php prefix
      for (const line of lines) {
        const m = line.match(/total\s*\(?incl\.?\s*vat\)?\s*[:\s]*(?:Php|P|₱)\s*([\d,]+\.?\d*)/i);
        if (m) {
          const val = parseAmount(m[1]);
          if (val > 10 && val < 100000) { totalAmount = val; break; }
        }
      }
    }
    if (totalAmount == null) {
      for (const line of lines) {
        const m = line.match(RE_TOTAL_DUE);
        if (m) {
          const val = parseAmount(m[1]);
          if (val > 10 && val < 100000) { totalAmount = val; break; }
        }
      }
    }
    if (totalAmount == null) {
      for (const line of lines) {
        const m = line.match(RE_TOTAL);
        if (m) {
          const val = parseAmount(m[1]);
          if (val > 10 && val < 100000) { totalAmount = val; break; }
        }
      }
    }

    // Fallback: find Php/PHP/₱/P amounts and pick the largest reasonable one
    if (totalAmount == null) {
      let best = 0;
      for (const line of lines) {
        const m = line.match(/(?:Php|PHP|[₱P])\s*([\d,]+\.\d{2})/);
        if (m) {
          const val = parseAmount(m[1]);
          if (val != null && val > best && val < 100000) best = val;
        }
      }
      if (best > 0) totalAmount = best;
    }

    // Cross-validate: if we have liters and price, compute expected total
    if (liters && pricePerLiter && totalAmount) {
      const expected = liters * pricePerLiter;
      const diff = Math.abs(expected - totalAmount);
      if (diff > totalAmount * 0.05) {
        validationFlags.push(`Amount mismatch: ${liters} × ${pricePerLiter} = ${expected.toFixed(2)}, but total shows ${totalAmount}`);
      }
    }
  }

  // --- Compute price_per_liter if missing ---
  if (pricePerLiter == null && liters && totalAmount) {
    pricePerLiter = parseFloat((totalAmount / liters).toFixed(2));
    priceComputed = true;
  }

  // --- Sanity checks ---
  if (totalAmount != null && (totalAmount < 10 || totalAmount > 100000)) {
    validationFlags.push(`Total amount ${totalAmount} seems unusual for a gas receipt — please verify`);
  }
  if (liters != null && (liters < 0.5 || liters > 500)) {
    validationFlags.push(`Liters ${liters} seems unusual — please verify`);
  }

  return {
    date: scoredField(date, getWordConfidencesForText(words, date), !!date),
    station_name: scoredField(stationName, getWordConfidencesForText(words, stationName), !!stationName),
    fuel_type: scoredField(fuelType, getWordConfidencesForText(words, fuelType), !!fuelType),
    liters: scoredField(liters, getWordConfidencesForText(words, String(liters || '')), liters != null),
    price_per_liter: scoredField(pricePerLiter, getWordConfidencesForText(words, String(pricePerLiter || '')), pricePerLiter != null),
    total_amount: scoredField(totalAmount, getWordConfidencesForText(words, String(totalAmount || '')), totalAmount != null),
    price_computed: priceComputed,
    is_shell: isShell,
    validation_flags: validationFlags,
  };
}

module.exports = { parseGasReceipt };

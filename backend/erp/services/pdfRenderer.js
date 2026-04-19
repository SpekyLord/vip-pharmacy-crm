/**
 * pdfRenderer — HTML → binary PDF conversion (Phase SG-Q2 W3 follow-up #3)
 *
 * Keeps puppeteer as an OPTIONAL dependency. Subscribers who want true binary
 * PDFs run `npm install puppeteer` in backend/ and flip the per-entity
 * PDF_RENDERER.BINARY_ENABLED lookup row to enabled=true. Everyone else
 * continues to get HTML (browser "Save as PDF"), which is the safe default.
 *
 * Rule #3 (lookup-driven): the PDF_RENDERER lookup controls behavior per
 * entity with zero code changes. Rule #2 (wire end-to-end): this service is
 * consumed by printCompensationStatement; adding another print route just
 * calls resolvePdfPreference() + htmlToPdf() here.
 *
 * Public API:
 *   - resolvePdfPreference(entityId, queryFormat) → 'pdf' | 'html'
 *         Combines the per-entity lookup + the ?format= query override.
 *   - htmlToPdf(html, opts)  → Buffer  (throws PDF_RENDERER_UNAVAILABLE)
 *   - getRendererStatus()    → { available, engine, error? }
 *         Lightweight introspection for admin settings UI.
 */

const Lookup = require('../models/Lookup');

const PDF_RENDERER_DEFAULTS = {
  // Opt-in — a fresh subsidiary stays on browser-print until admin flips this
  // lookup flag AND installs puppeteer. Matches the SMS channel posture.
  BINARY_ENABLED: false,
  ENGINE: 'puppeteer',
};

const PDF_UNAVAILABLE_ERR = 'PDF_RENDERER_UNAVAILABLE';

/**
 * Read + lazy-seed PDF_RENDERER config. Returns `{ binaryEnabled, engine }`.
 * Seeded rows carry `enabled: false` so nothing changes until admin opts in.
 */
async function getPdfRendererConfig(entityId) {
  const fallback = {
    binaryEnabled: PDF_RENDERER_DEFAULTS.BINARY_ENABLED,
    engine: PDF_RENDERER_DEFAULTS.ENGINE,
  };
  if (!entityId) return fallback;
  try {
    let rows = await Lookup.find({
      entity_id: entityId,
      category: 'PDF_RENDERER',
      is_active: true,
    }).lean();

    if (rows.length === 0) {
      try {
        await Lookup.updateOne(
          { entity_id: entityId, category: 'PDF_RENDERER', code: 'BINARY_ENABLED' },
          {
            $setOnInsert: {
              label: 'Enable binary PDF rendering for printable statements',
              sort_order: 0,
              is_active: true,
              metadata: {
                enabled: PDF_RENDERER_DEFAULTS.BINARY_ENABLED,
                engine: PDF_RENDERER_DEFAULTS.ENGINE,
                note: 'Flip enabled=true AND run "npm install puppeteer" in backend/ to emit real PDFs. Otherwise the /statement/print route continues to emit HTML that the browser prints via Save-as-PDF.',
              },
            },
          },
          { upsert: true }
        );
        rows = await Lookup.find({
          entity_id: entityId,
          category: 'PDF_RENDERER',
          is_active: true,
        }).lean();
      } catch (err) {
        console.warn('[pdfRenderer] PDF_RENDERER lazy-seed failed:', err.message);
        return fallback;
      }
    }

    const byCode = new Map(rows.map(r => [String(r.code).toUpperCase(), r]));
    const binaryRow = byCode.get('BINARY_ENABLED');
    return {
      binaryEnabled: binaryRow?.metadata?.enabled === true,
      engine: String(binaryRow?.metadata?.engine || PDF_RENDERER_DEFAULTS.ENGINE).toLowerCase(),
    };
  } catch (err) {
    console.warn('[pdfRenderer] getPdfRendererConfig failed:', err.message);
    return fallback;
  }
}

/**
 * Decide whether to emit PDF or HTML for a given print request.
 * Precedence: explicit `?format=pdf|html` query > per-entity lookup > default.
 */
async function resolvePdfPreference(entityId, queryFormat) {
  const normalized = String(queryFormat || '').toLowerCase();
  if (normalized === 'pdf') return 'pdf';
  if (normalized === 'html') return 'html';
  const cfg = await getPdfRendererConfig(entityId);
  return cfg.binaryEnabled ? 'pdf' : 'html';
}

/**
 * Introspection helper — used by the settings UI (and copilot) to tell the
 * admin whether puppeteer is actually importable on this box.
 */
function getRendererStatus() {
  try {
    // Do NOT cache — the admin may install puppeteer mid-process and expect
    // a fresh check on next click.
    require.resolve('puppeteer');
    return { available: true, engine: 'puppeteer' };
  } catch (err) {
    return { available: false, engine: null, error: err.message };
  }
}

/**
 * Render HTML to a PDF Buffer using puppeteer.
 *
 * Throws an Error with code = PDF_RENDERER_UNAVAILABLE when puppeteer is not
 * installed — callers should catch this and fall back to HTML. Any other
 * error is surfaced as-is so deployment issues (e.g. missing Chromium
 * sandbox) are visible in logs.
 */
async function htmlToPdf(html, opts = {}) {
  let puppeteer;
  try {
    // Dynamic require so absence of puppeteer does NOT break the process at
    // import time. Matches the optional-dependency pattern used elsewhere for
    // tesseract.js and `resend`.
    puppeteer = require('puppeteer');
  } catch (err) {
    const e = new Error(
      'Puppeteer is not installed. Run `npm install puppeteer` in backend/ to enable binary PDF rendering, ' +
      'or flip PDF_RENDERER.BINARY_ENABLED to false in Control Center to keep HTML output.'
    );
    e.code = PDF_UNAVAILABLE_ERR;
    e.cause = err;
    throw e;
  }

  const {
    format = 'A4',
    printBackground = true,
    margin = { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' },
    timeoutMs = 30000,
  } = opts;

  let browser = null;
  try {
    browser = await puppeteer.launch({
      headless: 'new',
      // Keep the launch args conservative so it boots in Docker/Lightsail.
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: timeoutMs });
    const buffer = await page.pdf({ format, printBackground, margin });
    return buffer;
  } finally {
    if (browser) {
      try { await browser.close(); } catch { /* best-effort */ }
    }
  }
}

module.exports = {
  PDF_UNAVAILABLE_ERR,
  PDF_RENDERER_DEFAULTS,
  getPdfRendererConfig,
  resolvePdfPreference,
  getRendererStatus,
  htmlToPdf,
};

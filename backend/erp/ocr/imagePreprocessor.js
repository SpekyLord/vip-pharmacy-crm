/**
 * OCR Image Preprocessor — Phase H4
 *
 * Optimizes phone-camera receipt photos for Google Vision OCR. Phone shots are
 * typically rotated, low-contrast, slightly blurry, and JPEG-compressed —
 * all of which hurt OCR accuracy. This pipeline:
 *
 *   1. EXIF auto-rotate    — corrects upside-down / sideways photos
 *   2. Grayscale            — receipts are monochrome; color hurts text recognition
 *   3. Normalize histogram  — stretches contrast so faded thermal prints stay legible
 *   4. Linear adjustment    — small contrast boost (1.15× gain, -8 offset)
 *   5. Sharpen              — edge enhancement helps Vision lock onto thin glyphs
 *   6. Output PNG (lossless)— avoids re-introducing JPEG artifacts before OCR
 *
 * Returns the enhanced buffer ALONGSIDE the original — the caller (ocrController)
 * uses enhanced for Vision but keeps the original/compressed copy for S3 so the
 * user sees their actual photo, not a grayscale version.
 *
 * Failure-safe: if sharp throws (corrupt image, unsupported format), falls back
 * to the original buffer so OCR still attempts on something rather than failing hard.
 */
const sharp = require('sharp');

/**
 * Enhance a photo buffer for OCR. Lossless PNG output.
 * @param {Buffer} buffer  — original phone photo (JPEG/PNG/HEIC)
 * @param {Object} [opts]
 * @param {number} [opts.maxDim=2400] — max edge size; larger keeps text crisp at the cost of Vision payload size
 * @param {boolean} [opts.grayscale=true] — disable for color-coded receipts (rare)
 * @returns {Promise<{ buffer: Buffer, mimetype: string, applied: boolean, error?: string }>}
 */
async function enhanceForOcr(buffer, opts = {}) {
  const { maxDim = 2400, grayscale = true } = opts;
  if (!buffer || !Buffer.isBuffer(buffer)) {
    return { buffer, mimetype: 'image/jpeg', applied: false, error: 'invalid buffer' };
  }
  try {
    let pipeline = sharp(buffer, { failOn: 'none' })
      .rotate()                       // EXIF auto-orient
      .resize({
        width: maxDim,
        height: maxDim,
        fit: 'inside',
        withoutEnlargement: true,
      });
    if (grayscale) pipeline = pipeline.grayscale();
    pipeline = pipeline
      .normalize()                    // stretch full dynamic range
      .linear(1.15, -8)               // small contrast / brightness tweak
      .sharpen({ sigma: 1.0 })        // edge enhancement for thin glyphs
      .png({ compressionLevel: 6, adaptiveFiltering: true });
    const out = await pipeline.toBuffer();
    return { buffer: out, mimetype: 'image/png', applied: true };
  } catch (err) {
    console.warn('[OcrPreprocessor] enhanceForOcr failed, using original buffer:', err.message);
    return { buffer, mimetype: 'image/jpeg', applied: false, error: err.message };
  }
}

module.exports = { enhanceForOcr };

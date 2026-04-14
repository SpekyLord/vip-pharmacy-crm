/**
 * Client-side image compression utility for ERP document uploads.
 *
 * Phone cameras produce 5-12MB photos that exceed the backend multer limit
 * and take too long to upload on mobile data. This utility compresses images
 * using the Canvas API before uploading.
 *
 * Settings are OCR-safe: 1600px max / 70% JPEG preserves receipt text for
 * Google Vision while reducing file size from ~8MB to ~400KB.
 *
 * @module erp/utils/compressImage
 */

const SKIP_THRESHOLD = 1 * 1024 * 1024; // 1MB — skip compression if already small

/**
 * Compress an image File using canvas, returning a new File ready for FormData.
 *
 * @param {File} file - Original image File from <input type="file">
 * @param {object} [opts]
 * @param {number} [opts.maxDimension=1600] - Max width or height (px)
 * @param {number} [opts.quality=0.7]       - JPEG quality (0-1)
 * @returns {Promise<File>} Compressed JPEG File (or original on error / small file)
 */
export async function compressImageFile(file, { maxDimension = 1600, quality = 0.7 } = {}) {
  // Skip non-images or already-small files
  if (!file || !file.type?.startsWith('image/') || file.size <= SKIP_THRESHOLD) {
    return file;
  }

  try {
    const bitmap = await createImageBitmap(file);
    let { width, height } = bitmap;

    // Scale down to fit within maxDimension (preserve aspect ratio)
    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    // Draw onto canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close(); // free memory

    // Convert to Blob, then File
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('toBlob returned null'))),
        'image/jpeg',
        quality
      );
    });

    // Preserve original filename with .jpg extension
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg', lastModified: Date.now() });
  } catch (err) {
    // Graceful fallback — upload original if compression fails (old browser, corrupt image)
    console.warn('[compressImage] Compression failed, using original:', err.message);
    return file;
  }
}

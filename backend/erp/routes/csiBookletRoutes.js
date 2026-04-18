/**
 * CSI Booklet Routes — Phase 15.2 (Monitoring + Traceability)
 *
 * Sub-permission gated: requires `inventory.csi_booklets` EXCEPT for
 * GET /available, which a BDM can call for their own numbers (bare protect).
 *
 * See CLAUDE-ERP §CSI Booklets for the BIR Iloilo HQ + remote BDM workflow.
 */
const express = require('express');
const crypto = require('crypto');
const sharp = require('sharp');
const router = express.Router();

const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const { uploadSingle, compressImage, handleUploadError } = require('../../middleware/upload');
const { uploadToS3 } = require('../../config/s3');

const ctrl = require('../controllers/csiBookletController');

const gate = erpSubAccessCheck('inventory', 'csi_booklets');

/**
 * Upload middleware for CSI void proof.
 * Mirrors processCommScreenshots() but writes to erp-documents/csi-voids/{year}/{month}/.
 */
const processVoidProof = async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Proof image is required to void a CSI number.' });
    }

    const { buffer: compressed, mimetype: compressedMime } = await compressImage(
      req.file.buffer,
      req.file.mimetype,
      { maxDim: 1920, quality: 85 }
    );

    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const ext = '.jpg';
    const key = `erp-documents/csi-voids/${year}/${month}/${crypto.randomUUID()}${ext}`;

    const url = await uploadToS3(compressed, key, compressedMime);

    req.uploadedProof = { url, key };
    next();
  } catch (error) {
    console.error('S3 CSI void proof upload error:', error);
    error.statusCode = 500;
    error.message = 'Failed to upload void proof image. Please try again.';
    next(error);
  }
};

// Admin /available — lets contractor/admin look up any BDM's available numbers
// (BDM self-service lives on /erp/my-csi/available; see routes/index.js)
router.get('/available', gate, ctrl.getAvailable);

// Sub-permission gated management endpoints
router.get('/', gate, ctrl.list);
router.get('/validate', gate, ctrl.validate);
router.post('/', gate, ctrl.create);
router.post('/:id/allocate', gate, ctrl.allocate);

router.post(
  '/:id/allocations/:allocIdx/void',
  gate,
  uploadSingle('proof'),
  handleUploadError,
  processVoidProof,
  ctrl.voidNumber
);

router.get('/:id/allocations/:allocIdx/voids/:voidIdx/proof', gate, ctrl.getVoidProof);

module.exports = router;

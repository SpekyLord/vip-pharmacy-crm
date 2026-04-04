/**
 * Import Routes
 *
 * Handles CPT Excel workbook import endpoints.
 * All routes require admin authentication.
 *
 * POST   /api/imports/upload     - Upload and parse CPT Excel file
 * GET    /api/imports            - List import batches
 * GET    /api/imports/:id        - Get batch detail
 * POST   /api/imports/:id/approve - Approve batch (write to DB)
 * POST   /api/imports/:id/reject  - Reject batch
 * DELETE /api/imports/:id        - Delete pending batch
 */

const express = require('express');
const multer = require('multer');
const path = require('path');
const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const importController = require('../controllers/importController');

const router = express.Router();

const parsedImportMaxFileSizeMb = parseInt(process.env.IMPORT_MAX_FILE_SIZE_MB || '5', 10);
const IMPORT_MAX_FILE_SIZE_MB = Number.isNaN(parsedImportMaxFileSizeMb) ? 5 : Math.max(1, parsedImportMaxFileSizeMb);
const IMPORT_MAX_FILE_SIZE = Math.max(1, IMPORT_MAX_FILE_SIZE_MB) * 1024 * 1024;

// Custom multer for Excel files (admin-only route + strict type checks)
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: IMPORT_MAX_FILE_SIZE,
  },
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowedExt = ['.xlsx'];
    const allowedMimes = new Set([
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/octet-stream', // fallback from some browsers/clients
    ]);

    if (!allowedExt.includes(ext)) {
      return cb(new Error('Invalid file extension. Only .xlsx files are allowed.'), false);
    }

    if (!allowedMimes.has(file.mimetype)) {
      return cb(new Error('Invalid file type. Only .xlsx files are allowed.'), false);
    }

    return cb(null, true);
  },
});

const uploadExcelFile = (req, res, next) => {
  excelUpload.single('file')(req, res, (err) => {
    if (!err) return next();

    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          message: `File too large. Maximum size is ${IMPORT_MAX_FILE_SIZE_MB}MB.`,
        });
      }
      return res.status(400).json({
        success: false,
        message: `Upload error: ${err.message}`,
      });
    }

    return res.status(400).json({
      success: false,
      message: err.message || 'Invalid file upload request.',
    });
  });
};

// All routes require admin auth
router.use(protect, adminOnly);

router.post('/upload', uploadExcelFile, importController.upload);
router.get('/', importController.list);
router.get('/:id', importController.getById);
// Approve may do bulk inserts (67+ doctors + 268 schedules) — extend timeout
router.post('/:id/approve', (req, res, next) => {
  req.setTimeout(120000); // 2 minutes
  next();
}, importController.approve);
router.post('/:id/reject', importController.reject);
router.delete('/:id', importController.deleteBatch);

module.exports = router;

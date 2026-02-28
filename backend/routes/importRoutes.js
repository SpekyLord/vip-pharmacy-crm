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
const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const importController = require('../controllers/importController');

const router = express.Router();

// Custom multer for Excel files (10MB limit)
const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only .xlsx and .xls files are allowed.'), false);
    }
  },
});

// All routes require admin auth
router.use(protect, adminOnly);

router.post('/upload', excelUpload.single('file'), importController.upload);
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

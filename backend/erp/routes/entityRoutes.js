const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const { upload, handleUploadError } = require('../../middleware/upload');
const entityController = require('../controllers/entityController');

const presidentAdmin = roleCheck('president', 'admin');
const financeReadable = roleCheck('admin', 'finance', 'president');

// CLM branding admin page needs staff read access too so BDMs can fetch
// their entity's deck config on CLMPresenter mount. Writes stay admin-only.
const clmBrandingReadable = roleCheck('admin', 'finance', 'president', 'staff');

// Multer `upload.fields` accepts the two optional logo files by name; the
// text fields (slides JSON, color, etc.) come in on req.body alongside them.
const clmBrandingUpload = (req, res, next) =>
  upload.fields([
    { name: 'logoCircle', maxCount: 1 },
    { name: 'logoTrademark', maxCount: 1 },
  ])(req, res, (err) => (err ? handleUploadError(err, req, res, next) : next()));

router.get('/', financeReadable, entityController.getAll);
router.get('/:id', financeReadable, entityController.getById);
router.post('/', roleCheck('president'), entityController.create);
router.put('/:id', presidentAdmin, entityController.update);

// ── CLM Branding (Phase 5 / PR1) ────────────────────────────────────
router.get('/:id/clm-branding', clmBrandingReadable, entityController.getClmBranding);
router.put('/:id/clm-branding', presidentAdmin, clmBrandingUpload, entityController.updateClmBranding);

module.exports = router;

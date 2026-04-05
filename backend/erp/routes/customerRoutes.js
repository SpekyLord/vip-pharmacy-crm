/**
 * Customer Routes — Phase 18
 * Shared infrastructure (no module gate, same level as /hospitals)
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { roleCheck } = require('../../middleware/roleCheck');
const c = require('../controllers/customerController');

router.get('/export', roleCheck('admin', 'finance', 'president'), c.exportCustomers);
router.post('/import', roleCheck('admin', 'finance', 'president'), upload.single('file'), c.importCustomers);
router.get('/', c.getAll);
router.get('/:id', c.getById);
router.post('/', roleCheck('admin', 'finance', 'president'), c.create);
router.put('/:id', roleCheck('admin', 'finance', 'president'), c.update);
router.patch('/:id/deactivate', roleCheck('admin', 'finance', 'president'), c.deactivate);
router.post('/:id/tag-bdm', roleCheck('admin', 'finance', 'president'), c.tagBdm);
router.post('/:id/untag-bdm', roleCheck('admin', 'finance', 'president'), c.untagBdm);

module.exports = router;

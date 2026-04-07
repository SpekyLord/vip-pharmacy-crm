const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { roleCheck } = require('../../middleware/roleCheck');
const c = require('../controllers/hospitalController');

// Note: protect + tenantFilter already applied at ERP router index level
router.get('/export', roleCheck('admin', 'finance', 'president'), c.exportHospitals);
router.post('/import', roleCheck('admin', 'finance', 'president'), upload.single('file'), c.importHospitals);
router.get('/', c.getAll);
router.get('/:id', c.getById);
router.post('/', roleCheck('admin', 'finance', 'president'), c.create);
router.put('/:id', roleCheck('admin', 'finance', 'president'), c.update);
router.patch('/:id/deactivate', roleCheck('admin', 'finance', 'president'), c.deactivate);
router.post('/:id/alias', roleCheck('admin', 'finance', 'president'), c.addAlias);
router.delete('/:id/alias', roleCheck('admin', 'finance', 'president'), c.removeAlias);

module.exports = router;

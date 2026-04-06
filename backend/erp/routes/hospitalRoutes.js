const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const { protect } = require('../../middleware/auth');
const { roleCheck } = require('../../middleware/roleCheck');
const c = require('../controllers/hospitalController');

router.get('/export', protect, roleCheck('admin', 'finance', 'president'), c.exportHospitals);
router.post('/import', protect, roleCheck('admin', 'finance', 'president'), upload.single('file'), c.importHospitals);
router.get('/', protect, c.getAll);
router.get('/:id', protect, c.getById);
router.post('/', protect, roleCheck('admin', 'finance', 'president'), c.create);
router.put('/:id', protect, roleCheck('admin', 'finance', 'president'), c.update);
router.patch('/:id/deactivate', protect, roleCheck('admin', 'finance', 'president'), c.deactivate);
router.post('/:id/alias', protect, roleCheck('admin', 'finance', 'president'), c.addAlias);
router.delete('/:id/alias', protect, roleCheck('admin', 'finance', 'president'), c.removeAlias);

module.exports = router;

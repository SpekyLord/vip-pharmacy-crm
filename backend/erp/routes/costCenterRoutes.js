/**
 * Cost Center Routes — Phase 15.5
 */
const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
const ctrl = require('../controllers/costCenterController');

router.get('/export', ctrl.exportCostCenters);
router.post('/import', upload.single('file'), ctrl.importCostCenters);
router.get('/', ctrl.list);
router.get('/tree', ctrl.getTree);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);

module.exports = router;

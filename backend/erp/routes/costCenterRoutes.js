/**
 * Cost Center Routes — Phase 15.5
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/costCenterController');

router.get('/', ctrl.list);
router.get('/tree', ctrl.getTree);
router.post('/', ctrl.create);
router.put('/:id', ctrl.update);

module.exports = router;

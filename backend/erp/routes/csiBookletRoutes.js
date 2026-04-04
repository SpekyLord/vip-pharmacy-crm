/**
 * CSI Booklet Routes — Phase 15.2
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/csiBookletController');

router.get('/', ctrl.list);
router.post('/', ctrl.create);
router.post('/:id/allocate', ctrl.allocate);
router.get('/validate', ctrl.validate);

module.exports = router;

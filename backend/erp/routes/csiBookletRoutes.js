/**
 * CSI Booklet Routes — Phase 15.2
 */
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/csiBookletController');

router.get('/', ctrl.list);
router.get('/validate', ctrl.validate);
router.post('/', ctrl.create);
router.post('/:id/allocate', ctrl.allocate);

module.exports = router;

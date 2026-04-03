const express = require('express');
const {
  getByEvent,
  getByType,
  getBySource,
  getDocumentFlow
} = require('../controllers/documentController');

const router = express.Router();

// Document attachment queries (Phase 9.1b)
router.get('/by-event/:event_id', getByEvent);
router.get('/by-type', getByType);
router.get('/by-source', getBySource);

// Document flow chain (Phase 9.3)
router.get('/flow/:event_id', getDocumentFlow);

module.exports = router;

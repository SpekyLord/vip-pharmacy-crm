const express = require('express');
const router = express.Router();
const c = require('../controllers/collectionController');
const periodLockCheck = require('../middleware/periodLockCheck');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');

// Static routes first (before /:id)
router.get('/open-csis', c.getOpenCsisEndpoint);
router.get('/ar-aging', c.getArAgingEndpoint);
router.get('/collection-rate', c.getCollectionRateEndpoint);
router.post('/validate', c.validateCollections);
router.post('/submit', periodLockCheck('COLLECTION'), c.submitCollections);
router.post('/reopen', periodLockCheck('COLLECTION'), c.reopenCollections);
router.post('/soa', c.generateSoaEndpoint);
router.delete('/draft/:id', c.deleteDraftCollection);

// CRUD
router.get('/', c.getCollections);
router.post('/', c.createCollection);
router.get('/:id', c.getCollectionById);
router.put('/:id', c.updateCollection);
router.post('/:id/request-deletion', c.requestDeletion);
// Phase 3c — legacy approve-deletion path (President Reverse is preferred for full cleanup,
// but route retained for back-compat). Tier 2 lookup-only danger gate.
router.post('/:id/approve-deletion', erpSubAccessCheck('accounting', 'approve_deletion'), c.approveDeletion);

// President-only delete + reverse (lookup-driven sub-permission; baseline = President only
// per ERP_DANGER_SUB_PERMISSIONS). SAP Storno for POSTED/DELETION_REQUESTED, hard delete for
// DRAFT/VALID/ERROR. Reversal entries post to the current open period; original document
// retained for audit with `deletion_event_id` set.
router.post('/:id/president-reverse', erpSubAccessCheck('accounting', 'reverse_posted'), c.presidentReverseCollection);

module.exports = router;

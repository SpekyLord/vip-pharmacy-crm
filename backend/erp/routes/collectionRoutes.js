const express = require('express');
const router = express.Router();
const c = require('../controllers/collectionController');
const { roleCheck } = require('../../middleware/roleCheck');

// Static routes first (before /:id)
router.get('/open-csis', c.getOpenCsisEndpoint);
router.get('/ar-aging', c.getArAgingEndpoint);
router.get('/collection-rate', c.getCollectionRateEndpoint);
router.post('/validate', c.validateCollections);
router.post('/submit', c.submitCollections);
router.post('/reopen', c.reopenCollections);
router.post('/soa', c.generateSoaEndpoint);
router.delete('/draft/:id', c.deleteDraftCollection);

// CRUD
router.get('/', c.getCollections);
router.post('/', c.createCollection);
router.get('/:id', c.getCollectionById);
router.put('/:id', c.updateCollection);
router.post('/:id/request-deletion', c.requestDeletion);
router.post('/:id/approve-deletion', roleCheck('admin', 'finance'), c.approveDeletion);

module.exports = router;

/**
 * Credit Note Routes — Phase 25
 * Return/Credit Note workflow
 */
const express = require('express');
const router = express.Router();
const c = require('../controllers/creditNoteController');

router.post('/', c.createCreditNote);
router.get('/', c.getCreditNotes);
router.get('/:id', c.getCreditNoteById);
router.put('/:id', c.updateCreditNote);
router.delete('/:id', c.deleteCreditNote);

router.post('/validate', c.validateCreditNotes);
router.post('/submit', c.submitCreditNotes);

module.exports = router;

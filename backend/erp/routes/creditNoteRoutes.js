/**
 * Credit Note Routes — Phase 25
 * Return/Credit Note workflow
 * Multi-gated: requires sales.credit_notes OR purchasing.credit_notes
 * (contractors with purchasing access can process returns)
 */
const express = require('express');
const router = express.Router();
const { erpAnySubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/creditNoteController');

const gate = erpAnySubAccessCheck(['sales', 'credit_notes'], ['purchasing', 'credit_notes']);

router.post('/', gate, c.createCreditNote);
router.get('/', gate, c.getCreditNotes);
router.get('/:id', gate, c.getCreditNoteById);
router.put('/:id', gate, c.updateCreditNote);
router.delete('/:id', gate, c.deleteCreditNote);

router.post('/validate', gate, c.validateCreditNotes);
router.post('/submit', gate, c.submitCreditNotes);

module.exports = router;

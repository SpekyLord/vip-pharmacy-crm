const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const { listCards, getMyCards, createCard, updateCard, deleteCard, exportCards } = require('../controllers/creditCardController');

// ═══ Credit Cards ═══
router.get('/export', roleCheck('admin', 'finance', 'president'), exportCards);
router.get('/', listCards);
router.get('/my-cards', getMyCards);
router.post('/', roleCheck('admin', 'finance', 'president'), createCard);
router.put('/:id', roleCheck('admin', 'finance', 'president'), updateCard);
// Phase 3c — Tier 2 lookup-only danger key. Card delete may orphan posted txns.
router.delete('/:id', erpSubAccessCheck('accounting', 'card_delete'), deleteCard);

module.exports = router;

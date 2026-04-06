const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const { listCards, getMyCards, createCard, updateCard, deleteCard, exportCards } = require('../controllers/creditCardController');

// ═══ Credit Cards ═══
router.get('/export', roleCheck('admin', 'finance', 'president'), exportCards);
router.get('/', listCards);
router.get('/my-cards', getMyCards);
router.post('/', roleCheck('admin', 'finance', 'president'), createCard);
router.put('/:id', roleCheck('admin', 'finance', 'president'), updateCard);
router.delete('/:id', roleCheck('admin', 'finance', 'president'), deleteCard);

module.exports = router;

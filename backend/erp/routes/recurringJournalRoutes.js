const express = require('express');
const router = express.Router();
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const ctrl = require('../controllers/recurringJournalController');

const writeGuard = erpSubAccessCheck('accounting', 'journal_entry');

// Static routes BEFORE /:id
router.get('/export', ctrl.exportTemplates);
router.post('/import', writeGuard, ctrl.uploadMiddleware, ctrl.importTemplates);
router.post('/run-all-due', writeGuard, ctrl.runAllDue);

router.get('/', ctrl.listTemplates);
router.get('/:id', ctrl.getTemplate);
router.post('/', writeGuard, ctrl.createTemplate);
router.put('/:id', writeGuard, ctrl.updateTemplate);
router.delete('/:id', writeGuard, ctrl.deleteTemplate);
router.post('/:id/run', writeGuard, ctrl.runNow);

module.exports = router;

const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const ac = require('../controllers/accountingController');

// ═══ Journal Entries ═══
router.post('/journals', roleCheck('admin', 'finance', 'president'), ac.createManualJournal);
router.get('/journals', ac.listJournals);
router.get('/journals/:id', ac.getJournalById);
router.post('/journals/:id/post', roleCheck('admin', 'finance', 'president'), ac.postJournalEndpoint);
router.post('/journals/:id/reverse', roleCheck('admin', 'finance', 'president'), ac.reverseJournalEndpoint);

// ═══ General Ledger ═══
router.get('/general-ledger/:accountCode', ac.getGeneralLedgerEndpoint);

// ═══ Trial Balance ═══
router.get('/trial-balance/:period', ac.getTrialBalance);

// ═══ P&L ═══
router.get('/pnl/:period', ac.getPnl);
router.get('/vat-return/:quarter/:year', ac.getVatReturnEndpoint);
router.get('/cwt-summary/:quarter/:year', ac.getCwtSummaryEndpoint);

// ═══ VAT Ledger ═══
router.get('/vat-ledger/:period', ac.getVatLedgerEndpoint);
router.post('/vat-ledger/:id/tag', roleCheck('admin', 'finance', 'president'), ac.tagVatEntryEndpoint);

// ═══ CWT Ledger ═══
router.get('/cwt-ledger/:period', ac.getCwtLedgerEndpoint);

// ═══ Cashflow ═══
router.get('/cashflow/:period', ac.getCashflowEndpoint);

// ═══ Fixed Assets ═══
router.get('/fixed-assets', ac.listFixedAssets);
router.post('/fixed-assets', roleCheck('admin', 'finance', 'president'), ac.createFixedAsset);
router.post('/depreciation/compute', roleCheck('admin', 'finance', 'president'), ac.computeDepreciationEndpoint);
router.get('/depreciation/staging/:period', ac.getDepreciationStagingEndpoint);
router.post('/depreciation/approve', roleCheck('admin', 'finance', 'president'), ac.approveDepreciationEndpoint);
router.post('/depreciation/post', roleCheck('admin', 'finance', 'president'), ac.postDepreciationEndpoint);

// ═══ Loans ═══
router.get('/loans', ac.listLoans);
router.post('/loans', roleCheck('admin', 'finance', 'president'), ac.createLoan);
router.post('/interest/compute', roleCheck('admin', 'finance', 'president'), ac.computeInterestEndpoint);
router.get('/interest/staging/:period', ac.getInterestStagingEndpoint);
router.post('/interest/approve', roleCheck('admin', 'finance', 'president'), ac.approveInterestEndpoint);
router.post('/interest/post', roleCheck('admin', 'finance', 'president'), ac.postInterestEndpoint);

// ═══ Owner Equity ═══
router.get('/owner-equity', ac.getEquityLedgerEndpoint);
router.post('/owner-equity/infusion', roleCheck('admin', 'finance', 'president'), ac.recordInfusionEndpoint);
router.post('/owner-equity/drawing', roleCheck('admin', 'finance', 'president'), ac.recordDrawingEndpoint);

module.exports = router;

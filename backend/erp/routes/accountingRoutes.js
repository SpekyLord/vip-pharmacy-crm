/**
 * Accounting Routes — Phase 11, updated Phase 16 (sub-module access)
 *
 * Write operations gated by erpSubAccessCheck (replaces roleCheck).
 * Read routes rely on module-level erpAccessCheck('accounting') at mount.
 */
const express = require('express');
const router = express.Router();
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const ac = require('../controllers/accountingController');

// ═══ Journal Entries ═══
router.post('/journals', erpSubAccessCheck('accounting', 'journal_entry'), ac.createManualJournal);
router.get('/journals', ac.listJournals);
router.get('/journals/:id', ac.getJournalById);
router.post('/journals/:id/post', erpSubAccessCheck('accounting', 'journal_entry'), ac.postJournalEndpoint);
router.post('/journals/:id/reverse', erpSubAccessCheck('accounting', 'journal_entry'), ac.reverseJournalEndpoint);

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
router.post('/vat-ledger/:id/tag', erpSubAccessCheck('accounting', 'vat_filing'), ac.tagVatEntryEndpoint);

// ═══ CWT Ledger ═══
router.get('/cwt-ledger/:period', ac.getCwtLedgerEndpoint);

// ═══ Cashflow ═══
router.get('/cashflow/:period', ac.getCashflowEndpoint);

// ═══ Fixed Assets ═══
router.get('/fixed-assets', ac.listFixedAssets);
router.post('/fixed-assets', erpSubAccessCheck('accounting', 'fixed_assets'), ac.createFixedAsset);
router.post('/depreciation/compute', erpSubAccessCheck('accounting', 'fixed_assets'), ac.computeDepreciationEndpoint);
router.get('/depreciation/staging/:period', ac.getDepreciationStagingEndpoint);
router.post('/depreciation/approve', erpSubAccessCheck('accounting', 'fixed_assets'), ac.approveDepreciationEndpoint);
router.post('/depreciation/post', erpSubAccessCheck('accounting', 'fixed_assets'), ac.postDepreciationEndpoint);

// ═══ Loans ═══
router.get('/loans', ac.listLoans);
router.post('/loans', erpSubAccessCheck('accounting', 'loans'), ac.createLoan);
router.post('/interest/compute', erpSubAccessCheck('accounting', 'loans'), ac.computeInterestEndpoint);
router.get('/interest/staging/:period', ac.getInterestStagingEndpoint);
router.post('/interest/approve', erpSubAccessCheck('accounting', 'loans'), ac.approveInterestEndpoint);
router.post('/interest/post', erpSubAccessCheck('accounting', 'loans'), ac.postInterestEndpoint);

// ═══ Owner Equity ═══
router.get('/owner-equity', ac.getEquityLedgerEndpoint);
router.post('/owner-equity/infusion', erpSubAccessCheck('accounting', 'owner_equity'), ac.recordInfusionEndpoint);
router.post('/owner-equity/drawing', erpSubAccessCheck('accounting', 'owner_equity'), ac.recordDrawingEndpoint);

module.exports = router;

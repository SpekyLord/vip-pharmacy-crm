/**
 * Petty Cash Routes — Phase 19 + Phase 3a rollout
 *
 * Fund management, transactions, ceiling checks, remittance/replenishment docs.
 * Module-level erpAccessCheck('accounting') applied in index.js.
 * Sub-permission gated: requires accounting.petty_cash for write actions.
 * Contractors with petty_cash sub-permission can post/void/process/generate.
 *
 * Authorization:
 *   Fund CRUD: sub-permission gated (admin/finance/president + contractors w/ petty_cash)
 *   Transactions create: custodian + privileged (checked in controller)
 *   Post/Void/Process/Generate: sub-permission gated
 *   Delete fund: lookup-driven danger sub-perm (accounting.reverse_posted) — was
 *     hardcoded `roleCheck('president')`; now delegable via Access Template so
 *     subsidiaries can authorize a CFO without a code change. Baseline still
 *     defaults to President-only because reverse_posted is a baseline danger key.
 *   Reverse txn: lookup-driven danger sub-perm (accounting.reverse_posted)
 */
const express = require('express');
const router = express.Router();
const { erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/pettyCashController');

// Sub-permission gate: accounting.petty_cash
// Admin/finance/president with FULL accounting access pass automatically;
// contractors need explicit petty_cash sub-permission in their access template.
const pcGate = erpSubAccessCheck('accounting', 'petty_cash');

// ═══ Funds ═══
router.get('/funds', c.getFunds);                                      // All w/ accounting access: view funds
router.get('/funds/:id', c.getFundById);                               // All w/ accounting access: view fund detail
router.post('/funds', pcGate, c.createFund);                           // Sub-permission gated: create fund
router.put('/funds/:id', pcGate, c.updateFund);                        // Sub-permission gated: edit fund
router.delete('/funds/:id', erpSubAccessCheck('accounting', 'reverse_posted'), c.deleteFund);  // Lookup-driven danger gate

// ═══ Transactions ═══
router.get('/transactions', c.getTransactions);                        // All w/ accounting access: view
router.post('/transactions', c.createTransaction);                     // Custodian + privileged (checked in controller)
router.put('/transactions/:id', c.updateTransaction);                  // DRAFT only — custodian edits own, privileged edits any
router.post('/transactions/:id/post', pcGate, c.postTransaction);      // Sub-permission gated: post
router.post('/transactions/:id/void', pcGate, c.voidTransaction);      // Sub-permission gated: void DRAFT
// President-only SAP Storno for POSTED txns (lookup-driven: accounting.reverse_posted).
// Reverses linked JE, flips fund balance back, marks txn VOIDED with audit log.
router.post('/transactions/:id/president-reverse', erpSubAccessCheck('accounting', 'reverse_posted'), c.presidentReversePettyCashTxn);

// ═══ Ceiling Check ═══
router.get('/ceiling/:fundId', c.checkCeiling);

// ═══ Remittance & Replenishment ═══
router.post('/remittances/generate', pcGate, c.generateRemittance);    // Sub-permission gated
router.post('/replenishments/generate', pcGate, c.generateReplenishment); // Sub-permission gated

// ═══ Documents ═══
router.get('/documents', c.getDocuments);
router.post('/documents/:id/sign', pcGate, c.signDocument);            // Sub-permission gated (cosmetic, not required)
router.post('/documents/:id/process', pcGate, c.processDocument);      // Sub-permission gated: process

module.exports = router;

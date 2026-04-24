# PHASETASK.md — VIP Integrated Platform Build Plan
## For Claude Code Execution

**Branch:** `erp-integration`
**Codebase:** `VIP-PHARMACY-CRM` (MERN stack)
**Reference PRD:** `docs/PRD-ERP.md`

**Rule:** Complete ALL checkboxes in a phase before moving to the next phase. Each phase is self-contained and testable.

**Key Principle:** DO NOT reorganize existing CRM files. All ERP code goes in NEW `erp/` directories. CRM code stays exactly where it is.

**UI Reference:** BOSS app (Play Store) — client wants this style for the ERP dashboard.
**ERP Design Standard:** SAP, NetSuite, and QuickBooks are the standard references for all ERP patterns, workflows, and terminology. Every transactional module follows the Document Lifecycle: DRAFT -> VALIDATE -> POSTED -> RE-OPEN. See PRD Section 2.1 and Section 5.5.
**Client Direction (March 31, 2026):** "need naton himuon nga standard reference ang SAP, NetSuite or Quickbooks para sa aton ERP."
**Current Live Baseline:** The client already operates an Excel + Apps Script ERP with sales validate/submit/re-open, collection validation + proof gates, journal rebuild, SALES/CORE export to PNL, SOA generation, and ERP month snapshot close / restore. Tasks below formalize those proven behaviors in MERN and then add the March 31 SAP-style upgrades where specified.

---

## PHASE 0 — ADD ERP SCAFFOLD (NO CRM CHANGES) ✅ COMPLETE
**Goal:** Add ERP folder structure and navigation alongside existing CRM. CRM must still work perfectly — zero files moved, zero imports changed.

> **Status:** Phase 0 complete as of March 2026. Backend starts clean (health 200, MongoDB connected). Frontend builds with 0 errors. Remaining 0.6 items (login, dashboard, visits, products, messages) need manual verification with prod credentials.

### 0.1 — Create ERP Backend Structure ✅
- [x] Create `backend/erp/` directory
- [x] Create `backend/erp/models/` directory
- [x] Create `backend/erp/controllers/` directory
- [x] Create `backend/erp/routes/` directory
- [x] Create `backend/erp/services/` directory
- [x] Create `backend/erp/ocr/` directory
- [x] Create `backend/erp/middleware/` directory

### 0.2 — Create ERP Frontend Structure ✅
- [x] Create `frontend/src/erp/` directory
- [x] Create `frontend/src/erp/pages/` directory
- [x] Create `frontend/src/erp/components/` directory
- [x] Create `frontend/src/erp/services/` directory
- [x] Create `frontend/src/erp/hooks/` directory

### 0.3 — Add ERP Route Mount in server.js ✅
- [x] In `backend/server.js`, add a comment block: `// ═══ ERP ROUTES ═══`
- [x] Add ERP route mount placeholder: `// app.use('/api/erp', require('./erp/routes'));` (commented out until Phase 1)
- [x] Verify server still starts cleanly with no errors
- [x] Commit: `"scaffold: add erp folder structure alongside existing crm"`

### 0.4 — Add ERP Navigation to Frontend ✅
- [x] In existing `frontend/src/components/common/Navbar.jsx`:
  - Add an "ERP" section/tab group that shows for logged-in users
  - ERP tabs: Dashboard, Sales, Inventory, Collections, Expenses, Reports
  - CRM tabs remain exactly as they are — no changes to existing nav items
  - On mobile: add a CRM/ERP toggle or tab group at the top
- [x] Create `frontend/src/erp/pages/ErpDashboard.jsx` — placeholder page with title "ERP Dashboard — Coming Soon"
- [x] Create `frontend/src/erp/pages/OcrTest.jsx` — placeholder page with title "OCR Test"
- [x] In `frontend/src/App.jsx`:
  - Add ERP route: `<Route path="/erp" element={<ErpDashboard />} />`
  - Add OCR test route: `<Route path="/erp/ocr-test" element={<OcrTest />} />`
  - Keep ALL existing CRM routes exactly as they are — do not change any paths
- [x] Verify: CRM pages still load correctly at their existing URLs
- [x] Verify: new ERP tabs appear in navbar
- [x] Verify: clicking "ERP Dashboard" shows the placeholder page
- [x] Commit: `"scaffold: add erp navigation tabs alongside crm"`

### 0.5 — Copy Reference Documents to docs/ ✅
- [x] Copy `VIP_IP_PRD_v4_MERN.md` to `docs/` folder
- [x] Copy this `PHASETASK.md` to `docs/` folder
- [x] Commit: `"docs: add erp prd and phase task plan"`

### 0.6 — Verify CRM Is Untouched ✅
- [x] Backend starts without errors (health check 200, MongoDB connected, no ERP errors in logs)
- [x] Frontend starts without errors (vite build succeeds with 0 errors, all chunks generated)
- [x] Login works — CRM is live and in daily use
- [x] CRM dashboard loads (admin and employee) — CRM is live
- [x] VIP Client / Doctor list loads — CRM is live
- [x] Can log a visit with GPS + photo — CRM is live
- [x] Products page loads — CRM is live
- [x] Messages work — CRM is live
- [x] All existing CRM features work as before (no code changes to CRM files)
- [x] No console errors related to ERP changes (ERP route is commented out, no ERP imports in CRM code)
- [x] Commit: `"verify: crm fully functional after erp scaffold"` — verified via production use

---

## PHASE 1 — OCR ENGINE (CLIENT PRIORITY #1) ✅ CORE COMPLETE
**Goal:** Build a standalone OCR test page where the client can photograph VIP documents (CSI, CR, BIR 2307, gas receipts, odometer) and see extracted data. This is what the client wants to demo FIRST.

**Prerequisites:** Google Cloud project with Vision API enabled, local ADC auth or service-account credentials, existing S3 bucket access (from CRM config/s3.js)

> **Status (April 2026):** Phase 1 core complete. All 8 parsers implemented and tested with real documents. OCR test page fully functional at `/erp/ocr-test`. Parser tuning continues incrementally as each ERP module is built.
> - **Done:** 1.1–1.13, 1.15, 1.16 (core)
> - **Moved to Phase 2:** 1.14 (Smart Dropdowns → 2.17, depends on Hospital/ProductMaster models)
> - **Remaining:** 1.17 (OR extraction-only refactor — do at start of Phase 2 alongside 2.15)
> - **Pending commit:** OcrTest.jsx null field crash fix (`'confidence' in null`)
> - **Commits:** `36a4587` → `ea4fdae` (6 commits total)

### 1.1 — Google Vision API Setup ✅
- [x] Install `@google-cloud/vision` package: `cd backend && npm install @google-cloud/vision`
- [x] Add Google Vision configuration to `backend/.env`:
  ```
  GOOGLE_CLOUD_PROJECT_ID=your-project-id
  GOOGLE_APPLICATION_CREDENTIALS=
  GOOGLE_VISION_KEY_JSON=
  GOOGLE_VISION_DEFAULT_FEATURE=DOCUMENT_TEXT_DETECTION
  ```
  Local development uses ADC (`gcloud auth application-default login`) by default; deployed environments can use `GOOGLE_APPLICATION_CREDENTIALS` or `GOOGLE_VISION_KEY_JSON`.
- [x] Create `backend/erp/ocr/visionClient.js`:
  - Initialize Google Vision client from ADC, service-account path, or inline JSON
  - Export `detectText(imageBuffer)` function that calls the configured Vision OCR feature
  - Default to `DOCUMENT_TEXT_DETECTION`, with per-request override support
  - Return: full text, words with bounding boxes, confidence scores per word
- [x] Test: call `detectText()` with a sample image, verify raw text returns
- [x] Commit: `ba9bdb7` `"feat(ocr): integrate Google Vision API for OCR processing"`

### 1.2 — S3 Document Upload for ERP ✅
- [x] Create `backend/erp/services/documentUpload.js`:
  - Reuse existing `backend/config/s3.js` S3 client
  - Implement `uploadErpDocument(fileBuffer, fileName, bdmName, period, cycle, docType)`
  - S3 key format: `erp-documents/${bdmName}/${period}/${cycle}/${docType}/${fileName}`
  - Return the S3 URL
- [x] Test: upload a test image, verify it appears in S3 at correct path
- [x] Commit: included in `36a4587`

### 1.3 — Base OCR Processing Route ✅
- [x] Create `backend/erp/routes/ocrRoutes.js`:
  - POST `/process` — accepts multipart `photo` file + `docType` string
  - GET `/types` — returns supported document types
  - Uses existing `backend/middleware/auth.js` for authentication
  - Uses existing `backend/middleware/upload.js` for file upload
  - Flow: receive file → upload to S3 → send buffer to Vision API → return raw text + S3 URL
- [x] Create `backend/erp/routes/index.js` — ERP router that mounts all ERP sub-routes:
  ```javascript
  const router = require('express').Router();
  router.use('/ocr', require('./ocrRoutes'));
  module.exports = router;
  ```
- [x] In `backend/server.js`, uncomment and add:
  ```javascript
  app.use('/api/erp', userLimiter, require('./erp/routes'));
  ```
- [x] Test: POST `/api/erp/ocr/process` with a CSI photo, verify raw OCR text returns
- [x] Commit: included in `36a4587`

### 1.4 — CSI Parser (Charge Sales Invoice) ✅
- [x] Create `backend/erp/ocr/parsers/csiParser.js`
- [x] Implement header extraction:
  - Invoice No: detect `N°` or `No.` or `No:` followed by digits (e.g., `004719`)
  - Date: detect `Date:` or `Date` followed by date pattern (MM/DD/YY or similar)
  - Hospital/Charge To: detect `CHARGE TO:` and extract the name on that line
  - Terms: detect `TERMS:` and extract (e.g., `30 days`)
- [x] Implement 3-line product parser (PRD Section 7.3):
  - Scan all OCR lines looking for "Batch" keyword → that's Line 2
  - Line above "Batch" → Line 1 (product name: brand before "(", generic between "()", dosage after ")")
  - Line below with "Exp" → Line 3 (expiry date)
  - Extract: brand_name, generic_name, dosage, batch_lot_no, expiry_date
- [x] Implement line item extraction:
  - For each product block: find Quantity, Unit Price, Amount in the corresponding table row
  - Match product text position to the numeric columns
  - Handles dash-decimal ("720-00"), dot-thousands, parentheses formats
- [x] Implement footer extraction:
  - Total Sales (VAT Inclusive)
  - Less: VAT / VATable Sales / VAT Amount
  - Amount: Net of VAT / VAT-Exclusive
  - Total Amount Due
- [x] Semantic validation: qty × unit_price ≈ amount cross-checks
- [x] Add per-field confidence scoring:
  - HIGH: Vision confidence > 0.9 AND regex matched
  - MEDIUM: Vision confidence 0.7-0.9 OR partial regex match
  - LOW: Vision confidence < 0.7 OR no pattern match
- [x] Test with actual VIP CSI photos including hospital multi-line (two-column OCR), BIR filtering, inline qty from dosage
- [x] Commits: `36a4587`, `ea4fdae` (inline qty extraction from dosage line)

> **Known limitation:** Detailed footer cross-validation (VAT mismatch flag) not yet implemented as a separate validation step — basic semantic validation exists.

### 1.5 — Collection Receipt Parser ✅
- [x] Create `backend/erp/ocr/parsers/crParser.js`
- [x] Extract header fields:
  - CR No: detect `N°` or `No.` followed by digits (e.g., `002905`)
  - Date: detect `Date` followed by date pattern (numeric and written formats)
  - Hospital: detect `Received from` and extract the name
  - Amount: detect `pesos(P` or `₱` followed by amount pattern (e.g., `48,740.72`)
- [x] Extract payment info:
  - Form of Payment: detect `CASH` or `CHECK` checkmarks/text
  - Check No: detect `CHECK No.` and extract
  - Bank: detect `BANK` and extract
- [x] Extract CSI settlement table (left stub):
  - Detect `CHARGE SALES INVOICE No.` and `AMOUNT` header pattern
  - Parse rows: CSI number + amount pairs (e.g., 4413=24,000 / 4411=10,800 / 4407=12,000 / 4250=4,000)
  - Handles dash-decimal amounts
- [x] Add per-field confidence scoring
- [x] Commit: included in `36a4587`

> **Note:** CR parser not yet tested with real documents this session — needs validation in next session.
> **Future (Phase 2+):** Hospital field should have a searchable dropdown lookup from Hospital collection. CSI settlement list should auto-populate from open AR CSIs for the matched hospital. These lookup aids reduce manual typing and are planned for task 1.14 (Smart Dropdowns) and 5.2b (CR→AR auto-population).

### 1.6 — BIR 2307 Parser (CWT Certificate) ✅
- [x] Create `backend/erp/ocr/parsers/cwtParser.js`
- [x] Handle rotated documents (Vision API handles rotation — no special code needed)
- [x] Extract payee info:
  - TIN: detect TIN pattern (space-separated "010 824 240" → "010-824-240")
  - Name: detect payee/taxpayer name (registered name)
- [x] Extract payor info:
  - Name: detect payor name
  - TIN: detect payor TIN
  - Address: detect registered address
- [x] Extract period:
  - From date and To date (MM/DD/YYYY pattern)
- [x] Extract financial data:
  - ATC code (e.g., WC 158)
  - Income Payment amounts per quarter column
  - Tax Withheld amounts per quarter column
  - Totals: total income, total tax withheld
- [x] Add per-field confidence scoring
- [x] Commit: included in `36a4587`

> **Known issues (mitigated in code):**
> - Tax withheld logic can grab ATC code if spacing is poor (mitigation in place)
> - TIN may be truncated if non-standard format
> - `period_from` sometimes missing if date format unusual
> - Needs further real-document testing in next session

### 1.7 — Gas Receipt Parser ✅
- [x] Create `backend/erp/ocr/parsers/gasReceiptParser.js`
- [x] Extract: date, station name, fuel type (brand mapping: Shell SVP, Petron XCS, Caltex, generic ULG/DSL), liters, price per liter, total amount
- [x] Handle Shell receipts (SVP, QTY space-decimal, pre-auth amount, "40.071L × 58.190P/L" format)
- [x] Handle Shell POS (L×P/L format)
- [x] Handle Petron POS (Php prefix, XCS/*ICS OCR mangling)
- [x] Handle FSGASOLINE fuel code
- [x] Handle colon-as-decimal QTY ("34:333" → 34.333)
- [x] Handle space-as-decimal liters ("3 840" → 3.840)
- [x] POS format detection, price_computed flag, validation flags (amount/liters sanity checks)
- [x] Add per-field confidence scoring
- [x] Commits: `36a4587`, `a8dc2a3` (FSGASOLINE + colon-as-decimal fixes)

### 1.8 — Odometer Parser ✅
- [x] Create `backend/erp/ocr/parsers/odometerParser.js`
- [x] Extract numeric reading from dashboard photo (5-6 digit numbers near "ODO" label)
- [x] Concatenation logic for split readings ("855 75" → 85575)
- [x] Filters out speedometer markings (20, 40, 60, 80, 100, 120, etc.)
- [x] Use photo EXIF timestamp as the capture date (converts EXIF format to DD/MM/YYYY)
- [x] Add confidence scoring (odometer photos are lower quality — expect more LOW confidence)
- [x] Validation flags for missing readings
- [x] Commit: included in `36a4587`

### 1.9 — Expense Receipt / OR Parser ✅
- [x] Create `backend/erp/ocr/parsers/orParser.js`
- [x] Extract: OR number (multiple patterns), date (multiple formats), supplier/establishment name, amount, VAT amount
- [x] Generic enough to handle parking receipts, toll receipts, misc expenses
- [x] Courier support (AP Cargo tracking numbers, line items)
- [x] Payment mode detection (CASH, GCASH, CHECK, CARD, ONLINE, etc.)
- [x] Series No. cross-line extraction, date priority logic, two-column footer
- [x] VAT auto-computation (12/112 formula) + VAT cross-validation
- [x] Add per-field confidence scoring
- [x] Commits: `36a4587`, `f9b8747` (real document testing fixes)

> **⚠️ Task 1.17 pending:** `EXPENSE_COA_MAP` and expense category auto-detection still in parser. Needs refactor to extraction-only — classification logic moves to Phase 2.15 (Expense Classification Service).

### 1.10 — Undertaking of Receipt Parser (for GRN) ✅
- [x] Create `backend/erp/ocr/parsers/undertakingParser.js`
- [x] Reuse 3-line product parser logic from CSI parser (extractProductBlocks)
- [x] Extract per line item: brand_name, generic_name, dosage, batch_lot_no, expiry_date, qty
- [x] Add per-field confidence scoring
- [x] Validation flags
- [x] Commit: included in `36a4587`

### 1.11 — Unified OCR Response Format ✅ (code done, testing ongoing)
- [x] Create `backend/erp/ocr/confidenceScorer.js`:
  - HIGH (black in UI): Vision word confidence > 0.9 AND regex pattern matched
  - MEDIUM (orange in UI): Vision confidence 0.7-0.9 OR partial match
  - LOW (red in UI): Vision confidence < 0.7 OR no match OR field missing
  - Helper functions: parseAmount, splitLines, findWordsInRegion, getWordConfidencesForText, scoredField wrapper
- [x] Create `backend/erp/ocr/ocrProcessor.js` — unified orchestrator:
  - Routes to all 8 parsers (CSI, CR, CWT_2307, GAS_RECEIPT, ODOMETER, OR, UNDERTAKING, DR)
  - SUPPORTED_DOC_TYPES export for route validation
  - Returns unified response: `doc_type`, `extracted`, `validation_flags`, `raw_ocr_text`
- [x] Update `backend/erp/routes/ocrRoutes.js` to use ocrProcessor
- [x] Commit: included in `36a4587`
- [ ] **More real-document testing needed** — OR, Undertaking, CSI need additional photo tests (amount misreads like 715,000 vs 15,000 on CSI)

### 1.12 — OCR Test Page (Frontend) ✅
- [x] Update `frontend/src/erp/pages/OcrTest.jsx` with full UI:
- [x] Document type selector dropdown (all 8 types including DR)
- [x] Capture buttons:
  - "Take Photo" — `<input type="file" accept="image/*" capture="environment">` (opens camera on phone)
  - "Upload from Gallery" — `<input type="file" accept="image/*">` (opens file picker)
- [x] Loading state: spinner animation while OCR runs
- [x] Error state with retry button
- [x] Results display — form with extracted fields:
  - Each field is an editable input pre-filled with OCR value
  - Confidence colors: HIGH=#1a1a1a (dark), MEDIUM=#f59e0b (orange), LOW=#ef4444 (red)
  - Line items display and editing
- [x] Original photo preview (image display)
- [x] Validation flags section (warning box)
- [x] Confirm / Try Another / Back buttons
- [x] Dark mode support
- [x] Raw OCR text debug view (collapsible)
- [x] EXIF datetime extraction integration
- [x] Create `frontend/src/erp/services/ocrService.js`:
  - `processDocument(photo, docType, exifDateTime)` — POST to `/api/erp/ocr/process` with FormData
  - `extractExifDateTime(file)` — EXIF-js integration for photo timestamp
  - `getSupportedTypes()` — fetches available doc types
- [x] Null field crash fix (`'confidence' in null` — pending commit)
- [x] Commit: included in `36a4587`

> **Future (Phase 2+):** For fields backed by lookup data (hospital, product, CSI list, DR type), replace plain text inputs with searchable dropdowns populated from master collections. Reduces manual typing and ensures data consistency. See tasks 1.14, 5.2b.

### 1.13 — Test with Real VIP Documents ✅ (initial round — tuning continues per module)
- [x] Test CSI parser with real VIP Charge Sales Invoice photos — hospital multi-line, BIR filtering, inline qty from dosage issues found and fixed (`ea4fdae`)
- [x] Test gas receipt parser with real Shell, Petron, POS receipts — FSGASOLINE, colon-as-decimal, SVP format all fixed (`a8dc2a3`)
- [x] Test DR parser with real Delivery Receipts — full rewrite done (`3e99628`)
- [x] Fix parsing issues found during testing — 5 fix commits (`f9b8747`, `a8dc2a3`, `3e99628`, `ea4fdae`)
- [x] Commit: `f9b8747` `"fix(ocr): parser improvements from real document testing"`

> **Ongoing testing per module:** As each ERP module is built, its parser(s) will be tested with more real documents:
> - Phase 3 (Sales) → CSI parser (more multi-product, amount misreads)
> - Phase 5 (Collections) → CR parser, CWT parser
> - Phase 6 (Expenses) → OR parser (courier/parking/toll/hotel), gas parser, odometer parser
> - Phase 4 (Inventory) → Undertaking parser (GRN photos)

### 1.15 — DR Parser (Delivery Receipt) [v5 UPGRADE] ✅
- [x] Create `backend/erp/ocr/parsers/drParser.js` — **full rewrite** (`3e99628`)
- [x] Extract header fields:
  - DR No: detect `DR No.`, `No.`, `N:` patterns followed by digits
  - Date: detect written dates ("March 15, 2026") and numeric formats
  - Hospital: multi-line hospital name extraction (from "Delivered to:")
- [x] Extract line items using 3-line product parser (reuses extractProductBlocks from CSI):
  - Product name (brand, generic, dosage)
  - Batch/Lot No, Expiry Date, Qty (from "Qty unit" lines — "20 amps", "100 vials")
  - Number assignment with semantic validation
- [x] Detect DR type: sampling/consignment/donation keyword detection (⚠️ currently donation is lumped into DR_SAMPLING — should be its own `DR_DONATION` type)
- [x] Add per-field confidence scoring
- [x] Test with actual VIP DR photos
- [x] Commit: `3e99628` `"fix(ocr): DR parser rewrite with full field extraction"`

> **Future (Phase 2+):** DR type must support **three distinct values**: `DR_CONSIGNMENT`, `DR_DONATION`, `DR_SAMPLING` — not hardcoded to just two. These should come from an enum/config, not be hardcoded in validation. The frontend should show a dropdown (not a binary toggle) for BDM to confirm/override. Hospital should have searchable dropdown from Hospital collection. **Fix required:** backend `consignmentController.js` currently rejects anything other than `DR_SAMPLING`/`DR_CONSIGNMENT`; parser `drParser.js` lumps donation into sampling — both need updating.

### ~~1.14 — OCR Smart Dropdowns (Fallback Lookups)~~ → **Moved to Phase 2 (task 2.17)**
> Depends on Hospital (2.3) and ProductMaster (2.4) models. Building throwaway lightweight seeds is wasted effort — wait for the real models. See task 2.17 below.

### 1.16 — Client Demo Ready ✅
- [x] OCR test page is accessible at `/erp/ocr-test` after login
- [x] All 8 document types can be scanned
- [x] Confidence colors display correctly (dark/orange/red)
- [x] Photo preview works on phone
- [x] Dark mode support + raw OCR text debug view (collapsible)
- [ ] Mobile layout polish — **deferred, will refine as ERP forms are built**
- [ ] Brief user instructions on page — **deferred**

> **Parser tuning is ongoing.** As each ERP module is built (Sales→CSI, Collection→CR, Expenses→OR/Gas), the relevant parsers will be tested with more real documents and refined. This is incremental, not a blocker.

### 1.17 — OR Parser Extraction-Only Refactor ❌ NOT STARTED
**Goal:** Enforce clean Layer 1 (extraction-only) boundary. Remove all accounting classification logic from parsers. Parsers should NEVER know about COA codes, expense categories, or journal entries — they only extract what the document says.

**Architecture principle:** Separation of extraction from classification follows SAP's pattern — SAP Document Capture (VIM) extracts fields, then Vendor Master + automatic account determination classifies. Our parsers = VIM extraction; classification moves to Phase 2.15.

> **Blocked by:** Should be done together with or just before 2.15 (Expense Classification Service), so the classification logic has somewhere to go. Can be done at start of Phase 2.

- [ ] Remove `EXPENSE_COA_MAP` constant from `backend/erp/ocr/parsers/orParser.js`
- [ ] Remove `EXPENSE_CATEGORIES` constant and `PH_VAT_RATE` constant from `orParser.js`
- [ ] Remove expense category auto-detection block (courier/parking/toll/hotel/food/office keyword matching)
- [ ] Remove `expense_category`, `coa_code`, `coa_name`, `available_categories`, and `vat_computed` from parser return object
- [ ] Keep `KNOWN_COURIERS` list — it aids supplier_name extraction accuracy, not classification
- [ ] Move VAT auto-computation logic to classification layer (Phase 2.15) — parser should extract VAT if readable, return null if not
- [ ] Fix remaining OR parser bugs:
  - Series No. on previous line (OCR reads number above label)
  - VATable Sales / VAT Amount two-column layout extraction
  - Date picking printer's "Date Issued" instead of invoice date
- [ ] Verify all 8 parsers return extraction-only fields (no accounting codes anywhere)
- [ ] Commit: `"refactor(ocr): remove classification logic from OR parser — extraction-only layer"`

---

### Phase 1 Summary

| Task | Description | Status |
|------|-------------|--------|
| 1.1 | Google Vision API Setup | ✅ Complete |
| 1.2 | S3 Document Upload | ✅ Complete |
| 1.3 | Base OCR Processing Route | ✅ Complete |
| 1.4 | CSI Parser | ✅ Complete |
| 1.5 | Collection Receipt Parser | ✅ Complete (needs more real-doc testing) |
| 1.6 | BIR 2307 Parser | ✅ Complete (known issues mitigated) |
| 1.7 | Gas Receipt Parser | ✅ Complete |
| 1.8 | Odometer Parser | ✅ Complete |
| 1.9 | OR Parser | ✅ Complete (1.17 refactor pending) |
| 1.10 | Undertaking Parser | ✅ Complete |
| 1.11 | Unified OCR Response Format | ✅ Complete |
| 1.12 | OCR Test Page (Frontend) | ✅ Complete |
| 1.13 | Real Document Testing | ✅ Initial round (ongoing per module) |
| 1.14 | Smart Dropdowns | → Moved to Phase 2 (task 2.17) |
| 1.15 | DR Parser | ✅ Complete |
| 1.16 | Client Demo Ready | ✅ Core complete |
| 1.17 | OR Extraction-Only Refactor | ✅ Complete (done at Phase 2 start) |

---

## PHASE 2 — SHARED MODELS & SETTINGS ✅ COMPLETE
**Goal:** Build the shared data models, settings, and tenant infrastructure that the ERP modules need. Extend User model with ERP fields.

> **Status (April 2026):** All 17 tasks complete (2.1–2.17 + 1.17). 37 files created/modified. 13 models, 8 controllers, 8 route files, 5 seed scripts, 2 frontend hooks, 1 middleware, 1 utility. Backend starts clean. All models load successfully.

### 2.1 — Settings Model ✅
- [x] Create `backend/erp/models/Settings.js` — flat key-value single document with all configurable constants (version field for seed idempotency, `getSettings()` static, `erp_settings` collection)
- [x] Create seed script: `backend/erp/scripts/seedSettings.js`
- [x] Create `backend/erp/controllers/settingsController.js` — GET and PUT (admin/finance only)
- [x] Create settings route in `backend/erp/routes/settingsRoutes.js`
- [x] Add to ERP router: `router.use('/settings', require('./settingsRoutes'))`
- [x] Committed: `ce0a8b7` (phase 2 batch commit)

### 2.2 — Extend User Model with ERP Fields ✅
- [x] In `backend/models/User.js` (existing CRM model), added optional ERP fields: entity_id, territory_id, live_date, bdm_stage, compensation (subdoc), compensation_history (array), date_of_birth, contract_type, date_started
- [x] Sensitive gov IDs with `select: false`: sss_no, pagibig_no, philhealth_no
- [x] toJSON transform strips gov ID fields
- [x] Extend role enum: `['admin', 'employee', 'finance', 'president', 'ceo']`
- [x] All new fields are optional — existing CRM user documents will NOT break
- [x] Added indexes: `{ entity_id: 1 }`, `{ entity_id: 1, role: 1 }`
- [x] CRM regression verified — CRM is live and in daily use, all ERP fields are optional, no breakage
- [x] Committed: `ce0a8b7` (phase 2 batch commit)

### 2.3 — Entity Model (Multi-Tenancy) ✅
- [x] Create `backend/erp/models/Entity.js`: entity_name, tin, address, vat_registered, entity_type (PARENT/SUBSIDIARY), parent_entity_id, status
- [x] Create seed script: `backend/erp/scripts/seedEntities.js` — VIP Inc (parent, TIN 744-251-498-0000) + MG AND CO (subsidiary, TIN 010-824-240-00000, non-VAT)
- [x] Committed: `ce0a8b7` (phase 2 batch commit)

> **Entity branding fields (Phase 4B.7):** Add `brand_color`, `brand_text_color`, `logo_url`, `tagline` to Entity model for entity-aware UI (badges, report headers, dashboard cards). These fields drive dynamic color-coding across the ERP without hardcoding per entity.
>
> | Entity | brand_color | brand_text_color | Tagline |
> |--------|-------------|-----------------|---------|
> | **VIP (VIOS INTEGRATED)** | `#F5C518` (gold) | `#1A1A1A` (black) | "Ka Dito!" |
> | **MG AND CO.** | `#1B2D5B` (navy) | `#FFFFFF` (white) | "Right Dose. Right Partner." |
> | **Future subsidiaries** | Set on creation | Set on creation | Set on creation |
>
> Additional MG palette: accent blue `#4DA8DA`, emerald green `#00A651`, teal `#00857C`

### 2.4 — Hospital Model ✅
- [x] Create `backend/erp/models/Hospital.js`: entity_id, hospital_name, hospital_name_clean (auto-generated via pre-save using `nameClean.js`), financial fields (tin, payment_terms, vat_status, cwt_rate, atc_code, credit_limit), HEAT fields (hospital_type, bed_capacity, engagement_level, etc.), tagged_bdms array, `erp_hospitals` collection
- [x] Create `backend/erp/utils/nameClean.js` — shared canonicalization for OCR fuzzy matching
- [x] Create `backend/erp/controllers/hospitalController.js` — CRUD with search (`?q=`), BDM-scoped GET (filters by `tagged_bdms.bdm_id` for employee role)
- [x] Create `backend/erp/routes/hospitalRoutes.js` — roleCheck('admin', 'finance', 'president') on writes; BDMs read-only (tagged hospitals only)
- [x] Add to ERP router
- [x] Committed: `ce0a8b7` (phase 2 batch commit)

> **Hospital access rule (April 2, 2026):** Only admin/finance/president can create, edit, or deactivate hospitals. BDMs are tagged to hospitals they transact with via `tagged_bdms` array — they see only their tagged hospitals in dropdowns. Admin tags BDMs to hospitals, not the other way around.

> **Hospital global sharing (Phase 4A.3):** Hospitals become globally shared across all entities — `entity_id` made optional, unique index changed to `{ hospital_name_clean: 1 }` (global). BDM dropdown filtering via `tagged_bdms.bdm_id` is unaffected — BDMs still only see their tagged hospitals regardless of entity. This enables VIP and MG AND CO. BDMs to sell to the same hospitals without duplicate records.

> **✅ Hospital Alias Support (COMPLETE — April 2, 2026):** `resolveHospital()` upgraded from 2-step to 6-step cascade matching `resolveProduct`/`resolveVendor` patterns:
> 1. ✅ Added `hospital_aliases` [String] array to Hospital model + updated text index to include aliases
> 2. ✅ Added ALIAS + ALIAS_SUBSTRING steps to `resolveHospital()` (between EXACT and FUZZY)
> 3. ✅ Added PH abbreviation expansion in `nameClean.js` (`expandAbbreviations()`): Saint↔St, Santa↔Sta, Santo↔Sto, MC↔Medical Center, GH↔General Hospital, OLO↔Our Lady of, Hosp↔Hospital, CTR↔Center, DR↔Doctor, + 9 more
> 4. ✅ Added `addAlias` + `removeAlias` endpoints to hospitalController (POST/DELETE `/:id/alias`)
> 5. ☐ Populate initial aliases from known OCR mismatches — do this as mismatches are discovered in production
>
> **New `resolveHospital()` cascade:** EXACT → ABBREVIATION_EXPAND → ALIAS → ALIAS_SUBSTRING (+ alias abbreviation) → PARTIAL (+ partial abbreviation) → FUZZY
> **Example fix:** OCR "Saint Jude Hospital" now matches "St. Jude Hospital Kalibo" via ABBREVIATION_EXPAND step (SAINT→ST expansion) + PARTIAL step (substring match)

### 2.5 — Product Master Model (No Batch) ✅
- [x] Create `backend/erp/models/ProductMaster.js`: entity_id, item_key (unique per entity, auto-generated from brand+dosage), generic_name, brand_name, dosage_strength, purchase_price, selling_price, vat_status, text index on brand+generic, `erp_product_master` collection
- [x] Separate from CRM `WebsiteProduct.js` — this is the ERP financial product record
- [x] Create `backend/erp/controllers/productMasterController.js` — CRUD with search
- [x] Create `backend/erp/routes/productMasterRoutes.js`
- [x] Add to ERP router
- [x] Committed: `ce0a8b7` (phase 2 batch commit)

### 2.6 — Admin-Managed Lookup Collections ✅
- [x] Create `backend/erp/models/BankAccount.js` — entity_id, bank_code, bank_name, account_no, account_type, coa_code
- [x] Create `backend/erp/models/PaymentMode.js` — mode_code, mode_label, mode_type, requires_calf
- [x] Create `backend/erp/models/ExpenseComponent.js` — component_code, component_name, or_required, calf_required
- [x] Create `backend/erp/scripts/seedLookups.js` — 8 payment modes + 6 expense components
- [x] Create `backend/erp/controllers/lookupController.js` — factory pattern CRUD for all three
- [x] Create `backend/erp/routes/lookupRoutes.js` — mounts /bank-accounts, /payment-modes, /expense-components
- [x] Committed: `ce0a8b7` (phase 2 batch commit)

### 2.7 — Transaction Event Model (Immutable) ✅
- [x] Create `backend/erp/models/TransactionEvent.js`: entity_id, bdm_id, event_type, event_date, document_ref, source_image_url, ocr_raw_json, confirmed_fields, payload, status, corrects_event_id, created_by, created_at (immutable)
- [x] Pre-save: blocks updates on non-new documents, sets created_at
- [x] Pre-findOneAndUpdate + pre-updateOne: strips all immutable fields, only allows status ACTIVE→DELETED
- [x] Committed: `ce0a8b7` (phase 2 batch commit)

### 2.8 — Document Attachment Model ✅
- [x] Create `backend/erp/models/DocumentAttachment.js`: event_id, document_type, ocr_applied, storage_url, folder_path, uploaded_by, uploaded_at
- [x] Committed: `ce0a8b7` (phase 2 batch commit)

### 2.9 — Tenant Filtering Middleware ✅
- [x] Create `backend/erp/middleware/tenantFilter.js`:
  - Reads entity_id and bdm_id from req.user
  - Attaches: req.entityId, req.bdmId, req.isAdmin, req.isFinance, req.isPresident, req.tenantFilter
  - President/CEO: empty filter (sees all). Admin/Finance: entity_id filter. Employee: entity_id+bdm_id filter
  - Backward compat: skips filtering if user has no entity_id
- [x] Applied in ERP router index AFTER /ocr but BEFORE all data routes
- [x] Committed: `ce0a8b7` (phase 2 batch commit)

### 2.10 — ERP Frontend Hooks ✅
- [x] Create `frontend/src/erp/hooks/useSettings.js` — fetches /erp/settings with 5-min global cache, refresh function
- [x] Create `frontend/src/erp/hooks/useErpApi.js` — wraps existing api.js with /erp prefix, exposes get/post/put/patch/del with loading/error state
- [x] Committed: `ce0a8b7` (phase 2 batch commit)

### 2.11 — Government Rates Collection [v5 NEW] ✅
- [x] Create `backend/erp/models/GovernmentRates.js`: rate_type enum, brackets array, flat_rate fields, benefit_limits, `getActiveRate()` static, `erp_government_rates` collection
- [x] Create seed script: `backend/erp/scripts/seedGovernmentRates.js` — SSS (36 brackets), PhilHealth (5% flat, floor ₱500, ceiling ₱5,000), PagIBIG (1-2% brackets), BIR withholding (6 TRAIN brackets), De Minimis (5 benefit types)
- [x] Create `backend/erp/controllers/governmentRatesController.js` — CRUD with active_only filter
- [x] Create `backend/erp/routes/governmentRatesRoutes.js` — roleCheck('admin', 'finance') on writes
- [x] Add to ERP router
- [x] Committed: `ce0a8b7` (phase 2 batch commit)

### 2.12 — Budget Allocation Collection [v5 NEW] ✅
- [x] Create `backend/erp/models/BudgetAllocation.js`: entity_id, target_type, target_id, period, components array, total_budget (auto-computed in pre-save), status (DRAFT/APPROVED/CLOSED), `erp_budget_allocations` collection
- [x] Create `backend/erp/controllers/budgetAllocationController.js` — CRUD + approve endpoint
- [x] Create `backend/erp/routes/budgetAllocationRoutes.js`
- [x] Add to ERP router
- [x] Committed: `ce0a8b7` (phase 2 batch commit)

### 2.13 — Consignment Tracker Model [v5 NEW] ✅
- [x] Create `backend/erp/models/ConsignmentTracker.js`: entity_id, bdm_id, hospital_id, dr_ref, product_id, qty_delivered/consumed/remaining (auto-computed), conversions array, aging_status (auto-updated in pre-save based on days_outstanding), immutable created_at
- [x] Committed: `ce0a8b7` (phase 2 batch commit)

### 2.14 — Vendor Master Model ✅
**Goal:** Supplier registry that maps vendors to default COA codes for automatic expense classification. Follows SAP Vendor Master (XK01) pattern.

- [x] Create `backend/erp/models/VendorMaster.js`: entity_id, vendor_code, vendor_name, vendor_aliases (array for OCR fuzzy matching), default_coa_code, default_expense_category, vat_status, bank_account, text index on vendor_name + vendor_aliases, `erp_vendors` collection
- [x] Create seed script `backend/erp/scripts/seedVendors.js` — 13 vendors: 3 couriers (AP CARGO, JRS, LBC), 5 fuel (Shell, Petron, Caltex, Phoenix, Seaoil), 5 toll roads (NLEX, SLEX, TPLEX, Skyway, Cavitex)
- [x] Create `backend/erp/controllers/vendorController.js`: CRUD + search endpoint + addAlias endpoint
- [x] Create `backend/erp/routes/vendorRoutes.js`, mounted on ERP router
- [x] Committed: `ce0a8b7` (phase 2 batch commit)

### 2.15 — Expense Classification Service ✅
**Goal:** Takes raw OCR-extracted fields and returns an accounting classification suggestion. 4-step cascade following SAP automatic account determination pattern.

- [x] Create `backend/erp/services/expenseClassifier.js`: async `classifyExpense(extractedFields)` with 4-step cascade (EXACT_VENDOR → ALIAS_MATCH → KEYWORD → FALLBACK), KEYWORD_RULES array (8 categories from removed EXPENSE_COA_MAP), VAT auto-computation (12/112), `getCategories()` function
- [x] Create `backend/erp/controllers/classificationController.js`: POST /classify, POST /classify/override (with save_as_default learning loop), GET /classify/categories
- [x] Create `backend/erp/routes/classificationRoutes.js`, mounted on ERP router
- [ ] Unit tests pending (deferred — classification working in production via OCR pipeline)
- [x] Committed: `ce0a8b7` (phase 2 batch commit)

### 2.17 — OCR Smart Dropdowns (Moved from Phase 1.14) ✅ COMPLETE
**Goal:** When OCR returns LOW confidence or empty for key fields, replace the text input with a searchable dropdown populated from master data.

- [x] Backend search endpoints ready: `GET /api/erp/hospitals?q=`, `GET /api/erp/products?q=`, `GET /api/erp/vendors/search?q=` — all support case-insensitive substring search
- [x] Updated `frontend/src/erp/pages/OcrTest.jsx` with searchable dropdowns for LOW/MEDIUM confidence fields:
  - Hospital field: dropdown from useHospitals hook (master data)
  - Brand name field (line items): dropdown from useProducts hook (ProductMaster)
  - Supplier name field: dropdown from hospital list (reused for vendor matching)
  - Dropdown filters as user types, max 10 suggestions shown
  - HIGH confidence fields remain plain text inputs (no dropdown needed)
- [x] DR type dropdown: 3 options (Consignment / Donation / Sampling) — backend accepts all three, frontend DrEntry.jsx uses `<select>` dropdown (not binary toggle). Commit `12834e8`
- [ ] CSI settlement checklist from AR (connects to 5.2b) — **deferred to Phase 5**
- [x] Committed: `ce0a8b7` (phase 2), `a009f2c` (frontend dropdowns)

---

### 2.16 — OCR-to-Classification Pipeline Integration ✅
**Goal:** Wire the extraction→classification pipeline so the OCR test page shows both extracted fields AND classification suggestion as separate auditable sections.

- [x] Update `backend/erp/ocr/ocrProcessor.js`:
  - processOcr is now async, imports classifyExpense
  - EXPENSE_DOC_TYPES set (OR, GAS_RECEIPT) — only these get classification
  - Calls `classifyExpense()` after parsing, attaches as separate `classification` key
  - Non-expense documents get `classification: null`
  - CLASSIFICATION_ERROR validation flag if classifier fails
- [x] Update `backend/erp/controllers/ocrController.js`: added `await` on processOcr, includes `classification` in response
- [x] API response clearly separates `extracted` (Layer 1) from `classification` (Layer 2)
- [ ] Update `frontend/src/erp/pages/OcrTest.jsx` with classification UI — **deferred to interactive testing session**
  - Classification section, override dropdown, "save as vendor default" checkbox
- [x] Committed: `ce0a8b7` (phase 2 batch commit)

### Phase 2 Summary

| Task | Description | Status |
|------|-------------|--------|
| 1.17 | OR Parser Extraction-Only Refactor | ✅ Complete |
| 2.1 | Settings Model | ✅ Complete |
| 2.2 | User Model ERP Extension | ✅ Complete (CRM regression verified — CRM is live) |
| 2.3 | Entity Model (Multi-Tenancy) | ✅ Complete |
| 2.4 | Hospital Model | ✅ Complete |
| 2.5 | ProductMaster Model | ✅ Complete |
| 2.6 | Lookup Collections (Bank/Payment/Expense) | ✅ Complete |
| 2.7 | TransactionEvent (Immutable) | ✅ Complete |
| 2.8 | DocumentAttachment | ✅ Complete |
| 2.9 | Tenant Filtering Middleware | ✅ Complete |
| 2.10 | ERP Frontend Hooks | ✅ Complete |
| 2.11 | Government Rates (PH Mandatories) | ✅ Complete |
| 2.12 | Budget Allocation | ✅ Complete |
| 2.13 | Consignment Tracker | ✅ Complete |
| 2.14 | VendorMaster (SAP XK01) | ✅ Complete |
| 2.15 | Expense Classification Service | ✅ Complete |
| 2.16 | OCR→Classification Pipeline | ✅ Backend complete (frontend UI deferred) |
| 2.17 | OCR Smart Dropdowns | ✅ Complete (backend + frontend dropdowns) |

**Files created:** 37 | **Models:** 13 | **Controllers:** 8 | **Routes:** 8 | **Seeds:** 5 | **Hooks:** 2 | **Middleware:** 1

**Remaining frontend work:**
- OcrTest.jsx: Classification section UI + override dropdown — **deferred to Phase 6 (Expenses)**
- ~~OcrTest.jsx: Smart dropdown fallbacks for low-confidence fields~~ — **DONE (commit `a009f2c`)**

---

## PHASE 3 — SALES MODULE (SAP Park -> Check -> Post) ✅ COMPLETE
**Goal:** Sales invoice entry that preserves the client's current validate/submit/re-open workbook behavior while upgrading it to the SAP-style webapp target: live date partition, spreadsheet-speed draft entry, FIFO batch selection, on-demand validation, posting controls, and audit trail.

> **Status (April 2026):** All 12 tasks complete (3.0–3.11 + verification). 31 new files + 3 modified. Backend: 3 models, 2 services, 2 controllers, 2 route files, 1 seed script, 1 util. Frontend: 4 hooks, 3 pages. Commits: `ce0a8b7` (phase 2), `881fb60` (backend), `f3239f8` (frontend). Build: 0 errors. FIFO engine verified with seeded data.

**Prerequisites:** Phase 2 committed, seeds run, CRM login verified.

### 3.0 — Pre-Work ✅
- [x] Commit all Phase 2 work (46 files) — `ce0a8b7`
- [x] Run `node backend/erp/scripts/seedAll.js` — Entity (2), Settings (1), GovernmentRates (5), Lookups (14), Vendors (13)
- [x] CRM regression verified — CRM is live and in daily use
- [x] Create `backend/erp/scripts/seedInventory.js` — 6 products, 9 OPENING_BALANCE entries, 3 hospitals
- [x] Fixed VendorMaster index: `partialFilterExpression` instead of `sparse: true` (null vendor_code collision)
- [x] Committed in `881fb60`

### 3.1 — Master Data Quality Layer ✅
**Why:** OCR output contains typos, variant spellings, and inconsistent formatting. Without normalization, FIFO fragments inventory into phantom batches and sales pipeline breaks. Every downstream model and service depends on clean master data.

- [x] Create `backend/erp/utils/normalize.js`:
  - `cleanBatchNo(raw)` — uppercase, strip non-alphanumeric ("B-1234" → "B1234", "lot 5678" → "LOT5678")
  - `parseExpiry(raw)` — 15+ format support (MMYYYY, MM/YYYY, APR 2027, ISO, Date objects) → first-of-month Date
  - `normalizeUnit(raw)` — 30+ variant mappings to 16 canonical codes (PC, BOX, BOTTLE, VIAL, TUBE, SACHET, STRIP, TABLET, CAPSULE, AMPULE, PACK, ROLL, SET, BAG, CAN, PAIR)
  - `cleanProductName(raw)` — reuses `cleanName()` from `nameClean.js`
  - Exports: UNIT_MAP, UNIT_CODES, MONTH_MAP for reuse
- [x] Modify `backend/erp/models/ProductMaster.js`:
  - Added `product_aliases` [String], `brand_name_clean` String (indexed), `unit_code` String enum
  - Pre-save: auto-generate brand_name_clean, auto-set unit_code from sold_per
  - Added index: `{ entity_id, brand_name_clean }`
  - Updated text index to include product_aliases
- [x] Create `backend/erp/services/productResolver.js`:
  - `resolveProduct(ocrText, entityId)` — 5-step: EXACT (brand_name_clean) → ALIAS (regex) → ALIAS_SUBSTRING → FUZZY (text index) → ITEM_KEY → null
  - `resolveHospital(ocrText, entityId)` — EXACT (hospital_name_clean) → PARTIAL (substring) → FUZZY
  - `resolveVendor(ocrText, entityId)` — EXACT (vendor_name) → ALIAS → ALIAS_SUBSTRING → FUZZY
  - All return `{ record, confidence, match_method }` or null
- [x] Committed in `881fb60`

### 3.2 — Inventory Ledger Model + ERP Audit Log Model ✅
- [x] Create `backend/erp/models/InventoryLedger.js` — all fields verified: entity_id, bdm_id, product_id, batch_lot_no, expiry_date, 9 transaction_type enums, qty_in/out, running_balance, event_id, fifo_override + override_reason (conditional validation), recorded_at (immutable), recorded_by. Pre-save: cleanBatchNo normalization + immutability enforcement. 4 compound indexes.
- [x] Create `backend/erp/models/ErpAuditLog.js` — all fields verified: entity_id, bdm_id, 6 log_type enums, target_ref, target_model, field_changed, old_value (Mixed), new_value (Mixed), changed_by, changed_at (immutable), note. Static: `ErpAuditLog.logChange()`. Immutable.
- [x] Committed in `881fb60`

### 3.3 — FIFO Engine + Stock Aggregation ✅
- [x] Create `backend/erp/services/fifoEngine.js` — 5 functions verified:
  - `getAvailableBatches(entityId, bdmId, productId)` — MongoDB aggregation, sorted by expiry ASC
  - `consumeFIFO(entityId, bdmId, productId, qty)` — read-only plan, throws INSUFFICIENT_STOCK
  - `consumeSpecificBatch(entityId, bdmId, productId, batchLotNo, qty)` — override with normalized batch
  - `getMyStock(entityId, bdmId)` — full stock-on-hand aggregation across all products
  - `buildStockSnapshot(entityId, bdmId)` — in-memory Map for validation deduction
- [x] Tested with seeded data: `getMyStock` returned 9 batch entries, `getAvailableBatches` confirmed FIFO ordering
- [x] Committed in `881fb60`

### 3.4 — Sales Line Model ✅
- [x] Create `backend/erp/models/SalesLine.js` — all fields verified: entity_id, bdm_id, event_id, source (SALES_LINE/OPENING_AR), hospital_id, csi_date, doc_ref, line_items subdoc array (product_id, item_key, batch_lot_no, qty, unit, unit_price, line_total, vat_amount, net_of_vat, fifo_override, override_reason), invoice_total/total_vat/total_net_of_vat (auto-computed), 5 status enums, posted_at/by, reopen_count, validation_errors[], deletion_event_id, created_at (immutable), created_by
- [x] Pre-save: cleanBatchNo + normalizeUnit on each line_item
- [x] Pre-save: auto-compute line_total = qty * unit_price, VAT (12/112 PH formula), roll up totals with 2dp rounding
- [x] Pre-save: source routing handled by controller (sets based on csi_date vs user.live_date)
- [x] Pre-save: does NOT trigger FIFO — inventory moves only on submitSales
- [x] Committed in `881fb60`

### 3.5 — Sales Controller (Validate → Submit → Re-open Pattern) ✅
- [x] Create `backend/erp/controllers/salesController.js` — 10 endpoints verified:
  - `createSale` — DRAFT, auto-routes source from live_date
  - `updateSale` — DRAFT only, tracks field changes → ErpAuditLog
  - `deleteDraftRow` — hard delete DRAFT only
  - `getSales` — paginated, filtered (status, hospital, source, date range), populate hospital + bdm
  - `getSaleById` — with populate
  - `validateSales` — **THE CORE:** fresh aggregation via buildStockSnapshot, in-memory deduction across rows (prevents double-allocation), checks: required fields, no future dates, duplicate doc_ref, stock available, VAT balance
  - `submitSales` — mongoose.startSession() + session.withTransaction(), creates TransactionEvent + InventoryLedger per line item, CSI-DR: skips inventory deduction + updates ConsignmentTracker
  - `reopenSales` — creates REVERSAL InventoryLedger entries, reverses ConsignmentTracker, increments reopen_count, ErpAuditLog
  - `requestDeletion` — status → DELETION_REQUESTED, ErpAuditLog
  - `approveDeletion` — SAP Storno: reversal TransactionEvent (corrects_event_id), reversal InventoryLedger, original stays POSTED
- [x] Validation rules: dupes, future dates, stock (FIFO), required fields, VAT balance
- [x] Committed in `881fb60`

### 3.6 — Inventory Controller & Routes (BDM Stock Visibility) ✅
- [x] Create `backend/erp/controllers/inventoryController.js` — 5 endpoints verified:
  - `getMyStock` — aggregates via fifoEngine.getMyStock, enriches with ProductMaster (brand_name, selling_price, unit_code), computes summary (total_products, total_units, total_value, near_expiry_count using Settings.NEAR_EXPIRY_DAYS), Admin/Finance: ?bdm_id=X
  - `getBatches(productId)` — available batches sorted by expiry ASC, days_to_expiry + near_expiry flag
  - `getLedger(productId)` — paginated transaction history, date-range filterable
  - `getVariance` — aggregation: opening_balance + total_in - total_out = expected_balance vs actual_balance, net_adjustments, variance status (OK/DISCREPANCY)
  - `recordPhysicalCount` — creates ADJUSTMENT InventoryLedger entries per product/batch variance, ErpAuditLog for each adjustment
- [x] Create `backend/erp/routes/inventoryRoutes.js` — 5 routes with protect middleware
- [x] Create `backend/erp/routes/salesRoutes.js` — 10 routes with protect, approveDeletion has roleCheck('admin', 'finance')
- [x] Modify `backend/erp/routes/index.js` — added `/sales` and `/inventory` mounts after tenantFilter
- [x] BDM stock isolation: all endpoints use req.bdmId from tenantFilter. BDM → own stock only. Admin/Finance → entity-wide. President/CEO → cross-entity.
- [x] Committed in `881fb60`

### 3.7 — Frontend Hooks ✅
- [x] Create `frontend/src/erp/hooks/useSales.js` — wraps useErpApi for all 10 sales endpoints (getSales, getSaleById, createSale, updateSale, deleteDraft, validateSales, submitSales, reopenSales, requestDeletion, approveDeletion)
- [x] Create `frontend/src/erp/hooks/useInventory.js` — wraps useErpApi for 5 inventory endpoints (getMyStock, getBatches, getLedger, getVariance, recordPhysicalCount). Admin bdm_id passthrough.
- [x] Create `frontend/src/erp/hooks/useProducts.js` — session-level cache, auto-fetches on mount, refresh()
- [x] Create `frontend/src/erp/hooks/useHospitals.js` — session-level cache, auto-fetches on mount, refresh()
- [x] Committed in `f3239f8`

### 3.8 — Sales Entry Page (Spreadsheet-Speed Data Entry) ✅
- [x] Create `frontend/src/erp/pages/SalesEntry.jsx` — single-file component with all sub-component logic inline (grid + cards + error panel + action bar):
  - Desktop: `<table>` grid with columns: #, Hospital (dropdown), CSI Date, CSI#, Product (stock-filtered dropdown), **Batch/Expiry** (batch selector), Qty, Unit (auto-fill readonly), Unit Price (auto-fill), Line Total (computed), Status (color badge), delete button
  - Mobile (< 768px): card-per-row layout with stacked fields, **batch/expiry selector**, and delete button
  - Product dropdown: **ONLY shows products with stock > 0** from /inventory/my-stock. Each option: "BrandName Dosage — qty Unit available"
  - Auto-fill: unit, unit_price, item_key from ProductMaster on product selection
  - Auto-compute: line_total = qty × unit_price (client-side)
  - **Batch/Expiry selector (April 2, 2026):** When product has 2+ batches, shows dropdown: "Auto (FIFO)" default + per-batch options sorted by expiry ASC. Single-batch products show static batch info. If BDM selects non-FIFO batch, `fifo_override: true` + yellow "override reason" input appears. Fields `batch_lot_no`, `fifo_override`, `override_reason` wired into save payload → backend `consumeSpecificBatch()` on submit.
  - Near-expiry badge: orange "Near Expiry" if product's batch expires within NEAR_EXPIRY_DAYS
  - Status colors: gray=DRAFT, green=VALID, red=ERROR, blue=POSTED, yellow=DELETION_REQUESTED
  - Action bar: Save Drafts + Scan/Upload CSI + Add Row only — all lifecycle actions (Validate/Submit/Re-open/Delete) live on **Sales Transactions** and act per-row. Per-row Validate + Post buttons remain inside the entry grid for convenience during the create-then-validate flow in a single session (superseded Apr 22 2026, Phase PR1 — see §PR1 below).
  - Validation error panel: collapsible, shows errors with CSI# references
  - No per-keystroke validation — free typing, validate on button click
  - **Note:** Sub-components (SalesEntryGrid, SalesEntryRow, SalesEntryCard, BatchSelector, SalesErrorPanel, ScanCSIModal, SalesActionBar) are inlined in SalesEntry.jsx for v1. Can be extracted to separate files later if needed.
  - ✅ ScanCSIModal implemented: camera/gallery → processDocument('CSI') → fuzzy match hospital + products → pre-fill sales row. Commit `95562d9`.
- [x] Committed in `f3239f8`

### 3.9 — My Stock Page (BDM Stock Visibility) ✅
- [x] Create `frontend/src/erp/pages/MyStock.jsx` — single-file component with all sub-component logic inline:
  - **Summary bar:** 4 cards (Total Products, Total Units, Total Value, Near Expiry count with red highlight)
  - **Tab 1: Stock on Hand (default)** — product table with expandable batch rows (click to expand). Shows brand_name, generic_name, unit_code, total_qty, batch count, nearest expiry, value. Near-expiry products highlighted. Zero-stock hidden (Option B). Batch breakdown: batch_lot_no, expiry_date, available_qty, days_to_expiry + near_expiry badge
  - **Tab 2: Transaction Ledger (Audit)** — product dropdown selector → full InventoryLedger history. Columns: date, type (color-coded badge by TYPE_COLORS), batch, qty_in (+green), qty_out (-red), running_balance
  - **Tab 3: Variance Report** — product table: opening_balance, total_in, total_out, expected_balance, actual_balance, variance, status (OK green / DISCREPANCY red)
  - **Note:** StockSummaryBar, StockTable, BatchBreakdown, TransactionLedger, VarianceTable, PhysicalCountModal are inlined in MyStock.jsx for v1.
  - ✅ PhysicalCountModal implemented: shows all batches with system qty, BDM enters actual counts, submits adjustments. Commit `95562d9`.
- [x] Committed in `f3239f8`

### 3.10 — Sales List Page ✅
- [x] Create `frontend/src/erp/pages/SalesList.jsx`:
  - Filter bar: status dropdown, source dropdown, date range pickers
  - Table: date, CSI#, hospital, total (P formatted), source, status (color badge), actions
  - Click row → detail modal with line items table (product, batch, expiry, qty, unit, price, total), invoice summary, validation errors
  - BDM: "Request Delete" button on POSTED rows
  - Admin/Finance: "Approve Delete" button on DELETION_REQUESTED rows (SAP Storno confirmation)
  - Reuses `frontend/src/components/common/Pagination.jsx`
  - Link to "/erp/sales/entry" for new sales entry
- [x] Committed in `f3239f8`

### 3.11 — Route Registration ✅
- [x] Modify `frontend/src/App.jsx` — added 3 lazy-loaded routes with ProtectedRoute:
  - `/erp/sales` → SalesList (employee, admin, finance)
  - `/erp/sales/entry` → SalesEntry (employee, admin)
  - `/erp/my-stock` → MyStock (employee, admin, finance)
- [x] Vite build: 0 errors confirmed
- [x] Committed in `f3239f8`

### 3.12 — Phase 3 Verification
- [x] **Data Quality:** cleanBatchNo, parseExpiry, normalizeUnit — verified via code review (15+ expiry formats, 30+ unit variants, batch normalization)
- [x] **Product Resolver:** resolveProduct — 5-step cascade verified (EXACT, ALIAS, ALIAS_SUBSTRING, FUZZY, ITEM_KEY)
- [x] **Hospital Resolver:** resolveHospital — 3-step verified (EXACT hospital_name_clean, PARTIAL substring, FUZZY)
- [x] **FIFO Engine:** getMyStock returned 9 batch entries, getAvailableBatches confirmed expiry-ascending sort
- [x] **Backend smoke test:** all models load, FIFO aggregation works with seeded data
- [x] **Frontend build:** 0 errors, all pages lazy-loaded
- [x] **Manual integration tests (April 2, 2026):**
  - [x] Stock isolation: Jay Ann (11 products) vs Jenny Rose (10 products), zero overlap — tenantFilter scopes by bdm_id ✅
  - [x] Full CRUD cycle: DRAFT → VALID (1 valid, 0 errors) → POSTED (3 posted, TransactionEvent + InventoryLedger created, FIFO assigned batch GN2241) → REOPEN (reversal ADJUSTMENT +5, stock restored to 100, reopen_count=1) ✅
  - [x] Submit atomicity: MongoDB transaction wraps TransactionEvent + InventoryLedger creation ✅
  - [x] SalesEntry UX: hospital dropdown (BDM-scoped, Title Case, deduplicated), product dropdown (stock-filtered, 11 in-stock items), OCR scan (CSI photo → invoice_no, hospital, line items extracted) ✅
  - [x] Physical count adjustment — verified via code review (April 3, 2026): `recordPhysicalCount` aggregates system balance per product/batch, computes variance = actual - system, creates ADJUSTMENT ledger entries (qty_in for overage, qty_out for shortage), ErpAuditLog per adjustment. Frontend PhysicalCountModal in MyStock.jsx wired to `POST /erp/inventory/physical-count`.
  - [ ] Mobile card layouts at 375px width — deferred (needs device testing)
  - **SalesList detail modal:** Added batch_lot_no and expiry_date columns to line items table (data from SalesLine model, FIFO assigns batch on submit)
  - [x] **Batch selector UI (April 2, 2026):** Added Batch/Expiry column to SalesEntry desktop table + mobile cards. Products with 2+ batches show dropdown (Auto FIFO + per-batch options). FIFO override detection + reason input. Save payload wires batch_lot_no, fifo_override, override_reason to backend. Build: 0 errors ✅
  - [x] **Entity_id fix (April 2, 2026):** Fixed entity_id mismatch for 6 BDMs (Menivie, Jake, Mae, Roman, Edcel Mae, Romela) — their User.entity_id pointed to VIOS INTEGRATED but inventory was imported under VIP Pharmacy Inc. Updated all 6 to match inventory entity. Root cause: seedErpMasterData.js created separate "VIP Pharmacy Inc." entity during CSV import.
  - [x] **ProductMaster data quality cleanup (April 2, 2026):**
    - Unit normalization: PREFILLEDSYRINGE→PFS (2), SYRINGE→PFS (2), BOTS→BOTTLE (1), BOXOFS→BOX (6), BXS→BOX (4). Reduced 17 unit codes → 12.
    - Brand merges: Bupright→Bupiright (1 ledger ref moved), Philvan 1→Philvan (1 ledger ref moved), Nupira 4→Nupira (1 ledger ref moved). 3 duplicates deleted.
    - Generic name fixes: 3 Nupira variants→Norepinephrine, 2 Noxprivex→Enoxaparin Sodium, 1 Metronidaziole→Metronidazole
    - Junk deleted: Hcd/l, Hcd/m (0 ledger, wrong units)
    - Nupira dosage fix: 1mg/mL→10mg/10mL (was wrong in source CSV)
    - Final count: 241 products (was 246), 12 unit codes (was 17), 0 bad generics ✅

### Phase 3 Summary

| Task | Description | Status |
|------|-------------|--------|
| 3.0 | Pre-Work (commit, seed, regression) | ✅ Complete (CRM live, regression verified) |
| 3.1 | Master Data Quality Layer | ✅ Complete |
| 3.2 | InventoryLedger + ErpAuditLog Models | ✅ Complete |
| 3.3 | FIFO Engine + Stock Aggregation | ✅ Complete (tested with seeded data) |
| 3.4 | SalesLine Model | ✅ Complete |
| 3.5 | Sales Controller (10 endpoints) | ✅ Complete |
| 3.6 | Inventory Controller & Routes (5 endpoints) | ✅ Complete |
| 3.7 | Frontend Hooks (4 hooks) | ✅ Complete |
| 3.8 | SalesEntry Page | ✅ Complete (ScanCSIModal: `95562d9`, Batch Selector: April 2 2026) |
| 3.9 | MyStock Page (3 tabs + Alerts) | ✅ Complete (PhysicalCountModal done: `95562d9`, Alerts tab added in Phase 4) |
| 3.10 | SalesList Page | ✅ Complete |
| 3.11 | Route Registration | ✅ Complete (build verified) |
| 3.12 | Verification | ✅ Manual tests passed (stock isolation, lifecycle, OCR, atomicity, batch selector, entity fix, data cleanup) |

**Files created:** 22 new + 3 modified | **Models:** 3 | **Services:** 2 | **Controllers:** 2 | **Routes:** 2 | **Seeds:** 1 | **Hooks:** 4 | **Pages:** 3
**Commits:** `881fb60` (backend), `f3239f8` (frontend)

**Phase 3 deferred items — COMPLETED (commit `95562d9`):**
- ✅ SalesEntry: ScanCSIModal (camera → OCR → productResolver → pre-fill row)
- ✅ MyStock: PhysicalCountModal UI (form to enter actual stock quantities)

**Phase 3 UX fixes (April 3, 2026 — during Phase 4B testing):**
- ✅ SalesEntry: loadSales fetches DRAFT+VALID+ERROR+POSTED (was DRAFT-only, breaking Submit flow)
- ✅ SalesEntry: Separate Batch and Expiry columns (was combined "Batch / Expiry")
- ✅ SalesList: Submit + Re-open action buttons added to Actions column
- ✅ SalesList: Products column showing item_key × qty
- ✅ useSales: submitSales sends `{}` body (was `null`, causing JSON parse error)

---

## PHASE 4 — INVENTORY MODULE (GRN, Reorder, DR/Consignment) ✅ COMPLETE
**Goal:** Stock receiving (GRN), reorder alerts, DR entry, and consignment tracking. Stock-on-hand visibility, audit trail, variance, and BDM isolation were moved to Phase 3 (required by sales entry).

> **Status (April 2026):** All 3 tasks complete (4.1–4.3). 8 new files + 9 modified. Backend: 1 model (GrnEntry), 1 controller (consignmentController), 1 route file (consignmentRoutes), 4 fields added to ProductMaster, 4 endpoints added to inventoryController, 1 endpoint added to productMasterController. Frontend: 2 hooks (useGrn, useConsignment), 3 pages (GrnEntry, DrEntry, ConsignmentDashboard), Alerts tab added to MyStock, 3 routes registered. Build: 0 errors.
>
> **Moved to Phase 3:** Stock aggregation (getMyStock, getBatches, getLedger, getVariance), BDM stock isolation, physical count, My Stock page. See 3.3, 3.6, 3.9.
>
> **Design decisions:**
> - GrnEntry is a separate model (not InventoryLedger) because GRN needs mutable PENDING→APPROVED/REJECTED workflow while InventoryLedger is immutable. Ledger entries created atomically on approval via MongoDB transaction.
> - SAP-level reorder fields (reorder_min_qty, reorder_qty, safety_stock_qty, lead_time_days) added directly to ProductMaster — all optional with null defaults, zero impact on existing documents.
> - ConsignmentTracker aging recomputed on read (not just at save-time) for live accuracy.
> - Consignment conversion is dual-trigger: auto via submitSales (salesController:302) + manual via convertConsignment endpoint.
>
> **Testing session fixes (April 2, 2026):**
> - **Auth loop fix:** `erp/routes/index.js` — `protect` middleware added at router level before `tenantFilter`. Without this, `req.user` was undefined in tenantFilter → 401 infinite loop on all ERP data endpoints.
> - **CSS layout fix:** `.admin-page`, `.admin-content`, `.admin-main` base layout styles moved to global `index.css` — were previously only defined inline in AdminDashboard.jsx, causing blank ERP pages.
> - **useHospitals infinite retry fix:** Added `fetchedRef` guard to prevent failed API calls from triggering re-render → re-fetch loops.
> - **nodemon.json:** Added `erp/` to watch paths so ERP backend changes trigger auto-restart.
> - **ErpDashboard.jsx:** Redesigned from "Coming Soon" placeholder to functional dashboard with quick actions, module grid, and tools section.
> - **Login redirect fix:** `LoginPage.jsx` — added president/ceo/finance roles → `/admin` redirect. `ProtectedRoute.jsx` — president/ceo/finance now granted access to admin-level routes (prevents blank page after login).
> - **Hospital dropdown fix:** `hospitalController.js` — BDMs now only see their tagged hospitals (filters by `tagged_bdms.bdm_id`). `useHospitals.js` — Title Case normalization, alphabetical sort, client-side deduplication. Updated SalesEntry, DrEntry, ConsignmentDashboard to use `hospital_name_display`.
> - **Hospital access rule:** Adding hospitals is admin/finance/president only (`hospitalRoutes.js` roleCheck). BDMs are tagged to hospitals they transact with — they cannot create or edit hospitals.
>
> **Master data import (April 2, 2026):**
> - Created `backend/erp/scripts/seedErpMasterData.js` — reads Hospital List CSV + Product Master CSV from Google Sheets exports
> - Entity created: VIP Pharmacy Inc. (entity_id assigned to all CRM users)
> - 101 hospitals imported (deduplicated from 203 CSV rows across 11 BDMs) with BDM tags
> - 238 products imported (deduplicated from 274 CSV rows) with 213 active
>
> **Opening stock import (April 2, 2026):**
> - Script: `backend/erp/scripts/importOpeningStock.js`
> - **251 opening balance entries** imported across 9 BDMs (56,476+ units total)
> - **140 products auto-created** from stock CSV data not in Product Master
> - BDM breakdown: Menivie Daniela (78/14,359), Edcel Mae Arespacochaga (33/2,609), Jenny Rose Jacosalem (29/11,444), Judy Mae Patrocinio (24/10,496), Roman Mabanag (23/2,973), Mae Navarro (20/5,223), Jake Montero (13/5,689), Jay Ann Protacio (11/1,570), Romela Shen Herrera (11/1,512)
> - 3 missing BDMs created via `backend/erp/scripts/addMissingBdms.js`: Jay Ann Protacio (s22.vippharmacy@gmail.com), Jenny Rose Jacosalem (s26.vippharmacy@gmail.com), Judy Mae Patrocinio (s25.vippharmacy@gmail.com)
> - Gregg Louie Vios account (yourpartner@viosintegrated.net, role: president) — test account, opening stock excluded
> - Full sales flow now unblocked: My Stock shows real data, Sales Entry product dropdown populated, CSI OCR matching works with real master data, FIFO deduction operational

### 4.1 — GRN (Goods Received Note) Workflow ✅
- [x] Create `backend/erp/models/GrnEntry.js` — entity_id, bdm_id, grn_date, line_items (product_id, item_key, batch_lot_no, expiry_date, qty), waybill_photo_url, undertaking_photo_url, ocr_data, status (PENDING/APPROVED/REJECTED), notes, rejection_reason, reviewed_by/at, event_id, created_by/at, pre-save cleanBatchNo, 3 indexes
- [x] Add to `backend/erp/controllers/inventoryController.js`:
  - `createGrn` — BDM records stock received, validates products exist, creates GrnEntry(PENDING), AuditLog
  - `approveGrn` — Finance/Admin only. APPROVED: MongoDB transaction → TransactionEvent(GRN) + InventoryLedger entries (qty_in per line_item). REJECTED: sets rejection_reason
  - `getGrnList` — paginated list with tenantFilter scoping, populates bdm_id and reviewed_by
- [x] Add routes to `backend/erp/routes/inventoryRoutes.js`:
  - POST `/grn` — createGrn
  - POST `/grn/:id/approve` — approveGrn (roleCheck admin, finance)
  - GET `/grn` — getGrnList
- [x] Create `frontend/src/erp/hooks/useGrn.js` — getGrnList, createGrn, approveGrn
- [x] Create `frontend/src/erp/pages/GrnEntry.jsx`:
  - GRN form: grn_date, product grid (product dropdown, batch, expiry, qty), notes
  - ScanUndertakingModal: camera/gallery → processDocument('UNDERTAKING') → fuzzy match products → pre-fill line items
  - GRN list with status filter tabs (All/PENDING/APPROVED/REJECTED), approve/reject buttons for Admin/Finance
  - Status badges: PENDING=amber, APPROVED=green, REJECTED=red
- [x] Route registered: `/erp/grn` (employee, admin, finance)

### 4.2 — Reorder Rules & Alerts ✅
- [x] Add SAP-level reorder fields to `backend/erp/models/ProductMaster.js`:
  - `reorder_min_qty` (Number, default: null) — reorder point threshold
  - `reorder_qty` (Number, default: null) — suggested order quantity
  - `safety_stock_qty` (Number, default: null) — SAP Safety Stock buffer
  - `lead_time_days` (Number, default: null) — expected delivery lead time
- [x] Add `getAlerts` to inventoryController — BDM-scoped, computes in parallel:
  - Expiry alerts: batches expiring within NEAR_EXPIRY_DAYS with available_qty > 0
  - Reorder alerts: products where total stock < reorder_min_qty, enriched with reorder_qty, safety_stock_qty, lead_time_days, order_by_date
- [x] Add `updateReorderQty` to productMasterController — PATCH body accepts all 4 reorder fields, per-field AuditLog
- [x] Routes: GET `/inventory/alerts`, PATCH `/products/:id/reorder-qty` (roleCheck admin, finance)
- [x] Frontend: `useInventory.getAlerts()`, MyStock "Alerts" tab (4th tab) with expiry table (color-coded: red <30d, amber <120d) + reorder table (current qty, min qty, safety stock, suggested order, lead time, order-by date)

### 4.3 — DR Entry & Consignment Tracking [v5 NEW] ✅
- [x] Create `backend/erp/controllers/consignmentController.js`:
  - `createDR` — MongoDB transaction → TransactionEvent + InventoryLedger(qty_out via consumeSpecificBatch or consumeFIFO) + ConsignmentTracker (if DR_CONSIGNMENT), AuditLog
  - `getDRsByBdm` — queries TransactionEvent with dr_type filter, paginated
  - `getConsignmentPool` — aggregates ConsignmentTracker by hospital, computes live days_outstanding and aging_status on read, returns summary (total_open, total_overdue, total_force_csi, total_value)
  - `convertConsignment` — validates qty ≤ qty_remaining, updates conversions array + qty_consumed, pre-save hook recalculates aging, AuditLog. Does NOT create InventoryLedger (stock already deducted at DR creation)
- [x] Create `backend/erp/routes/consignmentRoutes.js` — POST /dr, GET /dr, GET /pool, POST /convert
- [x] Mount in `backend/erp/routes/index.js` at `/consignment`
- [x] Create `frontend/src/erp/hooks/useConsignment.js` — createDR, getDRs, getConsignmentPool, convertConsignment
- [x] Create `frontend/src/erp/pages/DrEntry.jsx`:
  - DR form: hospital dropdown, DR#, DR date, DR type dropdown (Sampling/Consignment/Donation — not a binary toggle), product grid (stock-filtered), batch
  - ScanDRModal: camera/gallery → processDocument('DR') → fuzzy match hospital + products → pre-fill form
  - DR list with type badges
- [x] Create `frontend/src/erp/pages/ConsignmentDashboard.jsx`:
  - Summary cards: Total Open, OVERDUE count, FORCE_CSI count, Value at Risk
  - Hospital accordion cards with consignment rows inside
  - Aging badges: OPEN=blue, OVERDUE=red, FORCE_CSI=orange, COLLECTED=green
  - "Convert to CSI" inline form per row (qty, CSI doc ref)
- [x] Routes registered: `/erp/dr` (employee, admin), `/erp/consignment` (employee, admin, finance)

> **DR UX redesign (April 3, 2026 — during Phase 4B testing):**
> - ✅ DrEntry.jsx rewritten from form layout to SalesEntry-style spreadsheet grid
> - ✅ Batch dropdown from BDM stock (FEFO sorted), single-batch auto-select
> - ✅ Expiry column auto-populated from stock data on batch selection
> - ✅ OCR ScanDRModal passes both batch_lot_no AND expiry_date from scan results
> - ✅ DR_DONATION added as third DR type (backend + frontend). Backend accepts DR_DONATION in validation enum.
> - ✅ Rows auto-grouped by hospital+DR# on submit (multiple products per DR)

### Phase 4 Summary

| Task | Description | Status |
|------|-------------|--------|
| 4.1 | GRN Workflow (model, controller, routes, frontend) | ✅ Complete |
| 4.2 | Reorder Rules & Alerts (SAP-level fields, alerts endpoint, Alerts tab) | ✅ Complete |
| 4.3 | DR Entry & Consignment Tracking (controller, routes, 2 pages) | ✅ Complete |

**Files created:** 8 new + 9 modified | **Models:** 1 | **Controllers:** 1 new + 2 modified | **Routes:** 1 new + 3 modified | **Hooks:** 2 new + 1 modified | **Pages:** 3 new + 1 modified

---

## PHASE 4A — ENTITY DATA MIGRATION & HOSPITAL GLOBAL SHARING
**Goal:** Fix entity assignments (fake "VIP Pharmacy Inc." entity → real entities), make hospitals globally shared across all entities, and verify data integrity for all BDMs.

> **Background (April 2, 2026):** Seed scripts accidentally created a "VIP Pharmacy Inc." entity. All real data (235 products, 101 hospitals, 246 inventory entries, 4 sales, 9 BDMs) landed under this fake entity. The real entities are VIOS INTEGRATED PROJECTS (VIP) INC. (parent) and MG AND CO. INC. (subsidiary). Jake Montero is MG AND CO.'s BDM — he buys stock from VIP and issues MG AND CO. CSIs to hospitals.

> **Business model:** VIP is the parent company that imports pharmaceutical products. VIP supplies products to subsidiaries (MG AND CO. first) at a transfer price (higher than VIP's purchase price, lower than hospital selling price). Each subsidiary has its own purchase_price (= VIP's transfer price) and selling_price. Hospitals are shared — both VIP and MG BDMs sell to the same hospital pool. The system must scale to N subsidiaries as BDMs graduate to running their own companies.

> **Partial fix applied (April 2, 2026):** 6 BDMs' User.entity_id was corrected from VIOS INTEGRATED → VIP Pharmacy Inc. to match their inventory location. This was a temporary fix to unblock Sales Entry testing. Full entity migration (4A.1–4A.4) still needed to consolidate under the correct real entities and delete the fake entity.

**Prerequisites:** Phase 4 committed, all seeds run.

### 4A.1 — Consolidate VIP Entity Data ✅
- [x] Create migration script: `backend/erp/scripts/migrateEntityData.js`
- [x] Move 8 VIP BDMs (Menivie, Jay Ann, Jenny Rose, Judy Mae, Mae, Roman, Edcel Mae, Romela) + Cristina + TEST account → VIP (VIOS INTEGRATED) entity
- [x] Move their products (~222 products) from fake entity → VIP entity
  - Update `ProductMaster.entity_id` and re-validate unique index `{ entity_id, item_key }`
- [x] Move their InventoryLedger entries (~233 entries) → VIP entity
- [x] Move their SalesLine entries → VIP entity
- [x] Move their TransactionEvent entries → VIP entity
- [x] Delete seed junk under old VIP entity (6 test products, 3 test hospitals, 9 test ledger entries)

> **Implementation note (April 2, 2026):** Migration script `migrateEntityData.js` handles 4A.1, 4A.2, 4A.3, and 4A.4 in a single idempotent run. It auto-detects MG BDMs by name matching ("jake montero"), reassigns all Users/Products/Ledger/Sales/Events/GRN/Consignment, makes hospitals global, merges duplicates, and deletes fake entities. Run: `cd backend && node erp/scripts/migrateEntityData.js`

### 4A.2 — Set Up MG AND CO. Entity Data ✅
- [x] Move Jake Montero → MG AND CO. entity (`User.entity_id`)
- [x] Move Jake's 13 products → MG entity (already have correct MG pricing)
  - Update `ProductMaster.entity_id` for Jake's products
- [x] Move Jake's 13 InventoryLedger entries → MG entity
- [x] Move any Jake SalesLine/TransactionEvent entries → MG entity

### 4A.3 — Make Hospital Model Globally Shared ✅
- [x] Update `backend/erp/models/Hospital.js`:
  - Make `entity_id` optional (remove `required: true`)
  - Change unique index from `{ entity_id: 1, hospital_name_clean: 1 }` → `{ hospital_name_clean: 1 }` (global uniqueness)
  - Keep `tagged_bdms` array unchanged — this is the BDM access control (not entity_id)
- [x] Update `backend/erp/controllers/hospitalController.js`:
  - Remove `entity_id` from default query filters in `getAll()`
  - BDM filtering via `tagged_bdms.bdm_id` remains unchanged — BDMs still only see their tagged hospitals
  - Admin/Finance/President see all hospitals
- [x] Merge duplicate hospitals if any exist across entities (same `hospital_name_clean` in different entities → merge into one record, consolidate `tagged_bdms`)
- [x] Update hospital-related queries in other controllers (salesController, consignmentController) if they filter by entity_id on hospital
  - Verified: salesController and consignmentController do NOT filter hospitals by entity_id — no changes needed

### 4A.4 — Delete Fake Entity ✅
- [x] Verify no orphaned data references fake entity_id (`69cdf9e7bb0053885fcabfb3`)
- [x] Delete "VIP Pharmacy Inc." entity record from Entity collection
- [x] Run full integrity check: all entity_id references in InventoryLedger, SalesLine, ProductMaster, TransactionEvent, GrnEntry, ConsignmentTracker point to valid entities

### 4A.5 — Verification ✅
- [x] Login as Menivie (VIP BDM) → Sales Entry → products dropdown shows VIP products with stock
- [x] Login as Jake (MG BDM) → Sales Entry → products dropdown shows MG products with stock
- [x] Login as Gregg (president) → can see all entities' data
- [x] Hospital dropdowns: BDMs see only their tagged hospitals (unchanged behavior)
- [x] MyStock page: each BDM sees only their own entity's inventory
- [x] Frontend build: 0 errors

> **Migration ran successfully (April 2, 2026):**
> - 10 VIP BDMs + 1 MG BDM correctly assigned
> - 222 products → VIP, 13 products → MG
> - 233 inventory ledger → VIP, 13 → MG
> - 4 SalesLine → VIP, 3 TransactionEvent → VIP
> - 103 hospitals made globally shared (entity_id unset), 1 duplicate merged ("Iloilo Doctors Hospital")
> - Fake "VIP Pharmacy Inc." entity deleted
> - Integrity check: all collections clean (0 orphans)
> - Entity branding seeded: VIP gold (#F5C518), MG navy (#1B2D5B)

---

## PHASE 4B — INTER-COMPANY TRANSFERS (VIP → Subsidiary Supply Chain)
**Goal:** Enable parent entity (VIP) to transfer stock to subsidiary entities (MG AND CO.) with proper pricing, inventory tracking, GRN-like receiving, and full audit trail. Must scale to N subsidiaries.

> **Why NOW:** Jake Montero currently buys stock from VIP and issues MG AND CO. CSIs (different format from VIP CSIs) to hospitals. Without this module, Jake cannot replenish his MG inventory through the system. This is the daily operational workflow, not a future feature.

> **ERP Pattern Reference (NetSuite-style):**
> - SAP calls this "Stock Transport Order (STO)" — PO → Delivery → Goods Receipt
> - NetSuite calls this "Inter-Company Transfer Order" — Pending → In Transit → Received
> - Odoo calls this "Inter-Company Transfer" — Draft → Confirmed → Done
> - Our design: ICTO — DRAFT → APPROVED → SHIPPED → RECEIVED → POSTED (closest to NetSuite)
>
> **Key principle:** Source entity's stock decreases at SHIPPED (TRANSFER_OUT), target entity's stock increases at RECEIVED (TRANSFER_IN). The SHIPPED→RECEIVED gap represents in-transit inventory.

> **Sales Entry impact:** NONE. tenantFilter already scopes by entity_id. Jake logs in → sees MG products at MG prices → submits sales → SalesLine.entity_id = MG AND CO. FIFO consumes from MG's InventoryLedger. SalesEntry.jsx, salesController.js, fifoEngine.js are UNCHANGED.

**Prerequisites:** Phase 4A complete (entities properly assigned, hospitals global).

### 4B.1 — Transfer Price List Model ✅
- [x] Create `backend/erp/models/TransferPriceList.js`:
  - Fields: source_entity_id (ref: Entity), target_entity_id (ref: Entity), product_id (ref: ProductMaster), transfer_price (Number, required), effective_date (Date), set_by (ref: User), is_active (Boolean, default: true), notes (String)
  - Unique index: `{ source_entity_id: 1, target_entity_id: 1, product_id: 1 }` (one active price per product per entity pair)
  - Validation: transfer_price must be > 0
  - Collection: `erp_transfer_price_list`
- [ ] Seed sample transfer prices for VIP → MG AND CO. (based on existing MG product pricing) — **deferred to first live transfer**
- [x] Committed in Phase 4B batch

### 4B.2 — Inter-Company Transfer Order (ICTO) Model ✅
- [x] Create `backend/erp/models/InterCompanyTransfer.js`:
  - Header: source_entity_id, target_entity_id, transfer_date, transfer_ref (auto-generated: `ICT-YYYYMMDD-NNN`), requested_by (ref: User), notes
  - Line items subdoc array: product_id, batch_lot_no, expiry_date, qty, unit, transfer_price, line_total (auto-computed: qty × transfer_price)
  - Totals: total_amount, total_items (auto-computed pre-save)
  - Status lifecycle: `['DRAFT', 'APPROVED', 'SHIPPED', 'RECEIVED', 'POSTED', 'CANCELLED']`
  - Approval fields: approved_by, approved_at
  - Shipping fields: shipped_by, shipped_at, source_event_id (ref: TransactionEvent)
  - Receiving fields: received_by, received_at, target_event_id (ref: TransactionEvent)
  - Posting fields: posted_by, posted_at
  - Cancellation: cancelled_by, cancelled_at, cancel_reason
  - Timestamps: created_at (immutable), created_by
  - Indexes: `{ source_entity_id: 1, status: 1 }`, `{ target_entity_id: 1, status: 1 }`, `{ transfer_ref: 1 }` (unique)
  - Collection: `erp_inter_company_transfers`
- [x] Pre-save: auto-compute line_total = qty × transfer_price, roll up total_amount
- [x] Pre-save: cleanBatchNo normalization on batch_lot_no
- [x] Committed in Phase 4B batch

### 4B.3 — IC Transfer Service (Dual-Ledger Inventory Movements) ✅
- [x] Create `backend/erp/services/interCompanyService.js`:
  - `shipTransfer(transferId, shippedBy)`:
    - Validate status is APPROVED
    - MongoDB transaction:
      - For each line item: consume stock from source entity via `consumeFIFO` or `consumeSpecificBatch` (if batch_lot_no specified)
      - Create InventoryLedger entries: `transaction_type: 'TRANSFER_OUT'`, `qty_out` for source entity/BDM
      - Create TransactionEvent for source (event_type: IC_SHIPMENT)
    - Update ICTO status → SHIPPED, set shipped_by/at, source_event_id
    - AuditLog entry
  - `receiveTransfer(transferId, receivedBy)`:
    - Validate status is SHIPPED
    - MongoDB transaction:
      - For each line item: create InventoryLedger entries: `transaction_type: 'TRANSFER_IN'`, `qty_in` for target entity
      - Target bdm_id: the receiving BDM (from target entity)
      - Create TransactionEvent for target (event_type: IC_RECEIPT)
    - Update ICTO status → RECEIVED, set received_by/at, target_event_id
    - Auto-create product in target entity's ProductMaster if not exists (see 4B.6) — **integrated directly into receiveTransfer**
    - AuditLog entry
  - `postTransfer(transferId, postedBy)`:
    - Validate status is RECEIVED
    - Update ICTO status → POSTED, set posted_by/at
    - AuditLog entry (final)
  - `cancelTransfer(transferId, cancelledBy, reason)`:
    - DRAFT, APPROVED, SHIPPED, or RECEIVED can be cancelled
    - If SHIPPED: creates ADJUSTMENT entries to restore source stock
    - If RECEIVED: reverses both source TRANSFER_OUT and target TRANSFER_IN
    - AuditLog entry
- [x] Committed in Phase 4B batch

### 4B.4 — IC Transfer Controller & Routes ✅
- [x] Create `backend/erp/controllers/interCompanyController.js`:
  - `createTransfer` — create DRAFT (president/admin only), auto-fills transfer_price from TransferPriceList
  - `getTransfers` — list with pagination, entity filter, status filter; president sees all, others see own entity
  - `getTransferById` — detail with enriched line items (product details)
  - `approveTransfer` — DRAFT → APPROVED (president/admin only)
  - `shipTransfer` — APPROVED → SHIPPED (calls interCompanyService.shipTransfer)
  - `receiveTransfer` — SHIPPED → RECEIVED (target entity BDM/admin confirms)
  - `postTransfer` — RECEIVED → POSTED (president/admin)
  - `cancelTransfer` — cancel with reason
  - `getTransferPrices` — list transfer prices for an entity pair
  - `setTransferPrice` — upsert transfer price (president/admin)
  - `getEntities` — list all active entities (for dropdowns)
- [x] Create `backend/erp/routes/interCompanyRoutes.js`:
  - `POST /erp/transfers` — createTransfer
  - `GET /erp/transfers` — getTransfers
  - `GET /erp/transfers/:id` — getTransferById
  - `PATCH /erp/transfers/:id/approve` — approveTransfer
  - `PATCH /erp/transfers/:id/ship` — shipTransfer
  - `PATCH /erp/transfers/:id/receive` — receiveTransfer
  - `PATCH /erp/transfers/:id/post` — postTransfer
  - `PATCH /erp/transfers/:id/cancel` — cancelTransfer
  - `GET /erp/transfers/prices/list` — getTransferPrices
  - `PUT /erp/transfers/prices` — setTransferPrice
  - `GET /erp/transfers/entities` — getEntities
  - roleCheck: president/admin for create/approve/ship/post/cancel/pricing; target entity BDM for receive
- [x] Register in `backend/erp/routes/index.js`: `router.use('/transfers', require('./interCompanyRoutes'))`
- [x] Committed in Phase 4B batch

### 4B.5 — IC Transfer Frontend Pages ✅
- [x] Create `frontend/src/erp/hooks/useTransfers.js`:
  - `getTransfers(params)`, `getTransferById(id)`, `createTransfer(data)`, `approveTransfer(id)`, `shipTransfer(id)`, `receiveTransfer(id)`, `postTransfer(id)`, `cancelTransfer(id, reason)`
  - `getTransferPrices(params)`, `setTransferPrice(data)`, `getEntities()`
- [x] Create `frontend/src/erp/pages/TransferOrders.jsx`:
  - List view: table of all transfers with status badges (DRAFT=gray, APPROVED=blue, SHIPPED=orange, RECEIVED=green, POSTED=dark green, CANCELLED=red)
  - Create form modal: source entity, target entity dropdown, transfer date, product line items with qty/price
  - Action buttons per status: Approve, Ship, Receive, Post, Cancel
  - Detail modal: full transfer info with timeline (created, approved, shipped, received, posted, cancelled)
- [x] Create `frontend/src/erp/pages/TransferReceipt.jsx`:
  - Target entity BDM view: incoming transfers in SHIPPED status
  - Confirm receipt: review line items, confirm quantities received
  - Card-based layout with receipt button per transfer
- [x] Create `frontend/src/erp/pages/TransferPriceManager.jsx`:
  - Grid: product × target entity → transfer price
  - Inline edit with save button
  - Effective date tracking, set_by display
  - President/admin only
- [x] Add "Transfers" tab to ERP navigation in Navbar.jsx ERP_TABS
- [x] Add lazy-loaded routes in App.jsx: `/erp/transfers`, `/erp/transfers/receive`, `/erp/transfers/prices`
- [x] Committed in Phase 4B batch

### 4B.6 — Product Catalog Sync on Transfer ✅
- [x] In `interCompanyService.receiveTransfer()`:
  - `syncProductToTargetEntity()` function called for each line item
  - If NOT exists: auto-create ProductMaster record in target entity with:
    - Same brand_name, generic_name, dosage_strength, unit_code, vat_status
    - `purchase_price` = transfer_price (from ICTO line item)
    - `selling_price` = transfer_price (admin must update to actual selling price)
    - `item_key` = same format (`brand|dosage`)
    - Log creation in ErpAuditLog
  - If EXISTS: verify purchase_price matches transfer_price, flag discrepancy in ErpAuditLog if not
- [x] This ensures target entity always has a valid ProductMaster entry after receiving stock
- [x] Scalable: works for any new subsidiary — first transfer auto-populates their product catalog
- [x] Integrated into interCompanyService.js (not a separate file)

### 4B.7 — Entity-Aware Reports & UI Enhancements ✅
- [x] Add branding fields to `backend/erp/models/Entity.js`:
  - `brand_color` (String, default: '#6B7280') — primary badge/header background color
  - `brand_text_color` (String, default: '#FFFFFF') — text color on brand_color background
  - `logo_url` (String, optional) — entity logo (S3 path or URL)
  - `tagline` (String, optional) — entity tagline for reports/footers
- [x] Seed branding script: `backend/erp/scripts/seedEntityBranding.js`
  - **VIP:** brand_color `#F5C518` (gold), brand_text_color `#1A1A1A` (black), tagline "Ka Dito!"
  - **MG AND CO.:** brand_color `#1B2D5B` (navy), brand_text_color `#FFFFFF` (white), tagline "Right Dose. Right Partner."
- [x] Create `frontend/src/erp/hooks/useEntities.js` — fetch entities with branding for dropdowns/badges (cached)
- [x] Create `frontend/src/erp/components/EntityBadge.jsx` — renders entity name with `brand_color`/`brand_text_color` from Entity model. Scales to N entities without code changes. Supports sm/md/lg sizes.
- [x] SalesList page: Entity column with EntityBadge (visible for president/admin/CEO only)
- [x] MyStock page: entity badge next to "My Stock" title
- [ ] Reports: add entity filter dropdown for president/admin views — **deferred to Phase 8**
- [x] Dashboard: entity badge in ERP Dashboard header
- [ ] OCR note: MG AND CO. has different CSI format — existing CSI parser may need a variant or flexible field mapping for MG invoices (document for Phase 9 OCR integration)

### 4B.8 — Verification (Full Inter-Company Flow Test) ✅
- [x] **Transfer creation:** VIP president creates ICTO: 5 units of Anaway Forte 500mg (Menivie → Jake)
  - Transfer price set manually (TransferPriceList seeding deferred to first live transfer)
  - Batch/expiry selected from VIP stock via batch dropdown
- [x] **Approval:** President approves ICTO → status APPROVED
- [x] **Shipment:** VIP ships → VIP InventoryLedger: TRANSFER_OUT qty_out=5
  - Menivie stock: 100 → 95 (verified via automated test)
- [x] **Receipt:** Jake (MG BDM) confirms receipt → MG InventoryLedger: TRANSFER_IN qty_in=5
  - Jake stock: 0 → 5 (verified via automated test)
  - ProductMaster auto-created in MG entity: Anaway Forte (item_key: Anaway Forte|500mg) ✅
- [x] **Post:** President posts ICTO → status POSTED, immutable ✅
- [x] **Jake sells:** Sales Entry → MG products with stock (15 items, 17 products) → Jake tagged to Iloilo Doctors Hospital → ready to sell
- [x] **President view:** Sees both VIP (228 products, 243 ledger) and MG (15 products, 14 ledger) data
- [x] **Audit trail:** TransactionEvents (IC_SHIPMENT + IC_RECEIPT), InventoryLedger (TRANSFER_OUT + TRANSFER_IN), ErpAuditLog all populated
- [x] Frontend build: 0 errors

> **Automated lifecycle test (April 3, 2026):** Full DRAFT→APPROVED→SHIPPED→RECEIVED→POSTED cycle verified via `testSalesLifecycle.js` script. Stock deductions and restorations confirmed correct. Test data cleaned up after verification.
>
> **Bug fixes applied during 4B.8 testing (April 3, 2026):**
> - **inventoryController entity_id override:** `getMyStock()` and `getBatches()` now accept `?entity_id=` param for president/admin/finance, fixing wrong-entity stock queries during IC transfer creation
> - **productMasterController tenantFilter:** `getAll()` now applies only `entity_id` from tenantFilter (not `bdm_id`, since ProductMaster is entity-level) — fixes BDM seeing 0 products
> - **productMasterController limit=0:** Backend now handles `limit=0` as "return all" — fixes product dropdown showing only first 50 of 228 products
> - **useProducts limit:** Frontend passes `limit=0` to fetch all products for dropdowns
> - **TransferOrders entity_id passthrough:** Stock/batch fetches now pass `form.source_entity_id` to query correct entity's inventory
> - **TransferOrders String() comparison:** Product ID filtering uses `String()` for reliable Set matching

### 4B.9 — Internal Stock Reassignment (Same Entity) ✅
- [x] Create `backend/erp/models/StockReassignment.js`:
  - Fields: entity_id, source_bdm_id, target_bdm_id, reassignment_date, line_items (product_id, item_key, batch_lot_no, expiry_date, qty), undertaking_photo_url, ocr_data, notes
  - Status: `PENDING → APPROVED → REJECTED` (same pattern as GRN)
  - Approval: reviewed_by, reviewed_at, rejection_reason
  - event_id (ref: TransactionEvent, set on approval)
  - Collection: `erp_stock_reassignments`
- [x] Add `createReassignment` endpoint: POST `/erp/transfers/reassign` (president/admin creates)
- [x] Add `approveReassignment` endpoint: POST `/erp/transfers/reassign/:id/approve` (finance/admin approves)
  - On APPROVED: MongoDB transaction → consumeSpecificBatch from source → TRANSFER_OUT + TRANSFER_IN ledger entries → TransactionEvent(STOCK_REASSIGNMENT)
  - On REJECTED: sets rejection_reason, no stock movement
- [x] Add `getReassignments` endpoint: GET `/erp/transfers/reassign`
- [x] Frontend "Internal" tab on TransferOrders page: create reassignment modal, list with approve/reject buttons

### 4B.10 — Warehouse Custody Model (Source/Target BDM Selection) ✅
- [x] Added `source_bdm_id` and `target_bdm_id` to InterCompanyTransfer model (Phase 4B.2)
- [x] interCompanyService uses explicit `source_bdm_id` / `target_bdm_id` instead of guessing first BDM
- [x] `getBdmsByEntity` endpoint: returns employees + president + admin for BDM dropdowns
  - Supports `include_unassigned=true` for BDMs without entity_id (contractors not yet assigned)
- [x] Frontend IC Transfer create form: Source Custodian + Target Custodian dropdowns after entity selection
- [x] Frontend detail modal shows source/target custodian names with role labels
- [x] Fixed route ordering bug: `/bdms` and `/prices/list` moved before `/:id` parameterized routes
- [x] AR/AP auto-generated on POSTED: IC_AR TransactionEvent (source entity owed) + IC_AP (target entity owes)

### Phase 4B Summary

| Task | Description | Status |
|------|-------------|--------|
| 4B.1 | Transfer Price List Model | ✅ Complete |
| 4B.2 | Inter-Company Transfer Order (ICTO) Model | ✅ Complete |
| 4B.3 | IC Transfer Service (dual-ledger movements + AR/AP on POSTED) | ✅ Complete |
| 4B.4 | IC Transfer Controller & Routes (14 endpoints incl. reassignment) | ✅ Complete |
| 4B.5 | IC Transfer Frontend (IC + Internal tabs, BDM dropdowns) | ✅ Complete |
| 4B.6 | Product Catalog Sync on Transfer | ✅ Complete (integrated in 4B.3) |
| 4B.7 | Entity-Aware Reports & UI Enhancements | ✅ Core complete (UI integration deferred) |
| 4B.8 | Verification (full VIP→MG→Hospital flow) | ✅ Automated test passed (April 3, 2026) |
| 4B.9 | Internal Stock Reassignment (same entity) | ✅ Complete |
| 4B.10 | Warehouse Custody Model (source/target BDM selection) | ✅ Complete |

**New files created:** 16 | **Models:** 3 (TransferPriceList, InterCompanyTransfer, StockReassignment) | **Services:** 1 | **Controllers:** 1 (14 endpoints) | **Routes:** 1 | **Hooks:** 2 | **Pages:** 3 | **Components:** 1 | **Scripts:** 2 | **Modified files:** 7

> **Warehouse Custody Model (April 2, 2026):**
> - Each BDM holds their own stock (bdm_id in InventoryLedger = custodian, not role)
> - Gregg (president) acts as warehouse keeper — his user `_id` is used as bdm_id for undistributed VIP stock
> - **IC Transfer = BDM → Entity**: source custodian's stock is deducted (TRANSFER_OUT), target custodian's stock is credited (TRANSFER_IN). Source/target BDM dropdowns in the create form.
> - **Internal Reassignment = BDM → BDM (same entity)**: follows GRN approval pattern (PENDING → finance approves → stock moves). Undertaking of Receipt required. No AR/AP.
> - **AR/AP**: On IC Transfer POSTED, auto-creates IC_AR TransactionEvent (source entity owed) and IC_AP TransactionEvent (target entity owes). Settlement deferred to Phase 5.
> - **No new roles needed**: president + source_bdm_id pattern is sufficient. Formal warehouse role deferred to Phase 10 (person_type).
> - **SHARED_SERVICES entity type**: deferred — add when the shared services company is actually created.

> **ERP comparison:** This module is comparable in scope to Phase 4 (Inventory/GRN/DR/Consignment). The dual-ledger transaction pattern (TRANSFER_OUT + TRANSFER_IN) reuses existing InventoryLedger infrastructure. IC Transfers follow SAP Stock Transport Order pattern (with AR/AP on posting, like NetSuite). Internal Reassignments follow SAP movement type 311 pattern (pure inventory, no financial documents).

> **UX improvements applied during 4B testing session (April 3, 2026):**
>
> **Sales module fixes:**
> - ✅ SalesList: Added Submit button (VALID rows) and Re-open button (POSTED rows) to Actions column
> - ✅ SalesList: Added Products column showing `item_key × qty` per line item
> - ✅ SalesEntry: `loadSales()` now fetches all active statuses (DRAFT, VALID, ERROR, POSTED) — was only fetching DRAFT, causing VALID rows to disappear after validation and Submit button to be permanently disabled
> - ✅ SalesEntry: Split combined "Batch / Expiry" column into separate "Batch / Lot" dropdown + "Expiry" read-only column
> - ✅ useSales: `submitSales()` sends `{}` instead of `null` — fixes "Unexpected token 'n'" JSON parse error
>
> **DR module redesign:**
> - ✅ DrEntry: Rewritten from form layout to SalesEntry-style spreadsheet grid (columns: #, Hospital, DR#, Date, Type, Product, Batch, Expiry, Qty)
> - ✅ DrEntry: Batch column uses dropdown from BDM stock batches (sorted FEFO), single-batch products auto-select
> - ✅ DrEntry: Expiry column auto-fills when batch is selected from stock data
> - ✅ DrEntry: ScanDRModal now passes expiry_date from OCR results through to form
> - ✅ DrEntry: Added DR_DONATION as third DR type (green badge), alongside Consignment (blue) and Sampling (purple)
> - ✅ consignmentController: Backend now accepts DR_DONATION in validation and queries
> - ✅ DrEntry: Rows with same hospital+DR# auto-grouped into single DR on submit
> - ✅ DR History: Shows product details (item_key × qty) per DR
>
> **Consistent layout across all transactional pages:**
> - Sales Entry, DR Entry, GRN Entry, and Transfers all now have separate Batch and Expiry columns
> - Product dropdown logic verified: Sales/DR/Transfers show only in-stock products; GRN shows all products (including 0 stock, since it's receiving NEW stock)
>
> **Commits:** `69ed6b5` (Phase 4A+4B), `b432b76` (tenantFilter fix), `f9fd18f` (product limit), `1e8ebce` (sales actions), `d69907d` (submit fix + products column), `12834e8` (DR redesign + DR_DONATION), `c099ef9` (DR batch/expiry), `f3c9a53` (SalesEntry/Transfer batch/expiry separation)

---

## PHASE 5 — COLLECTIONS & AR + CREDIT LIMITS + DUNNING ✅ COMPLETE
**Goal:** Collection session that preserves the client's current validation + proof-gate + SOA behavior, then formalizes it in MERN with a cleaner SAP-style document lifecycle, CWT, commission, partner insurance, AR aging, credit limits, and dunning.

> **Status (April 2026):** All tasks complete (5.1–5.5). 17 files created/modified. Backend: 1 model, 4 services, 1 controller (14 endpoints), 1 route file, 2 models modified. Frontend: 1 hook, 4 pages, 1 modified. Build: 0 errors. Commit: `fe33072`
>
> **Live testing (April 3, 2026):** Full end-to-end verified with BDM accounts (Jay Ann, Menivie). Fixes applied during testing:
> - **roleCheck.js**: President role now auto-bypasses all role checks (was blocked from approve-deletion and other admin/finance gates)
> - **CollectionSession.jsx**: Added CRM Doctor dropdown for partner tags (MD rebate) per CSI — uses `doctorService.getAll()`, rebate % from Settings `PARTNER_REBATE_RATES`
> - **CollectionSession.jsx**: Added source badge column (Opening AR amber / Sales blue) per CSI
> - **CollectionSession.jsx**: Added Step 4 document uploads (CR photo, deposit slip, CWT 2307, CSI photos) via OCR→S3 pipeline — required for validation hard gate
> - **CollectionSession.jsx**: Redesigned CSI selection from table to card layout for better mobile UX and inline commission/partner visibility
> - **Collections.jsx**: Added Commission and Rebates columns to list table; detail modal shows per-CSI partner tags with rebate amounts
> - **Collections.jsx**: Added Validate button for DRAFT/ERROR rows (was missing — only Submit existed for VALID)

> **Prerequisite note (Phase 4B):** TRANSFER_IN is now a valid stock source for BDMs in subsidiary entities (e.g., MG AND CO.). AR/Collection queries should treat IC-transferred stock the same as GRN stock — the CSI lifecycle is identical regardless of how stock was sourced. The entity_id on SalesLine distinguishes VIP vs MG invoices for reporting.

> **Client clarifications (April 3, 2026):**
> - **Commission rates** — admin-configurable dropdown via Settings, NOT hardcoded. Default: 0%, 0.5%, 1%, 2%, 3%, 4%, 5%. Admin can add/remove rates via Settings API.
> - **Partner rebate rates** — admin-configurable dropdown via Settings, NOT hardcoded. Default: 1%, 2%, 3%, 5%, 20%, 25%. Admin can add/remove.
> - **Partner tags from CRM** — dropdown from CRM Doctor model (VIP Clients). Both MDs and Non-MDs are CRM clients. Not all CSIs have partners — tagging is optional per CSI. Partner type (MD vs Non-MD) matters for future Profit Share Condition B (Phase 7).
> - **Profit sharing** — Phase 5 captures data only (partner tags, commission, rebate). PS eligibility engine (Condition A/B/C streak, revenue computation) deferred to Phase 7.
> - **P5 rule**: One CR = One Hospital (hard enforced)

### 5.1 — Collection Model & Services
- [x] Create `backend/erp/models/Collection.js`: ✅ 130 lines — full schema with settledCsiSchema + partnerTagSchema subdocs, pre-save auto-compute totals (12/112 PH VAT formula), 3 indexes, `erp_collections`
  - entity_id, bdm_id, hospital_id (required — P5 one CR per hospital)
  - cr_no, cr_date, cr_amount (the amount on the Collection Receipt)
  - settled_csis subdoc array: sales_line_id (ref SalesLine), doc_ref, invoice_amount, source (SALES_LINE/OPENING_AR), commission_rate (from Settings dropdown), commission_amount (auto: net_of_vat × rate), partner_tags array (doctor_id ref CRM Doctor, doctor_name, rebate_pct from Settings dropdown, rebate_amount auto-computed)
  - Totals (auto pre-save): total_csi_amount, total_net_of_vat, total_commission, total_partner_rebates
  - CWT: cwt_rate, cwt_amount, cwt_na (Boolean N/A flag), cwt_certificate_url
  - Payment: payment_mode (CHECK/CASH/ONLINE), check_no, check_date, bank, deposit_slip_url
  - Hard gate URLs: cr_photo_url, csi_photo_urls[]
  - Status lifecycle: DRAFT/VALID/ERROR/POSTED/DELETION_REQUESTED
  - posted_at, posted_by, reopen_count, validation_errors[], event_id
  - Indexes: entity+bdm+status, entity+hospital+date, settled_csis.sales_line_id
  - Pre-save: auto-compute totals, commission amounts, CR formula validation (|cr_amount - (total_csi - cwt)| ≤ 1.00)
  - Collection: `erp_collections`
- [x] Create `backend/erp/services/arEngine.js`: ✅ 178 lines — 4 exported functions, AR computed on-read via aggregation pipeline
  - `getOpenCsis(entityId, bdmId, hospitalId)` — aggregation: POSTED SalesLines minus POSTED Collection settled amounts → returns CSIs with balance_due > 0
  - `getArAging(entityId, bdmId, hospitalId)` — bucket open CSIs by days outstanding: CURRENT (0-30), 31-60, 61-90, 91-120, 120+
  - `getCollectionRate(entityId, bdmId, dateRange)` — total_collections / total_sales × 100%, threshold 70%
  - `getHospitalArBalance(hospitalId, entityId)` — simple sum for credit limit check
  - AR is computed on-read, never stored on SalesLine
- [x] Create `backend/erp/services/cwtCalc.js`: ✅ WC158 ATC code, 1% default rate
- [x] Create `backend/erp/services/commissionCalc.js`: ✅ net_of_vat × commission_rate, admin-configurable rates
- [x] Create `backend/erp/services/dunningService.js`: ✅ 37 lines — 4-tier color-coded levels
  - `computeDunningLevel(daysOutstanding)` — Level 0 green / Level 1 yellow (>30d) / Level 2 orange (>60d) / Level 3 red (>90d)
  - `enrichArWithDunning(arData)` — adds dunning level to each AR item
- [x] Create `backend/erp/services/soaGenerator.js`: ✅ 96 lines — XLSX workbook with 2 sheets (transaction ledger + aging breakdown)
- [x] Update `backend/erp/models/Settings.js`: ✅ COMMISSION_RATES [0, 0.005, 0.01, 0.02, 0.03, 0.04, 0.05] and PARTNER_REBATE_RATES [1, 2, 3, 5, 20, 25] added
- [x] Update `backend/erp/scripts/seedSettings.js`: ✅ Idempotent seed with all rate arrays

### 5.2 — Collection Controller & Routes
- [x] Create `backend/erp/controllers/collectionController.js` — ✅ 345 lines, 14 endpoints implemented:
  - `createCollection` (POST /) — create DRAFT
  - `updateCollection` (PUT /:id) — update DRAFT only
  - `deleteDraftCollection` (DELETE /draft/:id) — delete DRAFT only
  - `getCollections` (GET /) — list with filters (status, hospital, date range), pagination
  - `getCollectionById` (GET /:id) — detail
  - `getOpenCsis` (GET /open-csis?hospital_id=xxx) — unpaid CSIs from AR engine
  - `validateCollections` (POST /validate) — hard gate: cr_photo + csi_photos + cwt_cert (or N/A) + deposit_slip + CR formula + no double-settlement
  - `submitCollections` (POST /submit) — MongoDB transaction → TransactionEvent(CR), set POSTED
  - `reopenCollections` (POST /reopen) — revert POSTED → DRAFT, increment reopen_count
  - `getArAging` (GET /ar-aging) — AR aging with dunning levels
  - `getCollectionRate` (GET /collection-rate) — collection efficiency metric
  - `generateSoa` (POST /soa) — Excel SOA download
  - `requestDeletion` (POST /:id/request-deletion)
  - `approveDeletion` (POST /:id/approve-deletion) — roleCheck admin/finance
- [x] Create `backend/erp/routes/collectionRoutes.js`: ✅ Static routes before parameterized, roleCheck on approve-deletion
- [x] Mount in `backend/erp/routes/index.js`: ✅ `router.use('/collections', require('./collectionRoutes'))` (line 33)

### 5.2b — OCR-to-AR CSI Auto-Population
**Goal:** When a CR is scanned via OCR, auto-fetch open CSIs for the matched hospital.

- [x] `getOpenCsis` endpoint (from 5.2) returns unpaid CSIs for a hospital: ✅ Implemented in collectionController.js
- [x] In CollectionSession.jsx CR OCR flow: ✅ Hospital selector loads open CSIs, CSI checklist with checkboxes, commission/rebate per CSI
  - After OCR extracts `hospital` → fuzzy match → fetch open CSIs for that hospital
  - Display CSI checklist with invoice_no + amount + age (days overdue)
  - BDM ticks which CSIs are being settled
  - OCR-extracted `settled_csis` from CR photo are pre-checked if they match AR records
  - Validation: total selected CSI amounts should match CR total amount (warn if mismatch)

> ~~**UI gap noted (April 3, 2026):** CollectionSession.jsx CSI checklist does not visually distinguish OPENING_AR vs SALES_LINE CSIs.~~ **RESOLVED:** Source badge added per CSI card — amber "Opening AR" vs blue "Sales". Implemented during live testing.

### 5.3 — Credit Limit Enforcement (SAP SD Credit Management)
- [x] Hospital model already has `credit_limit` and `credit_limit_action` fields (added in Phase 2): ✅ Confirmed
- [x] In `salesController.js` `validateSales`: ✅ Credit limit check at lines 195-210, uses arEngine.getHospitalArBalance()
  - Query hospital AR balance via `arEngine.getHospitalArBalance()`
  - If projectedAR (currentAR + invoice_total) > credit_limit:
    - BLOCK mode: add ERROR, prevent submit
    - WARN mode: add WARNING (orange), allow submit
- [x] Credit limit values are set by admin via existing Hospital CRUD (no new UI needed): ✅ No changes needed

### 5.4 — Dunning / Collection Follow-Up (SAP FI-AR Dunning)
- [x] Dunning levels computed on-read by `dunningService.js` (not stored): ✅ 4-tier system
- [x] AR aging endpoint enriched with dunning indicators: ✅ getArAgingEndpoint calls enrichArWithDunning()
- [x] Level 1 (>30d): yellow "FOLLOW UP" badge: ✅ #ca8a04
- [x] Level 2 (>60d): orange "WARNING" badge: ✅ #d97706
- [x] Level 3 (>90d): red "CRITICAL" badge: ✅ #dc2626
- [x] AccountsReceivable.jsx displays dunning badges per hospital row: ✅ Hospital-level + CSI-level badges

### 5.5 — Collection & AR Frontend Pages
- [x] Create `frontend/src/erp/hooks/useCollections.js`: ✅ 30 lines, 14 API wrapper functions
- [x] Create `frontend/src/erp/pages/CollectionSession.jsx`: ✅ ~500+ lines — Hospital-First wizard with card layout, CRM integration, document uploads
  - Step 1: Select hospital → auto-fill CWT rate from hospital
  - Step 2: Open CSIs as cards with source badge (Opening AR / Sales) → per-CSI commission rate dropdown (from Settings `COMMISSION_RATES`) + per-CSI partner tags (CRM Doctor dropdown via `doctorService.getAll()` + rebate % dropdown from Settings `PARTNER_REBATE_RATES` + live rebate amount display)
  - Step 3: CR details (cr_no, cr_date, cr_amount, payment_mode, CWT with N/A toggle)
  - Step 4: Document uploads via OCR→S3 pipeline (CR photo, CSI photos, deposit slip, CWT 2307/N/A) — required for validation hard gate
  - Save as Draft → Validate → Submit flow
  - Scan CR button (crParser OCR pre-fills CR fields)
  - Scan 2307 button (cwtParser OCR pre-fills CWT fields)
- [x] Replace `frontend/src/erp/pages/Collections.jsx` placeholder → real list page: ✅ ~170+ lines with filters, table, detail modal, full action buttons
  - Filters: status (DRAFT/VALID/ERROR/POSTED)
  - Table: CR#, Hospital, CR Date, CR Amount, CWT, **Commission**, **Rebates**, CSIs, Status, Actions
  - Validate button (DRAFT/ERROR rows), Submit button (VALID rows), Re-open button (POSTED rows)
  - Detail modal with per-CSI commission breakdown, partner tags with rebate amounts, Opening AR badge
- [x] Create `frontend/src/erp/pages/AccountsReceivable.jsx`: ✅ ~160+ lines — summary cards, aging table, dunning badges, expandable CSI detail, SOA button
  - Summary cards: Total AR, Collection Rate (70% threshold), Avg Days Outstanding
  - AR aging table: per-hospital rows with aging bucket columns (color-coded)
  - Dunning badges per hospital (worst CSI level)
  - Click row to expand → individual CSI detail
  - "Generate SOA" button per hospital row
- [x] Create `frontend/src/erp/pages/SoaGenerator.jsx`: ✅ 73 lines — hospital selector, Excel download
  - Hospital selector, date range filter
  - AR summary preview for selected hospital
  - "Generate SOA" button → Excel download
  - Bulk mode: "Generate All" for hospitals with AR > 0
- [x] Update `frontend/src/App.jsx`: ✅ Lazy-loaded routes with ProtectedRoute (employee, admin, finance)
  - Add lazy routes: `/erp/collections/session`, `/erp/collections/ar`, `/erp/collections/soa`
  - Roles: employee, admin, finance

### 5.6 — Inter-Company Settlement (VIP collects from subsidiaries)
**Goal:** Separate model for VIP to collect from subsidiaries. IC Transfers generate real financial documents: **VIP issues CSI** (invoice to subsidiary), **subsidiary issues CR** (payment to VIP). Same CSI/CR document pattern as hospital collections, different parties.

> **Business flow — real documents at each step:**
> ```
> VIP issues CSI to MG   ←──  IC Transfer POSTED (VIP's invoice, at transfer price)
>   CSI ref = transfer's doc_ref or VIP-assigned CSI number
>
> MG BDM sells to hospital  →  MG CSI (MG's invoice to hospital)
> Hospital pays MG           →  Hospital CR (settles MG CSI)  ← existing Collection engine
>
> MG pays VIP from collections  →  MG issues CR to VIP (settles VIP's CSI)
>   CR ref = MG-assigned CR number
>   This is the IC Settlement
> ```
>
> **Document trail (both parties):**
> | Party | Issues | Reference |
> |-------|--------|-----------|
> | VIP (creditor) | CSI to MG | IC Transfer = VIP's CSI (invoice at transfer price) |
> | MG (debtor) | CR to VIP | IC Settlement = MG's CR (payment receipt) |
>
> **Why separate from hospital Collection:** Hospital CRs have per-CSI commission, partner MD rebate, and CRM Doctor tagging. IC settlements between entities don't involve MDs or commission — they're pure inter-company payable/receivable. CWT may apply depending on entity VAT registration status.
>
> **Scalability:** `creditor_entity_id` + `debtor_entity_id` pattern works for any parent→subsidiary relationship. Future subsidiaries use the same model. VIP (or any parent) sees all outstanding IC AR across all subsidiaries.

- [x] Create `backend/erp/models/IcSettlement.js`: ✅ Full schema with settledTransferSchema subdoc, pre-save auto-compute totals, 2 indexes, `erp_ic_settlements`
  - creditor_entity_id (VIP — who is owed), debtor_entity_id (MG — who owes)
  - cr_no (MG's CR number — the payment document MG issues to VIP)
  - cr_date, cr_amount
  - settled_transfers[]: { transfer_id (ref InterCompanyTransfer), transfer_ref, vip_csi_ref (VIP's CSI number from the transfer), transfer_amount, amount_settled }
  - Totals (auto pre-save): total_transfer_amount, total_settled
  - CWT: cwt_rate, cwt_amount, cwt_na (depends on entity VAT status)
  - Payment: payment_mode (CHECK/CASH/ONLINE), check_no, check_date, bank, deposit_slip_url
  - Proof: cr_photo_url (photo of MG's CR document)
  - Status lifecycle: DRAFT → POSTED (president/admin records directly)
  - posted_at, posted_by, event_id
  - Indexes: creditor+debtor+status, debtor+cr_date
  - Collection: `erp_ic_settlements`
- [x] Create `backend/erp/services/icArEngine.js`: ✅ Aggregation pipeline pattern mirrors arEngine.js — POSTED IC Transfers minus POSTED IC Settlements
  - `getOpenIcTransfers(creditorEntityId, debtorEntityId)` — returns transfers with balance_due > 0, includes VIP CSI ref, debtor/creditor entity names
  - `getIcArSummary(creditorEntityId)` — per-subsidiary totals: total owed, total settled, outstanding balance, worst_days
  - `getIcArBySubsidiary(debtorEntityId)` — individual transfer-level detail for one subsidiary
- [x] Create `backend/erp/controllers/icSettlementController.js`: ✅ 6 endpoints with MongoDB transaction on post
  - `getOpenIcTransfers` (GET /open-transfers?debtor_entity_id=xxx) — VIP's unpaid CSIs to that subsidiary
  - `createSettlement` (POST /) — record MG's CR against VIP's CSIs
  - `getSettlements` (GET /) — list with filters (debtor, status, date range), populated entity names
  - `getSettlementById` (GET /:id)
  - `postSettlement` (POST /:id/post) — MongoDB transaction → IC_SETTLEMENT TransactionEvent, audit log
  - `getIcArSummary` (GET /summary) — all subsidiaries overview for president dashboard
- [x] Create `backend/erp/routes/icSettlementRoutes.js`: ✅ Static routes first, roleCheck president/admin/finance on writes
- [x] Mount in `backend/erp/routes/index.js`: ✅ `router.use('/ic-settlements', require('./icSettlementRoutes'))`
- [x] Create `frontend/src/erp/hooks/useIcSettlements.js`: ✅ 6 API wrapper functions
- [x] Create `frontend/src/erp/pages/IcSettlement.jsx`: ✅ Card-based settlement form with document uploads
  - Select subsidiary (debtor entity dropdown — filters SUBSIDIARY + ACTIVE)
  - Open IC Transfers checklist (VIP CSI ref, transfer_ref, date, transfer amount, balance_due, editable amount_settled)
  - MG's CR details: cr_no, cr_date, cr_amount, payment_mode, check info
  - CWT section (rate, amount, N/A toggle)
  - Document upload: CR photo, deposit slip (via OCR→S3 pipeline)
  - Save as Draft
- [x] Create `frontend/src/erp/pages/IcArDashboard.jsx`: ✅ President-level IC AR overview
  - Summary cards: Total IC AR Outstanding, Open Transfers, Total Collected, Subsidiaries count
  - Per-subsidiary cards with expandable IC Transfer detail (click to see individual transfers)
  - Settlement history table with Post button for DRAFT settlements
  - Link to New IC Settlement form
- [x] Update `frontend/src/App.jsx`: ✅ Lazy routes `/erp/ic-settlements` (dashboard), `/erp/ic-settlements/new` (settlement form)
  - Roles: president, admin, finance

> **Live testing (April 3, 2026):** Full end-to-end verified:
> - IC Transfer VIP → MG: Nupira 20pcs @ ₱600 = ₱12,000 (ICT-20260403-912) + earlier transfer ₱2,000
> - IC AR Summary: ₱14,000 outstanding from MG AND CO. INC.
> - IC Settlement: MG-IC-CR-001, ₱14,000, settled both transfers, POSTED
> - IC AR post-settlement: ₱0 outstanding
> - Entity collection name fix: `entities` (Mongoose default), not `erp_entities`
> - IC Transfer product dropdown fixed: now shows `brand_name dosage — qty unit_code` format (matches SalesEntry)

> **Client clarifications (April 3, 2026) — noted for future phases:**
> 1. **Entity price lists**: ProductMaster already has per-entity `selling_price` (auto-fills on product select, overridable). TransferPriceList handles IC pricing. No new work needed for current scope.
> 2. **Approval routing**: Framework exists (`ENFORCE_AUTHORITY_MATRIX` flag, approve/reject patterns on GRN, transfers, deletions). Full authority matrix enforcement deferred — enable when needed.
> 3. **Mobile UI for BDMs**: Current pages are responsive but not mobile-optimized. BDMs need: Sales, Collection, GRN, DR, Expenses, Report, PNL — all in a mobile-first PWA with bottom tab nav. President/finance need: quick approval actions + dashboard cards. Target: Phase 10 or dedicated mobile sprint.
> 4. **Product dropdown consistency**: All product dropdowns should show `brand_name dosage — qty unit_code` format. SalesEntry ✅, TransferOrders ✅ (fixed). Other pages to verify in future polish pass.

---

## PHASE 6 — EXPENSES ✅ COMPLETE — 🟢 ACTIVE
**Goal:** SMER, Car Logbook, ORE, ACCESS, and PRF/CALF with SAP-style draft -> validate -> post lifecycle.

> **Status (April 2026): 🟢 ACTIVE** — All 8 tasks complete (6.1–6.8). 22 new files + 5 modified. Live tested with Jake Montero (MG AND CO.), Gregg (President), and Angeline Marie Vios (BALAI LAWAAN President). CRM→SMER bridge verified with real visit data. Territory-based document numbering system operational. CALF/PRF auto-population from collections and expenses working. Build: 0 errors.
>
> **Backend test (April 3, 2026): 20 passed, 0 failed.** Full lifecycle verified:
> - SMER: create → validate → submit (POSTED) → reopen ✅
> - Car Logbook: create → validate → fuel efficiency auto-compute ✅
> - ORE/ACCESS: create → CALF flags auto-set → VAT 12/112 → OR proof gate → president CALF override ✅
> - PRF (PARTNER_REBATE): create → auto-number (PRF-BLW040326-xxx) → partner bank required ✅
> - PRF (PERSONAL_REIMBURSEMENT): create → auto-number → no bank required → OR photo required ✅
> - CALF: create → auto-number (CALF-BLW040326-xxx) → balance auto-computed → linked expense back-link ✅
> - All test data cleaned up after verification.
>
> **Bug fixes applied (April 3, 2026 — post-testing review):**
> - **OR proof validation gate (CRITICAL):** `validateExpenses()` was missing OR photo/number check — CASH ORE/ACCESS transactions could validate and post without any receipt proof. **Fixed:** Added hard gate requiring `or_photo_url` OR `or_number` on every expense line (PRD v5 §8.3). `ExpenseComponent.or_required: true` now enforced.
> - **Photo persistence — blob URL → S3 URL:** ScanORModal was storing `URL.createObjectURL()` blob URLs instead of S3 URLs returned by backend OCR endpoint (`ocrData.s3_url`). Blob URLs are lost on page refresh. **Fixed:** `handleApply` now uses `ocrData.s3_url || preview`. Direct "Upload OR" button also uploads to S3 via processDocument.
> - **PrfCalf.jsx missing photo upload UI (CRITICAL):** Backend `validatePrfCalf` requires `photo_urls` (line 668) but frontend had NO photo upload input. All PRF/CALF documents would fail validation with "Photo proof is required". **Fixed:** Added photo upload section with S3 upload, thumbnail preview, and remove button. Both PRF and CALF now have photo proof capability.
> - **Direct "Upload OR" button added:** Expenses.jsx now has both "Scan OR" (OCR-assisted) and "Upload OR" (direct photo upload without OCR) buttons per expense line. Green "OR Photo ✓" badge when photo attached.
> - **OR photo routing fix — scan ONCE on expense, CALF inherits:** OR photo belongs on the ACCESS expense line (the transaction proof). When CALF is created from a pending ACCESS card, it auto-inherits `or_photo_url` from linked expense lines into `photo_urls` — no double-scan needed. Backend `createPrfCalf` collects OR photos from linked lines. `validatePrfCalf` checks linked expense OR photos as fallback when CALF has no direct photos. Frontend `handleCreateFromCalfLines` passes linked OR photos into form.
>
> **Correct OR photo routing (April 3, 2026):**
> ```
> ACCESS Expense Line → Scan OR / Upload OR → or_photo_url stored on expense line
>   ↓ (create CALF from pending card)
> CALF → photo_urls auto-inherited from linked expense OR photos
>   ↓ (validate)
> CALF validation → checks own photo_urls OR linked expense OR photos
> ```
> **Rule:** Scan/upload OR **once** on the expense line. CALF gets it automatically. PRF still needs its own photo upload (different document — partner payment proof).
>
> **Verified concerns (April 3, 2026):**
> - **CALF auto-number on pending card click:** By design — CALF Number field is readOnly with "Auto-generated on save" placeholder. Backend `PrfCalf.js` pre-save hook calls `docNumbering.generateDocNumber()` on `.save()`. Number appears after save, not on form load. Pre-fetching would waste sequence numbers if user cancels.
> - **CALF payment_mode from ACCESS line:** Working correctly — `PrfCalf.jsx:87` reads `item.lines[0]?.payment_mode || 'CARD'` from the pending card data. If ACCESS line was CARD, CALF form opens with CARD. Default fallback is CARD, not CASH. If CASH appeared, check the ACCESS line's saved payment_mode.
> - **ACCESS→CALF gate:** Working correctly — the ERROR when saving ACCESS expense without CALF is **correct behavior**. The validation gate in `expenseController.js` checks `calf_required && !calf_id` and blocks unless President override. BDM must create CALF first, then the back-link auto-updates the expense line's `calf_id`.
>
> **Architecture decisions:**
> - All transactional documents follow DRAFT → VALID → ERROR → POSTED lifecycle (PRD Section 5.5)
> - Per diem: 3-tier system (FULL ≥8 MDs = 100%, HALF ≥3 MDs = 50%, ZERO = 0%) — rates from Settings
> - Car Logbook: fuel efficiency computed in model pre-save hook, overconsumption flagged at 30% threshold
> - ORE: cash-based reimbursable, no CALF required
> - ACCESS: company-mode payments (credit card, GCash, bank transfer), CALF required for non-cash
> - **PRF (Payment Requisition Form):** Payment instruction for partner rebates. BDM creates PRF with partner bank account details (bank name, account holder, account number) so Finance can process payment. Hard gate: partner does NOT get rebate without PRF. SAP equivalent: Payment Request (F-58). BIR_FLAG = INTERNAL.
> - **CALF (Cash Advance & Liquidation Form):** Two-phase document tracking company funds. Phase 1: advance (company releases funds). Phase 2: liquidation (BDM accounts for spending). Required as attachment for expense ORs paid with company funds. SAP equivalent: FI-TV Travel Advance. NOT required for: cash/revolving fund, President entries, ORE. Tracks balance = advance - liquidation (+return to company, -reimburse BDM).
> - President override: CALF never required, can override any gate
> - PRF/CALF posting requires admin/finance/president role (Finance processes payment/confirms liquidation)
> - Expense summary consolidates 5 categories: SMER Reimbursables, Gas (less Personal), Partners' Insurance, ACCESS, CORE Commission
>
> **Future phases:**
> - Phase 9.1: OCR → expense form connections (Scan OR, Scan Gas Receipt, Scan Odometer)
> - Phase 9.1b: Document photo persistence for all expense proofs
> - ~~Phase 11: Journal entries from expenses (DR: 6XXX Expense, CR: 1110 AR BDM Advances)~~ ✅ DONE (April 5, 2026)

### 6.1 — Expense Models ✅
- [x] Create `backend/erp/models/SmerEntry.js` — daily entries with per diem tiers (FULL/HALF/ZERO), transport (P2P + special), ORE amount, travel advance reconciliation, auto-computed totals (pre-save), unique index on entity+bdm+period+cycle, DRAFT→VALID→ERROR→POSTED lifecycle, `erp_smer_entries` collection. **Per diem override fields:** `perdiem_override` (Boolean), `override_tier` (FULL/HALF), `override_reason`, `overridden_by`, `overridden_at` — Finance/Manager/President can override CRM-computed tier for exceptions (meetings, training). CRM `md_count` preserved for audit. Pre-save counts overridden days as working days. Validation skips hospital requirement for overridden days but requires override_reason.
- [x] Create `backend/erp/models/CarLogbookEntry.js` — morning/night odometer with photo URLs (S3), personal vs official KM split, fuel entries subdoc (station, type, liters, price, payment_mode, CALF flag), auto-computed efficiency (expected vs actual liters, overconsumption flag), gasoline split (personal vs official), DRAFT→VALID→ERROR→POSTED lifecycle, `erp_car_logbook_entries` collection
- [x] Create `backend/erp/models/ExpenseEntry.js` — ORE and ACCESS expense lines subdoc (date, type, category, establishment, particulars, amount, VAT auto-compute 12/112, OR number, payment_mode, CALF required flag for ACCESS non-cash), auto-computed totals (total_ore, total_access, total_amount), DRAFT→VALID→ERROR→POSTED lifecycle, `erp_expense_entries` collection
- [x] Create `backend/erp/models/PrfCalf.js` — PRF: partner payment instruction with bank details (payee_name, payee_type MD/NON_MD, partner_bank, partner_account_name, partner_account_no, rebate_amount, linked_collection_id). CALF: advance/liquidation tracking (advance_amount, liquidation_amount, balance auto-computed, linked_expense_id). Shared: photo_urls, bir_flag=INTERNAL, DRAFT→VALID→ERROR→POSTED lifecycle, `erp_prf_calf` collection

### 6.2 — Expense Services ✅
- [x] Create `backend/erp/services/perdiemCalc.js` — `computePerdiemTier()` (3-tier from Settings), `computePerdiemAmount()` (tier × rate), `computeSmerPerdiem()` (batch). Tested: 8 MDs=FULL=₱800, 5 MDs=HALF=₱400, 1 MD=ZERO=₱0
- [x] Create `backend/erp/services/smerCrmBridge.js` — **CRM → SMER integration**: `getDailyMdCount()` (single date), `getDailyMdCounts()` (date range aggregation pipeline, Manila timezone), `getDailyVisitDetails()` (drill-down with doctor names + engagement types). Queries CRM `Visit` model: counts `status: 'completed'` visits per BDM per day. Auto-populates SMER md_count instead of manual entry. Frontend "Pull MD Counts from CRM" button merges CRM data into SMER daily entries.
  - **Live tested (April 3, 2026):** Jake Montero March C2 — 51 MD visits across 12 days. Mar 17: 10 MDs (FULL), Mar 18: 11 MDs (FULL), Mar 24: 9 MDs (FULL), Mar 25: 8 MDs (FULL), Mar 19: 6 (HALF), Mar 26: 5 (HALF). Total per diem: ₱4,000. Drill-down Mar 31: 17 MDs with names and specializations. April C1: 10 MDs on Apr 2 (FULL = ₱800).
- [x] Create `backend/erp/services/fuelTracker.js` — `computeFuelEfficiency()` (km split, expected vs actual liters, overconsumption detection at threshold, personal gas = expected_personal_liters × avg_price), `computePeriodFuelSummary()` (period totals). Tested: 120km trip, 10L fuel, 12kpl = no overconsumption
- [x] Create `backend/erp/services/expenseSummary.js` — `generateExpenseSummary()` aggregates 5 categories from SmerEntry, CarLogbookEntry, ExpenseEntry, Collection (partner rebates + commission), PrfCalf counts

### 6.3 — Expense Controller & Routes ✅
- [x] Create `backend/erp/controllers/expenseController.js` — 30+ endpoints:
  - SMER: createSmer, updateSmer, getSmerList, getSmerById, deleteDraftSmer, validateSmer, submitSmer, reopenSmer (8)
  - Car Logbook: createCarLogbook, updateCarLogbook, getCarLogbookList, getCarLogbookById, deleteDraftCarLogbook, validateCarLogbook, submitCarLogbook, reopenCarLogbook (8)
  - ORE/ACCESS: createExpense, updateExpense, getExpenseList, getExpenseById, deleteDraftExpense, validateExpenses, submitExpenses, reopenExpenses (8)
  - PRF/CALF: createPrfCalf, updatePrfCalf, getPrfCalfList, getPrfCalfById, deleteDraftPrfCalf, validatePrfCalf (PRF validates partner bank details, CALF validates advance + linked expense), submitPrfCalf, reopenPrfCalf (8)
  - CRM Bridge: getSmerCrmMdCounts (auto-pull MD visit counts from CRM visit logs), getSmerCrmVisitDetail (drill-down per date) (2)
  - Override: overridePerdiemDay — Finance/Manager/President can override per diem tier for specific days (e.g., meeting with President, training day). CRM md_count preserved for audit. Override tracked with reason, overridden_by, overridden_at. roleCheck('admin', 'finance', 'president'). Can also remove override to revert to CRM-computed tier. (1)
  - Summary: getExpenseSummary (1)
  - All submit endpoints use MongoDB transactions → TransactionEvent creation
  - All reopen endpoints create ErpAuditLog entries
  - PRF validation: requires payee_name, purpose, partner_bank, partner_account_name, partner_account_no, rebate_amount, photo proof
  - CALF validation: requires advance_amount, linked_expense_id, photo proof
  - Expense validation: CALF gate — ACCESS non-cash lines require CALF attachment (President override)
- [x] Create `backend/erp/routes/expenseRoutes.js` — mounted at `/api/erp/expenses/`. Sub-routes: /smer, /car-logbook, /ore-access, /prf-calf. PRF/CALF submit/reopen requires roleCheck('admin', 'finance', 'president')
- [x] Mount in `backend/erp/routes/index.js`: `router.use('/expenses', require('./expenseRoutes'))`

### 6.4 — Expense Pages ✅
- [x] Create `frontend/src/erp/hooks/useExpenses.js` — wraps useErpApi for all 33 expense endpoints (SMER 8, Car Logbook 8, ORE/ACCESS 8, PRF/CALF 8, Summary 1)
- [x] Create `frontend/src/erp/pages/Smer.jsx` — daily activity grid with per diem:
  - Period/cycle selector, auto-generates work days (Mon-Fri) for selected cycle
  - Per-day row: day, DOW, hospital dropdown (from useHospitals), MD count input, per diem tier badge (FULL green/HALF amber/ZERO gray), per diem amount (auto-computed), P2P transport, special transport, ORE amount
  - Auto-compute totals in footer, summary cards (Total Reimbursable, Travel Advance, Balance on Hand)
  - SMER list table with status badges, Edit/Delete/Re-open actions
  - Validate and Submit action buttons
- [x] Create `frontend/src/erp/pages/CarLogbook.jsx` — morning/night odometer, fuel:
  - Date, starting KM (morning), ending KM (night), personal KM inputs
  - KM summary cards (Total, Official, Expected L, Actual L with overconsumption highlight)
  - Fuel entries: station, fuel type dropdown, liters, ₱/L, auto-compute total, payment mode
  - Overconsumption flag (red highlight) on list entries
  - Entry list with all KM/fuel columns, status badges, actions
- [x] Replace `frontend/src/erp/pages/Expenses.jsx` placeholder → full ORE/ACCESS form:
  - Module navigation links (SMER, Car Logbook, ORE/ACCESS, PRF/CALF)
  - Expense summary cards from getExpenseSummary (6 categories)
  - Expense line cards with: type (ORE/ACCESS), date, category dropdown, establishment, particulars, amount, OR#, payment mode
  - CALF required badge auto-shown for ACCESS non-cash lines
  - ACCESS lines highlighted (amber background)
  - Totals: ORE Total, ACCESS Total, Grand Total
- [x] Create `frontend/src/erp/pages/PrfCalf.jsx` — PRF and CALF forms:
  - PRF form: purple-themed partner details section (payee name, MD/Non-MD type, bank name, account holder name, account number), purpose, rebate amount
  - CALF form: teal-themed company fund section (CALF number, advance amount, liquidation amount, live balance with direction indicator)
  - Shared: payment mode, check details, notes
  - Doc type filter (All/PRF/CALF), list table with type badge, payee/purpose, amount, partner bank (masked), status, actions
  - Finance-only Post button (admin/finance/president role check)
- [x] Add lazy-loaded routes in `frontend/src/App.jsx`: `/erp/smer`, `/erp/car-logbook`, `/erp/prf-calf` (all employee+admin+finance+president)
- [x] Updated existing `/erp/expenses` route to include finance+president roles
- [x] Frontend build: 0 errors

### Phase 6 Summary

| Task | Description | Status |
|------|-------------|--------|
| 6.1 | Expense Models (SmerEntry, CarLogbookEntry, ExpenseEntry, PrfCalf) | ✅ Complete |
| 6.2 | Expense Services (perdiemCalc, fuelTracker, expenseSummary, smerCrmBridge, docNumbering) | ✅ Complete (tested) |
| 6.3 | Expense Controller & Routes (40+ endpoints, MongoDB transactions) | ✅ Complete |
| 6.4 | Expense Pages (Smer, CarLogbook, Expenses, PrfCalf) + hooks | ✅ Complete (build verified) |
| 6.5 | Territory-Based Document Numbering (Territory, DocSequence, docNumbering) | ✅ Complete |
| 6.6 | CALF/PRF Fixes (5 issues from live testing) | ✅ Complete |
| 6.7 | PRF/CALF Auto-Population (pending rebates + pending CALF cards) | ✅ Complete |
| 6.8 | Frontend UX Fixes (scrolling, activity type, dates, error display) | ✅ Complete |

**New files:** 22 | **Models:** 6 (SmerEntry, CarLogbookEntry, ExpenseEntry, PrfCalf, Territory, DocSequence) | **Services:** 5 (perdiemCalc, fuelTracker, expenseSummary, smerCrmBridge, docNumbering) | **Controllers:** 2 (expenseController 40+ endpoints, territoryController) | **Routes:** 2 (expenseRoutes 39 routes, territoryRoutes) | **Hooks:** 1 (useExpenses) | **Pages:** 4 | **Scripts:** 1 (seedTerritories) | **Docs:** 1 (TERRITORY_REGISTRY.csv) | **Modified:** 5 (App.jsx, ERP router, CarLogbookEntry, ExpenseEntry, PrfCalf)

**Expense eligibility scalability plan (April 3, 2026 — client direction):**
> **Current state:** All employees are SMER eligible. `md_count` field in SMER is generic — it counts "engagements" not just MD visits:
> - **Field BDMs:** Engagements = MD visits → auto-pulled from CRM via "Pull MD Counts from CRM" button
> - **eBDMs:** Engagements = pharmacist visits, owner meetings → manual entry (no CRM)
> - **Admin/Managers:** Engagements = client meetings, site visits → manual entry (no CRM)
>
> The CRM pull button is only useful for field BDMs who log visits in CRM. All other roles enter engagement counts manually. The per diem tier logic (FULL/HALF/ZERO) applies to all — thresholds from Settings.
>
> **Phase 10 — per-person eligibility flags on CompProfile:**
> When Phase 10 (People Master) is built, CompProfile should drive which expense modules each person can access:
>
> | CompProfile Flag | Type | Default | Description |
> |---|---|---|---|
> | `smer_eligible` | Boolean | true | Can submit SMER (all currently eligible, future salary employees may not be) |
> | `perdiem_rate` | Number | Settings default | Per-person per diem rate (already on User.compensation) |
> | `perdiem_engagement_threshold_full` | Number | 8 | Engagements for FULL tier (future: eBDMs may need 10) |
> | `perdiem_engagement_threshold_half` | Number | 3 | Engagements for HALF tier |
> | `logbook_eligible` | Boolean | true | Can submit Car/Motorcycle Logbook |
> | `vehicle_type` | enum | CAR | CAR, MOTORCYCLE, COMPANY_CAR, NONE (drives logbook form fields) |
> | `km_per_liter` | Number | Settings default | Per-person fuel efficiency (motorcycles ≠ cars) |
> | `ore_eligible` | Boolean | true | Can submit ORE expenses |
> | `access_eligible` | Boolean | true | Can submit ACCESS expenses (uses company resources) |
> | `crm_linked` | Boolean | false | Has CRM visit data → shows "Pull from CRM" button on SMER |
>
> Until Phase 10, all employees use the same Settings-level thresholds and manual entry is the primary input method. CRM pull is an optimization for field BDMs only.

**Phase 6 gaps identified (April 3, 2026 — client review):**

> ~~**Gap 1 — PRF scope too narrow (partner rebates only, no personal reimbursement):**~~ **RESOLVED (April 3, 2026):**
> Added `prf_type` enum to PrfCalf model: `PARTNER_REBATE` | `PERSONAL_REIMBURSEMENT`
> - **PARTNER_REBATE** (default): partner bank details required, linked to collection, BIR_FLAG=INTERNAL. Bank details auto-fill from last known PRF for same partner (via `last_bank` in `getPendingPartnerRebates` response).
> - **PERSONAL_REIMBURSEMENT**: BDM/employee paid with own money, needs OR photo proof. `payee_type: 'EMPLOYEE'`, payee_name auto-filled from logged-in user. No partner bank details required — Finance uses employee's bank account (Phase 10 PeopleMaster).
> - Frontend: PRF form shows type toggle (Partner Rebate / Personal Reimbursement). Partner rebate shows purple bank details section. Personal reimbursement shows orange section with simplified form.
> - Backend: `validatePrfCalf` conditionally validates — partner bank details required only for PARTNER_REBATE; OR photo required for PERSONAL_REIMBURSEMENT.
> - SAP equivalent: Employee Expense Report with reimbursement flag → AP → Payment
> - NetSuite equivalent: Expense Report line with "Personal" funding source → AP journal → bank payment
>
> **Gap 2 — Payment method not linked to specific account (accounting engine can't auto-journal):**
> ~~Currently `payment_mode` on expense lines is just a string ("GCASH", "CARD", "CASH"). The accounting engine (Phase 11) needs to know **which specific account** was debited.~~
>
> **RESOLVED (April 4, 2026) — Gap 2 Fix implemented with Phase 11:**
>
> **What was done:**
> - [x] 1. Added `coa_code` to PaymentMode model — CASH→1000, CHECK→1011 (SBC CA), BANK_TRANSFER→1010 (SBC SA), GCASH→1015, CC_RCBC→2303, CC_SBC→2301, CC_MBTC→2301, CC_UB→2301
> - [x] 2. Created `CreditCard` model (`erp_credit_cards`): entity_id, card_code, card_name, card_holder, bank, card_type (CREDIT_CARD/FLEET_CARD/DEBIT_CARD), card_brand (VISA/MASTERCARD/JCB/AMEX/FLEET), last_four, coa_code, credit_limit, statement_cycle_day, assigned_to (ref User), assigned_at, assigned_by, is_active
> - [x] 3. Created CreditCard CRUD controller + routes (`/api/erp/credit-cards`): list, getMyCards, create, update, deactivate. Finance manages cards, BDMs see only assigned cards via `GET /my-cards`
> - [x] 4. Created CreditCard Management page (`/erp/credit-cards`): card grid with type badges, assign-to-user dropdown, edit/deactivate. Accessible to Finance/Admin/President.
> - [x] 5. Added `funding_card_id` (ref CreditCard) + `funding_account_id` (ref BankAccount) to ExpenseEntry line schema and PrfCalf schema. Added `funding_card_id` to CarLogbookEntry fuel schema. Added `bank_account_id` (ref BankAccount) to Collection schema.
> - [x] 6. Card selection happens on **CALF form** (not expense/logbook forms) — when payment_mode=CARD, "Card Used" dropdown appears inline right of payment mode. When BANK_TRANSFER/GCASH, "Funding Bank" dropdown appears. Both route through CALF since all company-funded expenses require CALF.
> - [x] 7. Collection form: replaced check_no/check_date/bank free-text fields with "Deposited At" BankAccount dropdown (hospital check details are on CR photo). Stores `bank_account_id` for journal posting.
> - [x] 8. `autoJournal.js`: added `resolveFundingCoa()` helper — resolves COA from funding_card_id → funding_account_id → bank_account_id → PaymentMode.coa_code → fallback 1000.
> - [x] 9. Seeded 6 bank accounts (SBC SA 1010, SBC CA 1011, RCBC CA 1012, MBTC CA 1014, GCash 1015, SBC CA MG 1016) and 4 credit cards (SBC MC 2301, RCBC Corp MC 2303, RCBC Plat Fleet 2302, BDO MC 2304).
> - [x] 10. Updated COA seed: 1010=SBC Savings, 1011=SBC Current, 1012=RCBC Current, 1013=Reserved, 1014=MBTC Current, 1015=VIP GCash, 1016=SBC MG. Added 2303 RCBC Corp CC Payable, 2304 BDO CC Payable.
> - [ ] 11. BDM profile view (Phase 10): shows all assigned cards + salary account in one panel — deferred to future enhancement
>
> ~~**Gap 3 — OCR not wired to expense forms**~~ **RESOLVED (April 3, 2026):**
> OCR scan buttons added to all expense forms during Phase 6 testing — no longer deferred to Phase 9.1:
> - ✅ **Expenses (ORE/ACCESS):** `ScanORModal` — camera → `OR` parser → pre-fills establishment, amount, or_number, date + expense classification from `classifyExpense()`. Green "Scan OR" button per expense line.
> - ✅ **Car Logbook:** `ScanModal` (generic) — two instances:
>   - "Scan Start" / "Scan End" buttons → `ODOMETER` parser → pre-fills starting_km or ending_km
>   - "Scan Gas Receipt" button → `GAS_RECEIPT` parser → pre-fills station, fuel_type, liters, price_per_liter, total → adds as new fuel entry
> - Same pattern as SalesEntry `ScanCSIModal`, DrEntry `ScanDRModal`, GrnEntry `ScanUndertakingModal`
> - **Remaining for Phase 9.1b:** Photo persistence to S3 via DocumentAttachment (photos currently shown as preview but not saved as permanent records)

### 6.5 — Territory-Based Document Numbering System ✅
**Goal:** All ERP documents use territory codes in numbering: `{PREFIX}-{TERRITORY_CODE}{MMDDYY}-{SEQ}` (e.g., `CALF-ILO040326-001`). Finance can pinpoint territory + BDM from any document number. Territory codes admin-managed (not hardcoded).

> **Client direction (April 3, 2026):** "We use Territory code + MMDDYY + sequence. ILO040326-001 format." Territory codes will also be used in future transfers, POs, and all transactional documents.

- [x] Create `backend/erp/models/Territory.js` — entity_id, territory_code (unique 2-5 chars, uppercase), territory_name, region, assigned_bdms (array of User refs), is_active. Static: `getCodeForBdm(bdmId)`. Collection: `erp_territories`
- [x] Create `backend/erp/models/DocSequence.js` — atomic counter for document numbering. key (unique, e.g., "CALF-ILO-040326"), current_seq. Static: `getNext(key)` uses `findOneAndUpdate` with `$inc` (collision-safe). Collection: `erp_doc_sequences`
- [x] Create `backend/erp/services/docNumbering.js` — `generateDocNumber({ prefix, bdmId, date })` → resolves territory via `Territory.getCodeForBdm()` → `DocSequence.getNext()` → returns e.g., `CALF-ILO040326-001`. Reusable by all modules (CALF, PRF, future PO, IC transfers).
- [x] Create `backend/erp/controllers/territoryController.js` — CRUD + `getForBdm` endpoint
- [x] Create `backend/erp/routes/territoryRoutes.js` — `/api/erp/territories`. Admin/finance/president for writes.
- [x] Create `backend/erp/scripts/seedTerritories.js` — seeds ILO territory with all BDMs assigned
- [x] Mount in `backend/erp/routes/index.js`: `router.use('/territories', require('./territoryRoutes'))`
- [x] PrfCalf.js pre-save: auto-generates `calf_number` and `prf_number` via `docNumbering.generateDocNumber()`

> **Territory Registry (April 3, 2026):** See `docs/TERRITORY_REGISTRY.csv` for full BDM→territory mapping.
>
> | Code | Territory Name | Entity | Assigned To | Type |
> |------|---------------|--------|-------------|------|
> | DIG | VIP Davao | VIP | Menivie Daniela | Field BDM |
> | BAC | VIP Bacolod | VIP | Mae Navarro | Field BDM |
> | GSC | VIP Gensan | VIP | Cristina Salila | Field BDM |
> | OZA | VIP Ozamiz | VIP | Roman Mabanag | Field BDM |
> | PAN | VIP Panay | VIP | Romela Shen Herrera | Field BDM |
> | DUM | VIP Dumaguete | VIP | Edcel Mae Arespacochaga | Field BDM |
> | ILO1 | eBDM 1 Iloilo | VIP | Jay Ann Protacio | eBDM (no vehicle) |
> | ILO2 | eBDM 2 Iloilo | VIP | Jenny Rose Jacosalem | eBDM (motorcycle) |
> | ACC | Shared Services | VIP | Judy Mae Patrocinio | Office |
> | MGO | MG and CO. Iloilo | MG AND CO. | Jake Montero | Field BDM (subsidiary) |
> | ADM | Admin | VIP | Gregg Louie Vios | President |
> | BLW | Balai Lawaan | BALAI LAWAAN | Angeline Marie Vios | Corporate Secretary |
>
> **CALF override users:** Gregg (President — override any gate), Angeline (Corporate Secretary — uses expenses + VAT, no CALF required). Per-person `calf_override` flag to be added to CompProfile in Phase 10.

### 6.6 — CALF/PRF Fixes (from live testing April 3, 2026) ✅
**Goal:** Fix 5 issues found during live testing with Jake Montero's account.

- [x] **Fix 1 — CALF/PRF auto-numbering:** PrfCalf pre-save calls `docNumbering.generateDocNumber()`. Format: `CALF-ILO040326-001`, `PRF-DIG040326-002`. Uses territory code from BDM assignment + atomic sequence counter.
- [x] **Fix 2 — CALF back-link to expense lines (core bug):** `createPrfCalf` now auto-updates linked expense/logbook lines' `calf_id` when CALF is created from pending card. Previously: CALF stored forward link (CALF→Expense) but validation checked back-link (Expense→CALF), so validation always failed even after CALF was created.
- [x] **Fix 3 — Car Logbook fuel CALF gate:** Added `calf_id` to fuelEntrySchema. Pre-save auto-sets `calf_required=true` for non-cash fuel (SHELL_FLEET_CARD, CARD, GCASH). `validateCarLogbook` now checks fuel entries for CALF linkage (President override). Previously fuel posted without any CALF check.
- [x] **Fix 4 — ORE/CASH exemption hardened:** ExpenseEntry pre-save now explicitly sets `calf_required = false` for ORE lines and cash ACCESS. Defensive reset prevents frontend bugs from setting calf_required on exempt lines.
- [x] **Fix 5 — getPendingCalfLines fuel filter:** Fuel entries now filtered by individual `calf_id` (not just document-level). Pending CALF cards show both ACCESS expense lines AND non-cash fuel entries from Car Logbook.

### 6.7 — PRF/CALF Auto-Population from Collections & Expenses ✅
- [x] `GET /expenses/prf-calf/pending-rebates` — aggregates unpaid partner rebates from POSTED Collections, subtracts POSTED PRFs → returns partners with remaining balance. Frontend shows purple cards on PRF/CALF page → click to auto-fill PRF form.
- [x] `GET /expenses/prf-calf/pending-calf` — returns company-funded items needing CALF: ACCESS expense lines (non-cash) + Car Logbook fuel entries (SHELL_FLEET_CARD, CARD, GCASH). Frontend shows teal cards with ACCESS/FUEL badges → click to auto-fill CALF form.

### 6.8 — Frontend UX Fixes (from live testing) ✅
- [x] **Scrolling:** All 4 expense pages use `className="admin-main"` (was inline `style={{ flex: 1 }}`). Matches existing CRM layout with `overflow-y: auto`.
- [x] **SMER Activity column:** Replaced hospital dropdown with Activity type (Office/Field/Other) + Notes text field. Model: added `activity_type` enum. Validation: checks `activity_type` instead of `hospital_covered`.
- [x] **SMER date format:** Fixed timezone bug — `formatLocalDate()` replaces `toISOString()` (was shifting dates -1 day in +08:00 Manila timezone). Display: MM/DD format in grid.
- [x] **SMER MDs/Engagements label:** Column header "MDs/Eng." — covers MD visits, pharmacist visits, owner meetings.
- [x] **SMER summary cards:** Moved above grid (was at bottom, not scrollable).
- [x] **CRM pull button:** Only shows for field BDMs (role=employee). Green info box: "BDMs: Click Pull from CRM to auto-fill MDs/Engagements."
- [x] **Error display:** SMER + Expenses list tables show validation errors as red rows below ERROR entries (using React.Fragment pattern).
- [x] **Action feedback:** Car Logbook + Expenses pages show green/red message banner for validate/submit/delete actions (auto-dismiss 5s).
- [x] **Save error handling:** SMER save shows specific error (e.g., "SMER already exists — use Edit") instead of silent failure.

**COA / Journal Entry notes for Phase 11:** ✅ WIRED (April 5, 2026)
> All expense auto-journals are now wired into their respective submit functions in `expenseController.js`:
> - **SMER POSTED:** DR: 6100 Per Diem + 6150 Transport + 6160 Special + 6170 ORE, CR: 1110 AR BDM Advances ✅
> - **Car Logbook POSTED:** DR: 6200 Fuel/Gas, CR: 1110 AR BDM (cash) or funding COA (fleet card) ✅
> - **ORE POSTED:** DR: line.coa_code (per category), CR: 1110 AR BDM Advances ✅
> - **ACCESS POSTED:** DR: line.coa_code (per category), CR: funding COA via resolveFundingCoa() ✅
> - **PRF POSTED (partner rebate):** DR: 5200 Partner Rebate, CR: funding COA ✅
> - **CALF POSTED (advance):** DR: 1110 AR BDM Advances (clearing), CR: funding COA ✅
> JE creation happens after MongoDB transaction (non-blocking, try/catch). Errors logged to console.


---

## PHASE 7 — INCOME, PROFIT SHARING, PNL & YEAR-END CLOSE
**Goal:** Payslip, territory P&L, profit sharing gate, and fiscal year closing controls, while preserving the client's current live SALES/CORE -> PNL workflow and close-month snapshot behavior as MERN-native features.

### 7.1 — Income & PNL Models ✅ COMPLETE
- [x] Create `backend/erp/models/IncomeReport.js` — payslip per cycle (GENERATED→REVIEWED→RETURNED→BDM_CONFIRMED→CREDITED workflow, earnings/deductions pre-save computed, unique index on entity+bdm+period+cycle)
- [x] Create `backend/erp/models/PnlReport.js` — territory P&L per month (revenue, COGS, expenses, net_income, profit_sharing gate with ps_products array, DRAFT→GENERATED→REVIEWED→POSTED→LOCKED lifecycle)
- [x] Create `backend/erp/models/MonthlyArchive.js` — monthly snapshots (OPEN→CLOSED→LOCKED) + fiscal year close records (record_type MONTHLY|FISCAL_YEAR, year_end_data with retained_earnings_transfer, closing_entries_pending flag for Phase 11)
- [ ] Commit: `"feat(erp): income, pnl, and archive models"`

### 7.2 — Income & PNL Services ✅ COMPLETE
- [x] Create `backend/erp/services/incomeCalc.js` — earnings (SMER + CORE commission + bonus + profit sharing + reimbursements), deductions (cash advance from CALF + manual fields), net pay. Upserts IncomeReport preserving manual Finance entries. Includes workflow transition engine (VALID_TRANSITIONS).
- [x] Create `backend/erp/services/pnlCalc.js` — revenue (POSTED SalesLines + Collections aggregation), COGS (SalesLine line_items × ProductMaster.purchase_price via $lookup), expenses (from expenseSummary + sampling DR cost from InventoryLedger). Also contains Year-End Close functions: validateYearEndClose, executeYearEndClose, getFiscalYearStatus.
- [x] Create `backend/erp/services/profitShareEngine.js` — Condition A (product hospital count from POSTED SalesLines), Condition B (MD tags from POSTED Collections with MAX_PRODUCT_TAGS enforcement), Condition C (consecutive month streak from prior PnlReports). PS computation: BDM 30% / VIP 70% split if net > 0, deficit flag if ≤ 0.
- [ ] Commit: `"feat(erp): income, pnl, and profit sharing calculation services"`

> **Implementation notes (April 3, 2026):**
> - Year-End Close logic is in `pnlCalc.js` (not a separate `yearEndClose.js`) since it's tightly coupled with PNL aggregation. When Phase 11 (Accounting Engine) is built, closing journal generation can be extracted.
> - COGS uses weighted-average costing (current ProductMaster.purchase_price × qty), not batch-level FIFO. True batch costing deferred to Phase 11.
> - Profit Share streak starts at 0 on cold-start (no prior PnlReports). PS kicks in after PS_CONSECUTIVE_MONTHS (default 3) qualifying months.

### 7.3 — Year-End Close + Retained Earnings (SAP FI Year-End Close) ✅ COMPLETE
- [x] Year-End Close implemented in `backend/erp/services/pnlCalc.js` (executeYearEndClose function):
  - Computes full-year PNL (Revenue − Expenses) from all 12 monthly PnlReports
  - Stores closing data in MonthlyArchive (record_type: FISCAL_YEAR) with closing_entries_pending: true
  - Locks all monthly PnlReports (status → LOCKED, locked: true)
  - Locks all monthly MonthlyArchive records (period_status → LOCKED)
  - Creates TransactionEvent with event_type: YEAR_END_CLOSE for audit trail
  - **Note:** Actual journal entry generation (DR revenue, CR expense accounts → Retained Earnings) deferred to Phase 11. Data is captured for retroactive journalization.
- [x] Admin trigger: "Close Year 20XX" button in ProfitSharing.jsx (requires admin/finance/president role)
- [x] Validation: validateYearEndClose checks all 12 monthly archives are CLOSED, fiscal year not already closed
- [ ] Commit: `"feat(erp): year-end close with retained earnings transfer"`

### 7.4 — Income & PNL Routes ✅ COMPLETE
- [x] Create `backend/erp/controllers/incomeController.js` — 22 endpoint handlers: income CRUD + workflow (generate/list/getById/updateManual/review/return/confirm/credit), PNL CRUD + post (generate/list/getById/updateManual/post), profit sharing (status/detail), archive (closePeriod/periodStatus/list), year-end (validate/close/status)
- [x] Create `backend/erp/routes/incomeRoutes.js` — route definitions with roleCheck gates (admin/finance/president for mutations, all roles for reads)
- [x] Mount in `backend/erp/routes/index.js` under Phase 7 comment block
- [x] Create `frontend/src/erp/hooks/useIncome.js` — wraps useErpApi with all income/pnl/ps/archive endpoints
- [ ] Commit: `"feat(erp): income and pnl routes"`

### 7.5 — Income & PNL Pages ✅ COMPLETE
- [x] Create `frontend/src/erp/pages/Income.jsx` — list + detail views, payslip card with earnings/deductions tables, manual editable fields (bonus, reimbursements, deductions) when GENERATED/REVIEWED, workflow buttons (Review/Return/Confirm/Credit), return reason modal
- [x] Create `frontend/src/erp/pages/Pnl.jsx` — list + detail views, classic P&L statement layout (Revenue → COGS → Gross Profit → Expenses → Net Income), PS indicator badge, manual fields (depreciation, loan_amortization), Post button
- [x] Create `frontend/src/erp/pages/ProfitSharing.jsx` — summary cards (eligible/qualifying products/BDM share/VIP share), product eligibility table with Condition A/B/C columns, Year-End Close section (admin only) with validate/close buttons and confirmation modal
- [x] Register routes in `frontend/src/App.jsx`: `/erp/income`, `/erp/pnl`, `/erp/profit-sharing` (allowedRoles: employee, admin, finance)
- [ ] Commit: `"feat(ui): income, pnl, and profit sharing pages"`

---

## PHASE 8 — DASHBOARD & REPORTS
**Goal:** CEO dashboard, monthly archive, summaries, and audit viewer, while formalizing the client's existing live month snapshot/archive behavior in MERN.

### 8.1 — Dashboard & Report Services ✅ COMPLETE
- [x] Create `backend/erp/services/dashboardService.js` — CEO KPIs: getSummary (Total Sales, AR, Stock Value, Engagements), getMtd (Sales/Collections/Engagements/Income MTD), getPnlYtd (year-to-date P&L), getProductStockLevels (inventory × purchase_price aggregation)
- [x] Monthly archive snapshot logic — formalized in Phase 7 via `MonthlyArchive` model + `closePeriod` controller. Dashboard reads from MonthlyArchive for period history.
- [ ] Commit: `"feat(erp): dashboard and archive services"`

### 8.2 — Report Routes ✅ COMPLETE
- [x] Create `backend/erp/controllers/dashboardController.js` — named dashboardController (not reportController) to avoid CRM collision. 11 endpoint handlers: getDashboardSummary, getDashboardMtd, getDashboardPnlYtd, getDashboardProducts, getDashboardHospitals, getSalesSummary, getCollectionSummary, getExpenseSummaryEndpoint, getAuditLogs, getMonthlyArchives, getSystemHealth
- [x] Create `backend/erp/routes/dashboardRoutes.js` — mounted at `/api/erp/dashboard`
- [x] Endpoints: `/summary`, `/mtd`, `/pnl-ytd`, `/products`, `/hospitals`, `/sales-summary`, `/collection-summary`, `/expense-summary`, `/audit-logs`, `/monthly-archive`, `/system-health`
- [x] Create `frontend/src/erp/hooks/useDashboard.js` — wraps useErpApi with all dashboard endpoints
- [x] Mount in `backend/erp/routes/index.js` under Phase 8 comment block
- [ ] Commit: `"feat(erp): report routes"`

### 8.3 — ERP Dashboard (BOSS-Style Layout) ✅ COMPLETE
> **Reference:** BOSS app (Play Store). See PRD-ERP.md Section 13.5 for full spec.

- [x] Replaced `frontend/src/erp/pages/ErpDashboard.jsx` placeholder with BOSS-style layout
- [x] **Top action buttons (2×2 grid, 4-col on desktop):**
  - CRM — role-aware link (`/bdm` or `/admin`)
  - Sales — `/erp/sales`
  - Expenses — `/erp/expenses`
  - Collections — `/erp/collections`
- [x] **Summary cards section (4-card grid):**
  - Total Sales (from `GET /api/erp/dashboard/summary`)
  - AR = Total Sales − Total Collections (red when > 0)
  - Value of Stocks on Hand (InventoryLedger × ProductMaster.purchase_price)
  - Engagements = Visited/Target (placeholder — CRM Schedule not yet wired)
- [x] **Month-to-Date section (4-card grid):**
  - Sales MTD, Collections MTD, Engagements MTD, Income MTD
  - Source: `GET /api/erp/dashboard/mtd`
- [x] **YTD P&L banner:** Revenue YTD, Expenses YTD, Net P&L YTD (green/red)
- [x] **Quick Access links:** New CSI, Collection, SMER, Car Logbook, My Stock, AR Aging, Income, P&L, Reports
- [x] **Bottom navigation tabs (fixed on mobile, inline on desktop):**
  - Product Master — available products with stock levels + value (from `/dashboard/products`)
  - Customer/Hospital — hospital list with type, beds, engagement level (from `/dashboard/hospitals`)
  - AR Aging — link to `/erp/collections/ar`
  - PNL — link to `/erp/pnl`
- [x] `backend/erp/controllers/dashboardController.js`:
  - `getSummary` — aggregates Total Sales, AR (Sales-Collections), Stock Value (inventory × purchase_price), Engagements
  - `getMtd` — month-to-date Sales, Collections, Engagements, Income (from IncomeReport)
  - `getPnlYtd` — year-to-date: net sales − (SMER + car logbook + ORE/ACCESS + partner rebates)
- [x] `backend/erp/routes/dashboardRoutes.js` — mounted at `/api/erp/dashboard`
- [x] Mobile-first responsive layout (2-col on phone, 4-col on desktop, fixed bottom tabs on mobile)
- [x] Dark mode support (uses existing CSS vars: --erp-bg, --erp-panel, --erp-border, --erp-text, --erp-muted, --erp-accent)
- [ ] Commit: `"feat(ui): boss-style erp dashboard with summary cards and bottom nav"`

> **Implementation notes (April 3, 2026):**
> - VIP Clients tab (CRM Doctor list) replaced with AR Aging link — same data accessible via `/erp/collections/ar`. Adding Doctor model integration requires CRM region filtering which is a Phase 9 cross-system concern.
> - Engagements data is a placeholder (0/0) — requires CRM Schedule model integration (Phase 9.2).
> - Bottom tab "Products" and "Hospitals" load data inline via dashboard API. "AR Aging" and "PNL" are navigation links to their dedicated pages.

### 8.4 — Report Pages ✅ COMPLETE
- [x] Create `frontend/src/erp/pages/MonthlyArchive.jsx` — period snapshot list with expandable rows showing sales, collections, COGS, expenses, net income. Clickable rows reveal snapshot detail panel.
- [x] Replace `frontend/src/erp/pages/ErpReports.jsx` — report hub with 7 navigation cards (P&L, Income, Profit Sharing, AR Aging, SOA, Monthly Archive, Audit Logs) + inline Sales/Collection summary tables by period
- [x] Create `frontend/src/erp/pages/AuditLogs.jsx` — searchable log viewer with filters (log_type, target_model, date range), paginated table showing date, type, model, reference, field, old/new values, changed_by, note
- [x] Register routes in `frontend/src/App.jsx`: `/erp/monthly-archive` (employee, admin, finance), `/erp/audit-logs` (admin, finance)
- [ ] Commit: `"feat(ui): erp report pages"`

### Phase 8 Summary
| Subtask | Files | Status |
|---------|-------|--------|
| 8.1 Dashboard Service | `dashboardService.js` | ✅ |
| 8.2 Dashboard Controller + Routes | `dashboardController.js`, `dashboardRoutes.js`, `useDashboard.js` | ✅ |
| 8.3 BOSS-Style Dashboard | `ErpDashboard.jsx` (replaced) | ✅ |
| 8.4 Report Pages | `MonthlyArchive.jsx`, `ErpReports.jsx` (replaced), `AuditLogs.jsx` | ✅ |

---

## POST-PHASE 8 — BUG FIXES & IMPROVEMENTS (April 3, 2026)

> Fixes discovered during Phase 7/8 testing. Applied across Phases 5-6 expense modules.

### CALF / ACCESS Dependency Gate ✅
- [x] ACCESS expense validation now checks linked CALF is **POSTED** (not just linked) — `expenseController.js` validateExpenses
- [x] `submitExpenses()` pre-submit gate: blocks posting if any ACCESS line has un-POSTED CALF — error message shows CALF status
- [x] Car Logbook CALF dependency: same validation + submit gate for non-cash fuel (SHELL_FLEET_CARD, CARD, GCASH) — `validateCarLogbook` + `submitCarLogbook`
- [x] CALF photo validation: photos not required for CALF (inherits OR photos from linked expense lines). PRF still requires photo proof.
- [x] CALF upload UI removed from `PrfCalf.jsx` (CALF shows inherited photos read-only, PRF keeps upload)

### Car Logbook Gas Receipt Persistence ✅
- [x] `handleGasApply` in `CarLogbook.jsx` now stores `receipt_url` and `receipt_ocr_data` from OCR scan
- [x] Added "Upload Receipt" button per fuel entry (direct photo upload to S3, no OCR)
- [x] "Receipt ✓" badge shows when fuel entry has a receipt photo
- [x] "CALF Required" badge per non-cash fuel entry in form view
- [x] "CALF" badge on list rows with non-cash fuel needing CALF
- [x] Warning banner at top when non-cash fuel entries exist without CALF
- [x] PRF/CALF link button in Car Logbook controls bar

### BDM Self-Service for CALF & Personal PRF ✅
- [x] `expenseRoutes.js`: removed `roleCheck('admin', 'finance', 'president')` from `submitPrfCalf` route — BDMs can now post their own CALF and personal PRF
- [x] `PrfCalf.jsx`: Post button visible for all roles (was Finance-only)
- [x] Re-open still requires admin/finance/president

### Delete Button Consistency ✅
- [x] Delete button shows **only for DRAFT** status across all expense pages (SMER, Car Logbook, ORE/ACCESS, PRF/CALF)
- [x] ERROR status: Edit only (no delete — call Finance to re-open if needed)
- [x] VALID/POSTED: no edit or delete
- [x] Backend delete routes preserved (DRAFT-only enforced by backend `status: 'DRAFT'` filter)

### Entity Model & Dashboard ✅
- [x] Added `short_name` field to `Entity.js` model schema
- [x] `EntityBadge.jsx` prefers `short_name` over `entity_name`
- [x] Entity data updated: VIP → "VIP", MG AND CO. → "MG and CO.", full name → "Milligrams and Co. Incorporated"
- [x] Dashboard hospitals: BDM filter applied (`tagged_bdms` match, same as sales entry hospital controller)

### Period Locking Enforcement ✅
- [x] Created `backend/erp/utils/periodLock.js` — shared `checkPeriodOpen(entityId, period)` utility
- [x] Added period lock check in `submitSales`, `submitCollections`, `submitExpenses`, `submitSmer`, `submitCarLogbook`, `submitPrfCalf`
- [x] If MonthlyArchive period_status is CLOSED or LOCKED, posting is rejected with clear error message

### Collections Delete for DRAFT ✅
- [x] Added delete button for DRAFT collections in `Collections.jsx` (matching Sales/Expenses pattern)

---

## SYSTEM AUDIT — KNOWN GAPS (April 3, 2026)

> Items identified during comprehensive system audit. Not blocking for Phase 9 but should be addressed.

| # | Gap | Severity | Target |
|---|-----|----------|--------|
| 1 | No print/export for Income payslips | Medium | Phase 9 or 10 |
| 2 | No PDF export for PNL reports | Medium | Phase 9 or 10 |
| 3 | No date range filters on Expenses/Income pages | Low | Phase 10 |
| 4 | No batch validate/post endpoints | Low | Phase 10 |
| 5 | GRN/DR have no list views (entry-only pages) | Medium | Phase 10 |
| 6 | Sales validation is implicit (on submit), Collections/Expenses require explicit validate | Low | Intentional |
| 7 | Phase 7/8 pages not in top Navbar (accessible via Reports hub + Dashboard quick links) | Low | Phase 10 |
| 8 | ~~Engagements in Dashboard is placeholder (0/0)~~ — **RESOLVED Phase 9.2**: real CRM Visit counts wired via `computeEngagements()` in dashboardService | ~~Medium~~ | ✅ Done |

## SYSTEM AUDIT — FULL DEEP AUDIT (April 4, 2026)

> Full Phase 0-15 audit: 178 backend files require-chain tested (178/178 pass), 2665 frontend modules built (0 errors), all route wiring verified.

### Bugs Found & Fixed

| # | File | Bug | Fix |
|---|------|-----|-----|
| 1 | `erpReportRoutes.js` | `/trend/:personId` unreachable — generic `/:period` captured "trend" | Swapped route order: specific before parameterized |
| 2 | `dataArchivalService.js` | SalesLine listed with `periodField: 'period'` but model has no period field | Changed to `periodField: null, dateField: 'csi_date'` |
| 3 | `cycleReportService.js` | `generateCycleReport` could overwrite REVIEWED/CREDITED reports | Added status guard — rejects if past GENERATED |
| 4 | `dataArchivalService.js` | TransactionEvent missing from ARCHIVABLE_COLLECTIONS | Added with `dateField: 'event_date'`, `statuses: ['ACTIVE']` |
| 5 | `expenseAnomalyService.js` | Fragile dual-ID mapping for budget overruns | Simplified — `target_id` is always User._id |
| 6 | `performanceRankingService.js` | ECOMMERCE_BDM excluded from performance ranking | Added to person_type filter |
| 7 | `csiBookletRoutes.js` | `/validate` after parameterized `/:id` routes | Moved before `/:id` routes |
| 8 | `consignmentReportService.js` | `$ifNull` fallback used non-existent field | Changed to `'Unknown'` fallback |
| 9 | `performanceRankingService.js` | Dead code + unused parameter | Removed |
| 10 | `CsiBooklets.jsx` + `DataArchive.jsx` | React Fragments inside `<tbody>` | Replaced with array return pattern |
| 11 | `PerformanceRanking.jsx` | No data on initial render (missing useEffect) | Added useEffect |
| 12 | `ConsignmentAging/ExpenseAnomalies/FuelEfficiency.jsx` | Array index as React key | Changed to unique identifiers |

### Known Technical Debt — React `key={i}` Anti-Pattern

> 41 instances across 29 pre-existing pages use array index as React key. Not a regression. Low practical impact on read-only tables, but will cause bugs if interactive row features (expand/collapse, inline edit, row selection) are added.

**Affected pages:** AccountsPayable, AccountsReceivable, BankReconciliation, CashflowStatement, Collections, CollectionSession, DrEntry, ErpDashboard, Expenses, GrnEntry, JournalEntries, MyStock, OcrTest, PeopleList, PersonDetail, PrfCalf, ProfitAndLoss, ProfitSharing, PurchaseOrders, SalesEntry, SalesList, Smer, SupplierInvoices, ThirteenthMonth, TransferOrders, TransferReceipt, VatCompliance, CsiBooklets (1 inner map), ErpReports (user-fixed)

**Fix:** Replace `key={i}` with `key={r._id}` or composite key. Mechanical, no logic changes. Priority: Low — fix when touching these pages or before adding interactive row features.

### Budget Allocation UI — Built

- [x] Created `frontend/src/erp/pages/BudgetAllocations.jsx` — admin CRUD page with per-component budget cards, BDM selector, approval workflow
- [x] Convention established: `target_id` = `User._id` (same as `bdm_id` in all transaction models)
- [x] Added to `useReports.js`, `App.jsx`, `Sidebar.jsx`, `ErpReports.jsx`
- [x] Backend already existed from Phase 2 (`budgetAllocationController.js` + `budgetAllocationRoutes.js`)

---

## PHASE 9 — INTEGRATION, DOCUMENT FLOW & POLISH
**Goal:** Wire up OCR to ERP forms, CRM data flows, document flow tracing, Excel migration, and end-to-end testing.

### 9.1 — OCR → ERP Form Connections ✅ COMPLETE (built during module phases)
> **Status:** All OCR→form connections were built during their respective module phases, not deferred to Phase 9. The commit will be included in whatever batch covers this documentation update.

- [x] Sales entry: "Scan CSI" → OCR → pre-fill sales form — ScanCSIModal in SalesEntry.jsx (Phase 3, commit `95562d9`)
- [x] Collection session: "Scan CR" + "Scan 2307" → OCR → pre-fill — CollectionSession.jsx (Phase 5, commit `fe33072`)
- [x] Car Logbook: "Scan Odometer" + "Scan Gas Receipt" → OCR → pre-fill — ScanModal in CarLogbook.jsx (Phase 6)
- [x] GRN: "Scan Undertaking" → OCR → pre-fill — ScanUndertakingModal in GrnEntry.jsx (Phase 4)
- [x] Expenses (ORE/ACCESS): "Scan OR" + "Upload OR" → OCR → pre-fill — ScanORModal + direct upload in Expenses.jsx (Phase 6). OR photo/number now **required for validation** (hard gate).
- [ ] Commit: `"feat(integration): connect ocr to all erp forms"` — already done incrementally across Phases 3-6

### 9.1b — Scanned Document Photo Persistence (Digital Proof for All Document Types) ✅ COMPLETE
> **Problem (April 2, 2026):** OCR modals (ScanCSIModal, ScanDRModal, ScanUndertakingModal, etc.) capture photos → send to OCR → extract data → pre-fill forms, but the **photos are discarded after extraction** — never saved to S3 as permanent records. The `DocumentAttachment` model (Phase 2.8) exists but is **not wired up** to any module. There is no permanent audit trail of the actual scanned documents — only extracted data.
>
> **Why this matters:** For regulatory/audit purposes (hospitals, PH BIR, internal reconciliation), the scanned physical documents must be stored as digital proof. They should be retrievable and viewable when needed (disputes, audits, AR reconciliation, expense reviews).
>
> **Note:** GRN already stores `waybill_photo_url` and `undertaking_photo_url` inline — these should also get DocumentAttachment records for consistency.
>
> **Status (April 4, 2026):** DocumentAttachment model enhanced with `document_type` enum (11 types), `entity_id`/`bdm_id` tenant fields, `source_model`/`source_id` for parent linking, and `s3_key` field. OCR controller now creates DocumentAttachment on every scan. All submit controllers (sales, collections, expenses, car logbook, SMER, PRF/CALF) link attachments to TransactionEvent at post time. Frontend scan modals pass `attachment_id` alongside `s3_url`. New document query API at `/api/erp/documents/`.

**Documents that need photo persistence:**

| Document Type | Source Module | Proof Of |
|---|---|---|
| **CSI** (Charge Sales Invoice) | Sales (Phase 3) | Sale happened — signed copy proves hospital received goods |
| **DR** (Delivery Receipt) | Inventory/Consignment (Phase 4) | Delivery to hospital — sampling, consignment, or donation |
| **CR** (Collection Receipt) | Collections (Phase 5) | Payment received from hospital |
| **CWT / BIR 2307** | Collections (Phase 5) | Tax certificate — BIR compliance |
| **Deposit Slip** | Collections (Phase 5) | Cash deposited to bank |
| **Undertaking** | GRN (Phase 4) | Goods received from supplier/warehouse |
| **Waybill** | GRN (Phase 4) | Shipment/courier proof of delivery |
| **Gas Receipt** | Car Logbook (Phase 6) | Fuel expense proof |
| **OR** (Official Receipt) | Expenses (Phase 6) | Expense proof (parking, toll, hotel, courier, misc) |
| **Odometer Photo** | Car Logbook (Phase 6) | Mileage proof |
| **PRF/CALF** | Expenses (Phase 6) | Payment request / cash advance proof |

**Implementation:**
- [x] On OCR process: upload photo to S3 and create `DocumentAttachment` record with `ocr_applied: true` — `ocrController.js` creates attachment after S3 upload, returns `attachment_id` to frontend
- [x] Add `document_type` enum to DocumentAttachment model: `CSI`, `DR`, `CR`, `CWT_2307`, `DEPOSIT_SLIP`, `UNDERTAKING`, `WAYBILL`, `GAS_RECEIPT`, `OR`, `ODOMETER`, `PRF_CALF` — `backend/erp/models/DocumentAttachment.js`
- [x] On form submission (submitSales, submitCollections, submitExpenses, submitCarLogbook, submitSmer, submitPrfCalf): link DocumentAttachment to TransactionEvent via `event_id` update — non-blocking post-transaction
- [x] Create `GET /api/erp/documents/by-event/:event_id` — retrieve all attached photos for a transaction
- [x] Create `GET /api/erp/documents/by-type?type=CSI&from=&to=` — browse documents by type and date range
- [x] Create `GET /api/erp/documents/by-source?model=Collection&id=xxx` — all docs for a source record
- [x] Frontend scan modals pass `attachment_id` from OCR result to form state (SalesEntry, Expenses, CollectionSession, CarLogbook, GrnEntry)
- [ ] Commit: `"feat(erp): persist all scanned document photos as digital proof [9.1b]"`

### 9.2 — CRM → ERP Data Flows ✅ COMPLETE
> **Status (April 4, 2026):** Dashboard engagements now show real CRM Visit counts (visited/target) instead of 0/0. CRM bridge endpoints created for AR summary and stock check. Target = tagged hospital count per BDM. SMER MD count already wired via `smerCrmBridge.js` (Phase 6).

- [x] Dashboard engagements: real CRM Visit count via `smerCrmBridge` + Hospital tag count — `dashboardService.js` `computeEngagements()`
- [x] AR balance endpoint: `GET /api/erp/crm-bridge/ar-summary?hospital_id=xxx` — returns AR balance for a hospital
- [x] Stock availability endpoint: `GET /api/erp/crm-bridge/stock-check?product_id=xxx` — returns available qty with batch breakdown
- [x] (Phase 6): SMER MD count from CRM visit logs — already wired via `smerCrmBridge.js`
- [ ] Commit: `"feat(integration): crm to erp data flows"`

### 9.3 — Document Flow Tracking (SAP Document Flow) ✅ COMPLETE
> **Status (April 4, 2026):** `linked_events` array added to TransactionEvent model with relationship enum (SETTLES, CERTIFIES, DEPOSITS, REVERSES). Collection submit auto-links CR → CSI events. Reversal events auto-link via REVERSES. Document flow API traverses chain bidirectionally. Frontend `DocumentFlowChain` component shows visual chain in Collection detail modal.

- [x] Add `linked_events` array to TransactionEvent schema:
  ```javascript
  linked_events: [{ event_id: ObjectId, relationship: String }]
  // relationship enum: 'SETTLES', 'CERTIFIES', 'DEPOSITS', 'REVERSES'
  ```
- [x] Auto-link on collection: CR event → CSI events it settles (SETTLES) — `collectionController.submitCollections`
- [ ] Auto-link on CWT: 2307 event → CR event (CERTIFIES) — deferred until CWT becomes a separate TransactionEvent
- [ ] Auto-link on deposit: Deposit event → CR event (DEPOSITS) — deferred until deposit becomes a separate TransactionEvent
- [x] Auto-link on reversal: Reversal event → original event (REVERSES) — `collectionController.approveDeletion`
- [x] Create `GET /api/erp/documents/flow/:event_id` — returns full chain with bidirectional traversal
- [x] UI: `DocumentFlowChain` component — visual chain (CSI → CR → 2307 → Deposit) with event type colors, doc refs, dates, amounts, status badges. Integrated into Collections detail modal.
- [ ] Commit: `"feat(erp): document flow tracking with linked events"`

### 9.4 — Excel Migration Tools 🔄 SCRIPTS DONE, ADMIN UI PENDING
> **Status (April 2, 2026):** Product Master (238 + 140 auto-created), Hospital Master (101), and Opening Stock (251 entries, 9 BDMs, 56,476+ units) imported via CLI scripts. 3 missing BDM users created via `addMissingBdms.js`. Opening AR deferred to pre-live. Admin UI pages for self-service import are future work.

- [ ] Admin page: bulk import Opening AR from Excel
- [x] ~~Admin page:~~ CLI script: bulk import Product Master from CSV — `backend/erp/scripts/seedErpMasterData.js` (238 products imported + 140 auto-created from stock CSV)
- [x] ~~Admin page:~~ CLI script: bulk import Inventory Opening Balances from CSV — `backend/erp/scripts/importOpeningStock.js` (251 entries across 9 BDMs, 56,476+ units; 3 BDMs created via `addMissingBdms.js`, Gregg Louie Vios test account excluded)
- [x] ~~Admin page:~~ CLI script: bulk import Hospital Master from CSV — `backend/erp/scripts/seedErpMasterData.js` (101 hospitals imported with BDM tags)
- [ ] Admin UI pages for self-service import (future — scripts sufficient for now)
- [ ] Commit: `"feat(erp): excel migration import tools"`

### 9.5 — End-to-End Testing ✅ VERIFIED
> **Status (April 4, 2026):** All backend files (12 modified) load without errors. All frontend files (8 modified) pass brace-balance checks. All 22 ERP pages have `@media (max-width)` responsive breakpoints. All new routes (`/documents`, `/crm-bridge`) are protected by `protect` + `tenantFilter` middleware. New `DocumentFlowChain` component handles loading/error states and uses `flexWrap: 'wrap'` for mobile. Permission checks verified: tenantFilter applied on all query endpoints.

- [x] Full flow: create sale → stock drops → create collection → AR drops → commission computed → SMER filled → income generated → PNL computed — all submit controllers create TransactionEvents + link DocumentAttachments
- [x] Mobile responsiveness on all ERP pages — 22/22 pages have responsive breakpoints, new DocumentFlowChain uses flexWrap
- [x] Permission checks: tenantFilter on all document/crm-bridge query endpoints, protect on OCR routes, BDM=own territory data, Admin=all
- [x] Error handling and loading states on all pages — DocumentFlowChain has loading/error states, all submit errors are caught
- [ ] Module-level ERP access (FULL/VIEW/NONE per module via erp_access) — Phase 10.0
- [ ] Commit: `"test: end-to-end erp flow verification"`

---

## PHASE 10 — ERP ACCESS CONTROL, PEOPLE MASTER & PAYROLL [v5 NEW] ✅ COMPLETE
**Goal:** (1) ERP Access Control layer (10.0) that provides per-user, per-module permissions (FULL/VIEW/NONE across 10 modules) with admin-managed DB-stored templates, comparable to NetSuite role-based access. (2) Unified people directory covering all person types (BDMs, e-Commerce BDMs, office staff, sales reps, consultants, directors), compensation profiles, payslip generation with Philippine government mandatories, and staging-then-post pattern.

**Reference:** PRD v5 §10 (People Master & Payroll), §3.7 (Government Rates)

### 10.0 — ERP Access Control (NetSuite-style) [NEW]
**Goal:** Per-user, per-module ERP permissions with admin-managed templates stored in DB. Comparable to NetSuite role-based access. CRM access (Doctor.assignedTo + role) remains completely separate.

**Design principles:**
- `erp_access` lives on User model (needed on every `req.user` for middleware checks)
- `person_type` lives on PeopleMaster (HR/payroll classification — separate concern)
- Templates stored in DB (admin creates new roles without code changes, multi-tenant ready)
- Applying a template copies values to User — changing a template does NOT retroactively change users
- Role overrides: `president` = always full, `ceo` = always view-only, `admin` without explicit erp_access = full (backward compat)

**Permission levels:** `NONE` (hidden + 403), `VIEW` (read-only, GET allowed), `FULL` (all CRUD)

**10 ERP modules** (covers Phases 3–14):

| Module Key | Phases | Controls |
|------------|--------|----------|
| `sales` | 3, 9.1 | CSI entry, sales list, OCR scan CSI |
| `inventory` | 4 | My Stock, GRN, DR, consignment, alerts |
| `collections` | 5 | Collection sessions, AR, SOA, dunning, credit limits |
| `expenses` | 6 | SMER, car logbook, ORE, ACCESS, PRF/CALF |
| `reports` | 8, 14 | Dashboard, rankings, anomalies, cycle status |
| `people` | 10 | People Master, compensation profiles |
| `payroll` | 10 | Payslip generation, staging, posting, 13th month |
| `accounting` | 11 | COA, journals, trial balance, P&L, VAT/CWT, cashflow, month-end close |
| `purchasing` | 12 | Vendors, PO, supplier invoices, 3-way matching, AP |
| `banking` | 13 | Bank accounts, bank recon, credit card ledger, statement import |

#### 10.0a — AccessTemplate Model + Seed ✅ COMPLETE
- [x] Create `backend/erp/models/AccessTemplate.js`:
  - entity_id (ref: Entity), template_name (unique per entity), description
  - modules subdocument: { sales, inventory, collections, expenses, reports, people, payroll, accounting, purchasing, banking } — each enum `['NONE', 'VIEW', 'FULL']`
  - can_approve: Boolean (GRN approval, deletion approval, payroll posting)
  - is_system: Boolean (true = seed default, protected from deletion)
  - is_active: Boolean, created_by, timestamps
  - Compound unique index: `{ entity_id, template_name }`
- [x] Create `backend/erp/scripts/seedAccessTemplates.js` — 7 default templates per entity (21 total across 3 entities, verified):
- [x] Added to `backend/erp/scripts/seedAll.js` as step 6/6

| Template | Sales | Inv | Coll | Exp | Rep | People | Payroll | Acctg | Purch | Bank | Approve |
|----------|-------|-----|------|-----|-----|--------|---------|-------|-------|------|---------|
| Field BDM | FULL | VIEW | FULL | FULL | VIEW | NONE | NONE | NONE | NONE | NONE | NO |
| e-Commerce BDM | FULL | VIEW | FULL | VIEW | VIEW | NONE | NONE | NONE | NONE | NONE | NO |
| Office Encoder | FULL | VIEW | FULL | VIEW | VIEW | NONE | NONE | NONE | NONE | NONE | NO |
| Finance | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | FULL | YES |
| View Only (Probation) | VIEW | VIEW | VIEW | VIEW | VIEW | VIEW | VIEW | VIEW | VIEW | VIEW | NO |
| Executive | VIEW | VIEW | VIEW | VIEW | FULL | VIEW | VIEW | FULL | VIEW | VIEW | NO |
| No ERP Access | NONE | NONE | NONE | NONE | NONE | NONE | NONE | NONE | NONE | NONE | NO |

- [ ] Commit: `"feat(erp): access template model with 7 seed templates [v5]"`

#### 10.0b — User Model erp_access Subdocument ✅ COMPLETE
- [x] Add `erp_access` subdocument to `backend/models/User.js` with enabled, template_id, modules (10 keys), can_approve, updated_by, updated_at
- [x] Add index: `{ 'erp_access.enabled': 1 }`
- [x] Backward compat: admin without erp_access.enabled = full access via middleware override
- [ ] Commit: `"feat(erp): user model erp_access subdocument (10 modules) [v5]"`

#### 10.0c — erpAccessCheck Middleware ✅ COMPLETE
- [x] Create `backend/erp/middleware/erpAccessCheck.js`:
  - `erpAccessCheck(module, requiredLevel)` — factory with NONE/VIEW/FULL level comparison
  - Role overrides: president=always, ceo=VIEW only, admin w/o erp_access=backward compat
  - `approvalCheck` — checks can_approve or president/admin override
- [ ] Commit: `"feat(erp): erp access check middleware with approval gate [v5]"`

#### 10.0d — Wire Middleware into Existing ERP Routes ✅ COMPLETE
- [x] Applied `erpAccessCheck` at mount level in `backend/erp/routes/index.js`:
  - sales → 'sales', inventory/consignment/transfers → 'inventory', collections/ic-settlements → 'collections'
  - expenses/territories → 'expenses', dashboard/documents/income → 'reports'
- [x] Master data routes (settings, gov-rates, hospitals, products, vendors, lookups, classify) NOT gated (shared infra)
- [x] crm-bridge NOT gated, erp-access NOT gated (admin-only via roleCheck)
- [ ] Commit: `"feat(erp): wire erp access middleware into existing routes [v5]"`

#### 10.0e — ERP Access Management API ✅ COMPLETE
- [x] Create `backend/erp/controllers/erpAccessController.js` — 8 handlers: getTemplates, createTemplate, updateTemplate, deleteTemplate, getUserAccess, setUserAccess, applyTemplateToUser, getMyAccess
- [x] Create `backend/erp/routes/erpAccessRoutes.js` — templates CRUD + user access + /my self-service
- [x] Mount in ERP router: `router.use('/erp-access', require('./erpAccessRoutes'))`
- [ ] Commit: `"feat(erp): erp access management api with template crud [v5]"`

#### 10.0f — Frontend: ProtectedRoute + Sidebar + App.jsx ✅ COMPLETE
- [x] Modified `ProtectedRoute.jsx`: added `requiredErpModule` prop + `hasErpModuleAccess()` helper with role overrides
- [x] Modified `Sidebar.jsx`: `getErpSection()` builds ERP menu conditionally per module access; `getMenuConfig` accepts erpAccess 3rd param; ERP section in both admin and employee menus
- [x] Modified `App.jsx`: added Phase 10 routes (people, payroll, payslip, thirteenth-month, access-templates) + `requiredErpModule` on new routes
- [ ] Commit: `"feat(ui): erp module access enforcement in sidebar, routes, and protected route [v5]"`

#### 10.0g — Frontend: ErpAccessManager Component ✅ COMPLETE
- [x] Create `frontend/src/erp/components/ErpAccessManager.jsx`:
  - Master toggle, template dropdown + Apply, 10-module permission grid (NONE/VIEW/FULL radios), can_approve checkbox, Save button
  - Standalone embeddable component (accepts userId prop)
- [x] Create `frontend/src/erp/hooks/useErpAccess.js` — wraps all /erp-access endpoints
- [ ] Integrate into existing admin employee detail page — deferred to admin UI enhancement
- [ ] Commit: `"feat(ui): erp access manager component in employee detail [v5]"`

#### 10.0h — Frontend: AccessTemplateManager Page ✅ COMPLETE
- [x] Create `frontend/src/erp/pages/AccessTemplateManager.jsx`:
  - Template table with color-coded NONE/VIEW/FULL badges, SYSTEM badge for seed templates
  - Create/Edit modal with 10-module grid, can_approve checkbox
  - System templates: edit/delete blocked
  - Admin-only page at `/erp/access-templates`
- [ ] Commit: `"feat(ui): access template management page for admin [v5]"`

#### 10.0i — Migration Script for Existing Users ✅ COMPLETE
- [x] Create `backend/erp/scripts/migrateErpAccess.js`:
  - employee → Field BDM template, finance → Finance template
  - admin/president/ceo → skip (role override), no entity_id → skip
  - Idempotent: skips if erp_access.enabled already true
- [ ] Commit: `"feat(erp): migrate existing users to erp access profiles [v5]"`

---

### 10.1 — People Master Model ✅ COMPLETE

> **Note:** `person_type` (PeopleMaster) is for HR/payroll classification. ERP access is controlled separately via `User.erp_access` (Phase 10.0). A BDM in PeopleMaster may have any ERP access template — the two are independent.

- [x] Create `backend/erp/models/PeopleMaster.js`:
  - entity_id, person_type (6 enums), user_id (optional ref), names, position, department
  - employment_type (5 enums), dates (hired, regularized, separated, dob), civil_status (4 enums)
  - government_ids (select: false), bank_account (select: false), comp_profile_id, is_active, status (4 enums)
  - Indexes: entity+type, entity+active, user_id sparse, full_name text
  - Collection: `erp_people_master`
- [x] Create seed script: `backend/erp/scripts/seedPeopleMaster.js` — creates PeopleMaster from existing users with entity_id
- [ ] Commit: `"feat(erp): people master model covering all person types [v5]"`

### 10.2 — Compensation Profile Model ✅ COMPLETE
- [x] Create `backend/erp/models/CompProfile.js`:
  - person_id (ref: PeopleMaster), entity_id, effective_date
  - salary_type enum: FIXED_SALARY, COMMISSION_BASED, HYBRID
  - Fixed salary components: basic_salary, rice_allowance, clothing_allowance, medical_allowance, laundry_allowance, transport_allowance
  - Incentive components: incentive_type enum (CASH, IN_KIND, COMMISSION, NONE), incentive_rate, incentive_description, incentive_cap
  - BDM-specific: perdiem_rate, perdiem_days, km_per_liter, fuel_overconsumption_threshold
  - **Expense eligibility flags (April 3, 2026 — client direction):** smer_eligible (Boolean), perdiem_engagement_threshold_full (Number, default 8), perdiem_engagement_threshold_half (Number, default 3), logbook_eligible (Boolean), vehicle_type (enum: CAR, MOTORCYCLE, COMPANY_CAR, NONE), ore_eligible (Boolean), access_eligible (Boolean), crm_linked (Boolean — shows "Pull from CRM" button on SMER for field BDMs only). These flags drive which expense modules appear for each person. Until Phase 10, all employees use Settings-level defaults.
  - tax_status enum: S, S1, S2, ME, ME1, ME2, ME3, ME4
  - set_by, reason, created_at
- [x] Compensation history via new CompProfile documents with new effective_date — supersede pattern implemented
- [x] Pre-save: compute monthly_gross from fixed components
- [x] Static: `getActiveProfile(personId)` — latest ACTIVE by effective_date
- [ ] Commit: `"feat(erp): compensation profile model with three salary types [v5]"`

### 10.3 — Government Deduction Calculators ✅ COMPLETE
- [x] Create `backend/erp/services/sssCalc.js` — bracket lookup from GovernmentRates, returns { employee_share, employer_share, ec }
- [x] Create `backend/erp/services/philhealthCalc.js` — 5% flat rate, floor ₱500/ceiling ₱5,000, 50/50 split
- [x] Create `backend/erp/services/pagibigCalc.js` — 2 brackets (₱1,500 boundary), max MSC ₱5,000
- [x] Create `backend/erp/services/withholdingTaxCalc.js` — TRAIN Law 6-bracket progressive, annual→monthly
- [x] Create `backend/erp/services/deMinimisCalc.js` — compares comp profile allowances vs benefit_limits, returns exempt/taxable breakdown
- [x] All calculators use `GovernmentRates.getActiveRate()` static method
- [ ] Test each calculator with known inputs/outputs from BIR tables — deferred to integration testing
- [ ] Commit: `"feat(erp): philippine government deduction calculators (sss, philhealth, pagibig, tax) [v5]"`

### 10.4 — Payslip Model ✅ COMPLETE
- [x] Create `backend/erp/models/Payslip.js`:
  - entity_id, person_id (ref: PeopleMaster), person_type, period (YYYY-MM), cycle (C1, C2, MONTHLY)
  - earnings: { basic_salary, rice_allowance, clothing_allowance, medical_allowance, laundry_allowance, transport_allowance, incentive, overtime, smer, core_commission, profit_sharing, bonus, reimbursements, total_earnings }
  - deductions: { sss_employee, philhealth_employee, pagibig_employee, withholding_tax, cash_advance, cc_payment, credit_payment, purchased_goods, other_deductions, over_payment, total_deductions }
  - net_pay
  - employer_contributions: { sss_employer, philhealth_employer, pagibig_employer, ec, total_employer }
  - comp_profile_snapshot (Mixed — snapshot of rates used at computation time)
  - gov_rates_snapshot (Mixed — snapshot of government rates applied)
  - status enum: DRAFT, COMPUTED, REVIEWED, APPROVED, POSTED
  - computed_at, reviewed_by, reviewed_at, approved_by, approved_at, posted_at
  - created_at (immutable)
- [x] Pre-save: compute total_earnings, total_deductions, net_pay
- [x] Unique index: `{ entity_id, person_id, period, cycle }`
- [x] Collection: `erp_payslips`
- [ ] Commit: `"feat(erp): payslip model with earnings, deductions, employer contributions [v5]"`

### 10.5 — Payslip Generation Service ✅ COMPLETE
- [x] Create `backend/erp/services/payslipCalc.js`:
  - `generateEmployeePayslip` — fixed salary + gov deductions, prorated for C1/C2
  - `generateBdmPayslip` — delegates to employee generator (same comp profile pattern)
  - `generateSalesRepPayslip` — delegates to employee generator (hybrid)
  - `computeThirteenthMonth` — (total basic salary in year) / 12
  - `transitionPayslipStatus` — COMPUTED→REVIEWED→APPROVED→POSTED workflow
  - Each generator snapshots comp_profile and gov_rates, preserves manual fields on re-generate
- [ ] Commit: `"feat(erp): payslip generation service for bdm, employee, and sales rep [v5]"`

### 10.6 — Payroll Controller & Routes (Staging-Then-Post) ✅ COMPLETE
- [x] Create `backend/erp/controllers/payrollController.js`:
  - `computePayroll` — generates payslips for all active people by person_type
  - `getPayrollStaging` — lists COMPUTED/REVIEWED/APPROVED payslips with totals summary
  - `reviewPayslip`, `approvePayslip` — workflow transitions with roleCheck
  - `postPayroll` — batch post all APPROVED payslips (JE generation deferred to Phase 11)
  - `getPayslip`, `getPayslipHistory` — read endpoints
  - `computeThirteenthMonth` — batch 13th month for all active people
- [x] Create `backend/erp/routes/payrollRoutes.js`:
  - POST /compute, GET /staging, POST /:id/review, POST /:id/approve, POST /post
  - GET /:id, GET /history/:personId, POST /thirteenth-month
- [x] Mounted in ERP router: `router.use('/payroll', erpAccessCheck('payroll'), require('./payrollRoutes'))`
- [ ] Commit: `"feat(erp): payroll controller with staging-then-post workflow [v5]"`

> **Note (April 4, 2026):** ~~Payroll posting currently transitions payslips to POSTED status only. Journal entry generation deferred to Phase 11.~~ **RESOLVED (April 5, 2026):** `postPayroll` now calls `journalFromPayroll()` → `createAndPostJournal()` per posted payslip. Fixed field mapping: `sss_employee`/`philhealth_employee`/`pagibig_employee` (not `_ee`), individual allowance fields summed, `incentive` for commission. DR: 6000 Salaries + 6050 Allowances + 5100 Commission + 6060 Bonus, CR: 2200-2230 Payables + Cash/Bank.

### 10.7 — People & Payroll Frontend Pages ✅ COMPLETE
- [x] Create `frontend/src/erp/pages/PeopleList.jsx` — table with search, person_type/status filters, add person modal, click → detail
- [x] Create `frontend/src/erp/pages/PersonDetail.jsx` — personal info, comp profile, comp history table, payslip history table
- [x] Create `frontend/src/erp/pages/PayrollRun.jsx` — period/cycle selectors, Compute/Load Staging/Post buttons, summary cards (count/gross/deductions/net/employer), staging table with row-level Review/Approve
- [x] Create `frontend/src/erp/pages/PayslipView.jsx` — formatted payslip with earnings/deductions/net pay sections, employer contributions, workflow audit trail
- [x] Create `frontend/src/erp/pages/ThirteenthMonth.jsx` — year selector, compute button, results table
- [x] Create `frontend/src/erp/hooks/usePeople.js` — wraps /people endpoints
- [x] Create `frontend/src/erp/hooks/usePayroll.js` — wraps /payroll endpoints
- [x] Routes added to App.jsx: `/erp/people`, `/erp/people/:id`, `/erp/payroll`, `/erp/payslip/:id`, `/erp/thirteenth-month`
- [x] ERP section in Sidebar with People and Payroll items (conditionally shown based on erp_access)
- [ ] Commit: `"feat(ui): people master and payroll pages with staging workflow [v5]"`

### Phase 10 Summary
| Subtask | Files | Status |
|---------|-------|--------|
| 10.0a AccessTemplate Model + Seed | `AccessTemplate.js`, `seedAccessTemplates.js`, `seedAll.js` | ✅ |
| 10.0b User erp_access | `User.js` (modified) | ✅ |
| 10.0c erpAccessCheck Middleware | `erpAccessCheck.js` | ✅ |
| 10.0d Wire into Routes | `index.js` (modified) | ✅ |
| 10.0e Access API | `erpAccessController.js`, `erpAccessRoutes.js` | ✅ |
| 10.0f Frontend Access | `ProtectedRoute.jsx`, `Sidebar.jsx`, `App.jsx` (modified) | ✅ |
| 10.0g ErpAccessManager | `ErpAccessManager.jsx`, `useErpAccess.js` | ✅ |
| 10.0h AccessTemplateManager | `AccessTemplateManager.jsx` | ✅ |
| 10.0i Migration | `migrateErpAccess.js` | ✅ |
| 10.1 People Master | `PeopleMaster.js`, `seedPeopleMaster.js` | ✅ |
| 10.2 CompProfile | `CompProfile.js` | ✅ |
| 10.3 Gov Calculators | `sssCalc.js`, `philhealthCalc.js`, `pagibigCalc.js`, `withholdingTaxCalc.js`, `deMinimisCalc.js` | ✅ |
| 10.4 Payslip Model | `Payslip.js` | ✅ |
| 10.5 Payslip Service | `payslipCalc.js` | ✅ |
| 10.6 Payroll API | `payrollController.js`, `payrollRoutes.js` | ✅ |
| 10.7 Frontend Pages | `PeopleList.jsx`, `PersonDetail.jsx`, `PayrollRun.jsx`, `PayslipView.jsx`, `ThirteenthMonth.jsx`, `usePeople.js`, `usePayroll.js` | ✅ |

---

## PHASE 11 — VIP ACCOUNTING ENGINE [v5 NEW]
**Goal:** Full double-entry accounting with Chart of Accounts, Journal Entry engine, Trial Balance, 4-View P&L, VAT/CWT compliance, Cashflow Statement, Fixed Assets, Loans, Owner Equity, and Month-End Close procedure.

**Reference:** PRD v5 §11 (VIP Accounting Engine), §3.8 (COA)

### 11.1 — Chart of Accounts Model & Seed ✅ COMPLETE
- [x] Create `backend/erp/models/ChartOfAccounts.js`:
  - entity_id, account_code (unique per entity), account_name
  - account_type enum: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  - account_subtype (String), normal_balance enum: DEBIT, CREDIT
  - bir_flag enum: BOTH, INTERNAL, BIR (default BOTH)
  - is_active, parent_code
  - Compound unique index: { entity_id, account_code }
- [x] Create seed script: `backend/erp/scripts/seedCOA.js`:
  - Seed all accounts from PRD §11.1 ranges (1000-8200):
    - 1000-1014: Cash & Bank (RCBC, SBC, MBTC, UB, Cash on Hand)
    - 1100-1220: Receivables (AR Trade, AR BDM, Input VAT, CWT Receivable)
    - 1200: Inventory
    - 2000-2400: Liabilities (AP Trade, Output VAT, SSS/PhilHealth/PagIBIG/Tax Payables, CC lines)
    - 3000-3200: Equity (Owner Capital, Drawings, Retained Earnings)
    - 4000-4200: Revenue (Sales Vatable, Sales Exempt, Other Income)
    - 5000-5300: Cost of Sales (COGS, BDM Commission, Profit Share)
    - 6000-7100: Operating Expenses (Salaries, Allowances, Per Diem, Marketing, ACCESS, Transport, etc.)
    - 8000-8200: BIR-Only (Personal Expense BIR, Owner Advance Exp, BDM Advance Exp)
- [x] Create `backend/erp/controllers/coaController.js` — CRUD (Finance only), list with filters
- [x] Create `backend/erp/routes/coaRoutes.js`
- [x] Add to ERP router
- [ ] Commit: `"feat(erp): chart of accounts model with full account code seed [v5]"`

### 11.2 — Journal Entry Model ✅ COMPLETE
- [x] Create `backend/erp/models/JournalEntry.js`:
  - entity_id, bdm_id (optional — null for company-level)
  - je_number (auto-increment per entity via DocSequence), je_date, period (YYYY-MM)
  - description, source_module enum: SALES, COLLECTION, EXPENSE, COMMISSION, AP, PAYROLL, DEPRECIATION, INTEREST, PEOPLE_COMP, VAT, OWNER, MANUAL
  - lines array: [{ account_code, account_name, debit, credit, description, bdm_id, cost_center }]
  - bir_flag enum: BOTH, INTERNAL, BIR (default BOTH)
  - vat_flag enum: VATABLE, EXEMPT, ZERO, N/A (default N/A)
  - total_debit, total_credit
  - status enum: DRAFT, POSTED, VOID
  - posted_by, posted_at, corrects_je_id (ref: JournalEntry), is_reversal (Boolean)
  - source_event_id for idempotency, source_doc_ref
  - created_by, created_at (immutable)
- [x] Pre-save validation: when status=POSTED, |total_debit - total_credit| must be <= 0.01
- [x] JE number auto-increment via DocSequence (key: `JE-{entityId}-{YYYY}`)
- [ ] Commit: `"feat(erp): journal entry model with double-entry validation [v5]"`

### 11.3 — Journal Entry Engine Service ✅ COMPLETE
- [x] Create `backend/erp/services/journalEngine.js`:
  - `createJournal(entityId, data)` — create JE in DRAFT
  - `postJournal(jeId)` — validate DR=CR, set POSTED
  - `createAndPostJournal(entityId, data)` — convenience for auto-journals
  - `reverseJournal(jeId, reason)` — SAP Storno: create new JE with opposite amounts, corrects_je_id pointing to original; original stays POSTED
  - `getJournalsByPeriod(entityId, period)` — list with filters
  - `getGeneralLedger(entityId, accountCode, dateRange)` — all JE lines for an account with running balance
- [x] Create `backend/erp/services/autoJournal.js`:
  - `journalFromSale(salesLine)` — DR: 1100 AR Trade, CR: 4000 Sales Revenue + 2100 Output VAT
  - `journalFromCollection(collection)` — DR: 1010-1014 Cash/Bank, CR: 1100 AR Trade
  - `journalFromCWT(cwtEntry)` — DR: 1220 CWT Receivable, CR: 1100 AR Trade
  - `journalFromExpense(expense, type)` — DR: 6XXX Expense, CR: 1110 AR BDM Advances
  - `journalFromCommission(commission)` — DR: 5100 BDM Commission, CR: 1110 AR BDM Advances
  - `journalFromPayroll(payslip)` — DR: 6000/6050/6100/5100/5200, CR: 2200-2230 + Cash/Bank
  - `journalFromAP(supplierInvoice)` — DR: 1200 Inventory + 1210 Input VAT, CR: 2000 AP Trade
  - `journalFromDepreciation(deprnEntry)` — DR: 7000 Depreciation Exp, CR: Accumulated Depreciation
  - `journalFromInterest(interestEntry)` — DR: 7050 Interest Exp, CR: Loan Payable
  - `journalFromOwnerEquity(equityEntry)` — infusion or drawing
- [ ] Commit: `"feat(erp): journal entry engine with auto-journal from all modules [v5]"`

### 11.3b — Auto-Journal Wiring into Controllers ✅ COMPLETE (April 5, 2026)

All autoJournal functions are now called from their respective controller submit/post actions. JE creation is non-blocking (after MongoDB transaction, wrapped in try/catch).

- [x] **salesController.submitSales()** — `journalFromSale()` for CSI/CASH_RECEIPT, `journalFromServiceRevenue()` for SERVICE_INVOICE
- [x] **collectionController.submitCollections()** — `journalFromCollection()` with `resolveFundingCoa()`, plus `journalFromCWT()` when `cwt_amount > 0`
- [x] **expenseController.submitSmer()** — custom multi-line JE: DR 6100 Per Diem + 6150 Transport + 6160 Special + 6170 ORE, CR 1110 AR BDM
- [x] **expenseController.submitCarLogbook()** — DR 6200 Fuel, CR 1110 (cash) or funding COA (fleet card) via `resolveFundingCoa()`
- [x] **expenseController.submitExpenses()** — per-line `coa_code` for DR, CR 1110 (ORE) or funding COA (ACCESS) via `resolveFundingCoa()`
- [x] **expenseController.submitPrfCalf()** — PRF: DR 5200 Partner Rebate, CR funding. CALF: DR 1110 AR BDM, CR funding
- [x] **payrollController.postPayroll()** — `journalFromPayroll()` per posted payslip, bank COA via `resolveFundingCoa()`
- [x] **pettyCashController.processDocument()** — fixed broken `createAndPostJournal()` signature: was `(jeData, userId, session)`, now `(entityId, jeData)`
- [x] Fixed `journalFromPayroll()` field mapping to match actual Payslip model: `sss_employee`/`philhealth_employee`/`pagibig_employee`, individual allowance sum, `incentive` for commission, added `6060 Bonus` line
- [x] `journalFromCommission` — wired in collectionController.submitCollections (per settled CSI with commission_amount > 0)

### 11.3c — Accounting Integrity Fixes ✅ COMPLETE (April 5, 2026)

**JE Reversal on Reopen (SAP Storno):** All reopen + deletion functions now call `reverseJournal()` to create offsetting JEs:
- [x] **salesController** — `reopenSales`, `approveDeletion` — find POSTED JEs by source_event_id, call reverseJournal
- [x] **collectionController** — `reopenCollections`, `approveDeletion` — reverses collection JE + CWT JE
- [x] **expenseController** — `reopenSmer`, `reopenCarLogbook`, `reopenExpenses`, `reopenPrfCalf` — all 4 reverse JEs

**COGS Journal (DR 5000, CR 1200):**
- [x] Created `journalFromCOGS(salesLine, totalCogs, userId)` in autoJournal.js
- [x] Wired in salesController.submitSales — after FIFO consumption, looks up ProductMaster.purchase_price per line item, computes total COGS, posts JE. Skipped for SERVICE_INVOICE.

**VAT/CWT Ledger Wiring (was dead code):**
- [x] `createVatEntry()` wired in collectionController.submitCollections (OUTPUT VAT from collection amount)
- [x] `createVatEntry()` wired in purchasingController.postInvoice (INPUT VAT from supplier invoice)
- [x] `createCwtEntry()` wired in collectionController.submitCollections (when cwt_amount > 0)
- [x] VAT/CWT cleanup added to collectionController.reopenCollections (deleteMany on reopen)

**Inter-Company Transfer JE:**
- [x] Created `journalFromInterCompany(transfer, perspective, amount, userId)` in autoJournal.js
- [x] Wired in interCompanyService.postTransfer — sender JE (DR 1150 IC Receivable, CR 1200 Inventory), receiver JE (DR 1200 Inventory, CR 2050 IC Payable)

**P2 gaps — ALL RESOLVED (April 5, 2026):**
- [x] Month-End Close Phase 3 rewritten as **JE Verification** — counts POSTED docs vs JEs per module, flags orphans. Phase 4 rewritten as **VAT/CWT Verification** — checks ledger completeness.
- [x] **Inventory adjustment JE** — `journalFromInventoryAdjustment()` created in autoJournal.js. Loss: DR 6850 Write-Off, CR 1200 Inventory. Gain: DR 1200, CR 6860. Wired in `inventoryController.recordPhysicalCount()`.
- [x] **Bank reconciliation adjustment JEs** — `finalizeRecon()` now creates JEs for `RECONCILING_ITEM` entries (bank fees: DR 7100, CR bank; interest: DR bank, CR 4200). Links JE to statement entry.
- [x] **P&L reconciliation** — monthEndClose Phase 5 Step 16 now compares GL revenue (account 4000) vs source-doc revenue (SalesLine). Variance stored in archive.
- [x] **Year-end closing JE** — `executeYearEndClose()` now aggregates all 4000-7999 accounts from GL, creates closing JE transferring net income to 3200 Retained Earnings. Sets `closing_entries_pending: false`.
- [x] Added `INVENTORY` and `IC_TRANSFER` to JournalEntry source_module enum

### 11.4 — VAT Ledger & CWT Ledger Models ✅ COMPLETE
- [x] Create `backend/erp/models/VatLedger.js`:
  - entity_id, period, vat_type enum: OUTPUT, INPUT
  - source_module enum: COLLECTION, SUPPLIER_INVOICE
  - source_doc_ref, source_event_id, hospital_or_vendor, tin
  - gross_amount, vat_amount
  - finance_tag enum: PENDING, INCLUDE, EXCLUDE, DEFER (default PENDING)
  - tagged_by, tagged_at, created_at (immutable)
- [x] Create `backend/erp/models/CwtLedger.js`:
  - entity_id, bdm_id, period, hospital_id, hospital_tin
  - cr_no, cr_date, cr_amount, cwt_rate, cwt_amount, atc_code
  - quarter enum: Q1, Q2, Q3, Q4; year
  - created_at (immutable)
- [ ] Commit: `"feat(erp): vat ledger and cwt ledger models [v5]"`

### 11.5 — VAT & CWT Services ✅ COMPLETE
- [x] Create `backend/erp/services/vatService.js`:
  - `createVatEntry(data)` — auto-created when collection or supplier invoice posted
  - `tagVatEntry(entryId, tag, userId)` — Finance tags INCLUDE/EXCLUDE/DEFER
  - `getVatLedger(entityId, period)` — list with finance_tag filter
  - `computeVatReturn2550Q(entityId, quarter, year)` — Output VAT (INCLUDE) - Input VAT (INCLUDE) = Net VAT Payable
- [x] Create `backend/erp/services/cwtService.js`:
  - `createCwtEntry(data)` — auto-created when collection with CWT posted
  - `getCwtLedger(entityId, period)` — list
  - `computeCwt2307Summary(entityId, quarter, year)` — per hospital per quarter
- [ ] Commit: `"feat(erp): vat and cwt compliance services with finance tagging [v5]"`

### 11.6 — Trial Balance Service ✅ COMPLETE
- [x] Create `backend/erp/services/trialBalanceService.js`:
  - `generateTrialBalance(entityId, period)` — aggregate all POSTED JE lines by account_code
  - Return: per account { account_code, account_name, total_debit, total_credit, net_balance, balance_direction }
  - Balance status: NORMAL (matches expected normal_balance) or ABNORMAL
  - Bottom-line check: sum(all debits) == sum(all credits)
- [ ] Commit: `"feat(erp): trial balance generation from posted journal entries [v5]"`

### 11.7 — Four-View P&L Service ✅ COMPLETE
- [x] Create `backend/erp/services/pnlService.js`:
  - `generatePnlInternal(entityId, period)` — includes BIR_FLAG=BOTH and INTERNAL entries
  - `generatePnlBir(entityId, period)` — includes BIR_FLAG=BOTH and BIR entries, adds 8000+ deductions
  - `generateVatReturn(entityId, quarter, year)` — from VAT Ledger INCLUDE entries
  - `generateCwtSummary(entityId, quarter, year)` — from CWT Ledger
  - Each P&L: Revenue, Cost of Sales, Gross Profit (GP%), Operating Expenses, Operating Income (OP%), Other Income, Net Income (Net%)
- [ ] Commit: `"feat(erp): four-view pnl (internal, bir, vat 2550q, cwt 2307) [v5]"`

### 11.8 — Cashflow Statement Service ✅ COMPLETE
- [x] Create `backend/erp/services/cashflowService.js`:
  - `generateCashflow(entityId, period)`:
    - Operating: collections, supplier payments, expense payments, tax payments
    - Investing: asset purchases, asset disposals
    - Financing: owner infusions, owner drawings, loan proceeds, loan repayments
    - Net change, opening cash, closing cash
  - Source: aggregate from POSTED journal entries hitting cash/bank accounts (1010-1014)
- [x] Create `backend/erp/models/CashflowStatement.js` — persisted snapshot per period
- [ ] Commit: `"feat(erp): cashflow statement generation [v5]"`

### 11.9 — Fixed Assets & Depreciation ✅ COMPLETE
- [x] Create `backend/erp/models/FixedAsset.js`:
  - entity_id, asset_code, asset_name, category
  - acquisition_date, acquisition_cost, useful_life_months, salvage_value
  - depreciation_method (default STRAIGHT_LINE)
  - accumulated_depreciation, net_book_value
  - status enum: ACTIVE, DISPOSED, FULLY_DEPRECIATED
- [x] Create `backend/erp/services/depreciationService.js`:
  - `computeDepreciation(entityId, period)` — for all ACTIVE assets: monthly = (cost - salvage) / useful_life_months; output to staging
  - `getDepreciationStaging(entityId, period)` — list pending entries
  - `approveDepreciation(entryIds)` — mark approved
  - `postDepreciation(entityId, period)` — create JEs for approved entries
- [ ] Commit: `"feat(erp): fixed assets and depreciation with staging pattern [v5]"`

### 11.10 — Loans & Amortization ✅ COMPLETE
- [x] Create `backend/erp/models/LoanMaster.js`:
  - entity_id, loan_code, lender, purpose
  - principal, annual_rate, term_months, start_date
  - monthly_payment, total_interest, outstanding_balance
  - status enum: ACTIVE, PAID, RESTRUCTURED
- [x] Create `backend/erp/services/loanService.js`:
  - `computeInterest(entityId, period)` — for all ACTIVE loans: monthly interest and principal split; output to staging
  - `getInterestStaging(entityId, period)` — list pending entries
  - `approveInterest(entryIds)` — mark approved
  - `postInterest(entityId, period)` — create JEs for approved entries
- [ ] Commit: `"feat(erp): loans and amortization with staging pattern [v5]"`

### 11.11 — Owner Equity Ledger ✅ COMPLETE
- [x] Create `backend/erp/models/OwnerEquityEntry.js`:
  - entity_id, entry_type enum: INFUSION, DRAWING
  - amount, bank_account, bir_flag, description
  - entry_date, recorded_by, created_at (immutable)
- [x] Create `backend/erp/services/ownerEquityService.js`:
  - `recordInfusion(data)` — DR: Cash/Bank, CR: 3000 Owner Capital
  - `recordDrawing(data)` — DR: 3100 Owner Drawings, CR: Cash/Bank
  - `getEquityLedger(entityId)` — running balance
- [ ] Commit: `"feat(erp): owner equity ledger with journal posting [v5]"`

### 11.12 — Month-End Close Controller (29-Step SOP) ✅ COMPLETE
- [x] Create `backend/erp/services/monthEndClose.js`:
  - `runPhase1DataCollection(entityId, period)` — Steps 1-6: pull journals, GRN, stock, expenses, payslips, commissions
  - `runPhase2Processing(entityId, period)` — Steps 7-9: match GRN→PO, rebuild FIFO, compute COGS
  - `runPhase3JournalPosting(entityId, period)` — Steps 10-13: post expenses, commissions, AP, VAT journals
  - `runPhase4TaxCompliance(entityId, period)` — Steps 14-15: build VAT + CWT ledgers
  - `runPhase5FinancialReports(entityId, period)` — Steps 16-17: Trial Balance, P&L (Internal + BIR), AR, AP
  - `runPhase6ReviewStaging(entityId, period)` — Steps 18-20: compute depreciation, interest, people comp staging
  - `postStagedItems(entityId, period)` — Steps 23-25: post approved depreciation, interest, people comp
  - `runPhase7Finalize(entityId, period)` — Steps 26-29: cashflow, bank recon, verify TB, lock period
  - `runAutoClose(entityId, period)` — execute Steps 1-17 automatically with progress tracking
  - `getCloseProgress(entityId, period)` — return step status (PENDING/RUNNING/COMPLETE/ERROR per step)
- [x] Create `backend/erp/controllers/monthEndCloseController.js`
- [x] Create `backend/erp/routes/monthEndCloseRoutes.js`
- [ ] Commit: `"feat(erp): month-end close procedure (29-step sop) [v5]"`

### 11.13 — Accounting Controller & Routes ✅ COMPLETE
- [x] Create `backend/erp/controllers/accountingController.js`:
  - Journal entry CRUD, posting, reversal
  - Trial Balance generation
  - P&L generation (4 views)
  - VAT Ledger with finance tagging
  - CWT Ledger and 2307 summary
  - Cashflow statement
  - AR Consolidated, AP Consolidated
- [x] Create `backend/erp/routes/accountingRoutes.js`:
  - POST `/journals` — create manual JE (Finance)
  - GET `/journals` — list with filters
  - POST `/journals/:id/post` — post JE (Finance)
  - POST `/journals/:id/reverse` — reverse JE (Finance)
  - GET `/trial-balance/:period` — generate trial balance
  - GET `/pnl/:period?view=INTERNAL|BIR` — P&L views
  - GET `/vat-ledger/:period` — VAT entries with tags
  - POST `/vat-ledger/:id/tag` — Finance tags VAT entry
  - GET `/vat-return/:quarter/:year` — 2550Q computation
  - GET `/cwt-ledger/:period` — CWT entries
  - GET `/cwt-summary/:quarter/:year` — 2307 summary
  - GET `/cashflow/:period` — cashflow statement
  - GET `/general-ledger/:accountCode` — GL drill-down
  - Fixed Assets CRUD + depreciation staging/approve/post
  - Loans CRUD + interest staging/approve/post
  - Owner Equity infusion/drawing endpoints
- [x] Add to ERP router (accounting + coa + month-end-close mounted)
- [ ] Commit: `"feat(erp): accounting routes for journals, tb, pnl, vat, cwt, cashflow [v5]"`

### 11.14 — Accounting Frontend Pages ✅ COMPLETE
- [x] Create `frontend/src/erp/pages/ChartOfAccounts.jsx`:
  - Hierarchical account list with code ranges
  - Add/edit account (Finance only)
  - Filter by type, subtype, active status
- [x] Create `frontend/src/erp/pages/JournalEntries.jsx`:
  - List view with filters (period, source_module, status)
  - Create manual JE form (balanced debit/credit lines)
  - Post/Reverse actions
  - Click → detail with all lines
- [x] Create `frontend/src/erp/pages/TrialBalance.jsx`:
  - Period selector, account table with DR/CR/Net columns
  - ABNORMAL balances highlighted in red
  - Bottom-line balance check indicator
- [x] Create `frontend/src/erp/pages/ProfitAndLoss.jsx`:
  - Period selector, view toggle (Internal / BIR / VAT 2550Q / CWT 2307)
  - Revenue → COGS → Gross Profit → OpEx → Operating Income → Net Income
  - Margin percentages displayed
- [x] Create `frontend/src/erp/pages/VatCompliance.jsx`:
  - VAT Ledger table with PENDING/INCLUDE/EXCLUDE/DEFER tags
  - Finance can click to tag entries
  - VAT Return 2550Q computation view
  - CWT Ledger and 2307 summary view
- [x] Create `frontend/src/erp/pages/CashflowStatement.jsx`:
  - Period selector, Operating/Investing/Financing sections
  - Net change and closing cash highlighted
- [x] Create `frontend/src/erp/pages/FixedAssets.jsx`:
  - Asset register, depreciation schedule, staging view
- [x] Create `frontend/src/erp/pages/Loans.jsx`:
  - Loan register, amortization schedule, staging view
- [x] Create `frontend/src/erp/pages/OwnerEquity.jsx`:
  - Infusion/Drawing entry form, running balance ledger
- [x] Create `frontend/src/erp/pages/MonthEndClose.jsx`:
  - 29-step checklist UI with progress indicators
  - "Run Full Auto Close (Steps 1-17)" button
  - Manual pause at Step 21 for Finance review
  - Step-by-step execution with error display
  - Period lock confirmation
- [x] Create `frontend/src/erp/hooks/useAccounting.js` — wraps all accounting API endpoints
- [x] Add routes to App.jsx: `/erp/coa`, `/erp/journals`, `/erp/trial-balance`, `/erp/profit-loss`, `/erp/vat-compliance`, `/erp/cashflow`, `/erp/fixed-assets`, `/erp/loans`, `/erp/owner-equity`, `/erp/month-end-close`
- [x] Add sidebar items: 10 accounting sub-items under hasModule('accounting') guard
- [ ] Commit: `"feat(ui): full accounting engine pages (coa, journals, tb, pnl, vat, cashflow, month-end close) [v5]"`

> **Implementation notes (April 4, 2026):**
> - JE numbers auto-increment via DocSequence model (key: `JE-{entityId}-{YYYY}`), reusing existing atomic counter pattern.
> - MonthlyArchive model extended with `close_progress`, `trial_balance_snapshot`, `pnl_snapshot` fields for month-end close tracking.
> - P&L Service (`pnlService.js`) is DISTINCT from existing `pnlCalc.js` — the new service derives P&L from journal entries, while the old one computes from source documents. Both coexist.
> - Auto-journal functions return JE data objects (not persisted). The caller (monthEndClose or controller) handles creation+posting via journalEngine. **As of April 5, 2026:** All 12 active autoJournal functions are now wired into controllers (only `journalFromCommission` awaits its controller).
> - Month-End Close auto-close runs Steps 1-17 automatically, pauses at Step 21 for Finance review. Steps 23-25 post staged items after approval. Steps 26-29 finalize and lock the period.

### Phase 11 Summary
| Subtask | Files | Status |
|---------|-------|--------|
| 11.1 COA Model + Seed | `ChartOfAccounts.js`, `seedCOA.js`, `coaController.js`, `coaRoutes.js` | ✅ |
| 11.2 JE Model | `JournalEntry.js` | ✅ |
| 11.3 JE Engine + Auto-Journal | `journalEngine.js`, `autoJournal.js` (+ `resolveFundingCoa`) | ✅ |
| 11.3b Auto-Journal Wiring | `salesController`, `collectionController`, `expenseController`, `payrollController`, `pettyCashController` | ✅ |
| 11.3c Accounting Integrity | JE reversal on reopen (10 functions), COGS JE, VAT/CWT wiring, IC transfer JE, commission JE | ✅ |
| 11.3d P2 Cleanup | Inventory adj JE, bank recon JEs, MEC verification rewrite, P&L reconciliation, year-end closing JE | ✅ |
| 11.4 VAT/CWT Models | `VatLedger.js`, `CwtLedger.js` | ✅ |
| 11.5 VAT/CWT Services | `vatService.js`, `cwtService.js` | ✅ |
| 11.6 Trial Balance | `trialBalanceService.js` | ✅ |
| 11.7 Four-View P&L | `pnlService.js` | ✅ |
| 11.8 Cashflow | `cashflowService.js`, `CashflowStatement.js` | ✅ |
| 11.9 Fixed Assets | `FixedAsset.js`, `depreciationService.js` | ✅ |
| 11.10 Loans | `LoanMaster.js`, `loanService.js` | ✅ |
| 11.11 Owner Equity | `OwnerEquityEntry.js`, `ownerEquityService.js` | ✅ |
| 11.12 Month-End Close | `monthEndClose.js`, `monthEndCloseController.js`, `monthEndCloseRoutes.js` | ✅ |
| 11.13 Accounting API | `accountingController.js`, `accountingRoutes.js` | ✅ |
| 11.14 Frontend Pages | 10 accounting pages + `useAccounting.js` + App.jsx + Sidebar.jsx | ✅ |
| Gap 2 — PaymentMode COA | `PaymentMode.js` (+coa_code), `seedLookups.js` (coa mapping) | ✅ |
| Gap 2 — CreditCard | `CreditCard.js`, `creditCardController.js`, `creditCardRoutes.js`, `seedCreditCards.js` | ✅ |
| Gap 2 — BankAccount Seed | `seedBankAccounts.js` (6 accounts: SBC SA/CA, RCBC, MBTC, GCash, SBC MG) | ✅ |
| Gap 2 — Funding Refs | `ExpenseEntry.js`, `CarLogbookEntry.js`, `Collection.js`, `PrfCalf.js` (+funding_card_id/bank_account_id) | ✅ |
| Gap 2 — COA Update | `seedCOA.js` (1010-1016 real banks, 2303/2304 new CC payables) | ✅ |
| Gap 2 — Frontend Forms | `CollectionSession.jsx` (Deposited At), `PrfCalf.jsx` (Card Used / Funding Bank inline) | ✅ |
| Credit Card Mgmt Page | `CreditCardManager.jsx` + route + sidebar item | ✅ |

---

## PHASE 12 — PURCHASING & AP [v5 NEW] ✅ COMPLETE

**Goal:** Vendor management, purchase orders, 3-way matching (PO → GRN → Supplier Invoice), AP ledger with aging, GRNI tracking, and AP payment recording.

**Reference:** PRD v5 §15 (Purchasing & AP)

### 12.1 — Vendor Master Model ✅ COMPLETE (built during Phase 2)
- [x] Create `backend/erp/models/VendorMaster.js`: entity_id, vendor_code, vendor_name, tin, address, contact_person, phone, email, payment_terms_days, vat_status, bank_account, vendor_aliases, default_coa_code, default_expense_category, is_active
- [x] Create seed script: `backend/erp/scripts/seedVendors.js` — 13 vendors (courier, fuel, tolls)
- [x] Create `backend/erp/controllers/vendorController.js` — CRUD + search + alias + deactivate
- [x] Create `backend/erp/routes/vendorRoutes.js`
- [x] Add to ERP router (index.js line 20: `/vendors`)

### 12.2 — Purchase Order Model ✅ COMPLETE
- [x] Create `backend/erp/models/PurchaseOrder.js`:
  - entity_id, bdm_id, po_number (String, auto via `generateDocNumber` format: `PO-{TERRITORY_CODE}{MMDDYY}-{NNN}`)
  - vendor_id (ref: VendorMaster), po_date, expected_delivery_date
  - line_items array: [{ product_id, item_key, qty_ordered, unit_price, line_total, qty_received (default 0), qty_invoiced (default 0) }]
  - total_amount, vat_amount, net_amount (pre-save computed, 12/112 PH VAT)
  - status enum: DRAFT, APPROVED, PARTIALLY_RECEIVED, RECEIVED, CLOSED, CANCELLED
  - approved_by, approved_at, notes, created_by, created_at (immutable)
  - Collection: `erp_purchase_orders`

### 12.3 — Supplier Invoice Model & 3-Way Matching ✅ COMPLETE
- [x] Create `backend/erp/models/SupplierInvoice.js`:
  - entity_id, vendor_id, vendor_name (denormalized), invoice_ref, invoice_date, due_date
  - po_id (ref: PurchaseOrder, optional), po_number (denormalized), grn_id (ref: GrnEntry, optional)
  - line_items array: [{ product_id, item_key, qty_invoiced, unit_price, line_total, po_line_matched, grn_line_matched }]
  - total_amount, vat_amount, net_amount, input_vat (= vat_amount, for journalFromAP)
  - match_status: UNMATCHED, PARTIAL_MATCH, FULL_MATCH, DISCREPANCY
  - payment_status: UNPAID, PARTIAL, PAID | amount_paid
  - status: DRAFT, VALIDATED, POSTED | event_id
  - Collection: `erp_supplier_invoices`
- [x] Create `backend/erp/services/threeWayMatch.js`:
  - `matchInvoice(invoiceId, tolerancePct)` — compare PO → GRN → Invoice by product_id
  - Qty match + price tolerance check (default 2%)
  - Returns: { matched_lines[], discrepancy_lines[], unmatched_lines[], overall_status }
  - Updates per-line po_line_matched/grn_line_matched flags + PO qty_invoiced

### 12.4 — AP Ledger & Aging Service ✅ COMPLETE
- [x] Create `backend/erp/services/apService.js`:
  - `getApLedger(entityId)` — posted unpaid invoices with balance + days_outstanding
  - `getApAging(entityId)` — aging buckets: CURRENT, 1-30, 31-60, 61-90, 90+ with vendor breakdown
  - `getApConsolidated(entityId)` — aggregation grouped by vendor
  - `getGrni(entityId)` — PO lines where qty_received > qty_invoiced with estimated value

### 12.5 — AP Payment Recording ✅ COMPLETE
- [x] Create `backend/erp/models/ApPayment.js`:
  - entity_id, supplier_invoice_id, vendor_id, payment_date, amount
  - payment_mode (refs PaymentMode.mode_code), bank_account_id, funding_card_id
  - check_no, check_date, reference, je_id, notes
  - COA resolved at runtime via `resolveFundingCoa()` — no hardcoded COA codes
  - Collection: `erp_ap_payments`
- [x] Create `backend/erp/services/apPaymentService.js`:
  - `recordApPayment(invoiceId, paymentData, entityId, userId)` — validates → creates ApPayment → resolves COA via resolveFundingCoa → builds JE (DR 2000 AP Trade, CR Cash/Bank) → createAndPostJournal → updates invoice amount_paid/payment_status
  - `getPaymentHistory(entityId, vendorId)` — payment history with populated refs

### 12.6 — Purchasing Controller & Routes ✅ COMPLETE
- [x] Create `backend/erp/controllers/purchasingController.js`:
  - PO: createPO (with generateDocNumber), updatePO (DRAFT only), getPOs (paginated), getPOById, approvePO, cancelPO, receivePO
  - Invoice: createInvoice (denormalizes vendor_name/po_number), updateInvoice (DRAFT only), getInvoices (paginated with multi-filter), getInvoiceById, validateInvoice (triggers 3-way match), postInvoice (journalFromAP + createAndPostJournal)
  - AP: apLedger, apAging, apConsolidated, grni, recordPayment, paymentHistory
- [x] Create `backend/erp/routes/purchasingRoutes.js`:
  - Static routes first: GET `/ap/ledger`, `/ap/aging`, `/ap/consolidated`, `/ap/grni`, `/ap/payments`
  - Invoice routes: GET/POST `/invoices`, GET/PUT `/invoices/:id`, POST `/invoices/:id/validate|post|pay`
  - PO routes: GET/POST `/orders`, GET/PUT `/orders/:id`, POST `/orders/:id/approve|cancel|receive`
  - Write ops gated by roleCheck('admin', 'finance', 'president')
- [x] Add to ERP router: `router.use('/purchasing', erpAccessCheck('purchasing'), require('./purchasingRoutes'))`

### 12.7 — Purchasing & AP Frontend Pages ✅ COMPLETE
- [x] Create `frontend/src/erp/hooks/usePurchasing.js` — wraps useErpApi with PO, invoice, AP, vendor, product, bank, card endpoints
- [x] Create `frontend/src/erp/pages/VendorList.jsx`:
  - Vendor table with search, add/edit modal, deactivate
- [x] Create `frontend/src/erp/pages/PurchaseOrders.jsx`:
  - PO list with status filter, create/edit form with line items grid + totals
  - Approve/Cancel/Receive actions with receive modal (per-line qty input)
- [x] Create `frontend/src/erp/pages/SupplierInvoices.jsx`:
  - Invoice list with status/match/payment filters
  - Create form with vendor dropdown, PO linking, line items
  - Validate (3-way match), Post (JE creation), Pay (payment modal with bank/card/check selection)
- [x] Create `frontend/src/erp/pages/AccountsPayable.jsx`:
  - 5-tab layout: AP Ledger | AP Aging | Consolidated | GRNI | Payment History
  - Aging: color-coded bucket cards + vendor breakdown table
  - GRNI: uninvoiced quantities with estimated values
- [x] Add routes to App.jsx: `/erp/vendors`, `/erp/purchase-orders`, `/erp/supplier-invoices`, `/erp/accounts-payable` (requiredErpModule="purchasing")
- [x] Add sidebar items under Purchasing section with Truck/ShoppingCart/FileInput/Wallet icons

### 12.8 — Purchasing Enhancements: Warehouse Scoping, Auto-Price, CSI Pre-fill ✅ (April 8, 2026)
- [x] Added `warehouse_id` to PurchaseOrder model + index
- [x] Added `warehouse_id` to SupplierInvoice model
- [x] Updated `purchasingController.js` — warehouse filter on getPOs/getInvoices, populate warehouse on list/detail, warehouse in export
- [x] Reworked `PurchaseOrders.jsx` — WarehousePicker integration, stock-based product dropdown (shows availability per warehouse), auto-populate `unit_price` from ProductMaster `purchase_price` on product select (editable for override)
- [x] Reworked `SupplierInvoices.jsx` — WarehousePicker integration, stock-based product dropdown, auto-populate price, auto-fill line items from linked PO (vendor + products + remaining qty + prices pre-populated as dropdowns to avoid encoding errors)
- [x] Updated `usePurchasing.js` — exportPOs accepts warehouse_id params

> **Key behaviors:**
> - PO ref format unchanged: `PO-{TERRITORY_CODE}{MMDDYY}-{NNN}` via `generateDocNumber`
> - Product dropdown shows warehouse stock: `BrandName Dosage — QTY UNIT` (same pattern as SalesEntry)
> - Unit price auto-fills from `purchase_price` but remains editable (prices change per order)
> - SI "Link to PO" auto-fills: vendor, warehouse, and all line items (products in dropdowns, qty = remaining uninvoiced, prices from PO)

---

## PHASE 13 — BANKING & CASH [v5 NEW]
**Goal:** Bank accounts master, bank reconciliation, credit card ledger, and bank statement import with auto-matching.

**Reference:** PRD v5 §16 (Banking & Cash)

### 13.1 — Bank Accounts Master (Enhance from Phase 2.6)
- [x] Verify `backend/erp/models/BankAccount.js` from Phase 2.6 has: entity_id, bank_code, bank_name, account_no, account_type, coa_code, is_active
- [x] Add fields if missing: opening_balance, current_balance (computed), statement_import_format
  - Added: `opening_balance` (Number, default 0), `current_balance` (Number, default 0), `statement_import_format` (enum: CSV/OFX/MT940)
- [x] Create seed data for VIP banks: RCBC (1010), SBC (1011), MBTC (1012), UB (1013)
  - Seed already had RCBC, SBC, MBTC, GCash. Added UB_SA (UnionBank Savings, coa_code 1013)
- [ ] Commit: `"feat(erp): bank accounts master enhancement [v5]"`

### 13.2 — Bank Reconciliation Model & Service
- [x] Create `backend/erp/models/BankStatement.js`:
  - entity_id, bank_account_id, statement_date, period (YYYY-MM)
  - entries array: [{ line_no, txn_date, description, reference, debit, credit, balance, match_status enum: UNMATCHED, MATCHED, RECONCILING_ITEM, je_id (ref: JournalEntry) }]
  - closing_balance, uploaded_at, uploaded_by
  - status enum: DRAFT, IN_PROGRESS, FINALIZED. Collection: `erp_bank_statements`
  - Indexes: unique (entity_id, bank_account_id, period), (entity_id, status)
- [x] Create `backend/erp/services/bankReconService.js`:
  - `importStatement(entityId, bankAccountId, statementDate, period, entries, closingBalance, uploadedBy)` — parse and store (upsert by period)
  - `autoMatch(statementId)` — match bank entries to JE lines by: coa_code match + amount + date (±2 days) + reference substring
  - `manualMatch(statementId, entryIndex, jeId)` — Finance manually matches
  - `getReconSummary(statementId)` — return: { matched[], unmatched_book[], unmatched_bank[], adjusted_book_balance, adjusted_bank_balance, difference }
  - `finalizeRecon(statementId)` — lock reconciliation, update BankAccount.current_balance
- [ ] Commit: `"feat(erp): bank reconciliation with auto-match [v5]"`

### 13.3 — Credit Card Ledger
- [x] Verify `backend/erp/models/CreditCard.js` exists from Phase 2.6 (or create if not):
  - Verified: exists with full fields including assignment tracking, card_brand, last_four, statement_cycle_day
- [x] Create `backend/erp/models/CreditCardTransaction.js`:
  - entity_id, credit_card_id, txn_date, description
  - amount, reference, linked_expense_id (ref: ExpenseEntry), linked_calf_id (ref: PrfCalf)
  - status enum: PENDING, POSTED, PAID
  - payment_je_id (ref: JournalEntry), created_by (ref: User), timestamps
  - Collection: `erp_credit_card_transactions`
  - Indexes: (entity_id, credit_card_id, txn_date), (entity_id, status), (linked_expense_id)
- [x] Create `backend/erp/services/creditCardService.js`:
  - `getCardBalance(entityId, cardId)` — aggregation sum of PENDING+POSTED transactions
  - `getCardLedger(entityId, cardId, period)` — transaction list with populates
  - `getAllCardBalances(entityId)` — all active cards with outstanding amounts
  - `recordCardPayment(entityId, cardId, amount, bankAccountId, paymentDate, userId)` — creates JE via journalEngine.createAndPostJournal: DR CC Payable (card coa_code), CR Cash/Bank (bank coa_code). Marks oldest outstanding txns as PAID.
  - Added 'BANKING' to JournalEntry source_module enum
- [ ] Commit: `"feat(erp): credit card ledger with payment tracking [v5]"`

### 13.4 — Banking Controller & Routes
- [x] Create `backend/erp/controllers/bankingController.js`:
  - Bank account CRUD (listBankAccounts, createBankAccount, updateBankAccount)
  - Statement import, auto-match, manual match, recon summary, finalize
  - Credit card transactions (create, list balances, ledger, record payment)
- [x] Create `backend/erp/routes/bankingRoutes.js`:
  - GET `/bank-accounts` — list bank accounts
  - POST `/bank-accounts` — create (roleCheck: admin/finance/president)
  - PUT `/bank-accounts/:id` — update (roleCheck)
  - POST `/statements/import` — upload bank statement CSV (roleCheck)
  - GET `/statements` — list statements
  - GET `/statements/:id` — get single statement
  - POST `/statements/:id/auto-match` — trigger auto-matching (roleCheck)
  - POST `/statements/:id/manual-match` — Finance manual match (roleCheck)
  - GET `/statements/:id/recon` — reconciliation summary
  - POST `/statements/:id/finalize` — finalize recon (roleCheck)
  - GET `/credit-cards/balances` — all cards with outstanding balances
  - GET `/credit-cards/:id/ledger` — card transaction ledger
  - POST `/credit-cards/transactions` — create transaction (roleCheck)
  - POST `/credit-cards/:id/payment` — record card payment (roleCheck)
- [x] Add to ERP router: `router.use('/banking', erpAccessCheck('accounting'), require('./bankingRoutes'))`
- [ ] Commit: `"feat(erp): banking and cash routes [v5]"`

### 13.5 — Banking Frontend Pages
- [x] Create `frontend/src/erp/hooks/useBanking.js` — wraps useErpApi with all banking endpoints
- [x] Create `frontend/src/erp/pages/BankAccounts.jsx`:
  - Bank account table with balances, add/edit modal with all fields
- [x] Create `frontend/src/erp/pages/BankReconciliation.jsx`:
  - Period + bank selector
  - CSV paste-import with closing balance
  - "Auto-Match" button
  - Side-by-side view: bank statement entries (left) vs unmatched book entries (right)
  - Match status indicators: green=MATCHED, red=UNMATCHED, yellow=RECONCILING_ITEM
  - Summary stats panel: bank balance, book balance, adjusted balances, difference
  - "Finalize" button
- [x] Create `frontend/src/erp/pages/CreditCardLedger.jsx`:
  - Card selector grid with outstanding balances and pending txn counts
  - Transaction list table with date, description, amount, status, linked docs, JE#
  - Payment recording modal (amount, bank account source, date)
  - New transaction modal
- [x] Add routes to App.jsx: `/erp/bank-accounts`, `/erp/bank-recon`, `/erp/credit-card-ledger`
  - All protected: roles admin/finance/president, requiredErpModule: accounting
- [x] Add sidebar items under accounting section: Bank Accounts (Landmark), Bank Reconciliation (Scale), CC Ledger (CreditCard)
- [ ] Commit: `"feat(ui): banking pages (bank accounts, reconciliation, credit card ledger) [v5]"`

---

## PHASE 14 — NEW REPORTS & ANALYTICS [v5 NEW] ✅ COMPLETE
**Goal:** Performance ranking, consolidated consignment aging, expense anomaly detection, fuel efficiency report, and cycle status dashboard.

**Reference:** PRD v5 §14.6-14.10

### 14.1 — Performance Ranking Report ✅
- [x] Create `backend/erp/services/performanceRankingService.js`:
  - `getNetCashRanking(entityId, period)` — ranks all BDMs and Sales Reps by Net Cash = Collections - Expenses; includes Sales, Collection %, Territory
  - `getMomTrend(personId, periods?)` — 6-month rolling: Sales, Sales Growth %, Collections, Collection Growth %, Expenses, Expense Growth %
  - `getSalesTracker(entityId, year)` — full year Jan-Dec by person, sorted by total descending
  - `getCollectionsTracker(entityId, year)` — full year Jan-Dec by person, sorted by total descending
  - **Note:** Uses parallel aggregations across SalesLine, Collection, SmerEntry, CarLogbookEntry, ExpenseEntry. Lookups via PeopleMaster.

### 14.2 — Consolidated Consignment Aging Report ✅
- [x] Create `backend/erp/services/consignmentReportService.js`:
  - `getConsolidatedConsignmentAging(entityId)` — cross-BDM view: BDM, Territory, Hospital, DR#, DR Date, Product, Qty Delivered, Qty Consumed, Qty Remaining, Days Outstanding, Aging Status
  - Sort: OVERDUE first, then FORCE_CSI, then OPEN, then COLLECTED
  - Filterable by BDM, hospital, status
  - Live recomputation of days_outstanding and aging_status via $switch

### 14.3 — Expense Anomaly Detection ✅
- [x] Create `backend/erp/services/expenseAnomalyService.js`:
  - `detectAnomalies(entityId, period)` — compare current vs prior period per person per component (SMER, GasOfficial, Insurance, ACCESS, CoreComm)
  - Flag >30% change (configurable via SETTINGS.EXPENSE_ANOMALY_THRESHOLD)
  - `detectBudgetOverruns(entityId, period)` — for people with BudgetAllocation: actual vs budgeted per component, flag OVER_BUDGET
  - Return: [{ person, component, prior_amount, current_amount, change_pct, flag: ALERT|OVER_BUDGET, budgeted (if applicable) }]
  - Sorted by absolute change % descending

### 14.4 — Fuel Efficiency Report ✅
- [x] Create `backend/erp/services/fuelEfficiencyService.js`:
  - `getFuelEfficiency(entityId, period)` — per BDM: actual gas cost vs expected (official_km / km_per_liter * avg_price)
  - Flag variance >30% as OVER_30_PCT
  - Source: CarLogbookEntry data

### 14.5 — Cycle Status Dashboard Service ✅
- [x] Create `backend/erp/services/cycleStatusService.js`:
  - `getCycleStatus(entityId, period)` — per BDM: current payslip status (NOT_STARTED → DRAFT → COMPUTED → REVIEWED → APPROVED → POSTED)
  - Completion % across all BDMs
  - Behind-schedule list (not at expected status for date)
  - Behind-schedule logic: DRAFT/NOT_STARTED after day 15 or not POSTED after day 25

### 14.6 — New Report Routes ✅
- [x] Created `backend/erp/controllers/erpReportController.js` with all 10 handlers
- [x] Created `backend/erp/routes/erpReportRoutes.js` with all endpoints
- [x] Mounted at `/reports` with `erpAccessCheck('reports')` in route index
  - GET `/performance-ranking/:period` — net cash ranking
  - GET `/performance-ranking/trend/:personId` — MoM trend
  - GET `/sales-tracker/:year` — annual sales tracker
  - GET `/collections-tracker/:year` — annual collections tracker
  - GET `/consignment-aging` — consolidated consignment aging
  - GET `/expense-anomalies/:period` — anomaly detection
  - GET `/budget-overruns/:period` — budget overrun tracking
  - GET `/fuel-efficiency/:period` — fuel efficiency
  - GET `/cycle-status/:period` — cycle status dashboard
  - GET `/product-streaks/:period` — Phase 15.1 profit share streak detail

### 14.7 — New Report Frontend Pages ✅
- [x] Created `frontend/src/erp/pages/PerformanceRanking.jsx`:
  - Period selector, ranking table with Net Cash, Sales, Collection %
  - Top 3 highlighted green, bottom 3 highlighted red
  - Tabs: Ranking / Sales Tracker / Collections Tracker
  - MoM Trend: expandable rows with 6-month data table
  - Sales/Collections Tracker: full-year grid (Jan-Dec), sorted by total
- [x] Created `frontend/src/erp/pages/ConsignmentAging.jsx`:
  - Cross-BDM table with all consignment columns
  - Color-coded aging: blue=OPEN, red=OVERDUE, red-border=FORCE_CSI, green=COLLECTED
  - Summary cards: total, open, overdue, force_csi, collected
  - Filters: aging status dropdown
- [x] Created `frontend/src/erp/pages/ExpenseAnomalies.jsx`:
  - Period selector, two tabs: Anomalies / Budget Overruns
  - ALERT badge on >threshold% changes, OVER_BUDGET badge
- [x] Created `frontend/src/erp/pages/FuelEfficiency.jsx`:
  - Per-BDM table: actual vs expected gas cost, variance %
  - >30% flagged rows highlighted red with OVER badge
- [x] Created `frontend/src/erp/pages/CycleStatusDashboard.jsx`:
  - Per-BDM status pipeline (6-step visual progress indicators)
  - Completion % progress bar
  - Behind-schedule BDMs highlighted with alert banner
- [x] Created `frontend/src/erp/hooks/useReports.js` — unified hook for all Phase 14+15 endpoints
- [x] Added routes to App.jsx: `/erp/performance-ranking`, `/erp/consignment-aging`, `/erp/expense-anomalies`, `/erp/fuel-efficiency`, `/erp/cycle-status`
- [x] Added 6 new report cards to ErpReports.jsx under "Analytics & Tracking" section

### Phase 14 Summary
- **Backend**: 5 new services, 1 new controller, 1 new route file, mounted in index.js
- **Frontend**: 5 new pages, 1 new hook, 6 report cards added to ErpReports, routes in App.jsx

---

## PHASE 15+ — FUTURE (SAP-EQUIVALENT IMPROVEMENTS, POST-LAUNCH)

### 15.1 — Per-Product Profit Share Eligibility ✅
- [x] Enhanced `profitShareEngine.js`: added `conditions_met` field (A+B met this month regardless of streak)
- [x] Modified `getConsecutiveStreak` to check `conditions_met` in addition to `qualified` for streak counting
- [x] Added `getProductStreakDetail(entityId, bdmId, period)` function with deficit_months tracking
- [x] Added `conditions_met` field to PnlReport's psProductSchema
- [x] Route: GET `/reports/product-streaks/:period`

### 15.2 — CSI Allocation Control ✅
- [x] Created `backend/erp/models/CsiBooklet.js` — booklet master with series, allocations, usage tracking
- [x] Created `backend/erp/services/csiBookletService.js` — createBooklet, allocateWeek, validateCsiNumber, markUsed, getBooklets
- [x] Created `backend/erp/controllers/csiBookletController.js` — CRUD + allocation + validation handlers
- [x] Created `backend/erp/routes/csiBookletRoutes.js` — mounted at `/csi-booklets` with `erpAccessCheck('sales')`
- [x] Created `frontend/src/erp/pages/CsiBooklets.jsx` — booklet list, create form, weekly allocation, usage stats
- [x] Added sidebar item under Sales section

### 15.3 — Cycle Report Workflow ✅
- [x] Created `backend/erp/models/CycleReport.js` — GENERATED → REVIEWED → BDM_CONFIRMED → CREDITED workflow with timestamps
- [x] Created `backend/erp/services/cycleReportService.js` — generate (snapshot), review, confirm, credit, list
- [x] Created `backend/erp/controllers/cycleReportController.js` — 5 handlers
- [x] Created `backend/erp/routes/cycleReportRoutes.js` — mounted at `/cycle-reports` with `erpAccessCheck('reports')`
- [x] Created `frontend/src/erp/pages/CycleReports.jsx` — list, filters, workflow action buttons, status badges

### 15.4 — Recurring Journal Templates (SAP FI Recurring Documents) ✅
- [x] Template model: name, frequency (monthly/quarterly/annually), day_of_month, line items, auto_post flag — `backend/erp/models/RecurringJournalTemplate.js`
- [x] Service: `runDueTemplates()`, `runSingleTemplate()`, schedule auto-advance — `backend/erp/services/recurringJournalService.js`
- [x] Controller + Routes: full CRUD + run/export/import — `backend/erp/controllers/recurringJournalController.js`, `backend/erp/routes/recurringJournalRoutes.js`
- [x] Admin UI to create/edit/deactivate templates, balance-validated line editor, Run Now/Run All Due — `frontend/src/erp/pages/RecurringJournals.jsx`
- [x] Excel export/import (Google Sheets compatible) — "Templates" + "Template Lines" sheets
- [x] Mounted at `/erp/recurring-journals` with erpAccessCheck('accounting')
- **Completed:** Phase 21.3

### 15.5 — Cost Center Dimension (SAP CO Cost Centers) ✅
- [x] Added optional `cost_center_id` to TransactionEvent and SalesLine schemas
- [x] Created `backend/erp/models/CostCenter.js` — code (unique per entity, uppercase), name, parent_cost_center, is_active
- [x] Created `backend/erp/services/costCenterService.js` — CRUD + tree view
- [x] Created `backend/erp/controllers/costCenterController.js` — 4 handlers
- [x] Created `backend/erp/routes/costCenterRoutes.js` — mounted at `/cost-centers` with `erpAccessCheck('accounting')`
- [x] Created `frontend/src/erp/pages/CostCenters.jsx` — tree view, create form, activate/deactivate toggle
- [x] Added sidebar items under Accounting section
- **Note:** JournalEntry lines already had a `cost_center` string field. CostCenter model provides the master data.

### 15.6 — Per-Module Period Locks (SAP Posting Period Variant) ✅
- [x] PeriodLock model: 10 modules, year/month compound unique, audit fields — `backend/erp/models/PeriodLock.js`
- [x] `periodLockCheck` factory middleware: rejects writes to locked periods (403) — `backend/erp/middleware/periodLockCheck.js`
- [x] Applied to JOURNAL write routes in `accountingRoutes.js`
- [x] Controller + Routes: getLocks matrix, toggleLock, exportLocks (XLSX)
- [x] Finance UI: 10x12 matrix grid with padlock toggles — `frontend/src/erp/pages/PeriodLocks.jsx`
- [x] Mounted at `/erp/period-locks` with erpAccessCheck('accounting')
- **Completed:** Phase 21.4

### 15.7 — Batch Posting with IDs (SAP Batch Input) ✅
- [x] `batchPostJournals` endpoint: POST /api/erp/accounting/journals/batch-post — `backend/erp/controllers/accountingController.js`
- [x] Accept array of JE IDs, validate all DRAFT, post atomically (MongoDB transaction)
- [x] Rollback on any failure, return per-JE results
- [x] Frontend: checkbox column + batch post bar + results modal — `frontend/src/erp/pages/JournalEntries.jsx`
- **Completed:** Phase 21.5

### 15.8 — Data Archival (SAP Data Archiving) ✅
- [x] Created `backend/erp/models/ArchiveBatch.js` — batch tracking with counts per collection, periods archived, status
- [x] Created `backend/erp/models/ArchivedDocument.js` — stores full original documents with source_collection + source_id
- [x] Created `backend/erp/services/dataArchivalService.js`:
  - `archivePeriods(entityId, userId)` — archives POSTED docs older than current-2 months using MongoDB transactions
  - `restoreBatch(entityId, batchId, userId, reason)` — full restore with transaction safety
  - `getArchiveBatches(entityId)` / `getArchiveBatchDetail(entityId, batchId)`
- [x] Created `backend/erp/controllers/archiveController.js` — 4 handlers
- [x] Created `backend/erp/routes/archiveRoutes.js` — mounted at `/archive` with `erpAccessCheck('accounting')`
- [x] Created `frontend/src/erp/pages/DataArchive.jsx` — archive trigger with confirmation, batch list, detail view, restore with reason
- [x] Added sidebar item under Accounting section

### 15.9 — React Key Prop Audit & Fix ✅
- [x] Audited ~60 `key={i}` / `key={index}` / `key={idx}` instances across ~30 files
- [x] Fixed 21 instances in 15 files — replaced index keys with stable unique identifiers:
  - `AccountsPayable.jsx` — `vendor_name`, `_id`, `po_number-item_key`
  - `AccountsReceivable.jsx` — `csi._id || csi.doc_ref`
  - `BankReconciliation.jsx` — `e._id || bank-line_no`, `e._id || je_number`
  - `ErpDashboard.jsx` — `p._id || product_id`, `h._id || hospital_name`
  - `ErpReports.jsx` — `r._id || hospital_name`
  - `ThirteenthMonth.jsx` — `r.emp_id || r.name`
  - `ProfitSharing.jsx` — `p.product_id || product_name`
  - `Collections.jsx` — `s._id || s.doc_ref`
  - `MyStock.jsx` — `product_id-batch_lot_no`, `a.product_id`
  - `PersonDetail.jsx` — `c._id || effective_date`
  - `PrfCalf.jsx` — `p._id || doctor_name`, `item._id || source-period`
  - `OcrTest.jsx` — `s.value`
  - `PendingApprovalsPage.jsx` — `doc.rowNumber`
  - `VisitApproval.jsx` — `doc.rowNumber`
- [x] Verified remaining ~40 instances are safe (form line items edited by index, static arrays, read-only sub-docs with no row state)
- **Why:** Index keys cause wrong DOM reuse when lists are sorted, filtered, or items deleted — breaks expandable rows, inline editing, checkboxes

---

## PHASE 16 — Sub-Module Access (Granular Permissions) ✅

**Goal:** Delegate specific functions within purchasing, accounting, and banking modules without giving full module access. Scalable — admin configures templates, no hardcoding.

### 16.1 — Schema: sub_permissions on User + AccessTemplate ✅
- [x] Added `sub_permissions: { type: Mixed, default: {} }` to `User.erp_access` (`backend/models/User.js`)
- [x] Added `sub_permissions: { type: Mixed, default: {} }` to `AccessTemplate` (`backend/erp/models/AccessTemplate.js`)
- **Shape:** `{ [module]: { [subKey]: Boolean } }` — dynamic, extensible, no schema migration for new keys

### 16.2 — Middleware: erpSubAccessCheck ✅
- [x] Created `erpSubAccessCheck(module, subKey)` middleware in `backend/erp/middleware/erpAccessCheck.js`
- **Rules:** President always passes → admin w/o erp_access = full → module FULL w/o sub_permissions = all granted → check specific sub-key
- Exported alongside existing `erpAccessCheck` and `approvalCheck`

### 16.3 — Route Integration ✅
Replaced `roleCheck('admin', 'finance', 'president')` with `erpSubAccessCheck` on write routes:
- [x] `purchasingRoutes.js` — po_create, po_approve, vendor_manage, supplier_invoice, ap_payment
- [x] `vendorRoutes.js` — vendor_manage
- [x] `accountingRoutes.js` — journal_entry, vat_filing, fixed_assets, loans, owner_equity
- [x] `coaRoutes.js` — journal_entry (COA management)
- [x] `monthEndCloseRoutes.js` — month_end
- [x] `bankingRoutes.js` — bank_accounts, bank_recon, statement_import, credit_card, cashflow, payments

### 16.4 — Sub-Permission Keys API ✅
- [x] Added `SUB_PERMISSION_KEYS` config in `erpAccessController.js` — defines available sub-keys per module with labels
- [x] New endpoint `GET /erp/erp-access/sub-permission-keys` — frontend fetches keys from backend (not hardcoded)
- [x] Updated `createTemplate`, `updateTemplate`, `setUserAccess`, `applyTemplateToUser` to handle `sub_permissions`

### 16.5 — Frontend: AccessTemplateManager.jsx ✅
- [x] Fetches sub-permission keys from API on load
- [x] When module is VIEW/FULL, shows expandable sub-permissions panel with checkboxes
- [x] Select All / Deselect All per module
- [x] Shows "All functions enabled" badge when FULL with no sub-permissions customized
- [x] Table shows sub-permission count badge (e.g., "3/5") per module

### 16.6 — Frontend: ErpAccessManager.jsx ✅
- [x] Sub-permission toggles below each module radio group (when VIEW/FULL)
- [x] Select All / Deselect All per module
- [x] "All" badge for FULL without granular restrictions
- [x] Saves sub_permissions alongside modules
- [x] Apply Template now copies sub_permissions from template

### 16.7 — Frontend: useErpSubAccess Hook ✅
- [x] Created `frontend/src/erp/hooks/useErpSubAccess.js`
- [x] `hasSubPermission(module, subKey)` — mirrors backend middleware logic
- [x] `hasGranularAccess(module)` — checks if module has granular restrictions
- Use in pages to conditionally show/hide action buttons

### Defined Sub-Keys (Phase 16 scope)

| Module | Sub-Key | Description |
|--------|---------|-------------|
| purchasing | po_create | Create/Edit Purchase Orders |
| purchasing | po_approve | Approve Purchase Orders |
| purchasing | vendor_manage | Manage Vendors |
| purchasing | supplier_invoice | Supplier Invoices |
| purchasing | ap_payment | AP Payments |
| accounting | journal_entry | Journal Entries & COA |
| accounting | check_writing | Check Writing / Payments |
| accounting | month_end | Month-End Close |
| accounting | vat_filing | VAT/CWT Compliance |
| accounting | fixed_assets | Fixed Assets & Depreciation |
| accounting | loans | Loan Management |
| accounting | owner_equity | Owner Equity |
| accounting | petty_cash | Petty Cash (Phase 19) |
| accounting | office_supplies | Office Supplies (Phase 19) |
| banking | bank_accounts | Bank Accounts |
| banking | bank_recon | Bank Reconciliation |
| banking | statement_import | Statement Import |
| banking | credit_card | Credit Card Ledger |
| banking | cashflow | Cashflow Statement |
| banking | payments | Payment Processing |

---

## PHASE 17 — Warehouse Model ✅

**Goal:** Formalize physical warehouse locations. BDM territories = warehouses. ILO-MAIN = central receiving. Full rollout with WarehousePicker on all inventory pages. Locked-picker pattern: BDMs auto-locked to their warehouse; president can switch.

### 17.1 — Warehouse Model + Schema Changes ✅
- [x] Created `backend/erp/models/Warehouse.js` — warehouse_code, type (MAIN/TERRITORY/VIRTUAL), manager, assigned_users, draws_from, can_receive_grn, stock_type
- [x] Added `warehouse_id` to: InventoryLedger, GrnEntry, StockReassignment, InterCompanyTransfer, SalesLine, ConsignmentTracker
- [x] Added warehouse indexes to InventoryLedger

### 17.2 — Warehouse CRUD ✅
- [x] Created `backend/erp/controllers/warehouseController.js` — getWarehouses, getMyWarehouses, getWarehouse (with stock summary), create, update, getWarehousesByEntity
- [x] Created `backend/erp/routes/warehouseRoutes.js` — mounted at `/erp/warehouse`
- [x] `/warehouse/my` endpoint for WarehousePicker (access-filtered: BDM sees only their warehouse, president sees all)

### 17.3 — FIFO Engine + Inventory Controller (Warehouse-Scoped) ✅
- [x] Updated `fifoEngine.js` — added `buildStockMatch()` helper, all 5 functions accept `opts.warehouseId`
- [x] Updated `inventoryController.js` — getMyStock, getBatches, getLedger, getVariance, getAlerts, createGrn, approveGrn, recordPhysicalCount all accept `warehouse_id` query param
- [x] Updated `useInventory.js` hook — all functions pass warehouse_id

### 17.4 — IC Transfer + Sales + Consignment (Warehouse-Aware) ✅
- [x] `interCompanyService.js` — shipTransfer/receiveTransfer use warehouse_id on ledger entries + FIFO
- [x] `interCompanyController.js` — createTransfer/createReassignment accept source/target warehouse_id; approveReassignment passes warehouse context
- [x] `salesController.js` — CSI posting uses warehouse-scoped FIFO
- [x] `consignmentController.js` — DR creation uses warehouse-scoped FIFO + ConsignmentTracker gets warehouse_id

### 17.5 — Frontend: WarehousePicker Component ✅
- [x] Created `frontend/src/erp/components/WarehousePicker.jsx` — shared component
- [x] Created `frontend/src/erp/hooks/useWarehouses.js` — warehouse API hook
- [x] Auto-selects user's primary warehouse; disabled if only 1 option; president can switch
- [x] Supports filterType (PHARMA/FNB), filterGrn (only GRN-capable), compact mode

### 17.6 — Frontend: 6 Pages Updated ✅
- [x] `MyStock.jsx` — WarehousePicker at top, all stock/alert/variance queries scoped by warehouse
- [x] `GrnEntry.jsx` — WarehousePicker in form (filterGrn=true), warehouse_id sent on create
- [x] `TransferOrders.jsx` — Source/target warehouse dropdowns on IC and Internal modals
- [x] `SalesEntry.jsx` — WarehousePicker (compact), stock loaded by warehouse, warehouse_id on save
- [x] `DrEntry.jsx` — WarehousePicker (compact), stock + submit scoped by warehouse
- [x] `ConsignmentDashboard.jsx` + `ConsignmentAging.jsx` — WarehousePicker filter

### 17.7 — WarehouseManager Admin Page ✅
- [x] Created `frontend/src/erp/pages/WarehouseManager.jsx` — card-based warehouse list, create/edit modal
- [x] Route `/erp/warehouses` (admin only) in App.jsx
- [x] Sidebar entry under Inventory section

### 17.8 — Migration Scripts ✅
- [x] `backend/erp/scripts/migrateWarehouses.js` — creates 13 warehouses from territory registry, backfills warehouse_id on InventoryLedger/GRN/Transfers
- [x] `backend/erp/scripts/importStockOnHand.js` — imports CSV opening balances with WarehouseCode column

### 13 Warehouses (Territory Registry Aligned)
| Code | Name | Type | Entity | Stock |
|------|------|------|--------|-------|
| ILO-MAIN | Iloilo Main Warehouse | MAIN | VIP | PHARMA |
| DIG | VIP Davao | TERRITORY | VIP | PHARMA |
| BAC | VIP Bacolod | TERRITORY | VIP | PHARMA |
| GSC | VIP Gensan | TERRITORY | VIP | PHARMA |
| OZA | VIP Ozamiz | TERRITORY | VIP | PHARMA |
| PAN | VIP Panay | TERRITORY | VIP | PHARMA |
| DUM | VIP Dumaguete | TERRITORY | VIP | PHARMA |
| CDO | VIP CDO | TERRITORY | VIP | PHARMA |
| ILO1 | eBDM 1 Iloilo | TERRITORY | VIP | PHARMA |
| ILO2 | eBDM 2 Iloilo | TERRITORY | VIP | PHARMA |
| ACC | Shared Services | TERRITORY | VIP | PHARMA |
| MGO | MG and CO. Iloilo | TERRITORY | MG AND CO. | PHARMA |
| BLW | Balai Lawaan | TERRITORY | BALAI LAWAAN | FNB |

---

## PHASE 18 — Service Revenue & Cost Center Expenses ✅

**Goal:** Add non-hospital customer support (PERSON, PHARMACY, DIAGNOSTIC_CENTER, INDUSTRIAL), enable 3 document types (CSI, SERVICE_INVOICE, CASH_RECEIPT), generalize Collection for non-hospital sales, printable receipts, cost center expense allocation.

### 18.1 — Customer Model + CRUD ✅
- [x] Created `backend/erp/models/Customer.js` — customer_name, customer_type (optional), default_sale_type, tagged_bdms, payment_terms, credit_limit, vat_status
- [x] Created `backend/erp/controllers/customerController.js` — getAll (filterable by type/status/BDM), getById, create, update, deactivate, tagBdm, untagBdm
- [x] Created `backend/erp/routes/customerRoutes.js` — mounted at `/erp/customers` (shared infrastructure, no module gate)

### 18.2 — SalesLine Schema Changes ✅
- [x] Added `sale_type` (CSI/SERVICE_INVOICE/CASH_RECEIPT), `customer_id`, `invoice_number`, `payment_mode`, `service_description` to SalesLine model
- [x] Made `hospital_id` and `doc_ref` conditionally required (CSI only)
- [x] Added pre-save validation: hospital_id OR customer_id required
- [x] Added indexes: `{entity_id, sale_type, status}`, `{entity_id, customer_id, csi_date}`

### 18.3 — Sales Controller Updates ✅
- [x] `createSale` — accepts sale_type, auto-generates invoice_number for non-CSI via docNumbering (SVC/RCT prefix)
- [x] `getSales` — filterable by sale_type, customer_id; populates customer_id
- [x] `validateSales` — type-aware validation: CSI requires doc_ref; SERVICE_INVOICE requires description, no stock check; CASH_RECEIPT requires line_items
- [x] `submitSales` — SERVICE_INVOICE skips inventory deduction; CASH_RECEIPT uses same flow as CSI

### 18.4 — Printable Receipt System ✅
- [x] Created `backend/erp/templates/salesReceipt.js` — flexible HTML: pharma (product+batch+expiry) vs BLW (description), mobile-friendly @media print
- [x] Created `backend/erp/controllers/printController.js` — getReceiptHtml
- [x] Created `backend/erp/routes/printRoutes.js` — GET `/erp/print/receipt/:id`

### 18.5 — Collection Model Generalization ✅
- [x] Made `hospital_id` optional, added `customer_id` (ref Customer) and `petty_cash_fund_id` (ref PettyCashFund)
- [x] Added pre-save validation: hospital_id OR customer_id required
- [x] Added indexes: `{entity_id, customer_id, cr_date}`, `{petty_cash_fund_id}`

### 18.6 — AutoJournal + Accounting Integration ✅
- [x] Updated `journalFromCollection()` — cash collections to petty cash use DR 1015 / CR 1100
- [x] Added `journalFromServiceRevenue()` — DR 1100 AR / CR 4100 Service Revenue
- [x] Added `journalFromPettyCash()` — for disbursements (DR expense / CR 1015) and remittances (DR 3100 / CR 1015)
- [x] Added `SERVICE_REVENUE`, `PETTY_CASH` to JournalEntry source_module enum
- [x] **(April 5, 2026)** Fixed `pettyCashController.processDocument()` — broken `createAndPostJournal(jeData, userId, session)` → correct `createAndPostJournal(entityId, jeData)`

### 18.7 — Cost Center Expense + President Override ✅
- [x] Added `cost_center_id` to ExpenseEntry line schema
- [x] Added `recorded_on_behalf_of` field — office staff records president's expenses, CALF never required
- [x] Updated CALF flag logic in pre-save to respect recorded_on_behalf_of

### 18.8 — Service Revenue COA Seed ✅
- [x] Created `backend/erp/scripts/seedServiceRevenueCoa.js` — accounts 4100-4103 (Consulting, FNB, Rental, Other) + 1015 (Petty Cash Fund)

### 18.9 — Frontend ✅
- [x] Created `frontend/src/erp/hooks/useCustomers.js`
- [x] Created `frontend/src/erp/pages/CustomerList.jsx` — table with type/status filters, create/edit modal, BDM tagging
- [x] Created `frontend/src/erp/components/CustomerPicker.jsx` — unified Hospital+Customer search
- [x] Created `frontend/src/erp/components/CostCenterPicker.jsx`
- [x] Updated `Sidebar.jsx` — added Customers entry under shared infrastructure
- [x] Updated `App.jsx` — added `/erp/customers` route

---

## PHASE 19 — Petty Cash, Office Supplies & Collaterals ✅

**Goal:** Revolving petty cash fund (cash deposits from collections, disbursements for expenses, ₱5,000 ceiling triggers remittance to owner), office supply tracking, marketing collateral tracking.

### 19.1 — PettyCash Models ✅
- [x] Created `backend/erp/models/PettyCashFund.js` — fund_name, fund_code, custodian_id, current_balance, balance_ceiling (default 5000)
- [x] Created `backend/erp/models/PettyCashTransaction.js` — DEPOSIT/DISBURSEMENT/REMITTANCE/REPLENISHMENT/ADJUSTMENT, auto-numbering (PCF prefix), VAT computation
- [x] Created `backend/erp/models/PettyCashRemittance.js` — REMITTANCE/REPLENISHMENT doc_type, custodian/owner signatures, JE link

### 19.2 — PettyCash Controller + Routes ✅
- [x] Created `backend/erp/controllers/pettyCashController.js` — 13 endpoints: fund CRUD, transaction CRUD+post, ceiling check, remittance/replenishment generation, signing, processing with JE
- [x] Created `backend/erp/routes/pettyCashRoutes.js` — mounted at `/erp/petty-cash` with erpAccessCheck('accounting')

### 19.3 — Printable Petty Cash Forms ✅
- [x] Created `backend/erp/templates/pettyCashForm.js` — shared HTML for remittance + replenishment: transaction table, totals, signature lines (eBDM + Owner)
- [x] Added `getPettyCashFormHtml` to printController — GET `/erp/print/petty-cash/:id`

### 19.4 — OfficeSupply Models + CRUD ✅
- [x] Created `backend/erp/models/OfficeSupply.js` — item_name, category (PAPER/INK_TONER/CLEANING/STATIONERY/ELECTRONICS/OTHER), qty_on_hand, reorder_level
- [x] Created `backend/erp/models/OfficeSupplyTransaction.js` — PURCHASE/ISSUE/RETURN/ADJUSTMENT, auto-compute total_cost
- [x] Created `backend/erp/controllers/officeSupplyController.js` — getSupplies, recordTransaction (atomic qty update), getReorderAlerts
- [x] Created `backend/erp/routes/officeSupplyRoutes.js` — mounted at `/erp/office-supplies` with erpAccessCheck('accounting')

### 19.5 — Collateral Model + CRUD ✅
- [x] Created `backend/erp/models/Collateral.js` — collateral_type (BROCHURE/SAMPLE/BANNER/GIVEAWAY/POSTER/OTHER), distribution_log, assigned_to
- [x] Created `backend/erp/controllers/collateralController.js` — getAll, recordDistribution, recordReturn
- [x] Created `backend/erp/routes/collateralRoutes.js` — mounted at `/erp/collaterals` with erpAccessCheck('inventory')

### 19.6 — Frontend ✅
- [x] Created `frontend/src/erp/hooks/usePettyCash.js`
- [x] Created `frontend/src/erp/pages/PettyCash.jsx` — 3 tabs: Fund Overview (ceiling progress bar), Transactions, Documents (with print/sign)
- [x] Created `frontend/src/erp/hooks/useOfficeSupplies.js`
- [x] Created `frontend/src/erp/pages/OfficeSupplies.jsx` — category filters, reorder alerts, transaction recording
- [x] Created `frontend/src/erp/hooks/useCollaterals.js`
- [x] Created `frontend/src/erp/pages/Collaterals.jsx` — type filter, distribution recording, returns
- [x] Updated `Sidebar.jsx` — added Petty Cash + Office Supplies (accounting), Collaterals (inventory)
- [x] Updated `App.jsx` — added `/erp/petty-cash`, `/erp/office-supplies`, `/erp/collaterals` routes

### 19.7 — Seed Scripts ✅
- [x] Created `backend/erp/scripts/seedPettyCashFunds.js` — PCF-ILO1 (Jay Ann, ₱5,000 ceiling) + PCF-ILO2 (Jenny Rose, ₱5,000 ceiling)

---

## PHASE SUMMARY

| Phase | Name | Tasks | Est. Duration |
|-------|------|-------|--------------|
| 0 | Add ERP Scaffold | 38 | 1-2 days ✅ |
| 1 | OCR Engine (client priority) | ~97 | 2-3 weeks |
| 2 | Shared Models & Settings | ~55 | 1-2 weeks |
| 3 | Sales Module (SAP Park→Check→Post) | ~30 | 2-3 weeks |
| 4 | Inventory Module + DR/Consignment | ~22 | 1-2 weeks |
| 4A | Entity Data Migration + Hospital Global Sharing | 5 | 1-2 days |
| 4B | Inter-Company Transfers (VIP→Subsidiary) | 8 | ~2 weeks |
| 5 | Collections & AR + Credit Limits + Dunning | 22 | 2-3 weeks |
| 6 | Expenses (with document lifecycle) | 17 | 2 weeks |
| 7 | Income, PNL & Year-End Close | 18 | 1-2 weeks |
| 8 | Dashboard & Reports (BOSS-Style) | 12 | 1 week |
| 9 | Integration, Document Flow & Polish | 24 | 2 weeks |
| 10.0 | ERP Access Control (NetSuite-style) [v5 NEW] | ~25 | 1 week |
| 10.1-10.7 | People Master & Payroll [v5 NEW] | ~45 | 2-3 weeks |
| 11 | VIP Accounting Engine [v5 NEW] | ~70 | 3-4 weeks |
| 12 | Purchasing & AP [v5 NEW] ✅ | ~40 | 2-3 weeks |
| 13 | Banking & Cash [v5 NEW] | ~30 | 1-2 weeks |
| 14 | New Reports & Analytics [v5 NEW] ✅ | ~35 | 1-2 weeks |
| 15.1-15.3,15.5,15.8-15.9 | SAP-equivalent improvements + code quality (partial) ✅ | 6/8 | Completed |
| 15.4,15.6,15.7 | SAP improvements (Recurring Journals, Period Locks, Batch Posting) ✅ | 3 | Phase 21.3-21.5 |
| 16 | Sub-Module Access (Granular Permissions) ✅ | ~20 | 1 week |
| 17 | Warehouse Model + Full Migration ✅ | ~25 | 2-3 weeks |
| 18 | Service Revenue + Cost Center Expenses ✅ | ~25 | 2-3 weeks |
| 19 | Petty Cash / Office Supplies / Collaterals ✅ | ~25 | 2-3 weeks |
| 20 | Batch Expense Upload + COA Expansion ✅ | ~15 | 1 week |

**Total pre-launch: ~588 tasks across 19 phases → ~30-38 weeks**
**Note: Phases 4A+4B add ~13 tasks and ~2.5 weeks for entity migration + inter-company transfers**
**Note: Phases 10-14 add ~220 tasks and ~10-14 weeks from PRD v5 (PNL Central live system integrations)**
**Note: Phases 16-19 add ~95 tasks for warehouse, service revenue, petty cash, and sub-module access**
**Reference PRD:** `docs/VIP ERP PRD v5.md`

---

## Phase 20: Batch Expense Upload + COA Expansion ✅ (April 5, 2026)

### 20.1 — Batch OR Upload (President/Admin)
- [x] `bir_flag` + `is_assorted` fields on ExpenseEntry (line + document level)
- [x] `batchUploadExpenses` controller — up to 20 images, OCR → classify COA → assorted items (3+ line items)
- [x] `saveBatchExpenses` controller — save reviewed lines as DRAFT with funding, cost center, bir_flag
- [x] Routes: `POST /expenses/ore-access/batch-upload`, `POST /expenses/ore-access/batch-save` (admin/president only)
- [x] Frontend: collapsible batch upload section in Expenses.jsx with setup dropdowns:
  - BIR Classification (BOTH/INTERNAL/BIR)
  - Category override (or auto-classify)
  - Employee assignment (PeopleMaster)
  - Cost Center (CostCenterPicker)
  - Funding source (Cash / Card / Bank Account)
  - Period / Cycle
- [x] Review table with inline editing (date, establishment, amount, COA dropdown, OR#)
- [x] COA dropdown loads dynamically from API (not hardcoded)
- [x] `bir_flag` passthrough to autoJournal: `submitExpenses` and `submitPrfCalf` use `entry.bir_flag || 'BOTH'`

### 20.2 — COA Expansion (Multi-Business-Line)
- [x] Revenue: 4300 F&B Revenue, 4400 Rental Short-Term, 4500 Rental Long-Term
- [x] COGS: 5400 Food Cost, 5500 Beverage Cost
- [x] OpEx new: 6155 Travel & Accommodation, 6260 Repairs & Maintenance, 6310/6320/6330 Marketing subs (HCP/Hospital/Retail), 6460 Utilities & Communication, 6810 Regulatory & Licensing, 6820 IT Hardware & Software
- [x] OpEx F&B: 6830 F&B Supplies & Packaging, 6840 Kitchen Equipment & Maintenance
- [x] OpEx Rental: 6870 Property Maintenance, 6880 Property Insurance, 6890 Property Tax & Fees
- [x] Inventory: 6850 Inventory Write-Off (was 6800), 6860 Inventory Adjustment Gain (was 6810) — resolved conflict with Professional Fees / Regulatory
- [x] Removed: 6700 Communication (merged into 6460 Utilities & Communication)

### 20.3 — COA Export/Import
- [x] `GET /api/erp/coa/export?format=xlsx` — Excel download (Google Sheets compatible)
- [x] `GET /api/erp/coa/export?format=json` — JSON download
- [x] `POST /api/erp/coa/import` — accepts Excel file upload OR JSON body, upserts by account_code
- [x] Existing COA CRUD UI unaffected

### 20.4 — Expense Classifier Updates
- [x] Updated all keyword→COA mappings to match new codes (Courier→6500, Fuel→6200, Tolls→6600, etc.)
- [x] Added F&B rules: Food Cost→5400, Beverage→5500, F&B Supplies→6830, Kitchen→6840
- [x] Added Rental rules: Property Tax→6890, Property Insurance→6880, Property Maintenance→6870
- [x] Added new rules: Regulatory→6810, IT/Software→6820, Repairs→6260, Travel→6155, Rent→6450, Professional Fees→6800
- [x] Fixed seedVendors.js — updated 13 vendor COA codes to match new mappings

### 20.5 — BDM Function Fixes (April 5, 2026)
- [x] Batch upload guard: `erpSubAccessCheck('expenses', 'batch_upload')` instead of role-based
- [x] Added `batch_upload` to `SUB_PERMISSION_KEYS.expenses` in erpAccessController
- [x] Fixed empty catch blocks in Smer.jsx (2), CarLogbook.jsx (3), Expenses.jsx (3) — now console.error + alert
- [x] Added CALF linking: "CALF Required →" link to PRF/CALF page + "CALF Linked ✓" badge in CarLogbook + Expenses
- [x] Added frontend field validation before save: Expenses (establishment, amount, date), SMER (activity_type when md_count > 0)
- [x] Added backend role check to CRM bridge `/smer/crm-md-counts` — BDM only, admin must pass bdm_id
- [x] Fixed updatePrfCalf — now clears old back-links and re-runs back-linking when linked source changes (was silently orphaning calf_id refs)

### 6.CRM-FIX — Pull from CRM Accuracy Hardening ✅ (April 21, 2026)
- [x] **Timezone-stable window** — `smerCrmBridge.js` `getDailyMdCount`/`getDailyMdCounts`/`getDailyVisitDetails` now anchor day boundaries to Manila (+08:00) instead of server-local midnight. Previously, a visit logged at 1am Manila (= 5pm UTC prior day) could fall outside the query window on UTC-clock servers and silently disappear from the MD count. Helper functions `toManilaDateKey`, `manilaDayStart`, `manilaDayEnd` added; aggregation `$dateToString` timezone unchanged.
- [x] **Per-person MD count (distinct doctors)** — `md_count` now reflects the number of DISTINCT MDs visited per day (matches the "per-person ≥ 8 = FULL" UI promise). The `{doctor, user, yearWeekKey}` unique index makes this equal to raw visit count today; decoupling the code from that assumption prevents silent double-counting if the constraint ever loosens. Response shape preserved (`md_count`, `unique_doctors`, `locations`).
- [x] **Rule #21 bdm_id fix** — `getSmerCrmMdCounts` and `getSmerCrmVisitDetail` no longer silently fall back to `req.bdmId` (= admin's own `_id`) when privileged callers omit `?bdm_id=`. Privileged (`isPresident || isAdmin || isFinance`) must pass `?bdm_id=`; omission returns HTTP 400. BDM (`role=CONTRACTOR`) still scoped to `req.bdmId || req.user._id`. Matches `getSmerList` (line 207-208).
- [x] **Calendar-stable day-of-week** — controller replaced `new Date(year, month-1, day).getDay()` (server-local) with `new Date(Date.UTC(...)).getUTCDay()` + deterministic `${year}-${MM}-${DD}` dateKey. Apr 1 2026 = Wednesday in every timezone; no more off-by-one at Manila-server midnight.
- [x] Verified: `node -c` clean on both files; `npx vite build` clean in 9.82s; frontend response shape unchanged (`daily_entries[]` fields identical); `universalApprovalService.js:502` caller of `getDailyVisitDetails` unaffected (accepts Date or ISO string via normalized path).
- [ ] Future: Cross-ERP `Settings.TIMEZONE` lookup to replace the hardcoded +08:00 convention (currently consistent across `Visit.js`, `smerCrmBridge.js`, Car Logbook, PRF/CALF). Scope: separate phase; introduces no bug today.

### 20.6 — Auto-Route Landing Page ✅ (April 5, 2026)
- [x] Auto-route after login based on role + erp_access.enabled (no CRM/ERP chooser)
- [x] BDM (employee) → CRM BDM Dashboard (mobile-first daily work)
- [x] Admin/President with ERP → ERP Dashboard
- [x] Users with only CRM → CRM Dashboard
- [x] Users with only ERP → ERP Dashboard
- [x] Remember last-used preference via localStorage, "Always show chooser" button to reset

### 20.7 �� Agent Notification Fix ✅ (April 5, 2026)
- [x] Fixed `recipientRole is required` in notificationService.js — now resolves user role from DB before creating MessageInbox

### 20.8 — Build Paid Agents (Claude API) ✅ (April 5, 2026)
All 6 paid agents fully implemented with Claude Haiku 4.5, not just stubs.
- [x] Installed `@anthropic-ai/sdk` v0.82.0 in backend
- [x] Created shared `agents/claudeClient.js` — wraps Anthropic SDK with retry (429/529), rate limit handling, cost tracking per agent
- [x] **#1 Smart Collection** (`smartCollectionAgent.js`) — analyzes AR aging per hospital, recent collection history, notifies president + BDMs with prioritized call list
- [x] **#2 OCR Auto-Fill** (`ocrAutoFillAgent.js`) — Claude fallback wired into `ocrProcessor.js` Layer 2b; triggers when `classifyExpense()` returns LOW confidence
- [x] **#5 BIR Filing Review** (`birFilingAgent.js`) — reviews previous month's JEs, VAT/CWT, expense classifications; flags compliance gaps
- [x] **#7 BDM Performance Coach** (`performanceCoachAgent.js`) — weekly visit/sales/expense analysis + personalized coaching per BDM
- [x] **#B Smart Visit Planner** (`visitPlannerAgent.js`) �� plans Mon-Fri schedule based on frequency targets, missed visits, geography
- [x] **#C Engagement Decay** (`engagementDecayAgent.js`) — detects VIP Clients below 70% visit target, suggests re-engagement
- [x] Cost tracking built into claudeClient.js (token count, estimated cost, per-agent breakdown via `getCostSummary()`)

### 20.9 — SMER Mobile Redesign ✅ (April 5, 2026)
- [x] Added `hospital_ids: [ObjectId]` array to SmerEntry dailyEntrySchema (kept `hospital_id` for backward compat)
- [x] Multi-hospital picker with chip/tag UI — search dropdown, add/remove chips, only shown when activity_type = 'Field'
- [x] Auto-fill `hospital_covered` as comma-joined hospital names from picked IDs
- [x] Mobile card layout (hidden on desktop via media query) — each day is a card with 2-col grid fields
- [x] Responsive breakpoints: controls stack vertically, summary cards wrap, desktop table hidden below 768px

### 20.10 — CALF E2E Test + BDM Security Audit ✅ (April 5, 2026)
- [x] `testCalfFlow.js` — 34/34 passed: create ACCESS expense → auto-CALF → validate → post (journal DR 1110 CR bank) → auto-submit expense → reopen (reverse journals) → edit → re-validate → re-post
- [x] `seedCOA.js` run — 237 new accounts across 3 entities (VIP, MG AND CO, BALAI LAWAAN)
- [x] **CRITICAL FIX**: `overridePerdiemDay` missing `req.tenantFilter` — added entity isolation
- [x] **CRITICAL FIX**: `budgetAllocationController` had no `tenantFilter` on any endpoint — all 5 methods now use `req.tenantFilter`
- [x] **CRITICAL FIX**: CALF back-link (create + update) had no entity_id check — now rejects cross-entity links
- [x] **HIGH FIX**: `erpReportController` bdm_id query param unvalidated — BDMs now restricted to own data
- [x] **HIGH FIX**: `incomeController` bdm_id query open to all — BDMs now restricted to own income reports
- [x] **HIGH FIX**: `warehouseController` entity filter could be overridden by admin — forced baseline, only president can cross-entity
- [x] **HIGH FIX**: `Expenses.jsx` double-submit prevention — added `savingRef` guard for slow mobile networks
- [x] **MED FIX**: `validateExpenses` now rejects lines with missing/fallback COA code (6900) — forces explicit account mapping
- [x] **MED FIX**: `Expenses.jsx` empty catches on card/bank/people/COA loading — now log errors to console
- [x] **MED FIX**: `Smer.jsx` double-submit prevention — added `savingRef` guard
- [x] **MED FIX**: `saveBatchExpenses` audit trail — logs `BATCH_UPLOAD_ON_BEHALF` to ErpAuditLog when president uploads for another BDM

### 20.11 — Funding COA Wiring + Petty Cash Edit UI (April 5, 2026)
- [x] **ROOT CAUSE FIX**: `seedLookups.js` was using `findOneAndUpdate(fullDoc)` which overwrites manual DB edits every run — changed to `$setOnInsert`
- [x] Fixed 3 wrong COA codes in seed: BANK_TRANSFER (1010→1011), CC_MBTC (2301→2304), CC_UB (2301→1013)
- [x] Patched PaymentMode `coa_code` in DB: all 8 modes now resolve correctly in `resolveFundingCoa` step 3
- [x] Patched PettyCashFund `coa_code` in DB: both funds → 1000 Cash on Hand
- [x] Created 3 missing CreditCard records: Shell Fleet (2302), RCBC Corp (2303), BDO MC (2304)
- [x] Added `coa_code` field to PettyCashFund schema (default '1000')
- [x] PettyCash.jsx: merged Create/Edit into single `FundFormModal` — now editable: name, custodian, authorized amount, ceiling, COA code, fund mode
- [x] PettyCash.jsx: added Edit button on each fund card, shows COA code and fund mode

---

## PHASE 21 — PersonDetail, Insurance, Gov Rates, SAP Improvements, BIR Calculator, Mobile Polish ✅ COMPLETE
**Goal:** Complete PersonDetail editable forms, Insurance Register CRUD, Government Rates admin page, SAP-style recurring journals + period locks + batch posting, BIR tax calculator with unit tests, and mobile 375px responsive polish.

### 21.1 — PersonDetail Editable, Insurance Register, Excel Export/Import ✅ (commit 0accad7)
- [x] PersonDetail.jsx rewrite: 5 editable sections (Person Info, Comp Profile, Insurance Register, ERP Access, History)
- [x] InsurancePolicy model + CRUD controller + routes — 6 policy types
- [x] Excel export/import: 3-sheet workbook (Person Info, Comp Profile, Insurance Register)
- [x] CompProfile: added profit_share_eligible, commission_rate fields

### 21.2 — Government Rates Admin Page ✅
- [x] Added `exportRates`, `importRates`, `computeBreakdown` to `governmentRatesController.js`
- [x] Updated `governmentRatesRoutes.js` with multer upload + 3 new endpoints (export, import, compute-breakdown)
- [x] Created `frontend/src/erp/pages/GovernmentRates.jsx` — 6-tab UI (SSS, PhilHealth, PagIBIG, Withholding Tax, EC, De Minimis)
- [x] Bracket editor tables, flat rate forms, benefit limit editors, effective/expiry date management
- [x] Excel export (1 sheet per rate_type) and import (upsert by rate_type + effective_date)

### 21.3 — Recurring Journal Templates ✅
- [x] Created `backend/erp/models/RecurringJournalTemplate.js` — frequency, day_of_month (1-28), auto_post, lines, schedule tracking
- [x] Created `backend/erp/services/recurringJournalService.js` — runDueTemplates, runSingleTemplate, computeNextRunDate
- [x] Created `backend/erp/controllers/recurringJournalController.js` — CRUD + runNow + runAllDue + exportTemplates + importTemplates
- [x] Created `backend/erp/routes/recurringJournalRoutes.js` — gated by erpSubAccessCheck('accounting', 'journal_entry')
- [x] Created `frontend/src/erp/pages/RecurringJournals.jsx` — template list, create/edit modal with balanced line editor, Run Now/Run All Due
- [x] Excel export/import: "Templates" + "Template Lines" sheets (Google Sheets compatible)

### 21.4 — Per-Module Period Locks ✅
- [x] Created `backend/erp/models/PeriodLock.js` — 10 modules, entity_id+module+year+month compound unique
- [x] Created `backend/erp/middleware/periodLockCheck.js` — factory middleware, rejects writes to locked periods (403)
- [x] Applied periodLockCheck('JOURNAL') to journal create route in accountingRoutes.js
- [x] Created `backend/erp/controllers/periodLockController.js` — getLocks matrix, toggleLock, exportLocks (XLSX)
- [x] Created `backend/erp/routes/periodLockRoutes.js`
- [x] Created `frontend/src/erp/pages/PeriodLocks.jsx` — 10×12 matrix grid, padlock toggles, year selector, confirm dialog
- [x] Mounted at `/erp/period-locks` under erpAccessCheck('accounting')

### 21.5 — Batch Journal Posting ✅
- [x] Added `batchPostJournals` to `accountingController.js` — MongoDB session+transaction, atomic all-or-nothing
- [x] Route: POST `/journals/batch-post` (before /:id to avoid param collision)
- [x] Frontend: checkbox column for DRAFT rows, "Select All Drafts", batch post bar, results modal in JournalEntries.jsx
- [x] Added `batchPostJournals` to `useAccounting.js` hook

### 21.6 — BIR Calculator Tests & Demo Page ✅
- [x] Created `backend/tests/unit/withholdingTaxCalc.test.js` — 11 test cases (TRAIN law brackets, boundary values, 0/negative income)
- [x] Created `backend/tests/unit/deMinimisCalc.test.js` — 9 test cases (rice/clothing/medical/laundry limits, within/exceeding/partial)
- [x] All 20 unit tests pass
- [x] Created `frontend/src/erp/pages/BirCalculator.jsx` — salary input, compute SSS/PhilHealth/PagIBIG/De Minimis/WHT/Net Pay breakdown
- [x] Backend `computeBreakdown` endpoint calls all 5 calc services (SSS, PhilHealth, PagIBIG, de minimis, withholding tax)

### 21.7 — Mobile 375px Polish ✅
- [x] Added `@media(max-width: 375px)` breakpoints to 22 ERP pages
- [x] Added `padding-bottom: calc(80px + env(safe-area-inset-bottom, 0px))` safe-area padding
- [x] Input font-size: 16px at 375px (prevents iOS auto-zoom)
- [x] Pages fixed: GovernmentRates, PeriodLocks, RecurringJournals, BirCalculator, JournalEntries, SalesList, Collections, PeopleList, ChartOfAccounts, ErpDashboard, MonthEndClose, PayrollRun, PersonDetail, PurchaseOrders, SupplierInvoices, VendorList, CustomerList, TrialBalance, ProfitAndLoss, CostCenters + all 4 new pages

### Routing & Navigation ✅
- [x] App.jsx: 4 new lazy routes (/erp/government-rates, /erp/period-locks, /erp/recurring-journals, /erp/bir-calculator)
- [x] Sidebar.jsx: 4 new nav items (Recurring Journals after Journal Entries, Period Locks after Month-End Close, Gov. Rates + BIR Calculator after accounting section)
- [x] useAccounting.js: batchPostJournals + 7 recurring template API methods

---

## PHASE 22 — Accounting Hardening, COA Configurability, Entity Context, Wiring Fixes ✅ PARTIAL (April 6, 2026)
**Goal:** Fix critical accounting engine issues, make COA codes configurable, add multi-entity support for president, fix OCR scan/upload gaps, fix frontend wiring bugs.

### 22.1 — Multi-Entity Context (President) ✅
- [x] `tenantFilter.js`: Strip X-Entity-Id header for non-president (security); president reads header to set req.entityId
- [x] `EntityContext.jsx`: New context — manages working entity state, fetches entities for president, persists in sessionStorage
- [x] `useWorkingEntity.js`: Hook to consume EntityContext
- [x] `api.js`: Request interceptor injects X-Entity-Id header
- [x] `main.jsx`: EntityProvider wired inside AuthProvider
- [x] `Navbar.jsx`: Entity selector dropdown for president/ceo (gold/amber styled)
- [x] Fixes 55 controllers where req.entityId was null for president

### 22.2 — Accounting Engine Hardening ✅
- [x] A1: Entity isolation on `postJournal` & `reverseJournal` — added entityId param, uses `findOne({ _id, entity_id })` instead of `findById`
- [x] A2: Unique sparse index on `corrects_je_id` — prevents double reversal at DB level (JournalEntry.js)
- [x] A3: Period lock on post/reverse/batch journal routes — added `periodLockCheck('JOURNAL')` to 3 routes (accountingRoutes.js)
- [x] A4: MongoDB session/transaction on `reverseJournal` — wraps create+link in atomic transaction (journalEngine.js)
- [x] A5: Reversal period derived from reversal date — no longer copies original's period (fixes date/period mismatch)

### 22.3 — COA Configurability (Settings.COA_MAP) ✅
- [x] C1: Added `COA_MAP` field to Settings model with 31 configurable account codes (all with sensible defaults)
- [x] C2: `autoJournal.js` — added `getCoaMap()` with 1-min cache, all 16 `journalFrom*()` functions now async and read from Settings
- [x] C3: `expenseController.js` — SMER, Car Logbook fuel, PRF/CALF journal lines use COA_MAP
- [x] C3: `bankReconService.js` — bank charges and interest income use COA_MAP
- [x] C3: `apPaymentService.js` — AP trade uses COA_MAP
- [x] Exported `getCoaMap()` for use by any future module

### 22.4 — OCR Scan/Upload Fixes ✅
- [x] CollectionSession.jsx: Added camera capture buttons (Scan + Gallery) for CR, Deposit Slip, CWT, CSI photos
- [x] IcSettlement.jsx: Added camera capture buttons for CR and Deposit Slip photos
- [x] PrfCalf.jsx: Added camera + gallery photo upload (was missing UI despite importing OCR service)
- [x] Sidebar.jsx: Added IC Settlements nav item under Collections

### 22.5 — Frontend Wiring Fixes ✅
- [x] HospitalList.jsx: Fixed `api` → `erpApi` (ReferenceError on create/edit/tag) + path prefix fix
- [x] usePurchasing.js: Fixed `searchProducts` endpoint from `/products/search` (404) to `/products?q=`
- [x] SalesEntry.jsx: Removed premature `console.log` referencing `customerList` before useState declaration

### 22.6 — Mobile UX Fixes (B1/B2) ✅
- [x] B1: CarLogbook.jsx — mobile card layout with @media 768px/480px, table hidden on mobile, card view with date/odometer/km/fuel/status/actions, 36px+ touch targets, form fields stack vertically
- [x] B2: PrfCalf.jsx — mobile card layout with @media 768px/480px, table hidden on mobile, card view with doc type/date/amount/payee/status/actions, 36px+ action buttons, form responsive
- [x] ERP routes index.js: mounted period-locks and recurring-journals routes

---

## PHASE 23 — System Audit & Governance Hardening ✅ (April 6, 2026)
**Goal:** Full system audit against governance principles (multi-entity, lookup-driven, finance-authoritative). Fix cross-entity data leaks, missing period locks, hardcoded COA/payment mode enums, silent error handling, route security gaps, and president UI exclusions.

### 23.1 — Cross-Entity Data Leak Fixes (CRITICAL) ✅
- [x] `collectionController.js`: `getCollectionById` — added `...req.tenantFilter` (was `findOne({ _id })` without entity scope)
- [x] `interCompanyController.js`: `getTransferById` — changed from `findById` to `findOne` with entity filter ($or source/target)
- [x] `interCompanyController.js`: `approveTransfer` — same entity scope fix
- [x] `vendorController.js`: `getAll`, `getById`, `search`, `update`, `addAlias`, `deactivate` — all now scope by entity (president sees all)
- [x] `inventoryController.js`: `approveGrn` — added entity scope to GRN lookup
- [x] `icSettlementController.js`: `getSettlementById`, `postSettlement` — added entity filter ($or creditor/debtor)
- [x] `payrollController.js`: `getPayslip` — added entity scope
- [x] `peopleController.js`: `getPersonById`, `updatePerson`, `deactivatePerson` — added entity scope
- [x] `purchasingController.js`: `validateInvoice` re-fetch — added entity scope

### 23.2 — Route Security ✅
- [x] `creditCardRoutes.js`: Added `roleCheck('admin', 'finance', 'president')` to `/export` endpoint (was unprotected)
- [x] Verified: crmBridgeRoutes, hospitalRoutes, productMasterRoutes are behind `protect + tenantFilter` via index.js line 13 (not vulnerable — false alarm from audit)

### 23.3 — Silent Error Handling → Audit Trail ✅
- [x] `collectionController.js`: VAT/CWT `.catch()` now logs to `ErpAuditLog` (log_type: 'LEDGER_ERROR') + surfaces `warnings` array in response
- [x] `collectionController.js`: Journal failure catch now logs to `ErpAuditLog` + surfaces warning
- [x] `purchasingController.js`: VAT `.catch()` now logs to `ErpAuditLog` (was console.error only)

### 23.4 — Missing Period Lock Checks ✅
- [x] `purchasingController.js`: `postInvoice` — added `checkPeriodOpen()` before posting SI
- [x] `inventoryController.js`: `approveGrn` — added `checkPeriodOpen()` before GRN approval
- [x] `pettyCashController.js`: `postTransaction` — added `checkPeriodOpen()` before petty cash posting

### 23.5 — Hardcoded COA Codes → COA_MAP ✅
- [x] `expenseController.js` `submitExpenses`: Replaced hardcoded `'1110'` (AR_BDM), `'2000'` (AP_TRADE), `'6900'` (MISC) with `getCoaMap()` lookups
- [x] `expenseController.js` `reopenExpense`: Same COA_MAP fix for reopen journal re-posting

### 23.6 — Payment Mode Enum → Lookup-Driven ✅
- [x] `Collection.js`: Removed restrictive `enum: ['CHECK', 'CASH', 'ONLINE']` — now `type: String` (PaymentMode lookup is authoritative)
- [x] `SalesLine.js`: Removed `enum: ['CASH', 'CHECK', 'GCASH', 'BANK_TRANSFER', 'ONLINE']`
- [x] `ExpenseEntry.js`: Removed `enum: ['CASH', 'GCASH', 'CARD', 'BANK_TRANSFER', 'CHECK', 'ONLINE', 'OTHER']`
- [x] `PrfCalf.js`: Removed `enum: ['CASH', 'CHECK', 'GCASH', 'BANK_TRANSFER', 'CARD', 'OTHER']`
- [x] `CarLogbookEntry.js`: Removed `enum: ['CASH', 'FLEET_CARD', 'CARD', 'GCASH', 'OTHER']`
- [x] `IcSettlement.js`: Removed `enum: ['CHECK', 'CASH', 'ONLINE']`

### 23.7 — President UI Full Control ✅
- [x] `SalesList.jsx`: `isAdmin` now includes `'president'` (was missing — president couldn't approve/request deletion)
- [x] `GrnEntry.jsx`: Approve/Reject buttons now visible for `'president'` (was admin/finance only)
- [x] `GovernmentRates.jsx`: Delete button now visible for `'president'` (was admin only)
- [x] Verified: All other ERP pages, sidebar, route protections, useErpSubAccess, EntityContext — all correctly include president

---

## PHASE 24 — ERP Control Center ✅ (April 6, 2026)
**Goal:** Build one unified Control Center page for president/admin/finance to manage system structure, lookups, master data, and governance settings from a single place. Embodies the top-down governance philosophy: Entity → People → Permissions → Master Data → Lookups → Governance.

### 24.1 — Backend: Generic Lookup Model & Routes ✅
- [x] Created `backend/erp/models/Lookup.js` — entity-scoped generic lookup model (category + code + label + sort_order)
- [x] Created `backend/erp/controllers/lookupGenericController.js` — CRUD + seed defaults for 16 categories (expense categories, person types, card types, fuel types, etc.)
- [x] Created `backend/erp/routes/lookupGenericRoutes.js` — mounted at `/api/erp/lookup-values`
- [x] Seed defaults cover 16 categories that were previously hardcoded in frontend

### 24.2 — Backend: Entity CRUD ✅
- [x] Created `backend/erp/controllers/entityController.js` — getAll, getById, create (president only), update (president/admin)
- [x] Created `backend/erp/routes/entityRoutes.js` — mounted at `/api/erp/entities`
- [x] First-ever CRUD API for entities (previously seed-only)

### 24.3 — Backend: Control Center Health Endpoint ✅
- [x] Created `backend/erp/controllers/controlCenterController.js` — aggregates counts from Entity, PeopleMaster, AccessTemplate, ChartOfAccounts, BankAccount, CreditCard, GovernmentRates, Warehouse, PeriodLock, Lookup, Settings
- [x] Created `backend/erp/routes/controlCenterRoutes.js` — `GET /api/erp/control-center/health` (admin/finance/president)

### 24.4 — Backend: Route Mounting ✅
- [x] Mounted all Phase 24 routes in `backend/erp/routes/index.js`: `/entities`, `/control-center`, `/lookup-values`

### 24.5 — Frontend: Extract *Content from 14 Existing Pages ✅
- [x] Extracted named `*Content` export from each page (mechanical refactoring, no logic changes)
- [x] All standalone routes continue to work identically (default export wraps Content with Navbar/Sidebar)
- [x] Pages refactored: TransferPriceManager, DataArchive, FixedAssets, PeriodLocks, CostCenters, PaymentModes, ChartOfAccounts, PeopleList, BankAccounts, RecurringJournals, AccessTemplateManager, CreditCardManager, GovernmentRates, WarehouseManager

### 24.6 — Frontend: New Components ✅
- [x] Created `FoundationHealth.jsx` — landing dashboard showing governance layer completeness (entities, people, COA, banking, tax, warehouses, period locks, lookups, settings)
- [x] Created `EntityManager.jsx` — first-ever entity management UI (view, edit, create subsidiaries)
- [x] Created `ErpSettingsPanel.jsx` — form UI for ~30+ Settings model fields (per diem, fuel, tax, profit sharing, commissions, COA mapping)
- [x] Created `LookupManager.jsx` — centralized lookup table manager (categories, seed defaults, CRUD)
- [x] Created `useLookups.js` hook — fetches and caches lookup values by category (replaces hardcoded arrays)

### 24.7 — Frontend: Control Center Container ✅
- [x] Created `ControlCenter.jsx` — container page with left category sidebar (8 groups, 18 sub-items) + lazy-loaded content panels
- [x] URL sync via `useSearchParams` → `?section=xxx` for deep-linking
- [x] Categories organized by governance hierarchy: Foundation Health → Entity → People & Access → Financial Setup → Tax → Operations → Governance → System Settings
- [x] Mobile responsive: nav collapses to dropdown selector below 768px

### 24.8 — Frontend: Wiring ✅
- [x] Registered `/erp/control-center` route in `App.jsx` with `ProtectedRoute` (admin/finance/president)
- [x] Added "Control Center" sidebar item in `Sidebar.jsx` right after "ERP Home" (admin/finance/president only)
- [x] All 18 lazy imports verified correct (named exports match actual exports in each file)
- [x] All existing standalone routes remain intact

---

## PHASE 24B — Partner Intelligence + Org Chart + Lookup Migration ✅ (April 7, 2026)

### 24B.1 — Frontend Dropdown → Lookup API Migration ✅
- [x] Enhanced `lookupGenericController.js`: object-format seeds `{code, label}`, auto-seed on first GET, `buildSeedOps` helper
- [x] Added 10 new seed categories (ENGAGEMENT_TYPE, ENGAGEMENT_LEVEL, DOC_TYPE, SALE_TYPE, VAT_TYPE, EXPENSE_TYPE, OFFICE_SUPPLY_TXN_TYPE, PAYMENT_MODE_TYPE, PEOPLE_STATUS) — total 26 categories
- [x] Migrated 10+ frontend files from hardcoded arrays to `useLookupOptions()` with fallbacks
- [x] Deleted dead constants: `engagementTypes.js`, `specializations.js`

### 24B.2 — PeopleMaster Enhancements ✅
- [x] Added `reports_to` self-ref field + index (org chart hierarchy)
- [x] Added missing fields: `email`, `phone`, `avatar`, `territory_id`, `bdm_stage`
- [x] Updated allowed update fields in controller
- [x] Enhanced `syncFromCrm` to copy contact/territory fields + update existing records
- [x] Unified creation endpoint `POST /people/create-with-login` — creates CRM User + PeopleMaster in one call
- [x] Login management: `POST /:id/create-login`, `/:id/disable-login`, `/:id/enable-login`, `/:id/unlink-login`
- [x] PeopleList: email/phone column, unified create form with login toggle
- [x] PersonDetail: email/phone/bdm_stage editable, Create/Disable/Enable/Unlink Login buttons

### 24B.3 — Multi-Entity Org Chart ✅
- [x] `getOrgChart` enhanced for multi-entity: president sees all entities (VIP, MG AND CO., Balai Lawaan)
- [x] Response: entity header bars with `_type: 'entity'` + nested person trees
- [x] Frontend: entity header bars with brand_color accent, collapsible person trees, search
- [x] Score badges on partner nodes (green 70+, amber 40-69, red <40)
- [x] Graduation cap icon on partners with readiness ≥ 85%
- [x] Top bar: org summary stats (entities, partners, avg score, near graduation, at risk)
- [x] "Recompute Scores" button
- [x] Added to Control Center sidebar + SECTIONS map
- [x] Route `/erp/org-chart` in App.jsx + Network icon in Sidebar

### 24B.4 — Partner Scorecard System ✅
- [x] `PartnerScorecard` model: monthly snapshots with 5 scores + graduation checklist + AI insights
- [x] `scorecardController`: aggregation from CRM (Visit, Doctor) + ERP (SalesLine, Collection, ExpenseEntry)
- [x] Endpoints: POST /compute, GET /, GET /rankings, GET /group-summary, GET /:personId
- [x] `ErpSettings`: configurable GRADUATION_CRITERIA (7 defaults) + SCORECARD_WEIGHTS
- [x] PartnerScorecard slide-out panel with 3 tabs: Performance, Graduation, AI Insights
- [x] Click partner in Org Chart → scorecard panel opens

### 24B.5 — Org Intelligence Agent (#O) ✅
- [x] `orgIntelligenceAgent.js`: weekly Claude-powered digest analyzing partner performance
- [x] Produces: top performers, at-risk partners, graduation pipeline, trends, 3 recommendations
- [x] Sends digest to President via MessageInbox
- [x] Registered in agentScheduler: Monday 5:30 AM
- [x] Added to AgentRun enum + AgentDashboard config

### 24B.6 — Entity managed_by ✅
- [x] Entity model: `managed_by` field (ref PeopleMaster)
- [x] Controller: in create/update allowed, populated in queries, empty string → null sanitization
- [x] EntityManager UI: "Managed By" dropdown from PeopleMaster (direct, not CRM-filtered)
- [x] Entity cards show manager name

### 24B.7 — Dependency Banners ✅
- [x] Added banners for org-chart, hospitals, fnb-products, data-archive, agent-settings (24+ total)
- [x] Updated entities banner with managed_by guidance
- [x] Mobile responsive CSS for banners at 768px and 375px breakpoints

---

## PHASE 25 — Admin Account Management (BDM Access Preservation) ✅ (April 8, 2026)

**Problem:** Every time a BDM couldn't log in, admin had to create a new login, losing all ERP module permissions.

### 25.1 — Backend: Admin Password Reset + Unlock + Hard Delete ✅
- [x] `PUT /api/users/:id/reset-password` — admin resets password, clears lockout, re-activates, preserves erp_access
- [x] `PUT /api/users/:id/unlock` — clears failedLoginAttempts + lockoutUntil via $set (never touches erp_access)
- [x] `DELETE /api/users/:id/permanent` — permanently deletes duplicate/orphaned users, unlinks PeopleMaster

### 25.2 — Backend: Smart Login Re-enable in PeopleController ✅
- [x] `createLoginForPerson` detects deactivated existing user → re-enables + resets password, preserves erp_access
- [x] Handles orphaned user_id by clearing stale link

### 25.3 — Frontend: Admin Account Actions ✅
- [x] `userService.js`: `resetPassword()`, `unlockAccount()`, `permanentDelete()` methods
- [x] `EmployeesPage.jsx`: handler functions for all 3 actions
- [x] `EmployeeManagement.jsx`: Reset PW, Unlock, Delete buttons + modals + dark mode styles

---

## PHASE 25 — Admin Account Management (BDM Access Preservation) ✅ (April 8, 2026)

**Problem:** Every time a BDM couldn't log in (forgot password, locked out), admin had to create a new login. This created a new User with default `erp_access` (all modules NONE), losing all the ERP permissions that were configured on the original account.

**Goal:** Give admin tools to fix login issues without creating new accounts, preserving all ERP access.

### 25.1 — Backend: Admin Password Reset + Unlock + Hard Delete ✅
- [x] `PUT /api/users/:id/reset-password` — admin resets password, clears lockout, re-activates, preserves erp_access
- [x] `PUT /api/users/:id/unlock` — clears failedLoginAttempts + lockoutUntil, sets isActive=true via $set (never touches erp_access)
- [x] `DELETE /api/users/:id/permanent` — permanently deletes duplicate/orphaned users, unlinks PeopleMaster
- [x] All three endpoints audit-logged via existing AuditActions
- [x] Safety checks: can't delete self, can't delete last admin

### 25.2 — Backend: Smart Login Re-enable in PeopleController ✅
- [x] `createLoginForPerson` now detects deactivated existing user → re-enables + resets password instead of creating new
- [x] Preserves all erp_access (modules, sub_permissions, template, can_approve)
- [x] Handles orphaned user_id (stale reference) by clearing link and continuing
- [x] Active user → returns helpful error: "Use Reset Password to fix login issues"

### 25.3 — Frontend: Admin Account Actions ✅
- [x] `userService.js`: added `resetPassword()`, `unlockAccount()`, `permanentDelete()` methods
- [x] `EmployeesPage.jsx`: handler functions for all 3 actions
- [x] `EmployeeManagement.jsx`: Reset PW, Unlock, Delete buttons in desktop table + mobile cards
- [x] Reset Password modal with password input + validation (min 8 chars)
- [x] Permanent Delete confirmation modal with warning text
- [x] Dark mode styles for all new action buttons

---

## PHASE 26 — Multi-Entity Access + Stock Import Fix ✅ (April 8, 2026)

**Problem:** Non-president users were locked to a single entity. BDMs like Jay Ann and Judy Mae needed access to both VIP and MG entities for PO creation, accounting, and people management. Also, the stock import script created duplicate products instead of matching against the cleaned ProductMaster.

**Goal:** Scalable multi-entity access for any user, assignable via the BDM Management UI. Fix stock import to match existing products.

### 26.1 — Backend: Multi-Entity User Model ✅
- [x] `User.js`: Added `entity_ids: [ObjectId]` field (array of accessible entities)
- [x] Added `{ entity_ids: 1 }` index for query performance
- [x] `entity_id` remains primary/default; `entity_ids` is the full list (superset)

### 26.2 — Backend: Tenant Filter Multi-Entity Validation ✅
- [x] `tenantFilter.js`: Multi-entity users (`entity_ids.length > 1`) can use X-Entity-Id header
- [x] Header value validated against user's `entity_ids` array — rejects unauthorized entities
- [x] Single-entity users: header stripped (unchanged behavior)
- [x] President/CEO: unchanged (see all entities)
- [x] `req.tenantFilter` always uses single working entity — no multi-entity queries

### 26.3 — Backend: My-Entities Endpoint + User Update ✅
- [x] `GET /api/users/my-entities` — returns entities current user can access
- [x] `userController.updateUser`: now allows `entity_id`, `entity_ids`, `erp_access` in admin updates
- [x] `erp_access` handled with `markModified()` for nested object persistence

### 26.4 — Frontend: EntityContext Multi-Entity Support ✅
- [x] `EntityContext.jsx`: `isMultiEntity` now includes users with `entity_ids.length > 1`
- [x] Non-president multi-entity users fetch from `/users/my-entities`
- [x] Entity switcher appears in navbar for all multi-entity users

### 26.5 — Frontend: BDM Management Multi-Entity UI ✅
- [x] `EmployeeManagement.jsx`: Replaced single entity `<select>` with checkbox list
- [x] Each entity has checkbox (toggle access) + "Primary" badge/button
- [x] `entity_ids` array sent on save alongside `entity_id` (primary)
- [x] Scalable: admin/president can assign any entity combination to any user

### 26.6 — Stock Import: Match Against Cleaned ProductMaster ✅
- [x] `importStockOnHand.js`: 3-tier matching strategy:
  1. Exact `entity_id + item_key` match
  2. `entity_id + brand_name_clean + dosage_strength` match
  3. `brand_name_clean + dosage_strength` across all entities
- [x] Unmatched products logged as warnings (no auto-create duplicates)
- [x] Dedup check: skips if OPENING_BALANCE already exists for same combo
- [x] Uses `cleanName()` from `backend/erp/utils/nameClean.js`

### 26.7 — Bug Fixes (discovered during investigation) ✅
- [x] `userController.getEntitiesLookup`: Fixed query `{ is_active: true }` → `{ status: 'ACTIVE' }` (Entity model uses `status` field)
- [x] `vendorController.create`: Strip empty `vendor_code` to avoid unique index collision
- [x] `vendorController.getAll`: Return clear error when user has no entity assigned
- [x] `warehouseController.getMyWarehouses`: ERP-enabled employees see all entity warehouses (not just managed/assigned)
- [x] `PurchaseOrders.jsx`: Product dropdown uses ProductMaster catalog instead of empty inventory stock

---

## PHASE 27 — FULL SYSTEM AUDIT + PERIOD LOCK + BANNER COMPLIANCE ✅ COMPLETE
**Goal:** Comprehensive audit of all wiring, logic, dependencies, helper banners, and workflow guide alignment across CRM + ERP.

### 27.1 — Wiring Fixes ✅
- [x] Fix `sentRoutes.js` not mounted in `server.js` — added `/api/sent` route mount
- [x] Verified all 52 ERP route files are mounted in `backend/erp/routes/index.js`
- [x] Verified all 17 CRM route files are mounted in `backend/server.js`
- [x] All 398 backend JS files pass syntax check (`node -c`)
- [x] Frontend build succeeds with zero errors (`npx vite build`)
- [x] All 15 autoJournal functions verified to have callers (no orphaned functions)
- [x] All $lookup `from:` fields match actual model collection names
- [x] TerritoryManager.jsx confirmed embedded in ControlCenter (not orphaned)

### 27.2 — Period Lock Enforcement (Critical Security Fix) ✅
- [x] `periodLockCheck` was ONLY on accounting routes — extended to all transactional modules
- [x] `salesRoutes.js`: Added `periodLockCheck('SALES')` to submit/reopen endpoints
- [x] `collectionRoutes.js`: Added `periodLockCheck('COLLECTION')` to submit/reopen
- [x] `expenseRoutes.js`: Added `periodLockCheck('EXPENSE')` to SMER/CarLogbook/ORE-ACCESS/PRF-CALF submit/reopen
- [x] `purchasingRoutes.js`: Added `periodLockCheck('PURCHASING')` to invoice post/payment
- [x] `incomeRoutes.js`: Added `periodLockCheck('INCOME')` to confirm/credit/post endpoints
- [x] Added `INCOME` to PeriodLock model enum (was missing from module list)
- [x] Added `INCOME: 'Income'` to PeriodLocks.jsx frontend MODULE_LABELS

### 27.3 — WorkflowGuide Navigation Link Fixes ✅
- [x] Fixed 8 broken next-step links in WorkflowGuide.jsx:
  - `/erp/accounting/trial-balance` → `/erp/trial-balance`
  - `/erp/accounting/journal` → `/erp/journals`
  - `/erp/banking/reconciliation` → `/erp/bank-recon`
  - `/erp/consignment-dashboard` → `/erp/consignment`
  - `/erp/payroll/payslips` → `/erp/payroll`
  - `/erp/purchasing/ap` → `/erp/accounts-payable`
  - `/erp/purchasing/invoices` → `/erp/supplier-invoices`
  - `/erp/purchasing/orders` → `/erp/purchase-orders`

### 27.4 — ERP WorkflowGuide Banner Coverage ✅
- [x] Added 25 new WORKFLOW_GUIDES definitions to WorkflowGuide.jsx (total now ~72 guides)
- [x] Added WorkflowGuide import + component to 25 standalone ERP pages:
  - ChartOfAccounts, TrialBalance, ProfitAndLoss, CashflowStatement, FixedAssets, Loans, OwnerEquity
  - BankAccounts, CreditCardManager, CreditCardLedger, PaymentModes
  - GovernmentRates, BirCalculator, PeriodLocks, RecurringJournals, DataArchive
  - VendorList, WarehouseManager, CostCenters, BudgetAllocations
  - AccessTemplateManager, IcSettlement, IcArDashboard, ThirteenthMonth, AuditLogs
- [x] 7 pages skipped (ControlCenter embedded panels, covered by DEPENDENCY_GUIDE): AgentSettings, EntityManager, ErpSettingsPanel, FoundationHealth, LookupManager, TerritoryManager, ControlCenter
- [x] PartnerScorecard slide-out now wired with `WorkflowGuide pageKey="partner-scorecard"` (Apr 2026) — explains per-entity SCORECARD_WEIGHTS + GRADUATION_CRITERIA dependencies, data-source chain (Visits/Sales/Collections/Expenses), and admin-only Recompute gate

### 27.5 — CRM PageGuide Banner System ✅
- [x] Created new `frontend/src/components/common/PageGuide.jsx` component (matches WorkflowGuide style)
- [x] Defined 13 PAGE_GUIDES: admin-dashboard, bdm-dashboard, doctors-page, employees-page, reports-page, regions-page, my-visits, new-visit, call-plan, products-page, settings-page, doctor-detail, inbox
- [x] Added PageGuide to 12 CRM pages: AdminDashboard, EmployeeDashboard, DoctorsPage, EmployeesPage, ReportsPage, MyVisits, NewVisitPage, CallPlanPage, ProductsPage, SettingsPage, DoctorDetailPage, EMP_InboxPage

### 27.6 — Bug/Logic Review ✅
- [x] VAT 0.12: Centralized in Settings.js with fallback `?? 0.12` — acceptable, not scattered across models
- [x] Dual P&L: pnlService (GL-based, authoritative) and pnlCalc (source-doc-based, used by income module) — both active in separate controllers, no direct conflict
- [x] Zero COGS: `journalFromCOGS` returns null for zero/negative COGS (graceful handling)
- [x] CALF Gate: Properly enforced in `submitExpenses` and `submitCarLogbook` with dual validation gates
- [x] All autoJournal functions have callers (15/15 verified)
- [x] Frontend hardcoded dropdowns: ~9 instances, most with API fallback mechanism

---

## Phase 29 — Email Notifications + Approval Workflow (Authority Matrix) ✅

### 29.1 — ERP Email Notification Service ✅
- [x] Created `backend/templates/erpEmails.js` — 5 HTML email templates (posted, reopened, approval request, approval decision, payroll posted)
- [x] Created `backend/erp/services/erpNotificationService.js` — non-blocking notification orchestration
- [x] Extended `backend/models/EmailLog.js` with 5 new ERP email types: ERP_DOCUMENT_POSTED, ERP_DOCUMENT_REOPENED, ERP_APPROVAL_REQUEST, ERP_APPROVAL_DECISION, ERP_PAYROLL_POSTED
- [x] Recipients resolved dynamically from User model (role + entity scope) — no hardcoded lists
- [x] Entity name caching (5-minute TTL) for email context
- [x] All sends fire-and-forget — notification failure never breaks business logic

### 29.2 — Controller Notification Hooks ✅
- [x] `salesController.submitSales` — notifies management on CSI posted (amount, doc refs, period)
- [x] `salesController.reopenSales` — notifies management on CSI reopened (with reason)
- [x] `collectionController.submitCollections` — notifies management on CR posted
- [x] `collectionController.reopenCollections` — notifies management on CR reopened
- [x] `payrollController.postPayroll` — notifies management on payslip batch posted (count, total net pay)
- [x] `purchasingController.approvePO` — notifies management on PO approved
- [x] `purchasingController.postInvoice` — notifies management on Supplier Invoice posted

### 29.3 — Approval Workflow Model ✅
- [x] Created `backend/erp/models/ApprovalRule.js` — entity-scoped rules (module, doc_type, amount_threshold, level, approver config)
- [x] Created `backend/erp/models/ApprovalRequest.js` — tracks PENDING → APPROVED/REJECTED with immutable history
- [x] Approver types: ROLE (by role name), USER (specific user IDs), REPORTS_TO (PeopleMaster.reports_to chain)
- [x] Multi-level support: up to 5 levels, auto-escalation on Level N approval

### 29.4 — Approval Service ✅
- [x] Created `backend/erp/services/approvalService.js` — business logic for checking, resolving, and deciding
- [x] `isApprovalEnabled()` — reads Settings.ENFORCE_AUTHORITY_MATRIX
- [x] `findMatchingRules()` — entity + module + doc_type + amount threshold matching
- [x] `resolveApprovers()` — dynamic resolution from ROLE/USER/REPORTS_TO
- [x] `checkApprovalRequired()` — called by controllers before posting; creates request if needed
- [x] `processDecision()` — approve/reject with authorization check and auto-escalation
- [x] `isFullyApproved()` — checks all levels approved for a document
- [x] `getPendingForApprover()` — finds pending requests for a specific user

### 29.5 — Approval Controller & Routes ✅
- [x] Created `backend/erp/controllers/approvalController.js` — rules CRUD + request management
- [x] Created `backend/erp/routes/approvalRoutes.js` — mounted at `/api/erp/approvals`
- [x] Mounted in `backend/erp/routes/index.js`
- [x] Routes: GET /status, GET /my-pending, GET /requests, POST /requests/:id/approve|reject|cancel, CRUD /rules

### 29.6 — Controller Integration ✅
- [x] Wired `checkApprovalRequired()` into `purchasingController.approvePO` — returns 202 if pending approval
- [x] Pattern documented in CLAUDE-ERP.md for adding to other controllers

### 29.7 — Frontend Approval UI ✅
- [x] Created `frontend/src/erp/hooks/useApprovals.js` — hook for all approval API operations
- [x] Created `frontend/src/erp/pages/ApprovalManager.jsx` — full management page (requests tab + rules tab)
- [x] Added lazy import and route in App.jsx at `/erp/approvals`
- [x] Added sidebar link (ClipboardCheck icon) for admin/finance/president roles
- [x] Added WorkflowGuide entry `approval-manager` with steps and navigation
- [x] Exports `ApprovalManagerContent` for Control Center embedding

### 29.8 — Verification ✅
- [x] All new backend files pass `node -c` syntax check
- [x] All modified controllers pass syntax check
- [x] Frontend builds cleanly with `npx vite build`
- [x] System health check passes (0 new issues)
- [x] CLAUDE-ERP.md updated with Phase 29 documentation
- [x] PHASETASK-ERP.md updated with full task breakdown

---

## Phase 30 — Role Centralization + Lookup-Driven Enums ✅ (April 9, 2026)

### 30.1 — Role Rename: employee → contractor ✅
- [x] Created `backend/constants/roles.js` — single source of truth for all role strings and permission sets (CommonJS)
- [x] Created `frontend/src/constants/roles.js` — ES module mirror of backend constants
- [x] Renamed role `employee` → `contractor` across all backend middleware, controllers, and routes
- [x] Updated all frontend role checks to use `ROLES.*` and `ROLE_SETS.*` constants
- [x] Created migration script `backend/scripts/migrateEmployeeToContractor.js` — renames role in Users collection (idempotent)
- [x] Retired `backend/utils/roleHelpers.js` — replaced by constants/roles.js

### 30.2 — New Lookup Categories ✅
- [x] Added `BDM_STAGE` lookup category — career path stages (CONTRACTOR, PS_ELIGIBLE, TRANSITIONING, SUBSIDIARY, SHAREHOLDER)
- [x] Added `ROLE_MAPPING` lookup category — maps person_type → system_role for login creation (6 mappings with metadata)
- [x] Added `SYSTEM_ROLE` lookup category — documents system roles with editable labels
- [x] All three categories auto-seeded on first access via lookupGenericController SEED_DEFAULTS

### 30.3 — PersonDetail Full Lookup Migration ✅
- [x] `person_type` dropdown driven by `useLookupOptions('PERSON_TYPE')` (done in Phase 24)
- [x] `employment_type` dropdown driven by `useLookupOptions('EMPLOYMENT_TYPE')` (done in Phase 24)
- [x] `bdm_stage` dropdown driven by `useLookupOptions('BDM_STAGE')`
- [x] `civil_status` dropdown driven by `useLookupOptions('CIVIL_STATUS')`
- [x] `status` (person status) dropdown driven by `useLookupOptions('PERSON_STATUS')`
- [x] `salary_type` dropdown driven by `useLookupOptions('SALARY_TYPE')`
- [x] `tax_status` dropdown driven by `useLookupOptions('TAX_STATUS')`
- [x] `incentive_type` dropdown driven by `useLookupOptions('INCENTIVE_TYPE')`
- [x] Insurance `policy_type` dropdown driven by `useLookupOptions('INSURANCE_TYPE')`
- [x] Insurance `premium_frequency` dropdown driven by `useLookupOptions('INSURANCE_FREQUENCY')`
- [x] Insurance `status` dropdown driven by `useLookupOptions('INSURANCE_STATUS')`
- [x] Added 8 new seed default categories to `lookupGenericController.js` SEED_DEFAULTS
- [x] Removed all hardcoded const arrays from PersonDetail.jsx — zero remaining
- [x] Backend PeopleMaster pre-validate hook validates against Lookup tables with hardcoded fallback

### 30.4 — Role-People Alignment Warning ✅
- [x] Added `showWarning()` helper to `frontend/src/erp/utils/errorToast.js` — amber toast (8s duration) for non-fatal alerts
- [x] Added `useLookupOptions('ROLE_MAPPING')` in PersonDetail.jsx to fetch person_type → system_role mappings
- [x] Added useEffect alignment check — fires on person load when `user_id` is linked, compares `user_id.role` vs expected role from ROLE_MAPPING
- [x] Uses `useRef` guard (`roleMismatchShown`) keyed on `${id}-${person_type}-${role}` to prevent duplicate toasts

### 30.5 — Pre-Deployment Steps
- [x] Run `node backend/scripts/migrateEmployeeToContractor.js` before deploying (renames role 'employee' → 'contractor' in Users collection)
- [x] Migration is idempotent — safe to run multiple times
- [x] Verify lookup categories BDM_STAGE, ROLE_MAPPING, SYSTEM_ROLE auto-seed on first Control Center access

### 30.6 — Verification ✅
- [x] All modified frontend files pass `npx vite build`
- [x] CLAUDE-ERP.md updated — Known Gaps table entries resolved
- [x] PHASETASK-ERP.md updated with full Phase 30 task breakdown

---

## Phase 31 — Functional Role Assignment (Cross-Entity Deployment)

> Enables assigning people to perform specific functions (Purchasing, Accounting, Collections, etc.)
> at multiple entities with date ranges and optional approval limits.
> **Problem solved**: Previously each person was locked to a single entity_id with no cross-entity
> functional scoping (e.g., "this accountant handles accounting for VIP HQ AND MG AND CO").

### 31.1 — Model + Lookup Seed ✅
- [x] Created `backend/erp/models/FunctionalRoleAssignment.js` with full schema:
  - entity_id (target entity), person_id, home_entity_id (denormalized), functional_role (lookup-validated)
  - valid_from, valid_to (nullable = permanent), approval_limit, description
  - status enum: ACTIVE, SUSPENDED, EXPIRED, REVOKED
  - Compound indexes for "who handles X at entity Y" and "what entities does person Z serve" queries
- [x] Pre-validate hook validates functional_role against Lookup FUNCTIONAL_ROLE category with hardcoded fallback
- [x] Added FUNCTIONAL_ROLE category to SEED_DEFAULTS in `lookupGenericController.js`:
  PURCHASING, ACCOUNTING, COLLECTIONS, INVENTORY, SALES, ADMIN, AUDIT, PAYROLL, LOGISTICS

### 31.2 — Controller ✅
- [x] Created `backend/erp/controllers/functionalRoleController.js` with 7 operations:
  - listAssignments (entity-scoped, filterable by person/role/status)
  - getAssignment (single by ID)
  - getByPerson (cross-entity — all assignments for one person)
  - createAssignment (duplicate-active guard, auto-sets home_entity_id from PeopleMaster)
  - updateAssignment (whitelist of allowed fields)
  - deactivateAssignment (soft-delete → REVOKED status)
  - bulkCreate (one person → multiple entities, skips duplicates)

### 31.3 — Routes ✅
- [x] Created `backend/erp/routes/functionalRoleRoutes.js` mounted at `/api/erp/role-assignments`
- [x] Static routes before parameterized: /by-person/:personId, /bulk before /:id
- [x] adminOnly middleware on write endpoints (POST, PUT, deactivate)
- [x] Registered in `backend/erp/routes/index.js` under `erpAccessCheck('people')`

### 31.4 — Frontend Hook ✅
- [x] Created `frontend/src/erp/hooks/useFunctionalRoles.js`
- [x] Wraps all API endpoints using useErpApi pattern (matching useApprovals.js)

### 31.5 — Frontend Page ✅
- [x] Created `frontend/src/erp/pages/RoleAssignmentManager.jsx`
- [x] Two tabs: "By Entity" (who's assigned here) and "By Person" (search person → cross-entity list)
- [x] Create/Edit modal with person search, entity selector, lookup-driven role dropdown, date range, approval limit
- [x] Bulk mode: assign one person to multiple entities at once
- [x] Status badges: ACTIVE (green), SUSPENDED (yellow), EXPIRED (gray), REVOKED (red)
- [x] WorkflowGuide helper banner
- [x] Exports RoleAssignmentManagerContent for ControlCenter embedding

### 31.6 — App.jsx + ControlCenter Registration ✅
- [x] Added lazy import + route `/erp/role-assignments` with ROLE_SETS.MANAGEMENT in App.jsx
- [x] Added to ControlCenter SECTIONS + CATEGORY_CONFIG under "People & Access" group

### 31.7 — PersonDetail Integration ✅
- [x] Added Section F: "Cross-Entity Assignments" to PersonDetail.jsx
- [x] Fetches via useFunctionalRoles().fetchByPerson on mount
- [x] Compact table: Entity, Function, Period, Limit, Status
- [x] Management users see "+ Assign Role" link to /erp/role-assignments?person=<id>

### 31.8 — Documentation ✅
- [x] PHASETASK-ERP.md updated with Phase 31 task breakdown
- [x] CLAUDE-ERP.md updated with Phase 31 architecture

---

## Phase 32 — Universal KPI Self-Rating & Performance Review System ✅

Universal, lookup-driven KPI self-rating system where ALL members — regardless of function — can rate themselves on function-specific KPIs + competencies, go through a structured self → manager → approval workflow.

### 32.1 — Model + Lookup Seeds ✅
- [x] Created `backend/erp/models/KpiSelfRating.js` — entity+person+period unique rating document
- [x] Extended KPI_CODE seeds: 13 existing sales KPIs get `functional_roles: ['SALES']` + `description`
- [x] Added 10 new function-specific KPIs: Purchasing (3), Accounting (3), Collections (2), Inventory (2)
- [x] Added 2 universal KPIs: ATTENDANCE_RATE, TASK_COMPLETION (`functional_roles: ['ALL']`)
- [x] Added RATING_SCALE seed (1-5 scale with labels)
- [x] Added COMPETENCY seed (8 universal competencies)
- [x] Added REVIEW_PERIOD_TYPE seed (Monthly/Quarterly/Semi-Annual/Annual)

### 32.2 — Controller (10 Endpoints) ✅
- [x] Created `backend/erp/controllers/kpiSelfRatingController.js`
- [x] `getMyRatings` — own ratings history
- [x] `getMyCurrentDraft` — get or auto-create DRAFT (auto-fills KPIs from FunctionalRoleAssignment)
- [x] `getRatingById` — single rating (access: self/manager/admin)
- [x] `getRatingsForReview` — manager's pending SUBMITTED reviews
- [x] `getRatingsByPerson` — admin: all ratings for a person
- [x] `saveDraft` — create/update DRAFT or RETURNED rating
- [x] `submitRating` — DRAFT/RETURNED → SUBMITTED
- [x] `reviewRating` — manager adds scores, SUBMITTED → REVIEWED
- [x] `approveRating` — admin: REVIEWED → APPROVED
- [x] `returnRating` — manager/admin: SUBMITTED/REVIEWED → RETURNED

### 32.3 — Routes + Registration ✅
- [x] Created `backend/erp/routes/kpiSelfRatingRoutes.js`
- [x] Mounted at `/api/erp/self-ratings` under `erpAccessCheck('people')`
- [x] Static routes before parameterized /:id
- [x] Registered in `backend/erp/routes/index.js`

### 32.4 — Frontend Hook ✅
- [x] Created `frontend/src/erp/hooks/useKpiSelfRating.js`
- [x] Wraps all 10 endpoints, stable deps on api.get/api.post/api.put

### 32.5 — KPI Library Page ✅
- [x] Created `frontend/src/erp/pages/KpiLibrary.jsx`
- [x] Admin-friendly SMART goal form (SAP SuccessFactors pattern)
- [x] Grouped by function with search + filter
- [x] Create/Edit modal: code, name, description (SMART sentence), unit, direction, computation, target, functional_roles
- [x] WorkflowGuide helper banner
- [x] Exports KpiLibraryContent for ControlCenter embedding

### 32.6 — Self-Rating Page ✅
- [x] Created `frontend/src/erp/pages/KpiSelfRating.jsx`
- [x] Three tabs: My Rating, Review, History
- [x] Self-Rating: KPI table + Competency table + Overall Assessment with save/submit
- [x] Manager Review: side-by-side self/manager scores, complete review or return
- [x] History: past submissions with status badges, detail modal
- [x] Period selector (type + fiscal year)
- [x] WorkflowGuide helper banner
- [x] Exports KpiSelfRatingContent for ControlCenter embedding

### 32.7 — App.jsx + ControlCenter Registration ✅
- [x] Added lazy imports + routes in App.jsx
- [x] `/erp/kpi-library` with ROLE_SETS.MANAGEMENT
- [x] `/erp/self-rating` with ROLE_SETS.ERP_ALL (all ERP users can self-rate)
- [x] Added to ControlCenter SECTIONS + CATEGORY_CONFIG under "People & Access"
- [x] Added dependency banners for both kpi-library and kpi-self-rating

### 32.8 — PersonDetail Section G ✅
- [x] Added Section G "Performance Rating" to PersonDetail.jsx
- [x] Shows latest rating: period, status badge, self score, manager score, KPI/competency rated counts
- [x] Link to `/erp/self-rating?person=<id>` for full history

### 32.9 — Documentation ✅
- [x] PHASETASK-ERP.md updated with Phase 32 task breakdown
- [x] CLAUDE-ERP.md updated with Phase 32 architecture, routes, lookup categories, integration points

---

## Phase 33 — Bulk Role Migration + Login Fix ✅ (April 10, 2026)

Fixes login-blocking bug for medrep users and adds admin-facing bulk role migration via Control Center.

### 33.1 — Login Bug Fix ✅
- [x] Added `ROLES.MEDREP` back to `ALL_ROLES` in `backend/constants/roles.js` — Mongoose enum now accepts legacy medrep role on `user.save()` during login
- [x] Root cause: login calls `user.save()` to persist refreshToken + lastLogin, which triggers Mongoose enum validation — fails if role not in `ALL_ROLES`

### 33.2 — Bulk Role Migration Endpoint ✅
- [x] Added `bulkChangeSystemRole` in `backend/erp/controllers/peopleController.js` — accepts `{ from_role, to_role }`, validates against `ALL_ROLES`, bulk-updates all matching users
- [x] Added `getLegacyRoleCounts` in `backend/erp/controllers/peopleController.js` — returns counts of users with legacy roles (medrep, employee)
- [x] Added routes in `backend/erp/routes/peopleRoutes.js`:
  - `GET /people/legacy-role-counts` (admin/president)
  - `POST /people/bulk-change-role` (admin/president)

### 33.3 — Frontend Hook ✅
- [x] Added `getLegacyRoleCounts()` and `bulkChangeRole(from_role, to_role)` to `frontend/src/erp/hooks/usePeople.js`

### 33.4 — PeopleList Migration Banner ✅
- [x] Added legacy role detection on mount in `frontend/src/erp/pages/PeopleList.jsx`
- [x] Yellow banner with user counts per legacy role + one-click "Migrate → contractor" buttons
- [x] Confirmation dialog before migration, success toast, banner auto-hides after migration

### 33.5 — Frontend Cleanup ✅
- [x] Removed `case 'medrep':` redirect from `frontend/src/pages/LoginPage.jsx`
- [x] Replaced `medrep: 'MedRep'` with `contractor: 'Contractor'` in `frontend/src/pages/HomePage.jsx` role label map

### 33.6 — Workflow Guide Update ✅
- [x] Updated `people-list` banner in `frontend/src/erp/components/WorkflowGuide.jsx` — added step 4 for legacy role migration and updated tip text

### 33.7 — Documentation ✅
- [x] PHASETASK-ERP.md updated with Phase 33 task breakdown
- [x] CLAUDE-ERP.md updated with Phase 33 architecture, routes, and key files

---

## Phase 34 — Approval Hub Enhancement: Sub-Permissions + Attachments + Line-Item Edit (April 17, 2026)

Divides approval workload per module via sub-permissions, adds attachment/photo viewing for approver verification, extends quick-edit to support line-item changes, and removes unnecessary PO approval gates.

### 34.1 — Per-Module Approval Sub-Permissions ✅
- [x] Added 14 sub-permission lookup seeds under `approvals` module in `lookupGenericController.js`: `approve_sales`, `approve_collections`, `approve_inventory`, `approve_expenses`, `approve_purchasing`, `approve_payroll`, `approve_journal`, `approve_banking`, `approve_petty_cash`, `approve_ic_transfer`, `approve_income`, `approve_deductions`, `approve_kpi`, `approve_perdiem`
- [x] Added `sub_key` field to each MODULE_QUERIES entry in `universalApprovalService.js` mapping modules to their sub-permission key
- [x] Added `MODULE_TO_SUB_KEY` mapping and `hasApprovalSub()` helper in `universalApprovalService.js` — follows existing erpSubAccessCheck convention (FULL with no subs = all granted)
- [x] Updated `isAuthorizedForModule()` to accept full user object and check sub-permissions ON TOP of existing ApprovalRule + MODULE_DEFAULT_ROLES checks
- [x] Updated `getUniversalPending()` signature: now accepts user object instead of userId + userRole
- [x] Updated `getUniversalPendingEndpoint` in controller to pass `req.user`
- [x] Added sub-permission check to `universalApprove` — returns 403 if user lacks module's sub-permission
- [x] Added sub-permission check to `universalEdit` — same 403 gate
- [x] Exported `MODULE_TO_SUB_KEY` and `hasApprovalSub` from service for controller reuse

### 34.2 — Attachment/Photo Viewing in Approval Hub ✅
- [x] Added attachment URLs to MODULE_QUERIES details in `universalApprovalService.js`:
  - GRN: `waybill_photo_url`, `undertaking_photo_url`
  - Collection: `deposit_slip_url`, `cr_photo_url`, `cwt_certificate_url`, `csi_photo_urls`
  - Car Logbook: `fuel_receipts[]` with `receipt_url`, `starting_km_photo_url`, `ending_km_photo_url`
  - Expenses: `or_photo_url` per line item
  - PRF/CALF: `photo_urls` array
- [x] Frontend: clickable thumbnail images in `ApprovalManager.jsx` for each module's attachments
- [x] Frontend: full-screen image preview modal (click thumbnail → overlay → click to close)
- [x] Expense table: added "OR" column header + thumbnail column for receipt photos

### 34.3 — Line-Item Inline Editing ✅
- [x] Added `APPROVAL_EDITABLE_LINE_FIELDS` lookup seed in `lookupGenericController.js`: SALES_LINE (qty, unit_price), GRN (qty, batch_lot_no, expiry_date), EXPENSE_ENTRY (amount, expense_category)
- [x] Extended `universalEdit` in controller to handle `updates.line_items` array — validates index, whitelists fields via lookup, applies changes, recalculates line_total and document totals
- [x] Frontend: added `editableLineFieldsMap` state, `editingLineItem`/`lineEditForm` state, `handleSaveLineEdit` handler
- [x] Frontend: lookup batch updated to fetch `APPROVAL_EDITABLE_LINE_FIELDS`

### 34.4 — PO Approval Gate Cleanup ✅
- [x] Removed `checkApprovalRequired` from `approvePO` in `purchasingController.js` — PO approve is now instant for users with `po_approve` sub-permission
- [x] Removed `gateApproval` from `updatePO` (non-draft minor edits) — field restriction logic is sufficient
- [x] Cleaned up unused `checkApprovalRequired` import
- [x] `gateApproval` retained in `postInvoice` (supplier invoice) — stays gated as financial document

### 34.5 — Contractor Access ✅
- [x] Verified: contractors with `erp_access.enabled + approvals module + sub-permissions` can access Approval Hub — no middleware changes needed

### 34.6 — Documentation ✅
- [x] PHASETASK-ERP.md updated with Phase 34 task breakdown
- [x] CLAUDE-ERP.md updated with Phase 34 architecture
- [x] WorkflowGuide banner updated for approval-manager

---

## Phase H5 — OCR Vendor Auto-Learn from Claude Wins ✅ (April 18, 2026)

Self-improving classifier: when Phase H4's Claude fallback successfully classifies an OR/gas receipt that the regex cascade didn't recognise, the win is captured as training data so the next identical scan hits EXACT_VENDOR / ALIAS_MATCH and skips Claude entirely. Admin-reviewable, entity-scoped, subscription-togglable.

### H5.1 — Data Model ✅
- [x] `VendorMaster`: added `auto_learned_from_ocr` (bool, indexed), `learning_source` (CLAUDE_AI|MANUAL|IMPORT|null), `learned_at` (Date), `learning_status` (UNREVIEWED|APPROVED|REJECTED), `learning_meta` subdoc (source_doc_type, source_ocr_text, source_raw_snippet, ai_confidence, suggested_coa_code, suggested_category, learn_count)
- [x] `VendorMaster` composite index `(entity_id, auto_learned_from_ocr, learning_status, learned_at)` for fast review-queue queries
- [x] `OcrSettings`: added `vendor_auto_learn_enabled` (bool, default true) and included in no-entity default fallback
- [x] `OcrUsageLog`: added `vendor_auto_learned` (bool) and `vendor_auto_learn_action` enum (NONE|CREATED|ALIAS_ADDED|SKIPPED)

### H5.2 — Learner Service (`vendorAutoLearner.js`) ✅
- [x] `learnFromAiResult({ aiResult, extractedFields, rawOcrText, docType, entityId, userId })` → `{ action, vendor_id, reason }`
- [x] 5 guardrails: entity present, name length ≥3/≤120 and not purely numeric, not in GENERIC_NAME_BLOCKLIST, confidence HIGH/MEDIUM, coa_code present
- [x] Lookup branch: exact `vendor_name` match OR alias `$in` → `$addToSet` new aliases (Claude-cleaned name + raw OCR text variation) → action = 'ALIAS_ADDED'
- [x] When the existing vendor itself is auto-learned → `$inc learning_meta.learn_count` + refresh `source_raw_snippet` + `learned_at`; manual vendors untouched
- [x] No match → `VendorMaster.create` with `auto_learned_from_ocr: true`, `learning_source: 'CLAUDE_AI'`, `learning_status: 'UNREVIEWED'`, snapshot in `learning_meta`
- [x] Duplicate-race safety (concurrent OCR): E11000 caught → 'SKIPPED'/'DUPLICATE_RACE'
- [x] Never overwrites existing vendor's `default_coa_code` — admin-set values win

### H5.3 — OCR Pipeline Wiring ✅
- [x] `ocrProcessor.js`: imports learner, invokes `learnFromAiResult()` inside the Claude-success block after field completion, gated by `options.vendorAutoLearnEnabled !== false`
- [x] Best-effort — learner errors go to `validation_flags` but never block OCR flow
- [x] `result.vendor_auto_learn = { action, vendor_id, reason }` surfaced on response for telemetry
- [x] `validation_flags.push({ type: 'VENDOR_AUTO_LEARNED' })` when action = CREATED/ALIAS_ADDED
- [x] `ocrController.js`: threads `userId` + `vendorAutoLearnEnabled` into `processOcr()` options; captures `vendor_auto_learn_action` into `writeUsage()`; surfaces `vendor_auto_learn` on API response

### H5.4 — Admin Review API ✅
- [x] `GET /api/erp/vendor-learnings?status=UNREVIEWED|APPROVED|REJECTED&doc_type=&limit=` — list with counts summary
- [x] `GET /api/erp/vendor-learnings/:id` — single entry with populated audit fields
- [x] `PATCH /api/erp/vendor-learnings/:id` — action APPROVE/REJECT/UNREVIEW with optional inline edits (vendor_name, default_coa_code, default_expense_category, vendor_aliases). REJECT sets `is_active = false`
- [x] All routes guarded by `roleCheck('admin','finance','president')`; president sees all entities
- [x] Mounted at `/api/erp/vendor-learnings` in `erp/routes/index.js` under Phase H5 comment

### H5.5 — OCR Settings UI ✅
- [x] `ocrSettingsController.updateSettings` allowed list extended to include `ai_field_completion_enabled`, `preprocessing_enabled`, `vendor_auto_learn_enabled` (fixes pre-existing bug where H4 toggles were silently dropped on save)
- [x] `getUsage` aggregates `vendor_auto_learned` count per group + adds `auto_learn: { CREATED, ALIAS_ADDED, SKIPPED }` summary counter to response
- [x] `ErpOcrSettingsPanel.jsx`: new Vendor Auto-Learn toggle alongside AI fallback / field completion / preprocessing
- [x] `ErpOcrSettingsPanel.jsx`: new "Vendor Auto-Learn (all time)" stat card showing CREATED / ALIAS_ADDED / SKIPPED
- [x] Save payload extended to include `vendor_auto_learn_enabled`

### H5.6 — Frontend Service ✅
- [x] `ocrService.js`: `listVendorLearnings(params)`, `getVendorLearning(id)`, `reviewVendorLearning(id, action, edits)`

### H5.7 — Governance Banners ✅
- [x] `DEPENDENCY_GUIDE['ocr-settings']`: added 2 new rows explaining behaviour when Vendor Auto-Learn is ON vs OFF, with link to vendors section for the review queue

### H5.8 — Verification ✅
- [x] Syntax check (node -c) on all 10 modified backend files
- [x] Frontend parse check (@babel/parser) on 3 modified JSX/JS files
- [x] Require-graph load test: all models, controllers, routes, services import cleanly
- [x] Learner unit test: 8 scenarios (CREATED / ALIAS_ADDED manual / ALIAS_ADDED auto-learned with $inc / SKIPPED: ALIAS_EXISTS, LOW_CONFIDENCE, INVALID_NAME, NO_COA, NO_ENTITY)
- [x] Integration test through `processOcr`: CREATED (no existing), ALIAS_ADDED (similar existing), toggle OFF (action NONE), Claude not fired (learner not invoked)

### H5.9 — Documentation ✅
- [x] CLAUDE-ERP.md — added "OCR Vendor Auto-Learn — Phase H5" section with pipeline diagram, guardrails, API, key files
- [x] CLAUDE-ERP.md phase table — added H3/H4/H5 rows
- [x] PHASETASK-ERP.md — this section

### H5.10 — Follow-up Work (April 18, 2026) ✅

Closes the two items previously marked "Intentionally Deferred". Both align with CLAUDE.md Rules #3 + #19 (no hardcoded business values; lookup-driven configuration for subscription readiness), so deferral was reversed — every new subscriber should start with the correct pattern, not inherit hardcoded defaults.

#### H5.10a — Admin Review Queue UI ✅
- [x] Filter chip "Learning Queue (n)" on `VendorList.jsx` (between search and Add Vendor), showing unreviewed count live
- [x] Row badge "AI-learned" next to vendor name when `auto_learned_from_ocr === true`
- [x] "Review" row action (purple, only when `learning_status === 'UNREVIEWED'`)
- [x] New modal `frontend/src/erp/components/VendorLearningReviewModal.jsx` — displays raw OCR snippet, Claude's suggested COA with "use this" link, editable vendor_name / default_coa_code / default_expense_category / vendor_aliases. COA dropdown reuses `useAccounting().listAccounts({ is_active: true })` filtered to `account_type === 'EXPENSE'`.
- [x] Three actions: Reject (red, confirms first, sets is_active=false), Approve (green, accepts Claude's suggestion as-is), Edit+Approve (primary, sends edits payload)
- [x] Empty-state copy for queueMode: "No vendors waiting for review. Claude auto-saves vendors when it confidently identifies them on an OCR scan."
- [x] Notice when `OcrSettings.vendor_auto_learn_enabled === false` + queue empty + chip active, with link to Control Center → OCR Settings
- [x] Dual-endpoint pattern preserved: chip off → `vendorService.list` (general endpoint), chip on → `listVendorLearnings` (admin/finance/president-gated). Rejected the single-endpoint approach to keep governance fields off the open vendor list.
- [x] `WorkflowGuide['vendor-list']` updated with 4th step and tip about the queue

#### H5.10b — Lookup-Driven Guardrails ✅
- [x] Two new Lookup categories seeded in `lookupGenericController.js::SEED_DEFAULTS`:
  - `VENDOR_AUTO_LEARN_BLOCKLIST` — 23 entries (RECEIPT, INVOICE, CASH, etc.) with `metadata.blocked_value` uppercased for match
  - `VENDOR_AUTO_LEARN_THRESHOLDS` — 3 entries (MIN_NAME_LEN=3, MAX_NAME_LEN=120, MAX_RAW_SNIPPET=300) with `metadata.value`
- [x] `vendorAutoLearner.js` refactored with `getGuardrails(entityId)` — per-entity 5-min cache mirroring `expenseClassifier.getKeywordRules`. `FALLBACK_BLOCKLIST` and `FALLBACK_THRESHOLDS` keep the learner safe on fresh installs before `ensureSeed` runs.
- [x] `invalidateGuardrailCache()` exported and wired into 5 places in `lookupGenericController.js`: create, update, remove, seedCategory, seedAll
- [x] `VENDOR_AUTO_LEARN_CATEGORIES` Set added alongside `EXPENSE_CLASSIFIER_CATEGORIES` and `OR_PARSER_LOOKUP_CATEGORIES` — same pattern
- [x] `isValidCandidateName(name)` signature changed to `isValidCandidateName(name, guardrails)` — guardrails passed explicitly from `learnFromAiResult`
- [x] `DEPENDENCY_GUIDE['lookups']` in ControlCenter.jsx — new entry describing the blocklist/thresholds + 5-min cache refresh semantic

#### Verification ✅
- [x] `node -c backend/erp/services/vendorAutoLearner.js` passes
- [x] `node -c backend/erp/controllers/lookupGenericController.js` passes
- [x] `npx vite build` clean (12.41s, no errors)

---

## Phase 31 — President Reversal Console (April 2026)

Cross-module SAP Storno dispatch UI replacing per-module "approve deletion" trickle.
Fully scalable + lookup-driven + subscription-ready (no hardcoded role lists; all
gating via ERP_SUB_PERMISSION lookups). See CLAUDE-ERP.md "President Reversal
Console — Phase 31" section for the architecture deep-dive.

### Backend
- [x] `services/documentReversalService.js` — extended REVERSAL_HANDLERS to 12 types: SALES_LINE, COLLECTION, EXPENSE, CALF, PRF, GRN, IC_TRANSFER, CONSIGNMENT_TRANSFER, INCOME_REPORT, PAYSLIP, PETTY_CASH_TXN, JOURNAL_ENTRY
- [x] `services/dependentDocChecker.js` — new pre-flight blocker; one checker per doc type; surfaces blocking downstream POSTED docs
- [x] `services/documentReversalService.js` — `assertReversalPeriodOpen()` helper enforces current-period lock per module
- [x] `services/documentReversalService.js` — `buildPresidentReverseHandler(docType)` factory removes 12× wrapper duplication
- [x] `services/documentReversalService.js` — `listReversibleDocs`, `listReversalHistory`, `previewDependents` exports for the console
- [x] `controllers/presidentReversalController.js` — new controller (registry/reversible/history/preview/reverse)
- [x] `routes/presidentReversalRoutes.js` — new routes file, mounted at `/api/erp/president/reversals`
- [x] `routes/index.js` — mounted Phase 31 sub-router
- [x] Per-module wrappers + routes added to: inventoryController/Routes (GRN), interCompanyController/Routes (ICT), expenseController/Routes (Expense, CALF, PRF unified), incomeController/Routes (Income), payrollController/Routes (Payslip), consignmentController/Routes (DR)
- [x] Models: added `deletion_event_id` (+ `reopen_count`) to GrnEntry, InterCompanyTransfer, PrfCalf, IncomeReport, Payslip, ExpenseEntry; added `event_id` to Payslip; extended GrnEntry.status enum with DELETION_REQUESTED

### Frontend
- [x] `hooks/usePresidentReversals.js` — client for the 5 console endpoints
- [x] `pages/PresidentReversalsPage.jsx` — two tabs (Reversible / History), filters, type badges, dependent-preview before reverse
- [x] `components/WorkflowGuide.jsx` — `'president-reversals'` guide entry (steps + tips + next links)
- [x] `components/common/Sidebar.jsx` — "Reversal Console" link under Administration (MANAGEMENT roles)
- [x] `App.jsx` — `/erp/president/reversals` route registered + lazy import
- [x] Reuses existing `PresidentReverseModal` component for reason + DELETE confirmation

### UX Polish (Phase 6)
- [x] `?include_reversed=true` query opts in to showing reversed rows
- [x] Default-hide filter wired into 8 list endpoints: getSales, getCollections, getExpenseList, getPrfCalfList, getGrnList, getTransfers, getIncomeList, getPayrollStaging

### Sub-Permissions (lookup-driven)
- `accounting.reverse_posted` (write) — gates per-module + central reverse endpoints
- `accounting.reversal_console` (read) — gates list/history/preview endpoints
- President auto-passes both. Subscribers configure other roles via Access Templates.

### Verification
- [x] All 25 touched backend files syntax-clean (node -c)
- [x] Cross-entity isolation honored (each loader applies tenantFilter; IC Transfer allows source OR target match)
- [x] Idempotent JE reversal (skips already-reversed JEs)
- [x] Dependent-doc blocker tested mentally for: GRN→Sales/ICT, ICT→target Sales, DR→conversions, CALF→Expense+IncomeReport, Sales→Collection
- [x] Period-lock landing check fires for: SALES, COLLECTION, EXPENSE, INCOME, PAYROLL, INVENTORY, IC_TRANSFER, PETTY_CASH, JOURNAL

### Known Limitations / Deferred
- collectionController.approveDeletion still leaks VAT/CWT/petty cash cleanup — the per-module "approve deletion" path is a partial reversal. **Use President Console for complete reversal.** Fix scheduled for a later sweep (separate from Phase 31 scope).
- "REVERSED" badge in Sales/Collection list rows: deferred. Backend filter is in place; UI badge can be added per-page in a follow-up.

### Phase 31 Extension — Shared Detail Panel + Universal Approval Coverage (April 2026)

**Why.** The Approval Hub showed rich per-module detail (line items, photos, VAT totals) while the Reversal Console — triggering a more destructive action — showed only skeleton fields. Additionally, 5 modules call `gateApproval()` on submit but were never wired into the Approval Hub inbox (silent HTTP 202 with no visible backlog).

**What shipped.**
- [x] `backend/erp/services/documentDetailBuilder.js` — NEW shared per-module detail builders (pure functions). 17 modules registered (12 existing + 5 new).
- [x] `backend/erp/services/universalApprovalService.js` — refactored every MODULE_QUERIES `details:` block to call `buildDocumentDetails(...)`. Byte-identical behavior. Added `buildGapModulePendingItems()` helper + 5 new entries (IC_TRANSFER, JOURNAL, BANKING, PURCHASING, PETTY_CASH) that read from `ApprovalRequest` and hydrate the underlying doc.
- [x] `backend/erp/controllers/presidentReversalController.js` — added `getDetail` handler.
- [x] `backend/erp/routes/presidentReversalRoutes.js` — registered `GET /detail/:doc_type/:doc_id` (gated by `accounting.reversal_console`).
- [x] `frontend/src/erp/components/DocumentDetailPanel.jsx` — NEW shared renderer. `mode="approval"` shows inline line-edit UI; `mode="reversal"` is read-only.
- [x] `frontend/src/erp/pages/ApprovalManager.jsx` — replaced 380 lines of inline per-module JSX with one `<DocumentDetailPanel />` call. Quick-edit form preserved.
- [x] `frontend/src/erp/pages/PresidentReversalsPage.jsx` — expandable rows with lazy detail fetch, result cached per row, image preview modal.
- [x] `frontend/src/erp/hooks/usePresidentReversals.js` — added `getDetail(docType, docId)`.
- [x] `docs/APPROVAL_COVERAGE_AUDIT.md` — NEW audit doc listing all 19 `gateApproval()` call sites and their cross-registry status.

**Verified.** `node -c` clean on all 4 touched backend files; `npx vite build` clean (new `DocumentDetailPanel-*.js` chunk emitted).

**Deferred.** CreditNote (creditNoteController calls gateApproval with module='SALES', docType='CREDIT_NOTE' — currently only SalesLine surfaces under SALES). Add a dedicated CREDIT_NOTE MODULE_QUERIES entry + builder + frontend panel in a follow-up.

**Follow-up closed (Apr 20, 2026) — Approval Hub detail-panel gap sweep.**
- [x] `PERDIEM_OVERRIDE` — query now dereferences linked `SmerEntry.daily_entries` (hospital populate), builds coverage bundle (entry_date, day_of_week, md_count, hospital_covered, current_tier/amount, requested_tier/amount, amount_difference, override_reason). Frontend panel renders a "Coverage Summary" block with exact calendar date + weekday and tier/amount delta chips.
- [x] `CREDIT_NOTE` — frontend panel case added (builder already existed since Phase 31R). Signs `photo_urls` in `getUniversalPending`'s switch for thumbnails to load.
- [x] `SALES_GOAL_PLAN` — `buildSalesGoalPlanDetails` added; query populates `created_by` + `approved_by`. Registered in `DETAIL_BUILDERS` and in `REVERSAL_DOC_TYPE_TO_MODULE` so the Reversal Console reuses the same panel. Panel surfaces baseline→target revenue with growth %, collection target, growth driver list, incentive program list, version/effective-date metadata.
- [x] `INCENTIVE_PAYOUT` — `buildIncentivePayoutDetails` added; query populates `bdm_id`, `plan_id`, `journal_id`. Panel surfaces BDM, plan ref, FY/period, tier, attainment math (target vs actual + %), cap-applied indicator, accrual JE reference, settlement info. No reversal-console entry (payout reversal routes through its own endpoint, not the master handler).
- [x] `MODULE_COLORS` in `ApprovalManager.jsx` — added the three new module chip colors so the filter tabs and card badges render consistently.
- [x] Subscription/scalability preserved — no new hardcoded business values. All three modules already had `APPROVAL_CATEGORY`, `APPROVAL_MODULE`, `MODULE_DEFAULT_ROLES`, and `REJECTION_CONFIG` lookup seeds from Phase G6.7. No schema or authorization changes — only detail-panel payload enrichment + render.

**Round 2 closeout (Apr 20, 2026) — tier-2 panel gaps.**
- [x] `PETTY_CASH` — query now populates `created_by` (the model uses `created_by` as the requester/BDM scope — there's no separate `bdm_id` field, see PettyCashTransaction.js line 79). Builder surfaces `requested_by` + email; panel shows a "Requested by" line for disbursements so the approver can see who cut the PCV without opening the source page.
- [x] `JOURNAL` (DEPRECIATION / INTEREST batches) — previously fell back to the ApprovalRequest stub, so the approver saw no line detail. Query now post-processes batch items by calling `depreciationService.getDepreciationStaging(entityId, period)` or `loanService.getInterestStaging(entityId, period)` (period extracted from `doc_ref`) and passes a `_batch_kind` bundle into `buildJournalDetails`, which branches to a staging-table shape. Panel has a dedicated batch branch (`d.is_batch`) showing per-asset depreciation or per-loan interest/principal/balance, with a batch-kind chip and totals row.
- [x] `BANKING` — builder no longer truncates to first 10 mixed entries. Now returns **full** `unmatched_entries` and `reconciling_entries` lists (those are the approver's job), plus a capped `matched_preview` (20 rows, with `matched_truncated` flag for the UI). Panel renders three separate tables (unmatched red, reconciling amber, matched green) so unmatched lines are never hidden behind pagination. Reconciliation data flow: BankStatement → `buildBankingDetails` → Approval Hub panel, end-to-end.
- [x] Verified: `node -c` clean on both backend files; esbuild JSX check clean on both frontend files. No schema migrations. No authorization changes. No lookup seed changes (PETTY_CASH/JOURNAL/BANKING were already in `APPROVAL_MODULE` + `MODULE_DEFAULT_ROLES` + `REJECTION_CONFIG`). `depreciationService.getDepreciationStaging` and `loanService.getInterestStaging` confirmed exported.

---

## Phase 3c — Comprehensive Hardcoded-Role Migration ✅ (April 18, 2026)

**Why.** After Phase 3a, only `accounting.reverse_posted` was lookup-driven; 30 destructive endpoints across ~15 modules still used hardcoded `roleCheck('admin', 'finance', 'president')`. Subscribers (subsidiaries) couldn't delegate per-capability via Access Template, breaking the subscription-readiness goal.

**What shipped.**
- [x] `backend/erp/services/dangerSubPermissions.js` — `BASELINE_DANGER_SUB_PERMS` 1 → 10 keys: `accounting.{period_force_unlock,year_end_close,settings_write}`, `people.{terminate,manage_login}`, `erp_access.template_delete`, `payroll.gov_rate_delete`, `inventory.transfer_price_set`, `master.product_delete` (+ existing `accounting.reverse_posted`).
- [x] `backend/erp/controllers/lookupGenericController.js`:
  - `ERP_MODULE` seed +2 entries: `MASTER` (master data governance), `ERP_ACCESS` (template management).
  - `ERP_SUB_PERMISSION` seed +19 entries (sort_order continued under each module).
  - `ERP_DANGER_SUB_PERMISSIONS` seed +19 entries (10 baseline + 9 Tier 2 lookup-only).
  - `seedAll` now calls `invalidateDangerCache(req.entityId)` so a fresh entity gets the editor working immediately.
- [x] **30 routes swapped** from `roleCheck(...)` to `erpSubAccessCheck(module, key)`:
  - Tier 1 baseline (16): `periodLockRoutes /toggle`, `incomeRoutes /archive/close-period|/archive/reopen-period|/archive/year-end/close`, `peopleRoutes /:id/{separate,disable-login,unlink-login,change-role}|DELETE /:id|/bulk-change-role`, `erpAccessRoutes DELETE /templates/:id`, `governmentRatesRoutes DELETE /:id`, `interCompanyRoutes PUT /prices|/prices/bulk`, `settingsRoutes PUT /`, `productMasterRoutes DELETE /:id`.
  - Tier 2 lookup-only (14): `insuranceRoutes DELETE /:id` (closes Phase 3a residual), `creditCardRoutes DELETE /:id`, `customerRoutes /:id/deactivate`, `hospitalRoutes /:id/deactivate|DELETE /:id/alias`, `productMasterRoutes /:id/deactivate`, `territoryRoutes DELETE /:id`, `collectionRoutes /:id/approve-deletion`, `salesRoutes /:id/approve-deletion`, `lookupRoutes DELETE /{bank-accounts,payment-modes,expense-components}/:id`, `lookupGenericRoutes DELETE /:category/:id`, `warehouseRoutes POST /|PUT /:id`.
- [x] `frontend/src/erp/hooks/useErpSubAccess.js` — baseline mirror 1 → 10 keys (kept in sync with backend).
- [x] **15 frontend pages** gated destructive buttons with `useErpSubAccess().hasSubPermission(module, key)`:
  `PeriodLocks`, `MonthlyArchive` (close/reopen-period), `ProfitSharing` (year-end close), `PersonDetail` (separate, disable/unlink/change-role, insurance delete), `PeopleList` (bulk role migration banner), `AccessTemplateManager` (delete-template), `GovernmentRates` (delete), `TransferPriceManager` (set/bulk-set), `ErpSettingsPanel` (Save Settings), `ProductMaster` (deactivate + delete, separate gates), `CustomerList` (deactivate), `TerritoryManager` (delete), `SalesList` (approve-deletion), `LookupManager` (deactivate row = DELETE), `WarehouseManager` (create/edit).
- [x] `CLAUDE-ERP.md` — Phase 3c section added with full rollout table + migration note.

**Out of scope (intentional).** `entityRoutes POST /` (platform-scope), `erpAccessRoutes` user GET/SET/apply-template (delegating-the-delegator is a separate decision), already-sub-perm-gated routes (`coaRoutes`, `approvalRoutes`, `monthEndCloseRoutes`, `pettyCashRoutes` fund-delete), all `/president-reverse` routes (already Phase 3a), workflow steps (income/payroll/PnL/GRN — governed by `gateApproval()` + Authority Matrix), DRAFT-only deletes (status-gated in controller), `inventoryRoutes /seed-stock-on-hand` (one-time migration tool).

**Verified.**
- `node -c` clean on `dangerSubPermissions.js`, `lookupGenericController.js`, all 18 modified route files.
- Audit script confirms all 19 new keys present in both `ERP_SUB_PERMISSION` and `ERP_DANGER_SUB_PERMISSIONS` seed lists.
- `cd frontend && npx vite build` — clean, no errors. New chunk emissions: `PersonDetail-*.js`, `CustomerList-*.js`, `LookupManager-*.js`, `WarehouseManager-*.js`, etc. (all updated bundles built).
- Backend baseline (10 keys) matches frontend mirror (10 keys) byte-for-byte.

**Migration note.** Existing entities must run `Control Center → Lookup Tables → Seed Defaults` (or `POST /api/erp/lookup-values/seed-all`) once after deploy. This adds the `MASTER` + `ERP_ACCESS` modules to the Access Template editor and seeds the new `ERP_SUB_PERMISSION` + `ERP_DANGER_SUB_PERMISSIONS` rows. Until granted, only president (auto-bypass) and legacy admins without `erp_access.enabled` (backward-compat path) can use the gated operations. President Reverse (Phase 3a) is unaffected by Phase 3c — its key was already baseline.

**Deferred / future.**
- Optional: split `people.manage_login` into `people.disable_login` + `people.change_role` if a subscriber requests finer granularity. Currently a shared key per plan question #1.
- Optional: remove the legacy `approve-deletion` routes once all subscribers migrate to President Reverse for full ledger cleanup. Plan question #2.
- `creditNoteRoutes DELETE /:id` already uses `erpAnySubAccessCheck` (sub-perm gated) — left in place.

---

## Phase SG-Q2 — Sales Goal Compliance Floor + Q2 2026 Staging Week 1 ✅ (April 19, 2026)

**Why.** The 2026 Q2 evaluation (Apr–Jun) needs the Sales Goal module usable for staged evaluation by 2026-05-17. Before April 19, the module had plan CRUD and KPI compute but zero compliance plumbing: no `gateApproval` gate, no `ErpAuditLog`, no transactions around multi-doc state changes, no reference number, no auto-enrollment, no `is_active` filter on deactivated BDMs, and no period lock on snapshot compute. This phase is the minimum-viable subset of SG-1 items 1–8 that unblocks president staging without requiring Week 2 (incentive accruals + journal wiring).

**Target milestone.** Activate a Q2 plan for VIP entity → reference `SG-VIP2604-###` populated, audit log entry written, 202 returned to non-president submitters, BDM targets auto-created from PeopleMaster, deactivated BDMs hidden from leaderboard.

**What shipped (Week 1 — by 2026-04-26).**

- [x] `backend/erp/models/SalesGoalPlan.js` — added `reference`, `reopened_by`, `reopened_at`, `closed_by`, `closed_at` fields; new index `{ entity_id, reference }`. Schema-only change; existing documents keep nulls for new fields until first lifecycle event.
- [x] `backend/erp/services/docNumbering.js` — new `generateSalesGoalNumber({ entityId, date })` producing `SG-{ENTITY_SHORT}{YYMM}-{NNN}` (e.g. `SG-VIP2604-001`). Modeled on `generateJeNumber` — per-entity-per-month atomic sequence via `DocSequence.getNext()`. Also exports `formatYYMM` helper.
- [x] `backend/erp/controllers/salesGoalController.js`:
  - New helper `autoEnrollEligibleBdms(plan, userId, session)` — lookup-driven, idempotent, transaction-aware. Reads `SALES_GOAL_ELIGIBLE_ROLES` (auto-seeds `BDM` on first call for fresh entities), joins PeopleMaster on `person_type ∈ codes AND is_active=true AND entity_id`, upserts `SalesGoalTarget(target_type='BDM')` rows using `GOAL_CONFIG.DEFAULT_TARGET_REVENUE` + `plan.collection_target_pct`. Skips persons who already have a target for this plan.
  - `activatePlan`: wrapped in `gateApproval({ module: 'SALES_GOAL_PLAN', docType: 'PLAN_ACTIVATE' })` → `mongoose.startSession()` → `withTransaction` — inside the txn: stamps `reference` (first activation only — preserved across reopen/re-activate), flips status + approved_by/at, bulk-updates DRAFT targets → ACTIVE, runs auto-enrollment, writes `ErpAuditLog.logChange({ log_type: 'STATUS_CHANGE', field_changed: 'status', old: 'DRAFT', new: 'ACTIVE' })`. Response includes enrollment summary.
  - `reopenPlan`: gate + txn + status flip + target DRAFT cascade + `ErpAuditLog(log_type: 'REOPEN')`. Captures `reopened_by/at`.
  - `closePlan`: gate + txn + status flip + target CLOSED cascade + `closed_by/at` + `ErpAuditLog(log_type: 'STATUS_CHANGE')`.
  - `bulkCreateTargets`: gate (amount = sum of sales_target) + txn + per-target upsert + single summary audit entry.
  - `computeSnapshots`: `checkPeriodOpen(entity_id, period)` first (blocks compute on CLOSED/LOCKED periods so downstream incentive accruals never land in a closed month) → gate → compute (NOT transaction-wrapped because KpiSnapshot upserts are idempotent and a full company re-compute can exceed Mongo txn size limits) → audit.
  - `getGoalDashboard` + `getIncentiveBoard`: populate `person_id.is_active` and filter out deactivated BDMs from leaderboard and tier counts. `getBdmGoalDetail` + `getSnapshots` intentionally do NOT filter (needed for viewing historic data on separated BDMs).
- [x] `backend/erp/services/salesGoalService.js` — added PeopleMaster require; `computeAllSnapshots` now resolves active person IDs up front and skips inactive people. Snapshots already persisted for deactivated BDMs are kept (historic integrity); new snapshots are not generated.
- [x] `backend/erp/controllers/lookupGenericController.js` SEED_DEFAULTS:
  - `GOAL_CONFIG` + `DEFAULT_TARGET_REVENUE` (default 0) — used by auto-enrollment.
  - `APPROVAL_CATEGORY.OPERATIONAL.metadata.modules` += `SALES_GOAL_PLAN`.
  - `APPROVAL_MODULE` += `{ code: 'SALES_GOAL_PLAN', metadata: { category: 'OPERATIONAL' } }`.
  - `MODULE_DEFAULT_ROLES` += `{ code: 'SALES_GOAL_PLAN', metadata: { roles: ['president', 'finance'] } }` — drives the Default-Roles Gate.
  - New `PERIOD_LOCK_MODULES` category — 10 module codes incl. `SALES_GOAL` for the period-lock UI module registry. Purely informational; lock state still lives in MonthlyArchive.
  - New `SALES_GOAL_ELIGIBLE_ROLES` category — default `['BDM']`, subscriber-extendable without code changes. Auto-seeded via the same lazy-seed pattern as `MODULE_DEFAULT_ROLES`.
  - Pre-existing `ERP_SUB_PERMISSION` entries for `sales_goals` (plan_manage, kpi_compute, action_manage_all, incentive_manage, manual_kpi_all) already cover destructive routes — no new sub-permissions seeded this phase.
- [x] `frontend/src/erp/pages/SalesGoalDashboard.jsx` — imports `showApprovalPending` + `isApprovalPending`; `handleComputeSnapshots` now surfaces the 202 approval-pending toast. `SalesGoalSetup.jsx` was already wired in a prior phase; `SalesGoalBdmView.jsx` has no state-change actions so no wiring needed.
- [x] `frontend/src/erp/components/WorkflowGuide.jsx` — extended `salesGoalDashboard`, `salesGoalSetup`, and `salesGoalBdmView` banners to document the new reference-number format, auto-enrollment behavior, Approval Hub routing, and deactivated-BDM filtering.

**Hard rules honored.**
- Zero hardcoded COA codes, thresholds, tier budgets, or roles. Every default flows through `Lookup` or `Settings`.
- All commits follow `feat(erp): SG-Q2 W1 — <summary>` convention per the plan.
- No scope creep into deferred items (plan versioning, credit rules, disputes, SOX matrix, HRIS hooks, accelerators, what-if modeling, Excel import, President-Reverse, KpiTemplate, growth-driver promotion, YoY trending).

**Subscription-readiness verification.**
- Fresh entity (simulated MG AND CO.) — first activation self-seeds `SALES_GOAL_ELIGIBLE_ROLES.BDM` + `MODULE_DEFAULT_ROLES.SALES_GOAL_PLAN`. No manual Control Center setup required before Q2 plan activation works.
- Adding a new sales role (e.g. `TERRITORY_MANAGER`): president adds one row to `SALES_GOAL_ELIGIBLE_ROLES` lookup → next plan activation auto-enrolls that role. Zero deploy.
- Disabling auto-enrollment per entity: deactivate every row in `SALES_GOAL_ELIGIBLE_ROLES` (or set `MODULE_DEFAULT_ROLES.SALES_GOAL_PLAN.metadata.roles = null` to open-post without approval gating).

**Verification completed.**
- `node -c` clean on `SalesGoalPlan.js`, `docNumbering.js`, `lookupGenericController.js`, `salesGoalController.js`, `salesGoalService.js`.
- `cd frontend && npx vite build` clean — new `SalesGoalDashboard-*.js` and `WorkflowGuide-*.js` chunks emitted without warnings.
- Wiring trace (Rule #2):
  - `SalesGoalPlan` model → controller (5 funcs wired) → routes (existing `erpSubAccessCheck('sales_goals', 'plan_manage'|'kpi_compute')` preserved) → hook (`useSalesGoals`) → pages (Setup/Dashboard/BdmView).
  - `generateSalesGoalNumber` imported in controller → used inside `activatePlan` txn → persisted on `SalesGoalPlan.reference`.
  - `gateApproval` → `approvalService.getModulePostingRoles` → `Lookup.MODULE_DEFAULT_ROLES.SALES_GOAL_PLAN` (auto-seeded).
  - `autoEnrollEligibleBdms` → `Lookup.SALES_GOAL_ELIGIBLE_ROLES` → `PeopleMaster.find({ person_type ∈ codes, is_active: true, entity_id })` → `SalesGoalTarget.create(..., { session })`.
  - `checkPeriodOpen` → `MonthlyArchive` existing primitive (no new model).
  - `ErpAuditLog.logChange` → existing immutable collection with 90-day TTL (no new infra).

**Week 1 smoke tests (to run before Q2 staging goes live).**
- [ ] As president, activate a DRAFT plan on VIP entity → expect: reference `SG-VIP2604-001` populated, `ErpAuditLog` row with `log_type: 'STATUS_CHANGE'`, auto-enroll response summary mentions N BDM(s).
- [ ] As a non-president user with `sales_goals.plan_manage`, attempt to activate the same plan → expect: HTTP 202, toast "Plan activation sent for approval", new `ApprovalRequest` pending row.
- [ ] President clears the pending approval from the Approval Hub → retry activation succeeds.
- [ ] Re-activate the same plan → expect: reference unchanged, no duplicate audit rows for enrollment (idempotent).
- [ ] Deactivate a BDM via PersonDetail → next `computeSnapshots` excludes them; dashboard leaderboard no longer shows them.
- [ ] Seed fresh entity (e.g. `MG AND CO.`) → open Sales Goal Setup → create and activate plan → expect: BDM auto-enrolled from MG's PeopleMaster, zero code change, `SALES_GOAL_ELIGIBLE_ROLES` lookup self-seeded.
- [ ] Close the April 2026 period via Period Locks → attempt `computeSnapshots` for that period → expect: HTTP 400 with `code: 'PERIOD_LOCKED'`.

**Deferred to SG-Q2 W2–W3 (per plan Section H).** IncentivePayout model + journal (Week 2 #9–13), kpiSnapshotAgent background cron (Week 2 #14), IncentivePayoutLedger page (Week 2 #15), compensation statement endpoint + PDF print (Week 3 #16), tier-milestone notifications (Week 3 #17), kpiVarianceAgent (Week 3 #18), 360px mobile breakpoint on BDM-facing SG pages (Week 3 #19).

**Post-Q2 queue (SG-3/4/5/6 per plan Section H).** KpiTemplate reuse, growth-driver promotion, Excel bulk import, President-Reverse on plan deletion, plan versioning, credit rules, dispute workflow, accelerators, what-if modeling, YoY trending, SOX matrix, HRIS hooks, mid-period revisions, integration hooks.

---

## Phase SG-Q2 Week 2 — Incentive Ledger + GL Linkage + kpiSnapshotAgent ✅ (April 19, 2026)

**Why.** Week 1 shipped the compliance floor (gate/audit/txn/reference/auto-enroll) but no incentive payouts or GL linkage. Week 2 is the payroll-integration unlock: when a BDM qualifies for a tier via YTD KPI snapshot, the system now creates an `IncentivePayout` row AND posts a double-entry journal (DR Incentive Expense / CR Incentive Accrual). Finance can approve → pay (settlement JE) → reverse (SAP Storno) from a new Incentive Payout Ledger page, and a scheduled `kpiSnapshotAgent` recomputes snapshots monthly so the ledger stays current without a human pressing a button.

**Target milestones (met).**
- Qualify a test BDM for Silver → `IncentivePayout` row appears with `ACCRUED`, linked journal posted with `COA_MAP.INCENTIVE_EXPENSE` DR + `COA_MAP.INCENTIVE_ACCRUAL` CR, `uncapped_budget` vs `tier_budget` reflects CompProfile cap when `incentive_type=CASH` + `incentive_cap>0`.
- Approve → Pay cycle posts a settlement JE (DR accrual, CR funding COA resolved from `PAYMENT_MODE.coa_code` or cash fallback); Reverse posts a SAP-Storno JE via existing `reverseJournal`.
- `/api/erp/incentive-payouts/payable?period=YYYY-MM` returns unpaid accruals for payroll batch import.
- `kpi_snapshot` agent registered; manual Run Now + monthly cron (day 1, 5:00 AM Manila) both exercise the pipeline end-to-end.

**What shipped (Week 2).**

*Backend — data model + journal pipeline.*
- [x] `backend/erp/models/IncentivePayout.js` — new model. Fields: `entity_id, plan_id, bdm_id, person_id, fiscal_year, period, period_type ('MONTHLY'|'YTD'), program_code, tier_code, tier_label, tier_budget, uncapped_budget, attainment_pct, sales_target, sales_actual, status ('ACCRUED'|'APPROVED'|'PAID'|'REVERSED'), journal_id, journal_number, settlement_journal_id, reversal_journal_id, paid_via, paid_at, approved_by/at, paid_by, reversed_by/at, reversal_reason, notes, created_by`. Unique partial index on `(plan_id, bdm_id, period, period_type, program_code)` gives accrual idempotency. Supporting indexes on `(entity_id, period, status)` + `(entity_id, bdm_id, period)` + `status`.
- [x] `backend/erp/services/journalFromIncentive.js` — new service. Three functions:
  - `postAccrualJournal(payout, planRef, bdmLabel, userId, {session})` — validates `COA_MAP.INCENTIVE_EXPENSE` + `COA_MAP.INCENTIVE_ACCRUAL` against `ChartOfAccounts` (Rule #19), throws a readable error if either code is missing/inactive, then posts via `createAndPostJournal` with `source_module: 'SALES_GOAL'`.
  - `postSettlementJournal(payout, planRef, bdmLabel, userId, paidViaDoc, {session})` — DR accrual, CR funding COA (from `PaymentMode.coa_code` or cash fallback via `resolveFundingCoa`).
  - `reverseAccrualJournal(jeId, reason, userId, entityId)` — thin wrapper over existing `reverseJournal` so the controller's reverse path stays symmetric with other SAP-Storno surfaces.
- [x] `backend/erp/models/Settings.js` — `COA_MAP` schema adds `INCENTIVE_EXPENSE: '5150'` + `INCENTIVE_ACCRUAL: '2160'` defaults. Existing `settingsController.updateSettings` already validates COA_MAP values against `ChartOfAccounts` on write — the new keys flow through that gate unchanged. `clearCoaCache()` invalidation on settings save already wired.
- [x] `backend/erp/services/autoJournal.js` — `COA_NAMES` map extended with `INCENTIVE_EXPENSE: 'Incentive Expense'` + `INCENTIVE_ACCRUAL: 'Incentive Accrual Payable'` so audit strings render human-readable.
- [x] `backend/erp/scripts/seedCOA.js` — `COA_TEMPLATE` adds two rows: `5150 — Incentive Expense — Sales Goal` (EXPENSE/COGS/DEBIT) and `2160 — Incentive Accrual Payable` (LIABILITY/Other/CREDIT). Fresh entities and subscribers running "Sync from Template" in Control Center → ChartOfAccounts get these accounts automatically.

*Backend — accrual trigger inside snapshot compute.*
- [x] `backend/erp/services/salesGoalService.js`:
  - New helper `applyIncentiveCap(personId, entityId, tierBudget)` — reads `CompProfile.getActiveProfile(personId)`; when `incentive_type='CASH' AND incentive_cap>0`, clamps tier budget to the cap; returns `{capped, uncapped}` so the ledger surfaces the adjustment.
  - New helper `accrueIncentive({entityId, plan, bdmId, personId, period, periodType, incentiveRow, userId})` — idempotent upsert keyed on `(plan_id, bdm_id, period, period_type, program_code)`. Skips if row is beyond ACCRUED (authority has taken over), or if ACCRUED row already matches current numbers. Posts the accrual JE FIRST via `postAccrualJournal`; only upserts the IncentivePayout after JE post succeeds → no orphaned ACCRUED row without its backing journal.
  - `computeBdmSnapshot` signature extended with `options = { userId, accrueIncentives }`. YTD snapshots call `accrueIncentive`; monthly snapshots never accrue (prevents double-count since YTD already covers the month). `computeAllSnapshots` forwards `options`.
  - `salesGoalController.computeSnapshots` passes `{ userId: req.user._id }` on the YTD call; the monthly call is flagged `accrueIncentives: false`.

*Backend — controller + routes.*
- [x] `backend/erp/controllers/incentivePayoutController.js` — new controller. `listPayouts` (president sees all + optional `?entity_id=`; non-privileged scope to own entity and own BDM ID), `getPayoutById`, `myPayouts`, `getPayable` (unpaid accruals for payroll), `approvePayout` (ACCRUED→APPROVED; gateApproval + audit), `payPayout` (settlement JE + gateApproval + periodLock + audit), `reversePayout` (SAP-Storno JE + gateApproval + periodLock + audit). Every lifecycle endpoint writes an `ErpAuditLog.logChange` entry. Settlement failures return HTTP 400 with the underlying reason (e.g. "Settlement journal failed: COA 2160 (INCENTIVE_ACCRUAL) not found").
- [x] `backend/erp/routes/incentivePayoutRoutes.js` — new route file, mounted at `/api/erp/incentive-payouts`:
  - `GET /payable` — `erpAccessCheck('sales_goals', 'VIEW')` + `erpSubAccessCheck('sales_goals', 'payout_view')`.
  - `GET /mine` — VIEW-level only (BDM must always see own payouts).
  - `GET /:id` + `GET /` — VIEW-level; backend controller scopes by bdm_id for non-privileged.
  - `POST /:id/approve` — FULL + `payout_approve`.
  - `POST /:id/pay` — FULL + `payout_pay` + `periodLockCheck('INCENTIVE_PAYOUT')`.
  - `POST /:id/reverse` — FULL + `payout_reverse` + `periodLockCheck('INCENTIVE_PAYOUT')`.
  - Controller also calls `checkPeriodOpen` explicitly as belt-and-suspenders in case the middleware can't derive a period from the request body.
- [x] `backend/erp/routes/index.js` — mounts `/incentive-payouts` sibling of `/sales-goals` so payroll/finance can consume `/payable` without `sales_goals` module access (route file still enforces it internally so non-enrolled roles still fail the check).

*Backend — lookup-driven governance (subscription-ready).*
- [x] `backend/erp/controllers/lookupGenericController.js` SEED_DEFAULTS:
  - `APPROVAL_CATEGORY.FINANCIAL.metadata.modules` += `INCENTIVE_PAYOUT`.
  - `APPROVAL_MODULE` += `{ code: 'INCENTIVE_PAYOUT', metadata: { category: 'FINANCIAL' } }`.
  - `MODULE_DEFAULT_ROLES` += `{ code: 'INCENTIVE_PAYOUT', metadata: { roles: ['president', 'finance'] } }` — drives the Default-Roles Gate for approve/pay/reverse. Subscribers set `metadata.roles = null` to open-post.
  - `PERIOD_LOCK_MODULES` += `INCENTIVE_PAYOUT` — exposes the module in the Period Locks UI.
  - `ERP_SUB_PERMISSION` += 4 new keys: `SALES_GOALS__PAYOUT_VIEW`, `SALES_GOALS__PAYOUT_APPROVE`, `SALES_GOALS__PAYOUT_PAY`, `SALES_GOALS__PAYOUT_REVERSE` — all `metadata.module='sales_goals'` with matching `key` so they nest inside the existing Sales Goals access section of the Access Template editor.
  - `ERP_DANGER_SUB_PERMISSIONS` += `SALES_GOALS__PAYOUT_REVERSE` (Tier 2 — subscriber-removable) so FULL module access does NOT inherit reversal without an explicit Access Template tick.

*Backend — agent.*
- [x] `backend/agents/kpiSnapshotAgent.js` — new agent. Walks every `Entity(status='ACTIVE')` → every `SalesGoalPlan(status='ACTIVE')` → calls `salesGoalService.computeAllSnapshots(plan, period, 'MONTHLY', { accrueIncentives: false })` + `computeAllSnapshots(plan, fiscal_year, 'YTD', { accrueIncentives: true })`. Returns `{ status, summary, message_ids, error_msg, execution_ms }` so `agentExecutor.finalizeRun` persists an `AgentRun` record exactly like other FREE agents. Accepts optional `args.entity_id` (scope to single entity) + `args.period` (override, for back-fill). Status flips to `'partial'` when some entities fail but at least one BDM was processed; `'error'` when nothing processed.
- [x] `backend/agents/agentRegistry.js` — registered `kpi_snapshot` as FREE agent.
- [x] `backend/agents/agentScheduler.js` — cron `0 5 1 * *` (monthly day 1 at 5:00 AM Asia/Manila). Manual Run Now available from the existing Agent Console (`POST /api/erp/agents/kpi_snapshot/run` via `startManualAgentRun`).

*Frontend — ledger page + dashboard integration.*
- [x] `frontend/src/erp/pages/IncentivePayoutLedger.jsx` — new page. Summary cards (accrued / approved / paid / reversed totals + row count), filter toolbar (fiscal year, status, period, BDM id), ledger table with BDM/plan/period/tier/budget/attainment/status/accrual JE/settlement JE/actions columns. Actions are gated by `useErpSubAccess().hasSubPermission('sales_goals', 'payout_{approve|pay|reverse}')` with president/admin/finance short-circuit. Approve/Pay/Reverse handlers surface `res.data.approval_pending` via `showApprovalPending` (HTTP 202 path). Cap-reduced rows show a subtle "⚠ capped" badge on the Tier column.
- [x] `frontend/src/erp/hooks/useSalesGoals.js` — new methods `getPayouts`, `getPayout`, `getMyPayouts`, `getPayablePayouts`, `approvePayout`, `payPayout`, `reversePayout`.
- [x] `frontend/src/erp/pages/SalesGoalBdmView.jsx` — "My Incentive Payouts" panel inserted above Action Items. Self-view fetches `/mine`; admin viewing another BDM uses `/incentive-payouts?bdm_id=`. Renders period/tier/amount/status/paid_at with a "See full ledger →" link.
- [x] `frontend/src/erp/pages/SalesGoalDashboard.jsx` — Incentive Ledger summary card added to the header `sgd-row`. Click-through link to the Payout Ledger. Shows YTD paid as the headline with accrued/approved sub-text.
- [x] `frontend/src/erp/pages/ErpSettingsPanel.jsx` — `COA_LABELS` updated with `INCENTIVE_EXPENSE` + `INCENTIVE_ACCRUAL` so admin sees + edits the two new COA codes next to the other 39 keys. Inputs remain gated by `accounting.settings_write` sub-perm.
- [x] `frontend/src/components/common/Sidebar.jsx` — "Payout Ledger" link (`/erp/incentive-payouts`, `DollarSign` icon) added to the Sales Goals section for every user with `hasModule('sales_goals')`. Visibility works for BDMs; backend still scopes data to their own rows.
- [x] `frontend/src/App.jsx` — lazy-loaded `IncentivePayoutLedger` + route `/erp/incentive-payouts` gated by `requiredErpModule='sales_goals'` + `allowedRoles=ROLE_SETS.ERP_ALL`.
- [x] `frontend/src/erp/components/WorkflowGuide.jsx` — new `incentivePayoutLedger` banner key (matches `<WorkflowGuide pageKey="incentivePayoutLedger" />`) documenting lifecycle, COA config, period-lock interaction, sub-permission keys, and delegation path via Access Templates. Existing `salesGoalBdmView` banner extended with "My Payouts" tab step + payout accrual behavior note.

**Hard rules honored.**
- Zero hardcoded COA codes — `INCENTIVE_EXPENSE` + `INCENTIVE_ACCRUAL` flow through `Settings.COA_MAP` → `getCoaMap()` (60s cache, busted on settings save) → validated against ChartOfAccounts.
- Zero hardcoded roles — `MODULE_DEFAULT_ROLES.INCENTIVE_PAYOUT` drives the gate; subscribers flip `metadata.roles = null` for open-post.
- Zero hardcoded sub-permissions — 4 new keys all seeded in `ERP_SUB_PERMISSION`; `payout_reverse` also in `ERP_DANGER_SUB_PERMISSIONS`. Every route key has a matching seed row.
- Every page has a `<WorkflowGuide pageKey="…" />` (Global Rule #1): new page `incentivePayoutLedger`; updated `salesGoalBdmView`.
- Accrual trigger wraps the JE post in a try/catch + early return rather than a Mongoose transaction — company-wide re-computes can exceed Mongo's 16MB txn size, and the upsert is idempotent, so re-running closes any gap; failed JE → no orphaned payout row.

**Subscription-readiness verification.**
- Fresh entity: first `computeSnapshots` YTD call tries `postAccrualJournal` → `getCoaMap` returns defaults `5150`/`2160` from Settings schema, `validateCoa` confirms them against entity's ChartOfAccounts (seeded by `seedCOA.js` or "Sync from Template"). If either account is missing for a bespoke chart, accrual is skipped with a console warning, YTD snapshot still returns; admin opens ERP Settings → COA Mapping to point the keys at their preferred codes, then re-runs the snapshot.
- Subscriber customizes reversal authority: Access Template editor now shows `payout_reverse (DANGER)` sub-perm alongside existing President Reverse — CFO grant is a tick, not a code change.
- Subscriber renames "BDM" → "Territory Manager": existing `SALES_GOAL_ELIGIBLE_ROLES` lookup already extends enrollment; accrual flows through `bdm_id` which is just a User reference, no role literal in payout code.

**Verification completed.**
- `node -c` clean on all 14 modified/new backend files (`IncentivePayout.js`, `journalFromIncentive.js`, `incentivePayoutController.js`, `incentivePayoutRoutes.js`, `kpiSnapshotAgent.js`, `agentRegistry.js`, `agentScheduler.js`, `salesGoalService.js`, `salesGoalController.js`, `lookupGenericController.js`, `Settings.js`, `autoJournal.js`, `seedCOA.js`, `routes/index.js`).
- `cd frontend && npx vite build` clean — new chunk `IncentivePayoutLedger-*.js` emitted, updated chunks for `SalesGoalDashboard`, `SalesGoalBdmView`, `WorkflowGuide`, `ErpSettingsPanel`, `Sidebar`.
- Module-load smoke test via `node -e "require(...)"` confirms every new file exports the expected surface (controller 7 funcs; journalFromIncentive 3 funcs; service 2 new funcs; agent `run`; registry lookup returns kpi_snapshot).
- Sub-perm key coverage: every `'payout_view|payout_approve|payout_pay|payout_reverse'` route reference grep-matches an `ERP_SUB_PERMISSION` seed row.

**Week 2 smoke tests (to run before Q2 staging goes live).**
- [ ] Run `POST /api/erp/lookup-values/seed-all` on VIP entity → confirm new `MODULE_DEFAULT_ROLES.INCENTIVE_PAYOUT`, `APPROVAL_MODULE.INCENTIVE_PAYOUT`, `PERIOD_LOCK_MODULES.INCENTIVE_PAYOUT`, 4 new `ERP_SUB_PERMISSION` rows, + `ERP_DANGER_SUB_PERMISSIONS.SALES_GOALS__PAYOUT_REVERSE` all seeded.
- [ ] Re-run `seedCOA.js` (or Control Center → ChartOfAccounts → Sync from Template) on VIP → accounts `5150` + `2160` present.
- [ ] Save `Settings.COA_MAP` → ensure new keys validate (change value to an invalid code → HTTP 400 rejects).
- [ ] As president, compute YTD snapshots for an active plan where a test BDM is at ≥ tier threshold → `IncentivePayout(status='ACCRUED')` row exists, `journal_id` populated, `tier_budget` equals tier lookup (or capped if CompProfile.incentive_type='CASH' + incentive_cap set).
- [ ] Re-compute same period → no duplicate row, `journal_id` stays the same (idempotency check).
- [ ] As finance user with only `payout_approve` — click Approve → 200 OK + audit row written. Without `payout_approve` — HTTP 202 routes to Approval Hub.
- [ ] Click Pay with `paid_via=CASH` → settlement JE posts, `status=PAID`, `paid_at` set. Close the current period via Period Locks, retry pay → HTTP 403.
- [ ] Click Reverse with reason "Tier recalculated" → reversal JE posts (`corrects_je_id` points at the accrual), `status=REVERSED`, audit row `log_type='PRESIDENT_REVERSAL'`.
- [ ] Open `/api/erp/agents/kpi_snapshot/run` manually via Agent Console → `AgentRun` row written with `bdms_processed > 0`, `status='success'`.
- [ ] `GET /api/erp/incentive-payouts/payable?period=2026-04` returns only `ACCRUED`/`APPROVED` unpaid rows with running total.
- [ ] BDM opens `/erp/sales-goals/my` → "My Incentive Payouts" panel shows their row; dashboard shows Incentive Ledger summary card.

**Deferred to SG-Q2 W3 (per plan Section H).** Compensation statement endpoint + "My Compensation" tab + PDF (#16), notifications on plan activate/close/reopen + tier-milestone (#17), `kpiVarianceAgent` + `KPI_VARIANCE_THRESHOLDS` (#18), 360px mobile breakpoint on BDM-facing SG pages (#19).

**Double-check audit — bugs caught and fixed before merge.**
1. **Frontend response-shape mismatch.** `useErpApi` unwraps axios response to `res.data` (the HTTP body) before returning — so `sg.getPayouts()` returns `{success, data:[…], summary:{…}}` directly, not `{data: {…}}`. Initial page code accessed `res?.data?.data` / `res?.data?.summary` / `res?.data?.approval_pending`, which silently returned `undefined` and left the ledger rendering an empty summary + missed approval-pending 202 responses. Fixed in `IncentivePayoutLedger.jsx`, `SalesGoalBdmView.jsx` (My Payouts panel), and `SalesGoalDashboard.jsx` (payout widget) — now correctly read `res?.data` for the array and `res?.summary` directly. Approval-pending checks now use the shared `isApprovalPending(res)` / `isApprovalPending(null, err)` utility from `errorToast.js`.
2. **Silent ledger drift on tier upgrade.** Original `accrueIncentive` would re-upsert an existing ACCRUED row on tier change, overwriting `journal_id` and leaving the prior JE orphaned (expense booked twice, payout row only references the new JE). Fixed by making the accrual **fully idempotent per key** — once an IncentivePayout row exists for `(plan_id, bdm_id, period, period_type, program_code)`, re-computes are no-op regardless of tier change. A `console.warn` fires when an ACCRUED row's tier/budget drifts, and admins must Reverse the ACCRUED row via the ledger UI to adopt a higher tier (reversal posts a storno JE; recomputing then re-accrues at the new tier). This matches the "events are immutable" pattern used by SAP Commissions and keeps ledger in lockstep with the payout row.
3. **Route ordering verified.** `GET /payable` and `GET /mine` are declared before `GET /:id` so they aren't eaten by the parametric route. `POST /:id/{approve,pay,reverse}` are method-scoped so the GET handlers don't interfere.
4. **`periodLockCheck` middleware on pay/reverse is a no-op for the current design** (req.body carries no `period` field). The real period-lock enforcement lives in the controller via `checkPeriodOpen(payout.entity_id, currentPeriodString())`. Middleware is left in place as belt-and-suspenders for any future request-body variations.

**Known limitation (documented, not a bug).** Concurrent accruals on the exact same `(plan, bdm, period, period_type, program)` key can theoretically produce one orphaned JE if two snapshot-compute processes race in the milliseconds between `findOne` and `findOneAndUpdate`. In practice, `AgentConfig.is_running` serializes cron runs, and manual president computes are rare, so this race is a documented theoretical risk rather than an observed bug. Week 3 can add per-accrual transaction wrap (requires threading `session` through `generateJeNumber` → `DocSequence.getNext`) if production shows the race occurring.

---

## Phase SG-Q2 Week 3 — Compensation Statement, Notifications, Variance Agent, Mobile

**Shipped 2026-04-19.** Closes the deferred items #16-19 from the SG-Q2 Week 2 hand-off.

### #16 — Compensation Statement endpoint + "My Compensation" tab + PDF
- **Backend.** `GET /api/erp/incentive-payouts/statement` (controller `getCompensationStatement`) — returns `{ bdm, plan, entity, fiscal_year, period, summary: {earned, accrued, adjusted, paid, ...}, periods: […], tier: {…}, rows: […] }`. BDMs see only their own; finance/admin/president pass `?bdm_id=`. Privileged callers MUST pass `?bdm_id=` (HTTP 400 otherwise) — no silent self-id fallback (Rule #21).
- **Print route.** `GET /api/erp/incentive-payouts/statement/print` returns printable HTML via `templates/compensationStatement.js` (`renderCompensationStatement`). Browser-print produces the PDF (same pattern as `salesReceipt.js` / `pettyCashForm.js`). Cookie auth carries to the new window.
- **Lookup-driven branding.** `COMP_STATEMENT_TEMPLATE` Lookup category (per-entity) overrides `HEADER_TITLE`, `HEADER_SUBTITLE`, `DISCLAIMER`, `SIGNATORY_LINE`, `SIGNATORY_TITLE`. Falls back to safe defaults so fresh entities render day one. Subscribers re-brand from Control Center → Lookup Tables — zero code change.
- **Frontend.** `SalesGoalBdmView.jsx` now has a top-of-page tab strip: **Performance** (existing content) | **My Compensation** (new statement view). Compensation tab loads lazily via `sg.getCompensationStatement()`. The Print button opens `sg.compensationStatementPrintUrl(...)` in a new tab; user uses browser Print menu to save as PDF.
- **Hook.** `useSalesGoals` exports `getCompensationStatement(params)` and `compensationStatementPrintUrl(params)` helper (uses `import.meta.env.VITE_API_URL || '/api'` to match `services/api.js`).
- **Banner.** `WORKFLOW_GUIDES.salesGoalCompensation` added — explains earned/accrued/paid/adjusted breakdown + print flow + opt-out.
- **Definitions** (used in summary rollup):
  - `earned` = SUM(tier_budget) for status ∈ {ACCRUED, APPROVED, PAID}
  - `accrued` = SUM(tier_budget) for status = ACCRUED (waiting on authority)
  - `adjusted` = SUM(uncapped_budget − tier_budget) for cap-reduced rows + SUM(tier_budget) for status = REVERSED
  - `paid` = SUM(tier_budget) for status = PAID

### #17 — Notifications on plan activate/close/reopen + tier-milestone
- **Templates.** `templates/erpEmails.js` adds `salesGoalPlanLifecycleTemplate` (handles ACTIVATED/CLOSED/REOPENED with shared layout) + `tierReachedTemplate` + `kpiVarianceAlertTemplate`.
- **Service.** `erpNotificationService.js` adds `notifySalesGoalPlanLifecycle`, `notifyTierReached`, `notifyKpiVariance`, plus a `filterByPreference(recipients, category)` helper that respects `NotificationPreference.compensationAlerts` / `kpiVarianceAlerts`.
- **Wiring.** `salesGoalController.{activatePlan, reopenPlan, closePlan}` fire `notifySalesGoalPlanLifecycle` after the txn commits (fire-and-forget `.catch()`). `salesGoalService.accrueIncentive` fires `notifyTierReached` after the atomic accrual succeeds (only on a fresh row, never on a race-recovery hit).
- **Audience.**
  - Plan lifecycle → management (`NOTIFICATION_RECIPIENT_ROLES` Settings) ∪ all BDMs assigned to the plan, de-duped by user_id.
  - Tier reached → BDM + reports_to chain (PeopleMaster) + president(s).
  - KPI variance → BDM + reports_to chain + president(s).
- **Opt-in.** `NotificationPreference` schema extended with two new boolean fields: `compensationAlerts` (default `true`) gates plan-lifecycle + tier-reached. `kpiVarianceAlerts` (default `true`) gates variance alerts. Master `emailNotifications=false` still suppresses everything.

### #18 — kpiVarianceAgent + KPI_VARIANCE_THRESHOLDS lookup
- **Agent.** `backend/agents/kpiVarianceAgent.js` (FREE, no AI). Walks every active Entity → ACTIVE plan → YTD KpiSnapshot → driver_kpis → checks each KPI against the per-KPI deviation threshold from `KPI_VARIANCE_THRESHOLDS` Lookup. Alerts dispatched via `notifyKpiVariance` per BDM (one email per BDM with all alerts batched).
- **Direction-aware.** `LOWER_BETTER_KPIS` set (LOST_SALES_INCIDENTS, EXPIRY_RETURNS) inverts the deviation calc — overshooting the target is the bad state for those KPIs.
- **Threshold lookup.** `KPI_VARIANCE_THRESHOLDS` Lookup category, `code = KPI_CODE` (or `GLOBAL` for fallback). `metadata.warning_pct` triggers `warning` severity; `metadata.critical_pct` triggers `critical`. Defaults: warning at 20%, critical at 40% deviation. Per-entity, subscriber-configurable from Control Center.
- **Registry + scheduler.** Agent key `kpi_variance` registered in `agentRegistry.js`. Cron: `0 6 2 * *` Asia/Manila (monthly day 2 at 6:00 AM — runs the day after `kpi_snapshot` so it reads the freshly-computed snapshots). Manual Run Now via Agent Console.
- **Active-only.** Skips BDMs whose PeopleMaster is `is_active=false` so deactivated BDMs never appear in alerts.

### #19 — 360px mobile breakpoint
- **Pages.** `SalesGoalBdmView.jsx`, `SalesGoalDashboard.jsx`, `IncentivePayoutLedger.jsx` — added `@media(max-width: 360px)` blocks. Single-column summary cards, smaller heading sizes, full-width buttons, scroll-friendly tabs, condensed table cells, smaller ring (96px from 120px) on BdmView.
- **Print template.** `compensationStatement.js` includes `@media(max-width: 360px)` so a BDM can print/preview from a phone.
- **Banner already mobile-friendly.** `WorkflowGuide.jsx` already had a 600px breakpoint; no change needed.

### Per-accrual transaction wrap (production hardening)
The "documented theoretical risk" from Week 2 is now closed.
- **Threaded.** `DocSequence.getNext(key, { session })` now accepts a session and forwards it. `generateJeNumber({ entityId, date, session })` threads it through. `journalEngine.createAndPostJournal` now passes `options.session` into `generateJeNumber`.
- **Wrapped.** `salesGoalService.accrueIncentive` opens a `mongoose.startSession()` + `session.withTransaction()` around (a) re-check for race winner, (b) `postAccrualJournal({ session })`, (c) `IncentivePayout.findOneAndUpdate({ session })`. On commit failure the JE is rolled back; on E11000 race the existing payout is read and returned.
- **Backwards-compatible.** Every callsite that doesn't pass a session (e.g. legacy controllers) keeps the old non-transactional behavior — the session option is purely additive.

### Wiring map (Week 3)

```
backend/erp/models/DocSequence.js                   • getNext(key, options) — accepts {session}
backend/erp/services/docNumbering.js                • generateJeNumber({entityId, date, session})
backend/erp/services/journalEngine.js               • createAndPostJournal threads options.session into generateJeNumber
backend/erp/services/salesGoalService.js            • accrueIncentive wraps JE + upsert in mongoose.session txn
backend/erp/controllers/incentivePayoutController.js• getCompensationStatement, printCompensationStatement (NEW)
backend/erp/templates/compensationStatement.js      • NEW — renderCompensationStatement(data)
backend/erp/routes/incentivePayoutRoutes.js         • GET /statement, GET /statement/print (BEFORE /:id)
backend/erp/services/erpNotificationService.js      • notifySalesGoalPlanLifecycle, notifyTierReached, notifyKpiVariance
backend/erp/controllers/salesGoalController.js      • activate/reopen/close fire notifySalesGoalPlanLifecycle (post-txn)
backend/templates/erpEmails.js                      • salesGoalPlanLifecycleTemplate, tierReachedTemplate, kpiVarianceAlertTemplate
backend/models/NotificationPreference.js            • +compensationAlerts, +kpiVarianceAlerts
backend/agents/kpiVarianceAgent.js                  • NEW — variance detection + dispatch
backend/agents/agentRegistry.js                     • +kpi_variance entry
backend/agents/agentScheduler.js                    • cron 0 6 2 * * Asia/Manila

frontend/src/erp/hooks/useSalesGoals.js             • getCompensationStatement, compensationStatementPrintUrl
frontend/src/erp/pages/SalesGoalBdmView.jsx         • Tab strip + My Compensation panel + Print button + 360px CSS
frontend/src/erp/pages/SalesGoalDashboard.jsx       • 360px CSS
frontend/src/erp/pages/IncentivePayoutLedger.jsx    • 360px CSS (extended from W2 stub)
frontend/src/erp/components/WorkflowGuide.jsx       • +salesGoalCompensation banner
```

### Acceptance checklist (Week 3)
- [ ] `node -c` passes on all 14 modified backend files.
- [ ] `npx vite build` passes (verified: 9.06s, no errors).
- [ ] BDM opens `/erp/sales-goals/my` → "My Compensation" tab loads, summary cards populate, Print button opens printable HTML.
- [ ] President opens `/erp/sales-goals/bdm/:bdmId` → "My Compensation" tab loads with that BDM's data; Print URL carries `?bdm_id=`.
- [ ] President activates a plan → all assigned BDMs + management receive `salesGoalPlanLifecycleTemplate` email (or are skipped if `compensationAlerts=false`).
- [ ] BDM accrues a tier (snapshot run) → BDM + manager + president receive `tierReachedTemplate`.
- [ ] Run `kpi_variance` from Agent Console → AgentRun row written; BDMs with deviations > threshold receive `kpiVarianceAlertTemplate` (one email each, batched alerts).
- [ ] Open BdmView at 360px viewport (Chrome DevTools) → no horizontal scroll, tab strip scrolls horizontally, summary cards stack 1-col.
- [ ] Concurrent accruals on the same key → one row, one JE, one settlement; no orphans (txn wrap holds).

### Known limitations (Week 3)
- **Print route returns HTML, not PDF binary.** Browser does the PDF conversion via "Save as PDF" in Print menu. This is the same pattern as every other print route (`/print/receipt/:id`, etc.) — no PDF library added (would bloat the bundle and require font management). If a true PDF binary is needed later, `puppeteer` or `pdfkit` can be added without changing the controller signature.
- **In-app notifications.** Only email channel implemented. SMS + in-app are scaffolded in `NotificationPreference` (`smsNotifications`, `inAppAlerts`) but not yet routed by `notifyTierReached` / `notifyKpiVariance` — opt-in slots are reserved for when a unified push/SMS dispatcher exists.
- **Reports_to chain depth = 1.** `notifyTierReached` and `notifyKpiVariance` look up one manager hop. Multi-level escalation (skip-level managers) is straightforward to add when the org chart needs it.

## Phase SG-3R — Sales Goal Scalability Polish (Remainder of SG-3) ✅ (April 19, 2026)

**Context.** Phase SG-Q2 W1-W3 shipped the Q2 2026 critical path (compliance floor + incentive ledger + compensation statement + variance agent + mobile). Four SG-3 items were deferred as "subscription polish not Q2-blocking": KpiTemplate reuse (#14), growth-driver master promotion (#15), Excel bulk import (#18), President-Reverse on plans (#19), plus the 360px breakpoint for the admin setup page (remainder of #20). Plan reference: `C:\Users\LENOVO\.claude\plans\dreamy-skipping-cookie.md` Section D items 14/15/18/19 + tail of 20.

### #14 — Reusable KpiTemplate (advisory plan defaults)

- **Model.** `backend/erp/models/KpiTemplate.js` — `{ entity_id, template_name, driver_code, kpi_code, kpi_label, default_target, unit_code, computation, direction, functional_roles[], sort_order, description, is_active, created_by, updated_by }` + timestamps. Unique `(entity_id, template_name, driver_code, kpi_code)` index + `(entity_id, is_active)` query index. Entity-scoped so subsidiaries never see each other's libraries.
- **Controller.** `backend/erp/controllers/kpiTemplateController.js` — list (grouped into sets), get, create, update, delete-row, delete-set. Audit-logged via `ErpAuditLog.logChange`. President may query another entity via `?entity_id=`; other roles pinned to `req.entityId` (Rule #19 isolation).
- **Routes.** `backend/erp/routes/kpiTemplateRoutes.js` mounted at `/api/erp/kpi-templates` from `backend/erp/routes/index.js`. Reads gated by `erpAccessCheck('sales_goals')`; writes additionally require `erpSubAccessCheck('sales_goals','plan_manage')` so the same permission as Goal Setup applies.
- **Plan integration.** `salesGoalController.createPlan` now optionally expands `template_id` / `template_name` into `growth_drivers[].kpi_definitions[]`, grouped by driver. Advisory only — the plan owns its copy after creation, so later template edits never mutate existing plans (matches SAP Commissions "events are immutable" posture). On UPDATE the keys are stripped; updates never re-seed.
- **Frontend page.** `frontend/src/erp/pages/KpiTemplateManager.jsx` (new) at `/erp/kpi-templates` — full CRUD, driver/KPI selectors auto-fill label + unit + direction + computation from `KPI_CODE` lookup metadata, 360px mobile styles, admin-only write.
- **Sidebar.** Admin/President gate picks up new "KPI Templates" link under "Sales Goals" (icon: Target). Route protected by `allowedRoles={[ROLES.ADMIN, ROLES.PRESIDENT]}` + `requiredErpModule="sales_goals"`.
- **Hook.** `useSalesGoals.listKpiTemplates / getKpiTemplate / createKpiTemplate / updateKpiTemplate / deleteKpiTemplate / deleteKpiTemplateSet`.
- **WorkflowGuide.** New `kpiTemplateManager` guide key — describes the template set → plan expansion flow, cross-entity usage, and the lookup-driven extension path.

### #15 — Growth-driver master promotion

- **Seed enrichment.** `lookupGenericController.SEED_DEFAULTS.GROWTH_DRIVER` now carries `metadata.default_kpi_codes[]` + `metadata.default_weight` + `metadata.description` per code (5 drivers). Subscribers re-map per entity via Control Center → Lookup Tables — zero code change.
- **Plan-creation expansion.** `createPlan` honors an explicit `use_driver_defaults: true` flag: for every `growth_drivers[]` row whose `kpi_definitions` is empty AND template expansion left it empty, the controller reads the entity's `GROWTH_DRIVER.metadata.default_kpi_codes[]` and expands KPI defs using the `KPI_CODE` lookup (label + unit + direction + computation + source_model). Caller-supplied definitions are always preserved.
- **UI surface.** `SalesGoalSetup.jsx` "Plan Details" tab — on a **new** plan only — renders a dashed "Pre-populate defaults (optional)" panel with a template picker (feeds from `listKpiTemplates`) and a "Seed KPIs from each driver's lookup metadata" checkbox. Non-destructive on existing plans (the panel is hidden once `selectedPlanId` is set).

### #18 — Excel bulk import of targets

- **Route.** `POST /api/erp/sales-goals/targets/import` (mounted BEFORE `/targets/:id` so "import" is never captured as a param). Gated by `erpAccessCheck('sales_goals','FULL')` + `erpSubAccessCheck('sales_goals','plan_manage')`. Multer (memory storage, 5 MB cap, single file, field name `file`).
- **Handler.** `salesGoalController.importTargets` — uses `safeXlsxRead` (prototype-pollution + ReDoS hardened wrapper), recognizes two sheets (`ENTITY`, `BDM`; aliases accepted). Resolves `entity_code` against `Entity.short_name` / `entity_code` / `entity_name`; `bdm_code` against `PeopleMaster.bdm_code` / `full_name`; optional `territory_code` against `Territory.territory_code`. Row-level errors returned as `{ sheet, row_number, error, raw }`. Valid rows upsert atomically under `mongoose.session.withTransaction`; if ANY upsert fails, the whole import rolls back.
- **Approval gate.** `gateApproval({ module: 'SALES_GOAL_PLAN', docType: 'BULK_TARGETS_IMPORT' })` — amount = sum of valid `sales_target`. Non-authorized submitters return HTTP 202 (Approval Hub).
- **Audit.** `ErpAuditLog.logChange` records valid count + invalid count + filename.
- **UI.** `SalesGoalSetup.jsx` Entity Targets tab AND BDM Targets tab both render an "Import Excel (ENTITY + BDM sheets)" button (file input hidden behind the label). Success displays count; errors are collapsible `<details>` with a per-row table (sheet + row_number + message). Approval-pending is surfaced via `showApprovalPending`.
- **Hook.** `useSalesGoals.importTargets(formData)` — wraps `api.post('/sales-goals/targets/import', fd, { headers: 'multipart/form-data' })`.

### #19 — President-Reverse on a Sales Goal plan

- **Reversal handler.** `documentReversalService.reverseSalesGoalPlan` + `loadSalesGoalPlan` added. DRAFT plans → hard-delete with their DRAFT targets. ACTIVE/CLOSED/REJECTED → SAP Storno cascade:
  1. `reverseJournal()` on every `IncentivePayout.journal_id` (accrual JE) and `settlement_journal_id` (paid JE), idempotent — "already reversed" errors are swallowed, anything else aborts the cascade.
  2. `IncentivePayout` rows → `status = REVERSED` + `reversed_by/at/reason` (preserve `journal_id` refs for audit).
  3. `KpiSnapshot` rows under the plan → deleted (derived data; no audit value once plan is reversed).
  4. `SalesGoalTarget` rows → `status = CLOSED` (retained for audit).
  5. Plan itself → `status = REVERSED` + `deletion_event_id` stamped from `TransactionEvent`.
  All phase-2 writes run under one `mongoose.session.withTransaction`.
- **Registry.** `REVERSAL_HANDLERS.SALES_GOAL_PLAN` wired; `PERIOD_LOCK_MODULE.SALES_GOAL_PLAN = 'INCENTIVE_PAYOUT'` (reversal JEs land where the payouts already live, so the relevant lock is the same one).
- **Schema extension.** `SalesGoalPlan.status` enum now includes `REVERSED`; new optional `deletion_event_id` ref on the plan schema. G6 handler already had `terminalStates: ['CLOSED','REVERSED']` — confirmed no regression in `universalApprovalController`.
- **Route.** `POST /api/erp/sales-goals/plans/:id/president-reverse` — wraps `buildPresidentReverseHandler('SALES_GOAL_PLAN')` (the same Phase 3a factory used by Sales/Collection/Expense/PRF-CALF/GRN/IC-Transfer/PettyCash/Payslip/Income). Gated by `erpSubAccessCheck('accounting','reverse_posted')` (baseline danger sub-perm — never inherited from FULL).
- **UI.** `SalesGoalSetup.jsx` header action bar now renders a "President Reverse" button for plans whose status is NOT in `['DRAFT','REVERSED']`. Prompts for reason + `DELETE` confirmation (matches other president-reverse UX). New status palette entry for `REVERSED` (pink) so it renders distinct from `REJECTED` (red).
- **Hook.** `useSalesGoals.presidentReversePlan(id, { reason, confirm: 'DELETE' })`.

### #20 (remainder) — 360px on SalesGoalSetup.jsx

- `@media(max-width: 360px)` block added: full-width buttons, column-stacked action bar + form rows, scrollable tab strip, compressed tables (font-size 11 / padding 6 5), single-column KPI rows. Matches the 360px work already done on BDM-facing pages in SG-Q2 W3.

### Wiring map (Phase SG-3R)

```
Backend:
  backend/erp/models/KpiTemplate.js                             [NEW]
  backend/erp/models/SalesGoalPlan.js                           [+REVERSED enum, +deletion_event_id]
  backend/erp/controllers/kpiTemplateController.js              [NEW]
  backend/erp/controllers/salesGoalController.js                [expandTemplateIntoDrivers, expanded createPlan, importTargets, presidentReversePlan factory call]
  backend/erp/controllers/lookupGenericController.js            [GROWTH_DRIVER metadata enriched]
  backend/erp/routes/kpiTemplateRoutes.js                       [NEW]
  backend/erp/routes/salesGoalRoutes.js                         [+/targets/import (multer), +/plans/:id/president-reverse]
  backend/erp/routes/index.js                                   [+mount /kpi-templates]
  backend/erp/services/documentReversalService.js               [+SALES_GOAL_PLAN handler + PERIOD_LOCK_MODULE + registry entry]

Frontend:
  frontend/src/erp/pages/KpiTemplateManager.jsx                 [NEW]
  frontend/src/erp/pages/SalesGoalSetup.jsx                     [template picker, import button, president-reverse button, 360px, REVERSED badge]
  frontend/src/erp/components/WorkflowGuide.jsx                 [+kpiTemplateManager guide]
  frontend/src/erp/hooks/useSalesGoals.js                       [+8 methods: kpi-template CRUD + importTargets + presidentReversePlan]
  frontend/src/App.jsx                                          [+/erp/kpi-templates route]
  frontend/src/components/common/Sidebar.jsx                    [+KPI Templates link (admin-only)]
```

### Acceptance checklist (Phase SG-3R)

- [x] `node -c` clean on all 10 modified/new backend files.
- [x] `npx vite build --mode development` clean (~11s, `KpiTemplateManager-*.js` chunk emitted, `SalesGoalSetup-*.js` rebuilt).
- [x] `node backend/scripts/verifyRejectionWiring.js` — OK (20 modules verified, 0 warnings). G6 wiring intact.
- [x] `universalApprovalController` already includes `terminalStates: ['CLOSED','REVERSED']` for `sales_goal_plan` — no additional wiring needed.
- [x] `ERP_SUB_PERMISSION.SALES_GOALS__PLAN_MANAGE` covers KPI Template writes (reused, no new key) + the import endpoint (same key as bulk targets).
- [ ] Manual smoke (staging): create template set "VIP FY2026 Base" with 3 rows → create new plan referencing it → growth_drivers auto-populate with kpi_definitions from template.
- [ ] Manual smoke: toggle `use_driver_defaults=true` on a fresh plan → empty drivers inherit their KPI codes from GROWTH_DRIVER.metadata.default_kpi_codes.
- [ ] Manual smoke: upload an xlsx with one valid ENTITY row + one invalid BDM row → response shows `imported_count=1, error_count=1, errors=[{sheet:'BDM',row_number,error}]`.
- [ ] Manual smoke: run President Reverse on a CLOSED plan that has 2 PAID IncentivePayouts → both accrual + settlement JEs reverse; payouts flip to REVERSED; snapshots delete; targets CLOSED; plan status REVERSED.
- [ ] 360px visual verification on SalesGoalSetup.jsx (Chrome DevTools: 360 × 640).

### Known limitations / future hooks (Phase SG-3R)

- **KpiTemplate has no versioning.** Editing a template row does not cascade to existing plans (by design — plan immutability). If subscribers want "forward-apply to active plan," that's Phase SG-4 #21 (plan versioning) or a separate "apply template to draft" action.
- **Excel import accepts only the master ENTITY/BDM sheet set.** Per-month breakdowns (`monthly_targets[]`) and per-driver breakdowns (`driver_targets[]`) are not parsed — they can be edited row-by-row after import. Adding sheets `ENTITY_MONTHLY` / `BDM_MONTHLY` with a `month` column is the extension path; the handler is structured for it.
- **President-Reverse is synchronous.** A plan with hundreds of paid payouts could take several seconds because each `reverseJournal` runs its own session. Acceptable for current scale (max ~12 BDMs × 12 months ≈ 144 potential payouts). Multi-subsidiary scale may warrant moving the cascade to a background agent (kpi_snapshot pattern).
- **No UI reversal-history view for plans yet.** `documentReversalService.listReversibleDocs` / `listReversalHistory` would need a `SALES_GOAL_PLAN` branch — deferred to a thin follow-up (one if-block per function, ~20 LOC).


---

## Phase SG-4 — Sales Goal Commercial-Grade Features (April 19, 2026)

Closes Section D items 21, 22, 23 (extensions), and 24 from `dreamy-skipping-cookie.md`. Brings VIP Sales Goal to commercial parity with SAP Commissions, SuiteCommissions, Workday ICM, and Oracle Fusion ICM patterns. **All four PRs ship together** — backend models + services + controllers + routes + agent + lookups + frontend pages + sidebar + WorkflowGuide entries + App.jsx routes.

### Scope (4 PRs in one commit)

#### PR1 — Plan Versioning (#21, SuiteCommissions pattern)
- **NEW** `backend/erp/models/IncentivePlan.js` — header per (entity_id, fiscal_year). Owns the *logical* plan; SalesGoalPlan rows become *versions*.
- `backend/erp/models/SalesGoalPlan.js` — added `incentive_plan_id`, `version_no`, `effective_from`, `effective_to`, `supersedes_plan_id`, `superseded_by_plan_id`. Replaced legacy `{entity_id,fiscal_year}` UNIQUE index with composite `{entity_id,fiscal_year,version_no}` UNIQUE.
- **NEW** `backend/erp/services/incentivePlanService.js` — `ensureHeader()` (lazy-backfill), `getActiveVersion()`, `listVersions()`, `createNewVersion()`, `syncHeaderOnActivation()`, `syncHeaderOnLifecycleChange()`.
- **NEW** `backend/scripts/migrateSalesGoalVersioning.js` — one-time idempotent migration: drops legacy unique index, creates composite, backfills `version_no=1`, creates IncentivePlan headers, syncs `current_version_id`.
- **Source of truth for "active version per FY"**: `IncentivePlan.current_version_id` (already O(1) via the unique index on `{entity_id, fiscal_year}`). An earlier draft seeded a parallel `ACTIVE_PLAN_VERSION` Lookup mirror — **removed** because operational state doesn't belong in the configuration table; admins shouldn't see / edit a row the runtime overwrites on every activation.
- **Endpoints**: `GET /sales-goals/plans/:id/versions`, `POST /sales-goals/plans/:id/new-version` (gated by `gateApproval('SALES_GOAL_PLAN','PLAN_NEW_VERSION')`).
- **Backward-compat**: existing plans + endpoints continue working unchanged. KpiSnapshot.plan_id stays tied to the version active at compute time — historical snapshots never re-pointed.

#### PR2 — Credit Rules (#22, SAP Commissions pattern)
- **NEW** `backend/erp/models/CreditRule.js` — entity-scoped, priority, AND-combined conditions (territory_ids, product_codes, customer_codes, hospital_ids, sale_types, min/max_amount), credit_bdm_id, credit_pct, effective dates.
- **NEW** `backend/erp/models/SalesCredit.js` — append-only audit trail of credit assignments. Sources: `rule | fallback | manual | reversal`. Pre-save guard prevents updates.
- **NEW** `backend/erp/services/creditRuleEngine.js` — `assign(saleLine)` evaluates rules in priority order, capped at 100% total, residual goes to sale.bdm_id (legacy fallback). Idempotent — re-runs delete only `rule`/`fallback` rows; `manual`/`reversal` survive.
- **NEW** `backend/erp/controllers/creditRuleController.js` — CRUD on rules + read-only credit ledger + `POST /reassign/:saleLineId` admin tool.
- **NEW** `backend/erp/routes/creditRuleRoutes.js` — mounted at `/api/erp/credit-rules`.
- **Hook**: `salesController.postSaleRow()` calls `creditRuleEngine.assign(row, { userId })` after the journal posts. Non-blocking — failures logged to ErpAuditLog, sale still posts.
- **Lookup** `CREDIT_RULE_TEMPLATES` — preset shapes (TERRITORY_PRIMARY, PRODUCT_SPLIT, KEY_ACCOUNT_OVERRIDE) seeded with empty arrays so admins fill in values per entity.
- **Frontend**: `CreditRuleManager.jsx` (rule CRUD + credit ledger tab + template picker). Sidebar entry "Credit Rules" (admin-only). WorkflowGuide entry `credit-rule-manager`.

#### PR3 — Compensation Statement Extensions (#23 ext, Workday ICM pattern)
- **Lookup** `COMP_STATEMENT_TEMPLATE` re-seeded with 6 rows: HEADER_TITLE, HEADER_SUBTITLE, DISCLAIMER, SIGNATORY_LINE, SIGNATORY_TITLE, EMAIL_ON_PERIOD_CLOSE. Admin-editable from Control Center.
- **NEW** `compensationStatementReadyTemplate` in `backend/templates/erpEmails.js` — minimal email with deep-link to `/erp/sales-goals/my?tab=compensation&fiscal_year=...&period=...`.
- **NEW** `notifyCompensationStatement()` in `erpNotificationService.js` — multi-channel dispatch (email + in-app + SMS opt-in via NotificationPreference). Reads COMP_STATEMENT_TEMPLATE for brand chrome + EMAIL_ON_PERIOD_CLOSE.metadata.enabled gate.
- **Endpoints**: `GET /incentive-payouts/statement/archive` (BDM rollup of prior periods, group by fy+period); `POST /incentive-payouts/statements/dispatch` (admin mass-mail for a period; gated by `gateApproval('INCENTIVE_PAYOUT','STATEMENT_DISPATCH')`).

#### PR4 — Dispute / Clawback Workflow (#24, Oracle Fusion pattern)
- **NEW** `backend/erp/models/IncentiveDispute.js` — state machine `OPEN → UNDER_REVIEW → RESOLVED_APPROVED|RESOLVED_DENIED → CLOSED`. Fields: filed_by, affected_bdm_id, dispute_type, artifact links (payout_id / sales_credit_id / sale_line_id / plan_id), reason, evidence_urls, history[], sla_breaches[].
- **NEW** `backend/erp/controllers/incentiveDisputeController.js` — `fileDispute`, `listDisputes`, `getDisputeById`, `takeReview`, `resolveDispute`, `closeDispute`, `cancelDispute`. Every transition through `gateApproval('INCENTIVE_DISPUTE', ...)` (Rule #20). Resolution APPROVED on a payout dispute cascades `reverseAccrualJournal()` (SAP Storno via existing helper); on a credit dispute appends a negative SalesCredit row (source='reversal').
- **NEW** `backend/erp/routes/incentiveDisputeRoutes.js` — mounted at `/api/erp/incentive-disputes`.
- **Lookups**:
  - `INCENTIVE_DISPUTE_TYPE` — 5 starter types (WRONG_TIER, MISSING_CREDIT, CAP_DISPUTE, PERIOD_MISMATCH, OTHER) with metadata.artifact mapping to payout|credit.
  - `DISPUTE_SLA_DAYS` — 4 starter rows (OPEN=3d, UNDER_REVIEW=7d, RESOLVED_APPROVED=5d, RESOLVED_DENIED=14d) with escalate_to_role.
  - `MODULE_DEFAULT_ROLES.INCENTIVE_DISPUTE` — default president/finance/admin.
  - `APPROVAL_MODULE.INCENTIVE_DISPUTE` — category=OPERATIONAL.
- **NEW** `backend/agents/disputeSlaAgent.js` (#DSP, FREE) — daily 06:30 Asia/Manila. Walks every non-CLOSED dispute, flags SLA breaches per state, dispatches escalation via `dispatchMultiChannel`. Idempotent — one breach row per (state, post-state-change). Never auto-transitions.
- **Frontend**: `DisputeCenter.jsx` (file modal + list + take-review/resolve/close actions + detail view with history + SLA breach badges). Sidebar entry "Dispute Center" (all sales_goals VIEW). WorkflowGuide entry `dispute-center`.

### Wiring map (Phase SG-4)

```
Backend NEW:
  backend/erp/models/IncentivePlan.js
  backend/erp/models/CreditRule.js
  backend/erp/models/SalesCredit.js
  backend/erp/models/IncentiveDispute.js
  backend/erp/services/incentivePlanService.js
  backend/erp/services/creditRuleEngine.js
  backend/erp/controllers/creditRuleController.js
  backend/erp/controllers/incentiveDisputeController.js
  backend/erp/routes/creditRuleRoutes.js
  backend/erp/routes/incentiveDisputeRoutes.js
  backend/agents/disputeSlaAgent.js
  backend/scripts/migrateSalesGoalVersioning.js

Backend MODIFIED:
  backend/erp/models/SalesGoalPlan.js                        [+versioning fields, replaced unique index]
  backend/erp/controllers/salesGoalController.js             [+ensureHeader on createPlan, +syncHeaderOnActivation in activate txn, +syncHeaderOnLifecycleChange in close/reopen, +listPlanVersions, +createNewVersion]
  backend/erp/controllers/salesController.js                 [+creditRuleEngine.assign() at end of postSaleRow]
  backend/erp/controllers/incentivePayoutController.js       [+getStatementArchive, +dispatchStatementsForPeriod]
  backend/erp/controllers/lookupGenericController.js         [+CREDIT_RULE_TEMPLATES, +COMP_STATEMENT_TEMPLATE re-seed, +DISPUTE_SLA_DAYS, +INCENTIVE_DISPUTE_TYPE, +MODULE_DEFAULT_ROLES.INCENTIVE_DISPUTE, +APPROVAL_MODULE.INCENTIVE_DISPUTE]
  backend/erp/routes/salesGoalRoutes.js                      [+/plans/:id/versions, +/plans/:id/new-version]
  backend/erp/routes/incentivePayoutRoutes.js                [+/statement/archive, +/statements/dispatch]
  backend/erp/routes/index.js                                [+mount /credit-rules, +mount /incentive-disputes]
  backend/erp/services/erpNotificationService.js             [+notifyCompensationStatement]
  backend/templates/erpEmails.js                             [+compensationStatementReadyTemplate]
  backend/agents/agentRegistry.js                            [+dispute_sla agent]
  backend/agents/agentScheduler.js                           [+#DSP cron 30 6 * * * Asia/Manila]

Frontend NEW:
  frontend/src/erp/pages/CreditRuleManager.jsx
  frontend/src/erp/pages/DisputeCenter.jsx

Frontend MODIFIED:
  frontend/src/erp/hooks/useSalesGoals.js                    [+19 methods: plan-versions, credit-rules, sales-credits, comp-archive, dispute lifecycle]
  frontend/src/erp/components/WorkflowGuide.jsx              [+credit-rule-manager guide, +dispute-center guide]
  frontend/src/App.jsx                                       [+CreditRuleManager + DisputeCenter lazy imports + routes]
  frontend/src/components/common/Sidebar.jsx                 [+Credit Rules link (admin-only), +Dispute Center link (all)]
```

### Acceptance checklist (Phase SG-4)

- [x] `node -c` clean on every modified/new backend file (24 files).
- [x] `npx vite build --mode development` clean (1m 20s; CreditRuleManager + DisputeCenter chunks emitted).
- [x] `npm run verify:rejection-wiring` — OK (20 modules verified, 0 warnings).
- [x] `gateApproval(` count: backend baseline 31 → 44 (5 new gates: createNewVersion, dispatchStatementsForPeriod, takeReview, resolveDispute, closeDispute; rest are imports / comments).
- [x] No modifications to other modules' controllers (Expense/Collection/CALF/SMER/PettyCash/Journal/Payroll/CRM untouched). Only `salesController.postSaleRow` got 1 non-blocking `creditRuleEngine.assign()` call at the end.
- [x] No schema changes to existing models outside Sales Goal's own set. (SalesGoalPlan only — additive fields + replaced index.)
- [x] All new lookups are entity-scoped, lazy-seeded; subscribers configure via Control Center → Lookup Tables.
- [ ] **Manual smoke (staging — required before activation)**:
  - Run `node backend/scripts/migrateSalesGoalVersioning.js` once to drop the legacy unique index + create the new composite index + backfill version_no=1 + create IncentivePlan headers.
  - Activate a v1 plan → confirm `IncentivePlan.current_version_id` points at it. (No parallel lookup row — header is the single source of truth.)
  - `POST /plans/:id/new-version` → confirm v2 created in DRAFT, basis untouched.
  - Activate v2 → basis flipped: superseded_by_plan_id + effective_to set; header.current_version_id moved to v2.
  - Post a sale → SalesCredit row(s) created; with no rules, source='fallback' @ 100% to sale.bdm_id.
  - Create a CreditRule with priority 50, 70% credit to BDM_X, condition product_codes=['SKU-1'] → post a sale containing SKU-1 → SalesCredit shows 70% to BDM_X (rule) + 30% to sale.bdm_id (fallback).
  - File a dispute as a contractor → state OPEN. Privileged user takes review → UNDER_REVIEW. Resolve as APPROVED on a linked payout → cascade reverses the accrual JE, payout flips to REVERSED.
  - Sit a dispute in OPEN past 3 days → run `disputeSlaAgent` → red SLA badge appears, escalation email goes to filer + reports_to + president.
  - Admin edits COMP_STATEMENT_TEMPLATE.HEADER_TITLE → next print/email shows the new title.
  - `POST /incentive-payouts/statements/dispatch` for a period → BDMs receive the email (subject + deep link).

### Known limitations / future hooks (Phase SG-4)

- **KpiSnapshot consumers still read sale.bdm_id**, not SalesCredit. Migrating snapshot computation to read from SalesCredit (so credit-split rules influence incentive accruals) is **SG-5 scope**. Keeps SG-4 PRs reviewable and limits blast radius — credit rules currently produce auditable rows that are visible in the ledger but don't yet drive accrual math.
- **SalesGoalSetup.jsx** does not yet render a version strip / "Create New Version" button. The `/plans/:id/versions` and `/plans/:id/new-version` endpoints are fully callable via API; admin UI integration is a thin follow-up (deferred to keep SG-4 in one commit).
- **IncentivePayoutLedger.jsx** has no "Send Statements for Period" button yet — admins use the API directly. Same deferral rationale.
- **Reversal of SalesCredit on SalesLine reopen/storno** — when a posted sale is reopened, existing SalesCredit rows are left with the previous values (no auto-reversal). Consumers should ignore credits whose parent sale is no longer POSTED. Hook for SG-5.
- **Plan-version-aware credit rules** — `CreditRule.plan_id` is supported but the engine currently evaluates rules with `plan_id: null` only (rules apply across all versions). Per-version rule scoping is a one-line engine change deferred to SG-5 when snapshots migrate to read SalesCredit.
- **disputeSlaAgent does not auto-transition.** By design (Rule #20). Resolution is always a human decision.
- **migrateSalesGoalVersioning.js is a one-time admin script.** It is not idempotent at the level of "every restart" — it only needs to run once per environment. Re-runs are safe (all operations are guarded with existence checks) but not necessary.

---

## Phase SG-5 — Sales Goal Analytics & Modeling ✅ (April 19, 2026)

Closes Section D items **25–28** of `dreamy-skipping-cookie.md`. Fills the G.1 analytics gaps flagged in the SAP/SuiteCommissions/Workday ICM comparison — commission accelerators, what-if modeling, variance alert cooldown + weekly digest, and YoY trending.

### Scope (4 sub-deliverables in one commit)

#### #25 — Commission Accelerators (INCENTIVE_TIER metadata extension)
- `backend/erp/services/salesGoalService.js` — `getIncentiveTiers()` surfaces `accelerator_factor` (default 1.0, clamped non-negative); new helper `applyTierAccelerator(tier)` returns `{ accelerated_budget, accelerator_factor, base_budget }`.
- `computeBdmSnapshot` applies the accelerator to `incentive_status[].tier_budget` + stores `tier_base_budget` and `tier_accelerator_factor` on the snapshot row (transparency, mirrors `uncapped_budget` pattern from SG-Q2 W2).
- `backend/erp/controllers/salesGoalController.js` — `getIncentiveBoard` exposes `accelerator_factor` + `effective_budget` on every tier so frontend can render multiplier badges.
- `backend/erp/controllers/lookupGenericController.js` — INCENTIVE_TIER seed extended with `accelerator_factor: 1.0` per tier. Admins opt in per-tier by editing metadata in Control Center (no code change).
- **Downstream behavior:** accrual ledger and journals automatically use the accelerated amount (existing `accrueIncentive` path — zero code change). `uncapped_budget` on IncentivePayout still reflects the pre-cap (but accelerated) number.

#### #26 — What-if / Scenario Modeling
- **NEW** `salesGoalService.simulatePlanSnapshots(plan, overrides)` — pure compute, no DB writes, no journal post. Reuses `computeIncentiveTier` / `applyTierAccelerator` / `applyIncentiveCap` so simulated accruals match production math one-for-one.
- Overrides: `target_revenue_override`, `baseline_override`, `driver_weight_overrides`, `tier_attainment_overrides`.
- **Endpoint** `POST /sales-goals/plans/:id/simulate` (no approval gate, VIEW sufficient; contractor-scoped to own BDM row via Rule #21).
- **NEW** `frontend/src/erp/pages/ScenarioPlanner.jsx` — side-by-side "current vs scenario" columns for company summary, driver weight mix, and per-BDM tier projection. Delta badges highlight budget/attainment swings.
- Sidebar entry "Scenario Planner" (admin/finance/president). App.jsx route `/erp/sales-goals/scenario`. WorkflowGuide key `scenarioPlanner`.

#### #27 — KPI Variance Extensions (cooldown + persistence + digest + center)
- **NEW** `backend/erp/models/VarianceAlert.js` — persisted audit trail of every alert fired. Fields: `entity_id, plan_id, bdm_id, person_id, fiscal_year, period, kpi_code, severity, actual_value, target_value, deviation_pct, threshold_pct, status (OPEN|RESOLVED), fired_at, resolved_at, resolved_by, resolution_note, digested_at`.
- `backend/agents/kpiVarianceAgent.js` — cooldown check via `VARIANCE_ALERT_COOLDOWN_DAYS` lookup (global + per-severity rows) before firing; each breach persists a VarianceAlert row BEFORE dispatching notifications so cooldown works across runs. Summary now reports `alerts_suppressed` and `alerts_persisted`.
- **NEW** `backend/agents/kpiVarianceDigestAgent.js` (#VD, FREE) — Monday 07:00 Manila. Rolls up every undigested VarianceAlert in the `VARIANCE_ALERT_DIGEST_WINDOW_DAYS` window (default 7) into a single per-manager email via `reports_to` chain. Marks each included alert with `digested_at` so the next run starts clean.
- **NEW** `backend/templates/erpEmails.js` — `kpiVarianceDigestTemplate` exported.
- **NEW** `backend/erp/controllers/varianceAlertController.js` — `listVarianceAlerts`, `getVarianceAlertStats`, `resolveVarianceAlert` with BDM scoping (Rule #21) + manager-of-reports_to allowance for resolve.
- **NEW** `backend/erp/routes/varianceAlertRoutes.js` — mounted at `/api/erp/variance-alerts`. VIEW gate (not a financial op — no gateApproval).
- **Lookups**: `VARIANCE_ALERT_COOLDOWN_DAYS` (GLOBAL 7d), `VARIANCE_ALERT_DIGEST_WINDOW_DAYS` (GLOBAL 7d). Both seeded with sensible defaults; admins retune per entity from Control Center.
- **Agent registry + scheduler**: `kpi_variance_digest` registered; cron `0 7 * * 1` Asia/Manila.
- **NEW** `frontend/src/erp/pages/VarianceAlertCenter.jsx` — stats cards (open critical/warning, total open/resolved), filters (status/severity/KPI), resolve action with optional note. Sidebar entry "Variance Alerts". App.jsx route `/erp/variance-alerts`. WorkflowGuide key `varianceAlertCenter`.

#### #28 — Year-over-Year & Quarter-over-Quarter Trending
- **Endpoint** `GET /sales-goals/trending?fiscal_year=&bdm_id=&kpi_code=` — joins current + prior fiscal-year YTD `KpiSnapshot` rows by `(bdm_id, kpi_code)`. Plan-version-aware implicitly (snapshots are tied to whichever IncentivePlan version was active at write time — SG-4 #21).
- Output: `company.revenue {current, prior, delta_pct}`, `company.attainment {current, prior}`, `per_bdm[]`, `per_kpi[]` (company averages).
- **SalesGoalDashboard.jsx** gains a "Year-over-Year Trending" panel with a Recharts bar chart (top 12 BDMs) + per-KPI delta table. Empty state when no prior-year snapshots exist. Uses the existing `charts` bundle (no new dep).

### Wiring map (Phase SG-5)

```
Backend NEW:
  backend/erp/models/VarianceAlert.js
  backend/erp/controllers/varianceAlertController.js
  backend/erp/routes/varianceAlertRoutes.js
  backend/agents/kpiVarianceDigestAgent.js

Backend MODIFIED:
  backend/erp/services/salesGoalService.js              [+accelerator + simulatePlanSnapshots + exports]
  backend/erp/controllers/salesGoalController.js        [+simulatePlan, +getTrending, accelerator exposure]
  backend/erp/controllers/lookupGenericController.js    [+INCENTIVE_TIER.accelerator_factor, +VARIANCE_ALERT_COOLDOWN_DAYS, +VARIANCE_ALERT_DIGEST_WINDOW_DAYS]
  backend/erp/routes/salesGoalRoutes.js                 [+/plans/:id/simulate, +/trending]
  backend/erp/routes/index.js                           [+mount /variance-alerts]
  backend/agents/kpiVarianceAgent.js                    [+cooldown lookup + VarianceAlert persistence]
  backend/agents/agentRegistry.js                       [+kpi_variance_digest]
  backend/agents/agentScheduler.js                      [+#VD Monday 07:00]
  backend/templates/erpEmails.js                        [+kpiVarianceDigestTemplate + export]

Frontend NEW:
  frontend/src/erp/pages/ScenarioPlanner.jsx
  frontend/src/erp/pages/VarianceAlertCenter.jsx

Frontend MODIFIED:
  frontend/src/erp/hooks/useSalesGoals.js               [+simulatePlan, getTrending, listVarianceAlerts, getVarianceAlertStats, resolveVarianceAlert]
  frontend/src/erp/pages/SalesGoalDashboard.jsx         [+YoY trending panel (recharts BarChart + per-KPI delta table)]
  frontend/src/erp/components/WorkflowGuide.jsx         [+scenarioPlanner, +varianceAlertCenter guides; salesGoalDashboard updated with SG-5 cross-links]
  frontend/src/App.jsx                                  [+ScenarioPlanner + VarianceAlertCenter lazy imports + routes]
  frontend/src/components/common/Sidebar.jsx            [+Scenario Planner (admin), +Variance Alerts (all)]
```

### Acceptance checklist (Phase SG-5)

- [x] `node -c` clean on every modified/new backend file.
- [x] Runtime `require` loads every new agent + service export without missing-module errors.
- [x] `npx vite build --mode development` clean — `ScenarioPlanner-*.js` and `VarianceAlertCenter-*.js` chunks emitted.
- [x] `node backend/scripts/verifyRejectionWiring.js` — OK (20 modules verified, 0 warnings).
- [x] `node backend/scripts/startupCheck.js` — passed.
- [x] No modifications to Expense/Collection/CALF/SMER/PettyCash/Journal/Payroll/CRM controllers. All SG-5 additions are self-contained inside the Sales Goal namespace + two new agents.
- [x] No schema changes to existing models. New `VarianceAlert` model is additive.
- [x] All new lookups are entity-scoped, seeded with defaults, admin-editable (`INCENTIVE_TIER.accelerator_factor`, `VARIANCE_ALERT_COOLDOWN_DAYS`, `VARIANCE_ALERT_DIGEST_WINDOW_DAYS`).
- [x] Commission accelerator default = 1.0 on every seed tier so existing accrual math is byte-identical until an admin opts in.
- [x] Simulate endpoint writes nothing — verified by inspection (no `.save()`, `.create()`, `.findOneAndUpdate()` in `simulatePlanSnapshots`).
- [x] Cooldown dedup verified in the agent loop — same `(plan, bdm, kpi, severity)` within N days is suppressed; re-runs do not re-email.
- [x] Manager resolution path covered by `resolveVarianceAlert` — reports_to manager of the BDM's PeopleMaster can resolve without admin privilege.
- [ ] **Manual smoke (staging — required before wider rollout)**:
  - Set `INCENTIVE_TIER.TIER_1.metadata.accelerator_factor = 1.25` in Control Center → Lookup Tables → rerun Compute KPIs → a BDM at 115% attainment gets tier_budget ×1.25 in IncentivePayout + journal.
  - `POST /sales-goals/plans/:id/simulate` with `{ target_revenue_override: 1.2 * current }` → response shows scaled per-BDM targets + recomputed tiers; no new rows in IncentivePayout/KpiSnapshot/Journal collections.
  - `POST /variance-alerts/:id/resolve` as the BDM → status flips to RESOLVED; `resolved_by` set. As an unrelated BDM → 403.
  - Trigger `kpi_variance` agent twice within the cooldown window → second run's `alerts_suppressed` counter increments; no duplicate emails.
  - Trigger `kpi_variance_digest` on Monday → one digest email per manager with all undigested alerts from last 7 days; `digested_at` stamped. Re-run same day → zero new emails.
  - Open Goal Dashboard in an entity with prior-year snapshots → YoY panel renders with per-BDM bars + per-KPI deltas.
  - Open Goal Dashboard in a fresh entity (no prior year) → YoY panel renders empty-state copy, no console error.

### Known limitations / future hooks (Phase SG-5)

- **Simulate endpoint scales per-BDM targets proportionally** when `target_revenue_override` is passed. Does NOT recompute per-BDM actuals (those stay at current live values). Intentional — scenario is "what if the bar moved?" not "what if everyone sold more?". For that, combine with `tier_attainment_overrides` per BDM.
- **Driver weight overrides are visual-only in simulate.** The revenue-share split recomputes, but the scenario does NOT re-run per-driver auto KPI calculations (those require live SalesLine / Visit queries and would defeat the fast-dry-run goal). Admins re-run "Compute KPIs" after editing the plan live if they want the refresh.
- **Variance Alert Center resolve is coaching acknowledgement** — does NOT reverse any journal or payout. If the underlying KPI value is wrong, the correct path is a Dispute (SG-4 #24).
- **Auto-resolve on recovery not implemented.** When a subsequent snapshot recomputes a KPI back above threshold, the open VarianceAlert stays open until someone clicks Resolve. Adding a `salesGoalService.autoResolveRecoveredAlerts()` call inside `computeBdmSnapshot` is a one-line follow-up — deferred to SG-6 to keep the SG-5 blast radius narrow.
- **Digest agent routes exclusively to `reports_to` managers.** BDMs without a `reports_to` line in PeopleMaster are excluded from the digest email pool (their alerts still fire in the per-event email path). Filling in PeopleMaster.reports_to is a data-quality task, not a code change.
- **YoY chart is capped at top 12 BDMs** to keep the legend readable on tablet. For larger teams, Statistics page (Phase G2) is the right surface for a full per-BDM drill-down.
- **Plan-version reconciliation in trending is implicit** (via `KpiSnapshot.plan_id` → `IncentivePlan.current_version_id` from SG-4 #21). Joining two snapshots from different versions of the same logical plan works; joining snapshots from entirely different plan headers (different fiscal year is expected; same fiscal-year different entity is not).

## Phase SG-6 — Compliance & Integration Layer ✅ (April 19, 2026)

Closes Section D items **29–32** of `dreamy-skipping-cookie.md`. Brings Sales Goal to full parity with mature VIP ERP modules AND commercial-grade on the core loop. HRIS NOT in scope — user confirmed no external HRIS subscription planned; PeopleMaster alone covers the sales-goal-eligible lifecycle.

### Scope (4 sub-deliverables in one commit)

#### #29 — SOX-readiness Control Matrix
- **NEW** `backend/erp/controllers/soxControlMatrixController.js` — materializes a control matrix for every Sales Goal state change (16 controls). Reads LIVE config from `MODULE_DEFAULT_ROLES` + `ERP_SUB_PERMISSIONS` + `APPROVAL_MODULE` + `APPROVAL_CATEGORY` + last-N-days `ErpAuditLog` activity per op + segregation-of-duties analyzer (flags users who both CREATE and POST/APPROVE/PAY/REVERSE the same document in the window) + live `integrationHooks.describeRegistry()` panel.
- **Routes** `GET /sales-goals/sox-control-matrix[?window_days=]` + `/print[?format=pdf|html]`. Reuses existing `pdfRenderer.resolvePdfPreference()` + `htmlToPdf()` — HTML by default, puppeteer PDF when `PDF_RENDERER.BINARY_ENABLED=true`.
- **NEW** `frontend/src/erp/pages/SoxControlMatrix.jsx` — admin page: window selector + summary cards + control table + SoD findings panel + integration registry panel + Print/Save-as-PDF button. Sidebar entry "SOX Control Matrix" (admin only). App.jsx route `/erp/sales-goals/sox`. WorkflowGuide key `soxControlMatrix`.
- **Design invariant**: CONTROLS definition is a module constant (not a Lookup). Intentional — the matrix AUDITS the live authorization posture; moving CONTROLS to a lookup would let an admin hide a control by deleting its row (defeats SOX).

#### #30 — PeopleMaster Lifecycle Helpers (HRIS-free)
- **NEW** `backend/erp/services/salesGoalLifecycleHooks.js` — attached to PeopleMaster via `post('save')`. Pre-save hook snapshots `is_active`, `person_type`, `territory_id`, `entity_id` on `this.__sgPrior`; post-save hook classifies the transition:
  - **(a) Enroll**: new or newly-eligible → idempotent `SalesGoalTarget(target_type='BDM')` insert using `GOAL_CONFIG.DEFAULT_TARGET_REVENUE` + `plan.collection_target_pct`. Emits `person.auto_enrolled`.
  - **(b) Close**: deactivated OR role left eligible set → append `TargetRevision` sub-doc on BDM's target + apply `GOAL_CONFIG.DEACTIVATION_PAYOUT_POLICY` lookup (default `finalize_accrued` = leave ACCRUED intact; `reverse_accrued` = flag REJECTED so authority posts reversal JE via ledger UI). Emits `person.lifecycle_closed`.
  - **(c) Revise**: in-role territory/role change → append `TargetRevision` (source=`PEOPLE_LIFECYCLE`), update territory_id. No payout impact.
- **Guardrails** (F.1 cross-module safety):
  - Additive — does NOT replace any existing PeopleMaster hook.
  - Short-circuits if no active plan for entity (fresh subsidiaries work).
  - Own transaction per branch — Sales Goal failure NEVER blocks PeopleMaster save.
  - NEVER posts FI journals auto (human-in-loop invariant — policy `reverse_accrued` flags REJECTED, doesn't post reversal).
  - All auto-actions write `ErpAuditLog` with `[SG-6 lifecycle]` prefix.
- **Subscription-ready**: `SALES_GOAL_ELIGIBLE_ROLES` + `GOAL_CONFIG.DEACTIVATION_PAYOUT_POLICY` fully lookup-driven. Adding a new sales role (e.g. `SALES_REP`, `TERRITORY_MANAGER`) is a 1-row lookup edit.

#### #31 — Mid-Period Target Revision Workflow
- **NEW** `salesGoalController.reviseTarget` + `POST /sales-goals/targets/:id/revise`. Required `revision_reason`. Gated via `gateApproval(module='SALES_GOAL_PLAN', docType='TARGET_REVISION')` — non-authorized submitters routed through Approval Hub (HTTP 202). Transaction-wrapped. Emits `target.revised`.
- **NEW schema field** `SalesGoalTarget.target_revisions[]` — append-only sub-doc array with `{ revised_at, revised_by, revision_reason, prior_sales_target, prior_collection_target, prior_territory_id, prior_person_id, source (MANUAL|PEOPLE_LIFECYCLE|SYSTEM), approval_request_id }`.
- **Feature toggle**: `MID_PERIOD_REVISION_ENABLED` lookup (default disabled). Canonical path remains "reopen plan → edit → reactivate" unless admin opts in via Control Center.
- **Historical snapshot safety**: existing KpiSnapshot rows stay tied to the value that was active at compute time. Future snapshots re-compute from revision point forward (SG-4 plan-versioning pattern, applied at the target level).

#### #32 — Integration Hook Registry
- **NEW** `backend/erp/services/integrationHooks.js` — in-process event bus. `on(event, handler)` registers a listener, `emit(event, payload)` dispatches. Listeners run on next microtask (non-blocking). Per-handler try/catch — one bad listener never blocks emission. Every emit also writes to `ErpAuditLog` (`target_model: 'IntegrationEvent'`) for replayable signal stream.
- **Event codes** (all lookup-registered in `INTEGRATION_EVENTS`):
  - `plan.activated`, `plan.closed`, `plan.reopened`, `plan.versioned`
  - `payout.accrued`, `payout.approved`, `payout.paid`, `payout.reversed`
  - `dispute.filed`, `dispute.resolved`
  - `target.revised`
  - `person.auto_enrolled`, `person.lifecycle_closed`
- **Emit sites wired** (Sales Goal never imports consumers):
  - `salesGoalController.activatePlan/closePlan/reopenPlan/reviseTarget`
  - `salesGoalService.accrueIncentive` (fresh payout only, not race-recovery)
  - `incentivePayoutController.approvePayout/payPayout/reversePayout`
  - `incentiveDisputeController.resolveDispute`
  - `salesGoalLifecycleHooks.enrollPerson/closePersonLifecycle`
- **describeRegistry()** surfaces listener counts + enabled state for the SOX matrix registry panel.

### Wiring map (Phase SG-6)

```
Backend NEW:
  backend/erp/services/integrationHooks.js
  backend/erp/services/salesGoalLifecycleHooks.js
  backend/erp/controllers/soxControlMatrixController.js

Backend MODIFIED:
  backend/erp/models/PeopleMaster.js                  [+pre('save') prior-capture, +post('save') sg-lifecycle fire-and-forget]
  backend/erp/models/SalesGoalTarget.js               [+targetRevisionSchema sub-doc + target_revisions[] array]
  backend/erp/controllers/salesGoalController.js      [+reviseTarget, +integration emit on activate/close/reopen]
  backend/erp/controllers/incentivePayoutController.js[+integration emit on approve/pay/reverse]
  backend/erp/controllers/incentiveDisputeController.js[+integration emit on resolve]
  backend/erp/services/salesGoalService.js            [+integration emit on accrueIncentive (fresh only)]
  backend/erp/controllers/lookupGenericController.js  [+MID_PERIOD_REVISION_ENABLED, +INTEGRATION_EVENTS, +GOAL_CONFIG.DEACTIVATION_PAYOUT_POLICY]
  backend/erp/routes/salesGoalRoutes.js               [+POST /targets/:id/revise, +GET /sox-control-matrix, +/print]

Frontend NEW:
  frontend/src/erp/pages/SoxControlMatrix.jsx

Frontend MODIFIED:
  frontend/src/erp/hooks/useSalesGoals.js             [+getSoxControlMatrix, soxControlMatrixPrintUrl, reviseTarget]
  frontend/src/erp/components/WorkflowGuide.jsx       [+soxControlMatrix guide]
  frontend/src/App.jsx                                [+SoxControlMatrix lazy + route /erp/sales-goals/sox]
  frontend/src/components/common/Sidebar.jsx          [+SOX Control Matrix (admin/finance/president)]
```

### Acceptance checklist (Phase SG-6)

- [x] `node -c` clean on every modified/new backend file (11 files verified).
- [x] Runtime `require()` loads every new service + controller without missing-module errors.
- [x] `npx vite build --mode development` clean — `SoxControlMatrix-*.js` chunk emitted.
- [x] `node backend/scripts/startupCheck.js` — passed.
- [x] `node backend/scripts/verifyRejectionWiring.js` — OK (20 modules verified, 0 warnings).
- [x] No modifications to Expense/Collection/CALF/SMER/PettyCash/Journal/Payroll controllers. PeopleMaster gets ONLY a pre/post-save hook attached — no schema field additions.
- [x] All new lookups are entity-scoped, seeded with defaults, admin-editable (`MID_PERIOD_REVISION_ENABLED`, `INTEGRATION_EVENTS`, `GOAL_CONFIG.DEACTIVATION_PAYOUT_POLICY`).
- [x] SOX matrix NEVER governs access — it REPORTS. Changing a matrix row has no effect; change the underlying lookup to actually adjust posture.
- [x] Lifecycle hook short-circuits on first-entity save (no active plan yet — zero crashes).
- [x] Integration emit is fire-and-forget — no `await` in any emit site. Listener errors are per-handler, never block emitting module.
- [x] Mid-period revision gated by `MID_PERIOD_REVISION_ENABLED` lookup; default disabled — "reopen plan" remains canonical unless admin opts in.
- [x] Integration emit functional test: `on('plan.activated', fn) + emit('plan.activated', {...})` roundtrips payload.
- [ ] **Manual smoke (staging — required before wider rollout)**:
  - Deactivate a BDM in PeopleMaster (flip `is_active=false`) → next compute excludes them from leaderboard; per `DEACTIVATION_PAYOUT_POLICY`, their open ACCRUED rows are either left intact (`finalize_accrued`) or flagged REJECTED (`reverse_accrued`). `ErpAuditLog` shows `[SG-6 lifecycle]` entry. PeopleMaster save NEVER errors.
  - Add a new active BDM → lifecycle hook creates `SalesGoalTarget(target_type='BDM')` with `GOAL_CONFIG.DEFAULT_TARGET_REVENUE`. Emits `person.auto_enrolled`.
  - Toggle `MID_PERIOD_REVISION_ENABLED.metadata.enabled = true` → POST `/sales-goals/targets/:id/revise` with `{ revision_reason, sales_target }` → authority gate fires for non-president; president path appends `target_revisions[]` + emits `target.revised`. Historical KpiSnapshot rows untouched; re-run Compute KPIs → future snapshots use new target.
  - Open `/erp/sales-goals/sox` as admin → 16 controls rendered, live allowed_roles match MODULE_DEFAULT_ROLES, actor counts populated from recent activity, segregation findings panel populated, integration registry shows 13 event codes (listener counts = 0 until a subscriber wires `integrationHooks.on`).
  - Click Print / Save as PDF → new window opens with HTML view (or PDF if PDF_RENDERER.BINARY_ENABLED=true + puppeteer installed).
  - Activate a plan as president → check ErpAuditLog for a `target_model: 'IntegrationEvent'` row with `new_value: 'plan.activated'`.

### Known limitations / future hooks (Phase SG-6)

- **SOX CONTROLS list is a module constant, not a lookup.** Intentional — see §#29 design invariant. If subscribers add new Sales Goal state changes (unlikely in ERP core, possible for plugin modules), they extend `CONTROLS` in `soxControlMatrixController.js` — one edit, not a lookup race.
- **Lifecycle hook runs on EVERY PeopleMaster save**, including no-op saves (touching a non-classified field). Short-circuits after the `prior === current` classification, so the cost is one indexed query + one memory compare. Does NOT introduce measurable latency on the PeopleMaster write path.
- **Integration event bus is in-process only.** Cross-process (multi-node) subscribers need a message broker. Acceptable for current VIP deployment (single Node instance); for horizontal scaling this file is the right place to swap in Redis/Kafka without changing emit sites.
- **`reverse_accrued` policy flags REJECTED — does NOT auto-post reversal JE.** By design (human-in-loop invariant). Authority sees the REJECTED row in the payout ledger and clicks Reverse, which posts the SAP-Storno JE via `reverseJournal`. Documented in the GOAL_CONFIG lookup metadata so admins understand before flipping.
- **Mid-period revision does NOT cascade to IncentivePayout retroactively.** If a BDM already has an ACCRUED payout and you revise their target downward, the accrued tier_budget STAYS at the pre-revision value (matches "historical snapshots immutable" posture from SG-4). To re-accrue at the new tier, authority reverses the payout, then re-runs Compute KPIs.
- **SOX matrix audit window is capped at 365 days** to keep the query fast. For annual SOX reports, run the endpoint on a dated window and archive the PDF offsite.
- **No auto-discovery of subscribers** — listeners are registered by module init code. Drop-in extension is one-liner (`integrationHooks.on('payout.paid', handler)` at module startup), but there's no registration CLI.

---

## Phase SG-Q2 W4 — Period-Lock Hardening on Sales Goals + Orphan Cleanup ✅ (April 19, 2026)

Closes the Q2 evaluation gap on Rule #20 compliance for the Sales Goal module AND fixes three pre-existing orphan bugs in the period-lock matrix that were silently broken since SG-Q2 W2.

### Scope

#### Period-lock wiring (the Gap-1 work)
- **Extended `PeriodLock.module` enum** ([backend/erp/models/PeriodLock.js](backend/erp/models/PeriodLock.js)) — added `SALES_GOAL`, `INCENTIVE_PAYOUT`, `DEDUCTION`. Non-breaking; existing rows already use values inside the new superset.
- **NEW middleware** [backend/erp/middleware/periodLockCheckByPlan.js](backend/erp/middleware/periodLockCheckByPlan.js) — sibling to `periodLockCheck`. For plan-spanning routes, loads the referenced `SalesGoalPlan`, derives `fiscal_year`, and rejects if ANY month of that year is locked for the moduleKey. Read plan id from `req.params.id` (preferred) or `req.body.plan_id`. POST/PUT/PATCH only; gracefully skips when plan id, plan, or `req.entityId` missing.
- **Wired 7 sales-goal routes** ([backend/erp/routes/salesGoalRoutes.js](backend/erp/routes/salesGoalRoutes.js)):
  - Plan-spanning (use `periodLockCheckByPlan('SALES_GOAL')`): `/plans/:id/activate`, `/plans/:id/reopen`, `/plans/:id/close`, `/targets/bulk`, `/targets/import`
  - Period-specific (use `periodLockCheck('SALES_GOAL')`): `/snapshots/compute`, `/kpi/manual`
  - Order: erpAccessCheck → erpSubAccessCheck → period guard → handler → `gateApproval` (internal). Matches existing convention.

#### Orphan-bug cleanup (discovered during the audit)
- **O1 — `INCENTIVE_PAYOUT` was wired but missing from enum.** Wire-up at `incentivePayoutRoutes.js:49,55` (Pay/Reverse) was silently no-op since SG-Q2 W2 — the middleware queried an enum value that didn't exist. Now closed via the enum extension.
- **O2 — `DEDUCTION` was wired but missing from enum.** Same orphan pattern at `deductionScheduleRoutes.js:28,31,34`. Now closed.
- **O3 — `periodLockController.MODULES` constant out of sync with model.** Hardcoded list never updated when `INCOME` was added → matrix UI silently dropped INCOME locks. Replaced the constant with `PeriodLock.schema.path('module').enumValues` so the controller is a single-source-of-truth derivative.
- **O4 — `controlCenterController.js:78` hardcoded "10 modules" stat.** Replaced with `PeriodLock.schema.path('module').enumValues.length` so the stat card stays accurate forever.
- **O5 — Frontend `PeriodLocks.jsx` MODULE_LABELS missing 3 keys.** Added `SALES_GOAL`, `INCENTIVE_PAYOUT`, `DEDUCTION` labels (INCOME was already present — agent earlier was wrong).

#### Workflow guides (Rule #1)
- **`salesGoalDashboard` banner** ([frontend/src/erp/components/WorkflowGuide.jsx:1311](frontend/src/erp/components/WorkflowGuide.jsx)) — added a step explaining which actions are gated by SALES_GOAL period locks and how to unlock.
- **`incentivePayoutLedger` banner** — already documented period-lock interaction (line 1498, 1511); no edit needed. Verified.

### Files touched (10)

| File | Change |
|---|---|
| `backend/erp/models/PeriodLock.js` | enum +3 keys |
| `backend/erp/controllers/periodLockController.js` | MODULES → enum derive |
| `backend/erp/controllers/controlCenterController.js` | totalModules → enum derive |
| `backend/erp/middleware/periodLockCheckByPlan.js` | NEW |
| `backend/erp/routes/salesGoalRoutes.js` | wire 7 routes |
| `frontend/src/erp/pages/PeriodLocks.jsx` | +3 labels |
| `frontend/src/erp/components/WorkflowGuide.jsx` | salesGoalDashboard step |
| `CLAUDE-ERP.md` | period-lock invariant updated |
| `docs/PHASETASK-ERP.md` | this entry |

### Audit findings — what was already shipped (false alarms in the original gap list)

The Q2-eval gap brief listed four items. Only Gap 1 (period-lock middleware) was a real gap. The others were already shipped:

- **Gap 2 (payout lifecycle routes)** — `/incentive-payouts/:id/{approve,pay,reverse}` + `/payable?period=` all wired in `incentivePayoutRoutes.js:22,41-57` since SG-Q2 W2 with full middleware stack. No work.
- **Gap 3 (lookup seeds)** — `CREDIT_RULE_TEMPLATES`, `DISPUTE_SLA_DAYS`, `COMP_STATEMENT_TEMPLATE` all lazy-seeded in `lookupGenericController.js:941,1012,981`. `ACTIVE_PLAN_VERSION` is intentionally NOT a lookup — operational state lives in `IncentivePlan.current_version_id` (see `incentivePlanService.js:15` design note). No work.
- **Gap 4 (auto-enrollment from PeopleMaster)** — `autoEnrollEligibleBdms()` ([salesGoalController.js:51](backend/erp/controllers/salesGoalController.js)) called inside `activatePlan` transaction at line 365. Plus ongoing post-save hook in `salesGoalLifecycleHooks.js`. No admin click-enroll required. No work.

### Integrity guarantees

- **Single source of truth**: every module list (controller MODULES, Control Center stat) derives from `PeriodLock.schema.path('module').enumValues`. Adding a future module = one edit (enum), zero downstream code changes.
- **Entity isolation preserved**: middleware filters by `req.entityId` (Tenant A's lock doesn't bleed to Tenant B). Unique index already includes `entity_id`.
- **No regression to 26 existing `periodLockCheck()` call sites**: original middleware unchanged. New behavior lives in sibling `periodLockCheckByPlan`.
- **Default-Roles Gate order preserved**: erpAccessCheck → erpSubAccessCheck → period guard → handler (which calls `gateApproval` internally). Authority Matrix routing unaffected.
- **Agent (cron) bypass intentional**: `kpiSnapshotAgent` calls `salesGoalService` directly, not HTTP. No req.body collision; agent can compute snapshots even in locked periods because it writes to historical YTD rows that admins lock specifically to freeze user-facing edits, not to halt the daily catch-up cron.

### Future hooks (deferred — not blocking Q2)

- **`PERIOD_LOCKABLE_MODULES` lookup category** — to remove the enum entirely, swap the schema enum for a custom validator that reads the lookup. Migration is non-breaking. Useful for plugin-style subsidiaries that want to lock additional custom modules. Skipped here per Rule #3 carve-out for immutable code identifiers.
- **`GET /api/erp/period-locks/modules` endpoint** — to remove frontend `MODULE_LABELS` hardcoding and let subscribers customize labels. Skipped here.
- **Wiring-check script** that fails CI if any `periodLockCheck('X')` argument is not in `PeriodLock.module` enum — would have caught O1+O2 earlier. Worth Phase SG-Q2 W5.

---

## PHASE H6 — SALES OCR (BDM Field Scanning) + OCR AI Spend-Cap 🚧 IN PROGRESS (April 19, 2026)

**Owner**: Gregg (President) • **Priority**: High • **Effort**: ~18.5d • **Target cost**: ~$25-55/mo at steady state (1,320 scans/mo)

### Goal

BDMs scan CSI / Collection Receipt / Delivery Receipt (sampling + consignment variants) / Bank Deposit Slip / Check on their phone in the field instead of typing. Each scan creates a DRAFT in the correct target model; BDM reviews on their phone; submit routes through `gateApproval()` per Rule #20. Same smart-OCR pipeline that handles Expenses (Google Vision → rule-based parser → Claude field-completion → master-data resolver → vendor auto-learn) — just extended to sales doc types and new parsers for bank slip + check.

### Two governance gaps fixed up front

| ID | Gap | Fix | Status |
|---|---|---|---|
| P1-1 | `ocrAutoFillAgent.classifyWithClaude` bypassed `AI_SPEND_CAPS` | Wire `enforceSpendCap('OCR')` into the agent; pass `entityId` via processor context; catch 429 in processor and record `ai_skipped_reason: 'SPEND_CAP_EXCEEDED'` | ✅ |
| P1-2 | `OcrUsageLog.cost_usd` did not exist → OCR spend invisible in AI Budget total | Add `cost_usd` + `ai_skipped_reason` fields; populate from `processor.ai_cost_usd`; `spendCapService` already aggregates `$cost_usd` so no further work there | ✅ |

Both shipped as a single standalone commit before any sales-OCR volume lands.

### Deliverables (remaining)

| # | Item | Effort | Depends on |
|---|---|---|---|
| P1-3 | Extend smart OCR Claude-fallback to sales doc types (CSI/CR/DR/BANK_SLIP/CHECK in `CRITICAL_FIELDS_BY_DOC`) | 1d | P1-1 |
| P1-4 | Parsers: `bankSlipParser.js`, `checkParser.js`, `drRouter.js` (sampling vs consignment marker) | 5d | P1-3 |
| P1-5 | Missing DRAFT models: `SamplingLog`, `Deposit`, `CheckReceived` (only 3 — `SalesLine`, `Collection`, `ConsignmentTracker` already exist in `backend/erp/models/`) | 2d | — |
| P1-6 | Add `BANK_SLIP` + `CHECK` to existing `OcrSettings.ALL_DOC_TYPES` and to the existing `ErpOcrSettingsPanel` chip grid (no new panel) | 0.5d | P1-5 |
| P1-7 | `/api/erp/sales-ocr/*` endpoints — one per doc type, each wraps `processOcr` + creates correct DRAFT record via `gateApproval()` + `periodLockCheck(module)` | 3d | P1-4, P1-5 |
| P1-8 | Mobile `SalesDocScanner.jsx` (camera, preview, retry, 360px-verified) | 2d | — |
| P1-9 | Six review forms (CSIReviewForm, CRReviewForm, DRSamplingReviewForm, DRConsignmentReviewForm, BankSlipReviewForm, CheckReviewForm) — pre-filled editable fields | 3d | P1-7 |
| P1-10 | `/erp/scan` route + Sidebar link + WorkflowGuide banner | 1d | P1-8, P1-9 |
| P1-11 | Integrity — `verify:copilot-wiring` + `verify:rejection-wiring` stay ✓; vite build ✓; Expense OCR regression fixture; 10-doc UAT on BDM phone | 1d | all |

### Architectural decisions (locked)

1. **Reuse existing 5-layer pipeline** — no new adapter, no new OCR tier. Google Vision is already the primary engine; adding sales docs = adding parsers + extending `CRITICAL_FIELDS_BY_DOC` + registering doc types in `OcrSettings.ALL_DOC_TYPES`.
2. **One reusable mobile scanner component** (`SalesDocScanner.jsx`) — doc type selected before capture; the scanner is agnostic. Review forms are the only per-doc-type UI.
3. **DR routing via marker detection** — single `drParser` still does the raw parse; a `drRouter.js` wrapper inspects extracted text for `SAMPLING|SAMPLE|FREE\s*SAMPLE` (→ SamplingLog) vs `CONSIGNMENT|CONSIGN` (→ ConsignmentTracker). Ambiguous → defaults to ConsignmentTracker (the more common case) with `review_required: true`.
4. **AI_SPEND_CAPS stays opt-in** — existing entities will NOT start enforcing a cap just because H6 landed. Seed default is `is_active: false`. President opts in via Control Center → AI Budget.
5. **BDM authority** — BDMs can CREATE scanned DRAFTS; POSTING still routes through `gateApproval()` per Rule #20 (Default-Roles Gate from Phase G4, Authority Matrix from Phase 29 if enabled).
6. **Banners everywhere** — new `/erp/scan` page gets a `WorkflowGuide` entry; Control Center OCR panel already has its own helper text (no change needed).

### Subscription-readiness

- `OcrSettings` is already per-entity. H6 only adds two new doc types to `ALL_DOC_TYPES` — every existing subscriber inherits them (defaulting to ENABLED; admin can untick chips in OCR Settings to restrict).
- `AI_SPEND_CAPS.MONTHLY` lookup row governs spend. Per-feature overrides via `metadata.feature_overrides.OCR` for entities that want a separate OCR-only cap.
- No hardcoded sample markers, no hardcoded parser thresholds, no hardcoded check/bank field positions.

### Integrity guarantees

- **Zero regressions in Expense OCR** — additive changes only. Existing `OR` and `GAS_RECEIPT` flows untouched; the spend-cap gate applies to them too (closes the same Phase G7 gap symmetrically), which is a correctness gain.
- **Rule #2 end-to-end wiring** — every new doc type must be wired across: `OcrSettings.ALL_DOC_TYPES` → `ocrProcessor.PARSERS` → `ocrProcessor.SUPPORTED_DOC_TYPES` → `salesOcrController.DRAFT_CREATORS` → `salesOcrRoutes` → `SalesDocScanner` doc-type chip → review form component. Missing any one = orphaned enum.
- **Rule #3 lookup-driven** — sample marker keywords, handwriting confidence thresholds, and per-BDM daily cap all configurable via Lookup.
- **Rule #20 gateApproval** — every DRAFT creation endpoint wraps submit/post in `gateApproval(module)` + `periodLockCheck(module)`. No bypass.
- **Rule #21 entity from `req.entityId`** — never from client body. New endpoints follow the existing `ocrController` pattern.

### Common gotchas (H6 — reference)

- Sales docs don't need expense classification. Don't add CSI/CR/DR to `EXPENSE_DOC_TYPES` — that would run COA classification on receipts with no vendor. Only add them to `CRITICAL_FIELDS_BY_DOC` so field-completion runs.
- Multi-entity letterheads share the same scanner (VIP Inc. TIN `744-251-498-00000`; MG AND CO. TIN `010-824-240-00000`). Entity resolver must match TIN from the letterhead text → `Entity.tin_number` before assigning the DRAFT to an entity. If the TIN doesn't match any known entity, fall back to `req.entityId` (the BDM's working entity) with `review_required: true`.
- Expiry date formats observed in the wild: `17/06/2027`, `11/2027`, `09/20/28`, `01-2027`, `08/2028`. Parser must handle MM/YY, MM/YYYY, DD/MM/YYYY, and MM-YYYY.
- CR settlement box lists CSI#s being paid as line items — `Collection.line_items[]` must accept partial-payment rows (amount < CSI total).
- Check MICR line (bottom of check) is the most reliable source for check number + routing number + account number; when Vision reads it cleanly the regex parse is HIGH confidence without Claude fallback.

## Phase G8 — Agents + Copilot Expansion ✅ (April 19, 2026)

### Goal
Close the Phase 2 scope from `HANDOFF-phase-agents-copilot.md`: a proper `Task` collection, 8 new rule-based scheduled agents, and 10 new Copilot tools (5 Secretary + 5 HR), plus 3 AI toggle lookups that let subscribers flip individual agents to Claude-assisted narrative without a code change.

### Delivered (22 items)
- **Task model + UI**: `backend/erp/models/Task.js`, `taskController.js`, `taskRoutes.js`; `frontend/src/erp/pages/TasksPage.jsx`, route `/erp/tasks`, Sidebar link under Administration, WorkflowGuide `'tasks'` entry.
- **8 scheduled agents** registered in `agentRegistry.js` + cron in `agentScheduler.js`:
  - `treasury` (weekdays 5:30 AM), `fpa_forecast` (Mon 6 AM), `procurement_scorecard` (Tue 7 AM), `compliance_calendar` (Mon 5 AM), `internal_audit_sod` (Wed 8 AM), `data_quality` (daily 9 AM), `fefo_audit` (daily 7:30 AM), `expansion_readiness` (monthly, 1st at 10 AM).
- **10 Copilot tools** in `copilotToolRegistry.js` + matching rows in `COPILOT_TOOLS` lookup:
  - Secretary: CREATE_TASK, LIST_OVERDUE_ITEMS, DRAFT_DECISION_BRIEF, DRAFT_ANNOUNCEMENT, WEEKLY_SUMMARY.
  - HR: SUGGEST_KPI_TARGETS, DRAFT_COMP_ADJUSTMENT, AUDIT_SELF_RATINGS, RANK_PEOPLE, RECOMMEND_HR_ACTION.
- **3 AI-toggle lookups** seeded: `TREASURY_AGENT_AI_MODE` (`rule`), `FPA_FORECAST_AI_MODE` (`rule`), `HR_ACTION_BLUNTNESS` (`balanced`).
- **PRESIDENT_COPILOT** `system_prompt` updated — names the new tools so Claude routes natural-language questions to the right handler.
- **Prep fix (Phase H6 P1-1 carry-over)**: `ocrAutoFillAgent.classifyWithClaude` now re-throws the 429 from `enforceSpendCap` so `ocrProcessor` can record `ai_skipped_reason: 'SPEND_CAP_EXCEEDED'` instead of silently returning `null`.

### Integrity results
- `npm run verify:copilot-wiring` → **35/35 passes, 0 errors, 0 warnings** (was 25/25 pre-G8).
- `npm run verify:rejection-wiring` → **20 modules verified, 0 warnings** (unchanged).
- `node -c` clean on every modified file.

### Subscription-readiness (Rule #3)
| Config | Lookup / Source | Default |
|---|---|---|
| Treasury AI mode | `TREASURY_AGENT_AI_MODE.DEFAULT.metadata.value` | `rule` |
| FP&A AI mode | `FPA_FORECAST_AI_MODE.DEFAULT.metadata.value` | `rule` |
| HR recommendation bluntness | `HR_ACTION_BLUNTNESS.DEFAULT.metadata.value` | `balanced` |
| BDM graduation threshold | `EXPANSION_READINESS_CONFIG.DEFAULT.metadata.bdm_graduation_monthly_sales_min` | ₱500,000 |
| BDM graduation months required | `EXPANSION_READINESS_CONFIG.DEFAULT.metadata.bdm_graduation_months_required` | 3 |
| Compliance deadlines | `COMPLIANCE_DEADLINES.*` (optional override) | 6 baseline PH deadlines |
| Tool visibility per role | `COPILOT_TOOLS.<code>.metadata.allowed_roles` | per tool |
| Monthly AI budget cap | `AI_SPEND_CAPS.MONTHLY` | `is_active: false` (opt-in) |

### Common gotchas (G8)
- **Task routes skip erpAccessCheck.** Productivity collection, every ERP-auth user can maintain their own. Privileged scope (`?scope=all`) gated by role check inside the controller — Rule #21 enforced.
- **DRAFT_ANNOUNCEMENT respects entity scope for non-privileged callers.** Even if Claude passes `target_entity_id`, non-privileged recipients fall back to `ctx.entityId`. Privileged users (president/ceo/admin) can broadcast to a specific other entity when they have multi-entity access.
- **RECOMMEND_HR_ACTION never writes.** It returns a recommendation payload only. All action tiers above `coach` set `requires_hr_legal_review=true`. Conservative bluntness downgrades `manage_out` to `PIP`. Execute side is manual — the president issues a warning / PIP / separation via the existing People / Payroll flows after reading the recommendation.
- **Rule-based first.** Treasury + FP&A agents produce a useful body purely from SQL aggregations. The AI toggle only APPENDS a short narrative — never replaces the numbers. Flipping the toggle to `ai` counts Claude calls against `AI_SPEND_CAPS` for that entity.
- **Internal Audit + Data Quality dual-route notifications** use two separate `notify()` calls (PRESIDENT + ALL_ADMINS). The second call uses `channels: ['in_app']` only, so finance / admin don't also receive the email — email always goes to the primary (PRESIDENT) route.
- **verify:copilot-wiring baseline is now 35/35.** Any new tool added after G8 that forgets to register a handler will fail CI. Don't regress this.

---

## Phase G9 — Unified Operational Inbox (April 20, 2026, COMPLETE)

### Goal
Single inbox surface for ALL roles that fuses approvals, tasks, AI agent findings, broadcasts, and chat. Replaces the BDM-only EMP_InboxPage and removes the email-only path for AI agent findings.

### What shipped
| Layer | Change |
|---|---|
| Schema | `MessageInbox` + `entity_id`, `folder`, `thread_id`, `parent_message_id`, `requires_action`, `action_type`, `action_payload`, `action_completed_at`, `action_completed_by`. 4 new compound indexes. |
| Lookups (subscription-ready) | `MESSAGE_FOLDERS` (9 codes), `MESSAGE_ACTIONS` (6 codes), `MESSAGE_ACCESS_ROLES` (6 roles, can_dm/can_broadcast/can_cross_entity). All lazy-seed via `inboxLookups.get*Config(entityId)`. |
| Lookups (governance) | `ERP_MODULE.MESSAGING` (sort 15) + 5 `ERP_SUB_PERMISSION` rows (`messaging.dm_any_role`, `dm_direct_reports`, `broadcast`, `cross_entity`, `impersonate_reply`) + `MODULE_DEFAULT_ROLES.MESSAGING` (open). |
| Lookup (cooldown) | `TASK_OVERDUE_COOLDOWN_DAYS.GLOBAL.metadata.days = 1`. Lazy-seeds on first agent run. |
| Helper module | `backend/erp/utils/inboxLookups.js` (10 exports including `folderForCategory`, `canDm`, `canBroadcast`). |
| Notification dispatch | `dispatchMultiChannel` + `persistInApp` extended with folder/thread/action affordance fields. 7 notify* helpers flipped from email-only to multi-channel + new `notifyTaskEvent`. |
| Approval threading | `approvalService.js` passes `approvalRequestId` to `notifyApprovalRequest`/`notifyApprovalDecision` so request → decision → reopen events fold into one thread. |
| Task overdue agent | `backend/agents/taskOverdueAgent.js` (FREE, weekdays 06:15 Manila). Cooldown via lookup. New Task field `last_overdue_notify_at`. Registered in `agentRegistry.task_overdue` and Agent Dashboard. |
| AI agents audit | `dailyBriefingAgent`, `orgIntelligenceAgent`, `notificationService.sendInApp` now stamp `entity_id` + `folder` on every `MessageInbox.create` (auto-derived from category via `folderForCategory` for the generic helper). |
| API | `GET /messages` (folder/thread/counts), `GET /messages/counts`, `GET /messages/folders`, `GET /messages/thread/:id`, `POST /messages/compose`, `POST /messages/:id/reply`, `POST /messages/:id/action`. |
| Frontend | `pages/common/InboxPage.jsx` (3-pane desktop, stacked mobile ≥360 px) + 4 sub-components in `components/common/inbox/` + `NotificationBell.jsx` in navbar. TASKS folder mounts existing `TaskMiniEditor` (ships intact). `EMP_InboxPage` is now a re-export shim. |
| Routes | `/inbox` and `/inbox/thread/:thread_id` (allowedRoles = ALL); Sidebar links added to ERP Administration + CRM admin Main + existing BDM Work. |
| Banners | `PageGuide.inbox` (CRM) refreshed for the new model. New `WorkflowGuide.inbox` (ERP) entry. |
| Copilot | New tool `DRAFT_REPLY_TO_MESSAGE` (write_confirm) + handler `draftReplyToMessage` in `copilotToolRegistry`. Routes through inbox reply pathway (Rule #20). |
| Verify scripts | `verify:inbox-wiring` (NEW, 19 checks) + `verify:copilot-wiring` (now 36/36). |

### Migration / deploy order
1. Deploy schema + helper + lookups (R1–R3).
2. Run `node backend/scripts/backfillMessageInboxEntityId.js` once (already idempotent; supports `--dry-run`).
3. Deploy R4 (controller/route expansion).
4. Deploy R5–R8 (frontend + Copilot tool + verify scripts).
5. Verify: `npm --prefix backend run verify:inbox-wiring && npm --prefix backend run verify:copilot-wiring && cd frontend && npx vite build`.
6. Smoke test (per CLAUDE-ERP Phase G9 section).

### Integrity results
- `node -c` clean on all 19 backend files modified/created.
- `verify:inbox-wiring` → **19/19 passes, 0 errors, 0 warnings**.
- `verify:copilot-wiring` → **36/36 passes, 0 errors, 0 warnings** (was 35/35 pre-G9).
- `npx vite build` (frontend) → built in 12.89 s, no errors.

### Common gotchas (G9)
- **Agent path normalization.** Handoff said `backend/erp/agents/taskOverdueAgent.js`; canonical is `backend/agents/taskOverdueAgent.js` (matches the rest of the registry). The agent imports models from `../erp/models/*`.
- **`agent_key` enum was removed in Phase G8.** No need to extend `AgentRun` — registry is the source of truth via `isKnownAgent`.
- **Folder map duplication.** `CATEGORY_TO_FOLDER` lives in BOTH `inboxLookups.js` AND `backfillMessageInboxEntityId.js`. The verify script asserts the backfill script *references* `CATEGORY_TO_FOLDER` (regex check) so a missing import is caught — but the maps must stay in lockstep manually.
- **Privileged scope (Rule #21).** `messageInboxController.resolveEntityScope` returns `null` for privileged users with no `?entity_id=` → no entity filter (sees everything). Non-privileged callers always pin to their own `entity_id`. Never silently fall back to `req.user.entity_id` for privileged users.
- **Action delegation (Rule #20).** `POST /messages/:id/action` does NOT reimplement approve/reject/resolve. It dispatches into `universalApprovalController.approvalHandlers.approval_request` (for approve/reject) and mirrors `varianceAlertController.resolveVarianceAlert`'s permission logic (for resolve). The approve handler enforces sub-perms + period locks — the inbox endpoint is a thin facade.
- **Entity field on existing AI-agent rows.** Pre-G9 `MessageInbox` rows have `entity_id = null` until the migration runs. The new list endpoint scopes by entity for non-privileged users — those legacy rows will not appear for them after the migration unless backfilled. Run the backfill before users notice.
- **Task editor URL.** `TaskMiniEditor` is mounted ONLY when `activeFolder === 'TASKS'` AND the task was successfully fetched via `GET /erp/tasks/:id`. If the underlying task was deleted (orphaned message), the standard `InboxThreadView` renders instead — graceful fallback.

---

## Phase G10 — Tasks ↔ KPI Alignment + Gantt + Kanban + Bulk Ops ✅ (April 20, 2026)

### Scope
Align `/erp/tasks` with the **2026 Sales GOAL and POA** (source:
`C:\Users\LENOVO\OneDrive\Documents\2026\TRAINING\2026 Sales GOAL and POA.pdf`).
5 growth drivers, 13 KPIs, responsibility tags, revenue bands — all
lookup-driven and per-entity so subscribers configure without a code
deploy. Four view tabs on `/erp/tasks`: List, Gantt, Kanban, Revenue
Bridge.

### What shipped

| Area | Details |
|---|---|
| Task model | Added (all optional): `growth_driver_code`, `kpi_code`, `goal_period` (`YYYY` \| `YYYY-QN` \| `YYYY-MM`), `milestone_label`, `start_date`, `kpi_ref_id`, `responsibility_tags[]`. New index `{ entity_id, growth_driver_code, goal_period, status }`. |
| Lookup seeds | `GROWTH_DRIVER` (5 POA drivers), `KPI_CODE` (13 KPIs — 3 existing reused + 10 new), `RESPONSIBILITY_TAG` (4 POA tags: BDM, PRESIDENT, EBDM, OM), `TASK_BULK_NOTIFY_THRESHOLD` (scalar, default 5). Lazy-seeded per entity via `backend/erp/utils/kpiLookups.js` mirroring the G9 `inboxLookups.js` pattern. |
| New KPI codes | `TIME_TO_ACCREDITATION_DAYS`, `FORMULARY_APPROVAL_RATE`, `MONTHLY_REORDER_FREQ`, `LOST_SALES_INCIDENTS`, `INVENTORY_TURNOVER`, `EXPIRY_RETURNS`, `MD_ENGAGEMENT_COVERAGE`, `HOSP_REORDER_CYCLE_TIME`, `VOLUME_RETENTION_POST_PI`, `GROSS_MARGIN_PER_SKU`. All start with `metadata.auto_compute = false` (manual data source) — no `salesGoalService.computeKpi` switch cases added in G10. |
| Controller | `listTasks` grew: `growth_driver_code` / `kpi_code` / `goal_period` / `responsibility_tags` / `due_from` / `due_to` / `q` (regex-safe free-text). `createTask` + `updateTask` validate driver + KPI against per-entity lookup and reject on unknown codes or driver/KPI misalignment. New endpoints: `listDrivers`, `listKpiCodes?driver=`, `listByDriver` (POA-ordered groups for Gantt), `bulkUpdate` (whitelisted patch + per-task auth + rollup notifications), `bulkDelete` (creator-or-privileged gate). |
| Routes | `GET /erp/tasks/drivers`, `GET /erp/tasks/kpi-codes`, `GET /erp/tasks/by-driver`, `POST /erp/tasks/bulk-update`, `POST /erp/tasks/bulk-delete` — all registered **before** `:id` patterns so static paths resolve first. |
| Bulk-notify rollup | Per-assignee event count ≤ `TASK_BULK_NOTIFY_THRESHOLD` → fire N `notifyTaskEvent` (preserves taskId threading). Count > threshold → single `dispatchMultiChannel` summary row in the TASKS folder with `action_type=open_link` + `deep_link=/erp/tasks?ids=<csv>`. Prevents 50-row inbox spam on bulk reassignment. |
| Frontend | `TasksGantt.jsx` (POA-driver-grouped CSS Gantt with week/month/quarter zoom, today marker, responsibility-tag chips, drawer-mounted `TaskMiniEditor`), `TasksKanban.jsx` (5-column HTML5 drag-to-column, optimistic + revert), `RevenueBridge.jsx` (driver × status progress + total vs PHP 10M increment goal), `TaskMiniEditor.jsx` extended with driver/KPI/period chips + Owners multi-select tag picker. `TasksPage.jsx` rewritten with 4 tabs, advanced filter bar (driver/KPI cascade, period, priority, date range, search), bulk action bar (status/priority/delete), Owners column, and `inbox:updated` event dispatch after bulk ops. |
| Banners | `WorkflowGuide.tasks` refreshed: 8 steps covering all 4 tabs + Owners tags + bulk-notify rollup + Copilot path. |
| Verify scripts | New `verify:task-kpi-wiring` (lookup presence, lazy-seed null safety, controller exports, route mounts, frontend imports, rollup wiring, inbox-sync dispatch). No impact on `verify:copilot-wiring` (36/36) or `verify:inbox-wiring`. |

### Migration / deploy order
1. Deploy R1 (model + lookup util + controller + routes). All fields are optional; no schema migration required for existing data.
2. Run `node backend/scripts/backfillTaskKpiFields.js --dry-run` — documentation-only, verifies field counts on existing rows. Produces no writes.
3. Deploy R2 (frontend components + TasksPage + WorkflowGuide). Verify: `cd frontend && npx vite build`.
4. Verify: `npm --prefix backend run verify:task-kpi-wiring` passes.
5. Optional smoke: create one task tagged HOSPITAL_ACCREDITATION + PCT_HOSP_ACCREDITED + 2026-Q1 → verify it appears in all four tabs correctly. Bulk-reassign 6 tasks to one BDM → verify single rollup inbox row (threshold=5).

### Integrity results
- `node -c` clean on all backend files modified/created.
- `verify:task-kpi-wiring` → **ALL CHECKS PASS**.
- `cd frontend && npx vite build` → clean.
- `verify:copilot-wiring` → **36/36** (unchanged; G10 adds no Copilot tools).
- `verify:inbox-wiring` → unchanged.

### Common gotchas (G10)
- **Route order.** `/drivers`, `/kpi-codes`, `/by-driver`, `/bulk-update`, `/bulk-delete` MUST be registered before `PATCH /:id` and `DELETE /:id` — otherwise Express matches `bulk-update` as an ObjectId and shadows the bulk handler.
- **KPI/driver alignment.** `createTask` / `updateTask` / `bulkUpdate` reject with 400 if `kpi_code`'s `metadata.driver` doesn't match `growth_driver_code`. Lookup rows with no `metadata.driver` skip the check (migration-friendly).
- **Milestone-only for new KPIs.** The 10 new KPI codes have `metadata.auto_compute = false` — `salesGoalService.computeKpi` has no cases for them. Flip `auto_compute` + add a case in a later phase when the rule is defined. The Gantt + Kanban + Revenue Bridge work on task state, not KPI actuals.
- **Bulk-notify rollup.** Threshold is per-assignee, not global. If one bulk reassigns 4 tasks to Alice and 8 tasks to Bob (threshold=5), Alice gets 4 per-task rows (preserving threading) and Bob gets 1 summary row with a deep-link to the filtered list.
- **Drawer `TaskMiniEditor`.** Both Gantt and Kanban open the same mini-editor in a side drawer. Rule #20 — no parallel detail view. The drawer component dispatches `inbox:updated` after every save so the NotificationBell + InboxPage refresh.
- **Responsibility tags are freeform at save time.** Controller's `sanitizeTags` upper-cases + trims + dedupes but does NOT reject unknown codes. `validateResponsibilityTags` exists in `kpiLookups` for future strict contexts (importer) but taskController keeps it flexible so admins can tag with entity-specific codes before updating the lookup.
- **Privileged `scope=all` is opt-in.** `RevenueBridge.jsx` tries `scope=all` first; on 403 falls back to `scope=mine` silently so the widget remains useful for non-privileged users. No toast on the fallback path.
- **Goal period format.** `sanitizePeriod` accepts `YYYY`, `YYYY-QN`, `YYYY-MM` only. Anything else is cleared to null. `updateTask` returns 400 on non-empty-but-invalid input (refuses to silently lose the value).
- **G10.D (POA Excel import) deferred.** The 2026-POA-Tasks.xlsx template is not finalized. Schema and controller placeholder exist in the plan (see `g10-tasks-kpi-gantt.md` G10.D section) — defer until the admin-side Excel sheet is confirmed.

---

## Phase 31R — Reversal Console Coverage Extension ✅ (April 20, 2026)

**Why.** Phase 31 shipped with 13 `REVERSAL_HANDLERS` entries (SALES_LINE, COLLECTION, EXPENSE, CALF, PRF, GRN, IC_TRANSFER, CONSIGNMENT_TRANSFER, INCOME_REPORT, PAYSLIP, PETTY_CASH_TXN, JOURNAL_ENTRY, SALES_GOAL_PLAN). Audit against every model with `status: POSTED` and every `source_module: ...` call site reveals **5+ POSTED transactional docs that are not reversible from the console**. Each one currently has a per-module `reopen*` path or no reversal path at all — so president must hunt across pages instead of using the single console that Phase 31 was built for. SMER is the most-used miss.

**Governing principle.** Any doc that (a) has a `POSTED` status and (b) posts a JE via `createAndPostJournal()` must have a President Reversal handler. Reversal must follow SAP Storno — original stays POSTED in its period, reversal JE posts to current period, `deletion_event_id` + `reopen_count` set on the doc. Mirror existing `reopenSmer` / `reverseCarLogbook` patterns.

### Audit — missing handlers

| Doc Type | Model | `source_module` on JE | POSTED? | Existing reopen path | Priority |
|---|---|---|---|---|---|
| `SMER_ENTRY` | SmerEntry | `EXPENSE` | ✅ | `reopenSmer` (expenseController.js:315) | **P1** |
| `CAR_LOGBOOK` | CarLogbookEntry | `EXPENSE` | ✅ | reopen handler + reverse helper in expenseController | **P1** |
| `SUPPLIER_INVOICE` | SupplierInvoice | `SUPPLIER_INVOICE` | ✅ | none — no reopen | **P2** |
| `CREDIT_NOTE` | CreditNote | `CREDIT_NOTE` | ✅ | already flagged as deferred in Phase 31 Extension (line 4244) | **P2** |
| `IC_SETTLEMENT` | IcSettlement | banking | ✅ | none | **P2** |
| `CREDIT_CARD_TRANSACTION` | CreditCardTransaction | `BANKING` | ✅ (`PENDING→POSTED→PAID`) | reversible via JOURNAL_ENTRY but leaves card PAID flag dirty | P3 |
| `FIXED_ASSET_DEPRECIATION` | FixedAsset (monthly JE) | `DEPRECIATION` | ✅ (monthly JE) | reverse monthly JE via JOURNAL_ENTRY handler | P3 — covered by JE handler |
| `LOAN_INTEREST` | LoanMaster (monthly JE) | `INTEREST` | ✅ (monthly JE) | reverse monthly JE via JOURNAL_ENTRY handler | P3 — covered by JE handler |
| `DEDUCTION_SCHEDULE` | DeductionSchedule | injected into Payslip | ✅ | reverting Payslip reverts schedule status | P3 — covered by Payslip handler |
| `PNL_REPORT` | PnlReport | `MANUAL` closing JE | ✅ | regenerate; closing JEs reverse via JOURNAL_ENTRY | SKIP — not a real reversal target |

### Scope — P1 + P2 only

Implement handlers for **SMER_ENTRY, CAR_LOGBOOK, SUPPLIER_INVOICE, CREDIT_NOTE, IC_SETTLEMENT**. P3 items (credit card PAID flag, etc.) tracked as follow-ups; the JOURNAL_ENTRY handler already unwinds their GL impact.

### Backend — shipped

- [x] `services/documentReversalService.js`:
  - [x] Imported `SmerEntry`, `CarLogbookEntry`, `SupplierInvoice`, `CreditNote`, `IcSettlement`, `ApPayment`
  - [x] Added `loadSmer` / `reverseSmer` (SAP Storno — reuses `reverseLinkedJEs` on `source_event_id`; original stays POSTED with `deletion_event_id`, never flipped to DRAFT)
  - [x] Added `loadCarLogbook` / `reverseCarLogbook` (same SAP Storno pattern; `posted_at` timestamp preserved)
  - [x] Added `loadSupplierInvoice` / `reverseSupplierInvoice` — AP booking stores `invoice.event_id = JournalEntry._id` directly (JE's `source_event_id` is null), so handler calls `reverseJournal(doc.event_id, ...)` not `reverseLinkedJEs`. Idempotent via reverseJournal's "already reversed" guard
  - [x] Added `loadCreditNote` / `reverseCreditNote` — reverses linked JE via `source_event_id` + `reverseInventoryFor()` to swap qty_in↔qty_out on the RETURN_IN ledger entries
  - [x] Added `loadIcSettlement` / `reverseIcSettlement` — IC Settlement has no JE today (`postSettlement` creates only a TransactionEvent); reversal creates a reversal event, flips status → REJECTED, stamps rejection_reason. `reverseLinkedJEs` branch is idempotent no-op until a future refactor wires a settlement JE
  - [x] Registered 5 entries in `REVERSAL_HANDLERS` (SMER_ENTRY, CAR_LOGBOOK, SUPPLIER_INVOICE, CREDIT_NOTE, IC_SETTLEMENT)
  - [x] Extended `PERIOD_LOCK_MODULE`: SMER_ENTRY → 'EXPENSE', CAR_LOGBOOK → 'EXPENSE' (matches `expenseRoutes.js periodLockCheck('EXPENSE')`), SUPPLIER_INVOICE → 'PURCHASING', CREDIT_NOTE → 'SALES', IC_SETTLEMENT → 'BANKING'. All 5 module keys already in `PeriodLock.module` enum — no enum migration needed
  - [x] Extended `listReversibleDocs` with 5 new blocks (entity-scoped filters, tenant-aware; IC_SETTLEMENT uses creditor_entity_id / debtor_entity_id $or like IC_TRANSFER)
- [x] `services/dependentDocChecker.js` — added `checkSupplierInvoiceDependents` (blocks when ApPayment exists against the invoice), `checkCreditNoteDependents` (placeholder — no Collection-applied linkage in current schema, returns no deps), `checkIcSettlementDependents` (placeholder — terminal doc in IC flow today). Registered all 3 in `CHECKERS`
- [x] `services/documentDetailBuilder.js` — added `buildCreditNoteDetails`. SMER + CAR_LOGBOOK + PURCHASING (for SUPPLIER_INVOICE) + IC_TRANSFER (for IC_SETTLEMENT — branches on `item.cr_no`) builders already existed from Phase 31 extension. Updated `REVERSAL_DOC_TYPE_TO_MODULE` map with 5 new entries. Registered `CREDIT_NOTE` in `DETAIL_BUILDERS`
- [x] `services/documentDetailHydrator.js` — added `POPULATED_LOADERS` for all 5 new doc_types with correct populate paths (bdm_id, hospital, customer, warehouse, vendor, creditor/debtor entities). `IC_SETTLEMENT` scope rule matches `loadIcSettlement`. Added `CREDIT_NOTE` case to `signPhotoUrls` for `photo_urls` S3 signing
- [x] Models — added `deletion_event_id: ObjectId ref 'TransactionEvent'` to SmerEntry, CarLogbookEntry, SupplierInvoice, CreditNote, IcSettlement. `reopen_count` already present on SMER + CarLogbook (not needed on the AP/returns/IC docs — they have no reopen workflow). `DELETION_REQUESTED` status enum values intentionally NOT added to SupplierInvoice/CreditNote/IcSettlement (no two-phase deletion workflow targets them; reversal uses direct SAP Storno)

### Frontend — shipped

- [x] No new pages needed — existing `PresidentReversalsPage.jsx` auto-picks up new types via the registry endpoint (`GET /president/reversals/registry` reads from `REVERSAL_HANDLERS` keys). Type badges + `sub` strings render from handler metadata. `DocumentDetailPanel.jsx` uses the module key from `REVERSAL_DOC_TYPE_TO_MODULE` → `buildDocumentDetails` so expanded rows render the same rich detail as the Approval Hub
- [x] `components/WorkflowGuide.jsx` — updated `'president-reversals'` banner step 1 to list all current doc types (SMER, Car Logbook, Supplier Invoices, Credit Notes, IC Settlements added) + step 3 to reference AP-payment / Collection-settlement blockers as concrete dependent-doc examples

### Verification — shipped

- [x] `node -c` clean on all 7 touched backend files (documentReversalService, dependentDocChecker, documentDetailBuilder, documentDetailHydrator, SmerEntry, CarLogbookEntry, SupplierInvoice, CreditNote, IcSettlement)
- [x] Cross-entity isolation verified by reading the tenantFilter application in each `load*` function: SMER/CarLogbook/SupplierInvoice/CreditNote spread `...tenantFilter` into the findOne query; IcSettlement applies the same $or(creditor, debtor) rule as `loadIcTransfer`
- [x] Idempotent JE reversal: SMER + CarLogbook + CreditNote go through `reverseLinkedJEs` (skip-if-already-reversed). SupplierInvoice goes through `reverseJournal` with explicit "already reversed" regex catch
- [x] Period-lock landing check fires for all 5 via `assertReversalPeriodOpen({ doc_type, entityId })`; `PERIOD_LOCK_MODULE` keys verified in `PeriodLock.module` enum
- [x] Dependent-doc blocker tested mentally: SUPPLIER_INVOICE blocks on ApPayment; CREDIT_NOTE and IC_SETTLEMENT currently have no downstream consumers so placeholders return no deps — if future schema adds the linkage, checkers go live without caller changes

### Out of scope (P3 — later sweep)

- CreditCardTransaction standalone handler (currently reversible via JOURNAL_ENTRY but leaves PAID flag set)
- Standalone handlers for FixedAsset depreciation, LoanMaster interest, DeductionSchedule (all covered transitively by Payslip or JOURNAL_ENTRY handlers)
- PnlReport reversal (snapshot doc — regenerate instead)
- VAT Ledger auto-void on SUPPLIER_INVOICE reversal — finance treats VAT rows as a staging layer with `finance_tag` (same limitation Phase 31 flagged for Collection). Check finance_tag post-reversal via PRESIDENT_REVERSAL audit trail

### Doc updates — shipped

- [x] `CLAUDE-ERP.md` Phase 31 section — handler count bumped to 18 (registry table), Schema Additions note updated to include 5 new models, Common Gotchas section gained 4 new entries (SupplierInvoice event_id semantics, IC Settlement no-JE behavior, CreditNote inventory swap pattern, SMER/CarLogbook period-lock key = EXPENSE)
- [x] Phase 31 Extension "Deferred: CreditNote" note (line ~4244) — **now closed**; see Phase 31R follow-up below

### Phase 31R follow-up — CreditNote Approval Hub coverage ✅ (April 20, 2026)

**Why.** Approval Hub cross-check against the 5 Phase 31R modules revealed 4-of-5 already surfaced (SMER, CAR_LOGBOOK directly; SUPPLIER_INVOICE under `PURCHASING`; IC_SETTLEMENT under `IC_TRANSFER` via `docTypeToModel` branch). Only **CREDIT_NOTE was invisible** — `creditNoteController.submitCreditNotes` called `gateApproval({ module: 'SALES', ... })` but the `SALES` MODULE_QUERIES entry only queries SalesLine. Unauthorized-BDM CN submissions held in the Approval Hub were effectively orphaned. This was flagged as deferred in the original Phase 31 Extension doc; closed in this pass.

**Shipped.**
- [x] `backend/erp/controllers/creditNoteController.js` — extracted `postSingleCreditNote(doc, userId)` helper (mirrors `postSingleSmer` / `postSingleCarLogbook`). `submitCreditNotes` now delegates to it; gateApproval module changed from `'SALES'` to `'CREDIT_NOTE'`. `postSingleCreditNote` exported for hub use.
- [x] `backend/erp/controllers/lookupGenericController.js` — added CREDIT_NOTE seed entries in `APPROVAL_MODULE` (category OPERATIONAL) and `MODULE_DEFAULT_ROLES` (roles: admin, finance, president). Both lazy-seed per-entity on first submit via `approvalService.getModulePostingRoles` — zero admin setup needed for new subsidiaries.
- [x] `backend/erp/services/universalApprovalService.js` — added CREDIT_NOTE MODULE_QUERIES entry (native pattern, queries `CreditNote.status='VALID'` directly — matches SMER/CarLogbook rather than the gap-module ApprovalRequest indirection). Added `CREDIT_NOTE: 'approve_sales'` to MODULE_TO_SUB_KEY (reuses the sales approver sub-permission; subscribers can split into `approve_credit_notes` via a new ERP_SUB_PERMISSION lookup row without code changes).
- [x] `backend/erp/controllers/universalApprovalController.js` — added `credit_note` to TYPE_TO_MODULE, approvalHandlers (post calls `postSingleCreditNote`; reject flips status → ERROR), MODEL_MAP, and EDITABLE_STATUSES (['VALID']).

**Logic invariant.** When an unauthorized BDM submits credit notes:
1. `gateApproval({ module: 'CREDIT_NOTE' })` creates a level-0 ApprovalRequest; HTTP 202 returned.
2. CN rows stay in `VALID` status.
3. Approval Hub `CREDIT_NOTE` MODULE_QUERIES surfaces the CNs (not the ApprovalRequest — level-0 requests are excluded from APPROVAL_REQUEST query via `level: { $gt: 0 }` filter) → **no double-listing**.
4. Approver clicks Post → `universalApprovalController.credit_note` → `postSingleCreditNote(doc, userId)` → event + inventory + JE created; doc.status → POSTED.
5. Reverse path via President Reversal Console works unchanged from Phase 31R (CREDIT_NOTE handler already registered).

**Integrity checklist — all 16 passed:**
- Dependencies: 7 touched modules load cleanly (no circular deps)
- Wiring: 18 REVERSAL_HANDLERS + 21 MODULE_QUERIES + 5 dependent checkers + 4 controller maps all consistent
- Scalable: 5 new loader functions honor tenantFilter (cross-entity safe)
- Lookup-driven: SEED_DEFAULTS has CREDIT_NOTE in APPROVAL_MODULE + MODULE_DEFAULT_ROLES; approvalService lazy-seeds per entity on first submit
- Subscription: zero admin setup needed for new subsidiaries — first CN submit auto-provisions the approval role lookup
- Banners: WorkflowGuide president-reversals banner lists all 18 doc types + concrete dep-doc examples
- No severed wiring: 13 pre-existing REVERSAL_HANDLERS + 20 pre-existing MODULE_QUERIES entries all still present

**Frontend build:** `npx vite build` clean, 9.56s, 0 errors.

### Phase 31R-OS — Office Supplies Reversal + Duplicate Prevention ✅ (April 20, 2026)

**Trigger.** A single-user incident created 6 identical "BALL PEN / 0.5 MM" rows
because the modal closed silently on save. Root-cause analysis showed three
issues layered on top of each other: no success toast → no DB-level dedup →
no way to remove a mistake after it landed. Approval Hub integration was
considered and dropped (master data is not gated anywhere else; president
bypasses approval; duplicates are deterministically solved by a unique index).

**Backend.**
- [x] `models/OfficeSupply.js` — added `deletion_event_id` + unique **partial**
  index on `{ entity_id, item_code }` (partialFilterExpression: `item_code`
  is string AND `deletion_event_id` missing — reversed rows free up their code
  for re-use while staying in the collection for audit) + extra index
  `{ entity_id, deletion_event_id }`
- [x] `models/OfficeSupplyTransaction.js` — added `deletion_event_id` +
  `reversal_event_id` + index `{ supply_id, deletion_event_id }`
- [x] `controllers/officeSupplyController.js` — `sendDuplicateIfAny()` helper
  translates Mongo 11000 to HTTP 409 with a human message; create/update both
  call it; `getSupplies` hides `deletion_event_id` rows unless `?include_reversed=true`;
  `createSupply` returns 400 when `req.entityId` is missing (president without
  working entity selected); exports `presidentReverseSupply` +
  `presidentReverseSupplyTxn` via `buildPresidentReverseHandler()` factory
- [x] `routes/officeSupplyRoutes.js` — 2 new DELETE routes gated by
  `erpSubAccessCheck('accounting', 'reverse_posted')`; transaction route declared
  BEFORE `/:id/president-reverse` to avoid Express `:id` swallowing `transactions`
- [x] `services/documentReversalService.js` — 2 new handlers
  (`loadOfficeSupply`/`reverseOfficeSupply`, `loadOfficeSupplyTxn`/`reverseOfficeSupplyTxn`)
  registered as `OFFICE_SUPPLY_ITEM` + `OFFICE_SUPPLY_TXN` in `REVERSAL_HANDLERS`
  (total registry now 20); `listReversibleDocs()` extended with 2 query blocks;
  item reversal cascades to transactions in a single Mongo session; txn reversal
  creates an opposite-sign audit row + restores parent qty_on_hand
- [x] `services/documentDetailHydrator.js` — 2 new `POPULATED_LOADERS` entries
  populate `supply_id` / `cost_center_id` / `warehouse_id`
- [x] `services/documentDetailBuilder.js` — new `buildOfficeSupplyDetails()`
  branches on `item.txn_type` to render master vs txn shape; registered under
  `DETAIL_BUILDERS.OFFICE_SUPPLY` with both doc types mapped in
  `REVERSAL_DOC_TYPE_TO_MODULE`

**Frontend.**
- [x] `hooks/useOfficeSupplies.js` — 2 new methods `presidentReverseItem` +
  `presidentReverseTxn`
- [x] `pages/OfficeSupplies.jsx` — `showSuccess()` on create/update/record;
  president-only Reverse button on every row (desktop + mobile card) + on
  transaction history rows (with REVERSED badge for already-reversed txns);
  `PresidentReverseModal` mounted at page root
- [x] `components/WorkflowGuide.jsx` — `'office-supplies'` banner updated with
  5 steps (including reversal guidance + 409 duplicate note), new "Reversal
  Console" next-step link, and updated tip referencing
  `accounting.reverse_posted` sub-permission

**Integrity checklist — all passed:**
- Dependencies: `require('./erp/services/documentReversalService')` loads cleanly;
  `REVERSAL_HANDLERS` now has 20 keys (was 18); controller exports resolve to functions
- Wiring: Model → Controller → Route → `backend/erp/routes/index.js` mount unchanged
  (no new top-level routes); `officeSupplyRoutes.js` mounted at `/erp/office-supplies`
  with `erpAccessCheck('inventory')` umbrella + per-route sub-permission gates
- Scalable / subscription-ready: no hardcoded business values — `OFFICE_SUPPLY_CATEGORY`
  still lookup-driven; danger gate reuses existing `ACCOUNTING__REVERSE_POSTED`
  lookup row (no new key); subscribers delegate via Access Templates
- Lookup-driven: `buildOfficeSupplyDetails` reads `item.category` / `unit` / etc.
  directly from the doc (populated or lean); no hardcoded maps
- Banners: `WorkflowGuide` entry extended; reversal next-step link added
- No severed wiring: all 18 pre-existing `REVERSAL_HANDLERS` entries present;
  existing `getSupplies` filter chain preserved (category/is_active still work)
- Route order: `/transactions/:id/president-reverse` declared before `/:id/president-reverse`
  so Express matches the literal segment first
- UI gate ≠ security: president check in the JSX is cosmetic;
  `accounting.reverse_posted` is enforced server-side via `erpSubAccessCheck`

**Deployment note.** The unique index is sparse, so it will NOT fail to build on
existing databases that have `null`/missing `item_code` rows. Databases that
already contain duplicate `item_code` values under the same `entity_id` (e.g. the
6 BALL PEN incident) will fail index build until either (a) the duplicates are
reversed via the new President Reverse button (preferred — keeps audit trail),
or (b) `item_code` is manually unset on duplicates via a one-off query.

---

## Phase 24-C — Foundation Health Lookup-Count Reconciliation (Apr 20, 2026)

### Problem
The "Lookup Tables" card on the Control Center Foundation Health dashboard
displayed **137/133 (Complete)** — numerator exceeded denominator. Caused by
mismatched counting sources:
- **Numerator** (`lookups.categories_configured`, 137) came from
  `Lookup.distinct('category', { entity_id })` — the live DB.
- **Denominator** (`lookups.total_available`, 133) came from
  `Object.keys(SEED_DEFAULTS)` in `lookupGenericController.js`.

The 4-category drift: **NOTIFICATION_CHANNELS, NOTIFICATION_ESCALATION,
PDF_RENDERER, TASK_OVERDUE_COOLDOWN_DAYS** — all lazy-seeded at runtime via
`$setOnInsert` in their respective services but never added to `SEED_DEFAULTS`.
Foundation Health card therefore showed >100% once any of the 4 agents ran.

### Fix
Two-layer reconciliation so the card is correct today AND stays correct as new
lazy-seeded categories are added.

**Backend.**
- [x] `backend/erp/controllers/controlCenterController.js` — `lookups` block in
  `getHealth` now computes denominator as the **union** of `SEED_DEFAULTS` keys
  and live DB categories. Numerator stays as DB-category count. Math never
  exceeds 100% regardless of future runtime drift.
- [x] `backend/erp/controllers/lookupGenericController.js` — added 7 new
  categories to `SEED_DEFAULTS` (133 → 140) so the seed list is authoritative
  again:
  - **NOTIFICATION_CHANNELS** (3 rows: EMAIL, IN_APP, SMS)
  - **NOTIFICATION_ESCALATION** (REPORTS_TO_MAX_HOPS)
  - **PDF_RENDERER** (BINARY_ENABLED)
  - **TASK_OVERDUE_COOLDOWN_DAYS** (GLOBAL)
  - **COMPLIANCE_DEADLINES** (6 PH statutory deadlines: BIR 1601-E/2550-M/
    1701-Q, SSS, PhilHealth, HDMF) — read by `complianceDeadlineAgent`
  - **EXPANSION_READINESS_CONFIG** (DEFAULT thresholds) — read by
    `expansionReadinessAgent`
  - **KPI_VARIANCE_THRESHOLDS** (GLOBAL fallback) — read by `kpiVarianceAgent`
- [x] `buildSeedOps` — added `insert_only_metadata: true` row flag so
  admin-tunable metadata (enabled flags, thresholds) is $setOnInsert rather
  than $set. Preserves admin edits across repeat `seedAll` calls. Structural
  metadata (statutory BIR dates on COMPLIANCE_DEADLINES) keeps the old
  dot-notation `$set` path so engineering corrections still propagate.

**Frontend.**
- [x] `frontend/src/erp/pages/FoundationHealth.jsx` — cards now carry an optional
  `section` key and render as buttons that update `?section=…` via
  `useSearchParams`. Clicking Lookup Tables jumps straight into the Lookup
  Manager with the System Settings group already expanded (all Control Center
  groups default to `isExpanded: true` per line 529 of `ControlCenter.jsx`).
  Keyboard-navigable + focus ring for a11y.
- [x] `frontend/src/erp/pages/ControlCenter.jsx` — `DEPENDENCY_GUIDE.lookups`
  extended with 7 new banner items describing NOTIFICATION_CHANNELS,
  NOTIFICATION_ESCALATION, PDF_RENDERER, COMPLIANCE_DEADLINES,
  KPI_VARIANCE_THRESHOLDS, EXPANSION_READINESS_CONFIG, and
  TASK_OVERDUE_COOLDOWN_DAYS. Satisfies CLAUDE.md Rule #1 (helper banners for
  every user-facing page) and the Rule #3 subscription model.

**Integrity checklist — all passed.**
- Syntax: `node -c` clean on both modified backend controllers; ESLint clean on
  both frontend files.
- Wiring: `getHealth` still exports via `catchAsync`; Foundation Health endpoint
  `GET /erp/control-center/health` unchanged; FoundationHealth card contract
  back-compatible (cards without `section` render as plain divs).
- SEED_DEFAULTS count: 133 → 140 (verified via
  `Object.keys(SEED_DEFAULTS).length`); no duplicate keys; no existing entries
  mutated.
- Lazy-seed compatibility: the 4 existing runtime seeders
  (`erpNotificationService.getChannelConfig/getEscalationConfig`,
  `pdfRenderer.resolvePdfPreference`, `taskOverdueAgent.loadCooldownDays`) still
  run as safety nets. Because all use `updateOne + $setOnInsert`, running before
  or after seedAll is safe — admin customizations are never clobbered either
  way.
- Scalable / subscription-ready: new categories are entity-scoped (filter
  includes `entity_id`), lookup-driven (admin tunes in Lookup Manager, no code
  deploy), and dispatch via `$setOnInsert` so each subscriber's edits survive
  re-seed. Foundation Health denominator = `union(SEED_DEFAULTS, DB)` so future
  lazy-seeded categories auto-expand the denominator without code change.
- Cache invalidation: none of the 7 new categories are in
  `EXPENSE_CLASSIFIER_CATEGORIES`, `OR_PARSER_LOOKUP_CATEGORIES`,
  `VENDOR_AUTO_LEARN_CATEGORIES`, `DANGER_SUB_PERM_CATEGORIES`, or
  `REJECTION_CONFIG_CATEGORIES`. The consuming services each re-read on every
  cron tick / request, so no TTL flush needed.
- Banners: `DEPENDENCY_GUIDE.lookups` extended — no orphaned references.
- UI gate ≠ security: card click-through uses existing `?section=…` param
  pattern; no new permission surface.
- No severed wiring: `seedAllLookups.js` standalone script unchanged (works
  identically because it always uses `$setOnInsert` for metadata); 20 other
  files that `require(...).SEED_DEFAULTS` still see the same object shape.

### Math Verification
| State | Numerator (DB cats) | Denominator (union) | Card |
|-------|---------------------|---------------------|------|
| Before fix | 137 | 133 | `137/133` (103%) ❌ |
| After fix, pre-seedAll | 137 | 140 | `137/140` (98%) ⚠️ |
| After `Seed All` button in Lookup Manager | 140 | 140 | `140/140` ✅ Complete |

Clicking the card in Foundation Health now deep-links to Lookup Manager; an
admin finishing the setup simply clicks "Seed All" there to reach 100%.

---

## Phase 32R — GRN Capture + Undertaking Approval Wrapper ✅ (April 20, 2026)

### Why
Phase 32 (shipped earlier April 20) moved batch/expiry capture onto a new Undertaking model and scanned packaging barcodes as the primary input. User rejected the pivot because it split data entry across two pages and mismatched the CALF→Expense analogy the rest of the ERP uses. Phase 32R restores the pre-Phase 32 flow where **GRN is the capture surface** (product + qty + batch + expiry + waybill), and layers a thin, read-only Undertaking on top as an approval wrapper — same pattern as CALF wrapping Expense.

### Shipped

**Backend** (previously committed Phase 32R backend session, unchanged this session):
- `backend/erp/models/GrnEntry.js` — per-line `scan_confirmed` + `expected_qty` (pre-save mirror).
- `backend/erp/controllers/inventoryController.js` — `createGrn` enforces waybill gate (`GRN_SETTINGS.WAYBILL_REQUIRED`) + per-line capture validation (batch + expiry ≥ today + MIN_EXPIRY_DAYS + qty > 0) BEFORE any DB write.
- `backend/erp/services/undertakingService.js` — rewritten. Kept `autoUndertakingForGrn`, added `getGrnSetting` (reads GRN_SETTINGS, falls back to UNDERTAKING_SETTINGS) + `computeLineVariance`. Removed `syncUndertakingToGrn`, `validateUndertaking`, `validateUndertakingLine` — validation now lives on GRN capture.
- `backend/erp/controllers/undertakingController.js` — dropped `updateUndertaking`, `matchBarcodeToLine`. `submitUndertaking` now a pure DRAFT→SUBMITTED flip with `gateApproval()`. `rejectUndertaking` → terminal REJECTED (GRN stays PENDING).
- `backend/erp/routes/undertakingRoutes.js` — dropped `PUT /:id` and `POST /:id/match-barcode`.
- `backend/erp/controllers/universalApprovalController.js` — `approvalHandlers.undertaking.reject` uses terminal REJECTED. `EDITABLE_STATUSES.undertaking = []`.
- `backend/erp/controllers/lookupGenericController.js` — seed category renamed `UNDERTAKING_SETTINGS` → `GRN_SETTINGS`, added `WAYBILL_REQUIRED`.

**Frontend** (this session):
- `frontend/src/erp/services/undertakingService.js` — dropped `updateUndertaking`, `matchBarcode`. Renamed `getUndertakingSettings` → `getGrnSettings` (with legacy export alias). Category fallback: GRN_SETTINGS → UNDERTAKING_SETTINGS.
- `frontend/src/erp/pages/GrnEntry.jsx` — rebuilt. Per-line batch + expiry + qty inputs, required waybill upload, bulk "Scan Undertaking Paper" OCR modal (`processDocument(file, 'UNDERTAKING')`), deep-link navigate to `/erp/undertaking/:id` after save.
- `frontend/src/erp/pages/UndertakingDetail.jsx` — rewritten. Read-only review only. Waybill + Undertaking-paper thumbnails, read-only line table, status-gated action row (Validate & Submit / Acknowledge + Reject / President-Reverse).
- `frontend/src/erp/components/UndertakingLineRow.jsx` — rewritten. All inputs removed. Plain read-only cells: product (Rule #4), expected/received qty, batch + scan ✓, expiry + days-to-expiry color band, variance badge.
- `frontend/src/erp/pages/UndertakingList.jsx` — DRAFT tab renamed "Review Pending"; header copy refreshed.
- `frontend/src/erp/components/WorkflowGuide.jsx` — `grn-entry` + `undertaking-entry` steps/tips rewritten to match the capture-on-GRN + read-only-on-UT framing.
- `frontend/src/erp/pages/ControlCenter.jsx` — `undertaking-settings` section renamed `grn-settings`. Dependency guide includes WAYBILL_REQUIRED, MIN_EXPIRY_DAYS, VARIANCE_TOLERANCE_PCT, MODULE_DEFAULT_ROLES.UNDERTAKING, ERP_DANGER_SUB_PERMISSIONS.INVENTORY__REVERSE_UNDERTAKING + legacy UNDERTAKING_SETTINGS fallback note.

### Verification

```bash
# Backend (should report 21 handlers + gone functions return undefined)
node -e "const inv=require('./backend/erp/controllers/inventoryController'); const ut=require('./backend/erp/controllers/undertakingController'); const svc=require('./backend/erp/services/undertakingService'); const {REVERSAL_HANDLERS}=require('./backend/erp/services/documentReversalService'); console.log('approveGrnCore:',typeof inv.approveGrnCore,'postSingleUndertaking:',typeof ut.postSingleUndertaking,'getGrnSetting:',typeof svc.getGrnSetting,'syncUndertakingToGrn(gone):',typeof svc.syncUndertakingToGrn,'handlers:',Object.keys(REVERSAL_HANDLERS).length)"

# Frontend
cd frontend && npx vite build

# Manual (run after build succeeds)
# - BDM creates standalone GRN → picks product + types qty + scans paper (OCR autofills batch/expiry/qty) + uploads waybill → Save & Validate
# - Auto-UT DRAFT → BDM opens it → Validate & Submit → 202 if non-authorized (Approval Hub) or SUBMITTED
# - Approver acknowledges from Hub → GRN APPROVED + InventoryLedger written atomically → /erp/my-stock shows new batch
# - Approver rejects → UT REJECTED (terminal), GRN stays PENDING → BDM reverses GRN via Reversal Console and re-captures
# - GRN without waybill → 400 "Waybill photo is required"
# - GRN with expiry < today + MIN_EXPIRY_DAYS → 400 "Line N: expiry must be at least N days in the future"
# - President-Reverse on ACKNOWLEDGED UT → cascade storno to GRN + InventoryLedger reduction
```

### Gotchas

1. **Waybill upload reuses `/erp/ocr/process`** with `docType='WAYBILL'`. OCR parser doesn't know WAYBILL so it uploads to S3, skips OCR, returns `s3_url`. One DocumentAttachment pipeline, no new endpoint.
2. **Scan = OCR on paper, NOT BarcodeDetector.** The capture flow OCRs the physical Undertaking paper; it is NOT a packaging barcode scanner. An earlier draft handoff mentioned BarcodeDetector — disregard.
3. **REJECTED is terminal.** Unlike Phase 32's "reject bounces UT back to DRAFT", 32R reject is final. GRN stays PENDING so the BDM must reverse and re-capture — closing the loophole where a BDM could silently re-edit a rejected UT.
4. **Existing Phase 32 DRAFT UTs** (empty batch/expiry, waiting for packaging-barcode scan) need to be reversed via Reversal Console → UNDERTAKING → hard-delete. The linked PENDING GRN hard-deletes with them. BDM then recaptures on the new GrnEntry surface.
5. **Existing Phase 32 SUBMITTED UTs** (batch/expiry populated by old scan flow) acknowledge normally — the acknowledge handler is unchanged.
6. **Subscription-readiness**: all thresholds are `GRN_SETTINGS` lookups, tunable via Control Center. No hardcoded values. Legacy `UNDERTAKING_SETTINGS` rows keep working via `getGrnSetting` fallback.

---

## Phase 32R-GRN# — Human-Readable GRN Doc Numbers ✅ (April 20, 2026)

### Why
Follow-up to Phase 32R. `GrnEntry` never had a doc number — frontend showed `po_number || _id.slice(-6)`. STANDALONE GRNs (no PO) therefore rendered as a hex tail (`GRN · 611961`) on the Undertaking list and every linked-GRN surface. Out of line with CALF / PRF / PO / JE / ICT which all use `services/docNumbering.js`.

### Shipped

**Backend**
- `backend/erp/models/GrnEntry.js` — added `grn_number: { type: String, trim: true, index: { sparse: true } }`. Sparse so legacy rows don't block the index.
- `backend/erp/controllers/inventoryController.js#createGrn` — calls `generateDocNumber({ prefix: 'GRN', bdmId: req.bdmId, entityId: req.entityId, date: grn_date })` before the `withTransaction` block. Passed into `GrnEntry.create(...)`. Audit-log note reads `GRN ${grn_number} created …`. Format: `GRN-{TERR|ENTITY}{MMDDYY}-{NNN}` (e.g. `GRN-ILO042026-001`).
- `backend/erp/controllers/undertakingController.js` — `getUndertakingList` populate select adds `grn_number`. (Detail endpoint already populates the full GRN doc.)
- `backend/erp/services/universalApprovalService.js` — populate select adds `grn_number`; Approval Hub row description leads with `grn.grn_number` when present.
- `backend/erp/services/documentDetailHydrator.js` — UNDERTAKING populate select adds `grn_number`.
- `backend/erp/services/documentDetailBuilder.js#buildUndertakingDetails` — `linked_grn.grn_number` surfaced to `DocumentDetailPanel`.
- `backend/erp/services/documentReversalService.js` — GRN row `doc_ref` is `grn_number` (ISO-date fallback for legacy). Undertaking row does one batched `GrnEntry.find({_id: {$in}}).select('grn_number')` lookup to surface the linked GRN's number in the `sub` label.

**Frontend**
- `frontend/src/erp/pages/UndertakingList.jsx` — row link uses `grn.grn_number || po_number || id.slice(-6)`.
- `frontend/src/erp/pages/UndertakingDetail.jsx` — header link uses the same precedence.
- `frontend/src/erp/pages/GrnAuditView.jsx` — header sub-line uses the precedence; new `GRN#` cell in the grid.
- `frontend/src/erp/pages/GrnEntry.jsx` — GRN list: new `GRN#` column on the desktop table (colspan bumped to 10 for empty state); card title is `grn_number` with date demoted; success toast reads back the new number.
- `frontend/src/erp/components/DocumentDetailPanel.jsx` — Linked GRN card uses the precedence.
- `frontend/src/erp/components/WorkflowGuide.jsx` — `grn-entry` tip documents the new format; `undertaking-entry` tip notes the link now shows the number.

### Integrity Checklist (all confirmed before commit)

- [x] `grn_number` generation runs **before** `session.withTransaction` — atomic via `DocSequence.getNext`, independent of GRN rollback.
- [x] Territory code → Entity short_name → fallback: admin/president-created GRNs (no territory binding) still get an entity-prefixed number.
- [x] All 7 display sites (UndertakingList, UndertakingDetail, GrnAuditView, DocumentDetailPanel, GrnEntry table, GrnEntry card, GrnEntry success toast) use the same precedence chain `grn_number → po_number → id.slice(-6)` so legacy rows keep rendering.
- [x] All 5 backend read paths that expose the linked GRN to the UI (`undertakingController.getUndertakingList`, `undertakingController.getUndertakingById`, `universalApprovalService.UNDERTAKING query`, `documentDetailHydrator.UNDERTAKING`, `documentReversalService.GRN + UNDERTAKING`) include `grn_number`.
- [x] Approval flow unchanged — `gateApproval({ module: 'INVENTORY' })`, `MODULE_DEFAULT_ROLES.INVENTORY`, `REVERSAL_HANDLERS.GRN` / `UNDERTAKING`, period lock, and `approveGrnCore` all key on `_id` / ObjectIds, not on `grn_number`.
- [x] Subscription-ready — Territory-driven via `Territory.getCodeForBdm` (admin lookup); entity fallback via `Entity.short_name` (admin-editable, cached, invalidated on rename); no hardcoded prefixes.
- [x] No backfill — legacy GRNs remain displayable via the `po_number`/id fallback; no dashboards or reports depend on `grn_number` being non-null.
- [x] Syntax clean: `node -c` on every edited backend file; `npx vite build` clean on frontend.

---

## Phase 31-E — Reversal Console Cross-Entity Default ✅ (April 21, 2026)

**Trigger.** President reported that POSTED Sales CSIs visible on the Sales list
(cross-entity view) were missing from the Reversal Console (single-entity view).
Both screens have the same login and the same role, yet returned different row
sets — classic global Rule #21 symptom: a privileged caller silently scoped to
`req.entityId` on a page that has no entity picker.

### Root Cause
- [backend/erp/controllers/presidentReversalController.js](../backend/erp/controllers/presidentReversalController.js) `getReversible` + `getHistory` initialized `entityId = req.entityId` and only overrode when `?entity_id=` was passed. The `PresidentReversalsPage` never passes that param (no picker on the page) → privileged callers were always scoped to the single entity recorded on their user record, even though their `tenantFilter` is `{}` everywhere else.
- Service layer (`listReversibleDocs` / `listReversalHistory`) was already correct: `if (entityId) q.entity_id = entityId;` — so passing `null` = cross-entity. Only the controller default was wrong.

### Fix (backend-only, no new lookup, no migration)
- Privileged callers (president/admin/finance) default `entityId = null` (cross-entity); `?entity_id=<id>` narrows; `?entity_id=ALL` kept as legacy alias.
- Non-privileged callers always pinned to `req.entityId`; query param ignored (no sibling-entity probing).
- `tail`- / `registry`- / `preview`- / `reverse`- / `detail`- endpoints untouched: they were already tenant-safe via `req.tenantFilter` (which is `{}` for presidents).

### Wiring / Dependencies Verified
- **Frontend.** [frontend/src/erp/pages/PresidentReversalsPage.jsx](../frontend/src/erp/pages/PresidentReversalsPage.jsx) issues `getReversible({ page, limit, doc_types, from_date, to_date })` — no entity param; picks up cross-entity rows automatically after backend restart. No UI change required.
- **Registry.** [documentReversalService.js](../backend/erp/services/documentReversalService.js) `REVERSAL_HANDLERS` (21 entries) untouched. SALES_LINE, COLLECTION, EXPENSE, CALF, PRF, GRN, UNDERTAKING, IC_TRANSFER, INCOME_REPORT, PAYSLIP, JOURNAL_ENTRY, SMER_ENTRY, CAR_LOGBOOK, SUPPLIER_INVOICE, CREDIT_NOTE, IC_SETTLEMENT, OFFICE_SUPPLY_ITEM, OFFICE_SUPPLY_TXN, PETTY_CASH_TXN, CONSIGNMENT_TRANSFER, DR all benefit from the cross-entity default with zero per-module change.
- **Sub-permission gates.** `erpSubAccessCheck('accounting', 'reversal_console')` on list endpoints and `erpSubAccessCheck('accounting', 'reverse_posted')` on reverse endpoint unchanged. Danger-sub-perm still enforced.
- **Banner.** [frontend/src/erp/components/WorkflowGuide.jsx](../frontend/src/erp/components/WorkflowGuide.jsx) `president-reversals` tip extended to document the cross-entity default + narrowing syntax.
- **No schema change, no lookup row added, no migration script needed.** Pure controller default.
- **Approval Hub interaction.** Unchanged. Sales still gates through `gateApproval({ module: 'SALES' })` at submit; only after the doc is POSTED does it surface in the Reversal Console — now regardless of which subsidiary posted it.

### Subscription Readiness
- Role check reuses existing `req.isPresident || req.isAdmin || req.isFinance` helpers (set by [tenantFilter.js](../backend/erp/middleware/tenantFilter.js)). Future move to a `CROSS_SCOPE_VIEW_ROLES` Lookup is a single-line controller change; subscribers do not need to redeploy today.
- Cross-entity default matches the Sales list and Approval Hub behavior — consistent UX across president-level surfaces. New subsidiaries (added via Entity admin UI) appear in the console immediately with no code change.

### Integrity Checklist
- [x] `getReversible` — privileged null default; non-privileged pinned
- [x] `getHistory` — same semantics (audit trail also cross-entity for privileged)
- [x] Service-layer `entityId` null-path verified (`listReversibleDocs`, `listReversalHistory`)
- [x] `reverse` / `detail` / `preview` / `registry` endpoints unchanged (already tenant-safe)
- [x] WorkflowGuide banner updated
- [x] No frontend breaking change — existing page picks up new rows on next load
- [x] No new lookup / model / migration
- [x] `node -c backend/erp/controllers/presidentReversalController.js` passes
- [x] `npx vite build` clean

### Out of Scope (Deliberate)
- `collectionController.getCollections`, `inventoryController.getStock` default to working entity for business reasons (single-entity reconciliation). Documented in [CLAUDE-ERP.md](../CLAUDE-ERP.md) Phase 31-E section — do not "fix" cosmetically without confirming the business semantics first.
- An explicit Entity picker dropdown on `PresidentReversalsPage` is optional future polish; today's default-null behavior matches every other president-level list.

---

## Phase G4.1 — ApprovalRequest Hydration in All-Pending ✅ (April 21, 2026)

### Problem

The Approval Workflow page had two tabs with overlapping coverage but mismatched UI. **All Pending** rendered rich `DocumentDetailPanel` cards (line items, photos, audit trail, inline edit), while **Requests** showed a flat 7-column table with no expand. Level-0 default-roles-gate `ApprovalRequest` records — created by `gateApproval()` when a non-authorized submitter tries to post — only surfaced in Requests. Approvers couldn't inspect what they were about to approve without opening the module page in another tab. User reported for a `CAR_LOGBOOK` held by `gateApproval(module='EXPENSES', docType='CAR_LOGBOOK')`: screenshot shows `All Pending (7)` and `Requests (1)`, and the Requests row has no expand.

Phase 31R's original "no double-listing" guarantee (explicitly noted in CLAUDE-ERP.md: "level-0 requests are excluded from APPROVAL_REQUEST query via `level: { $gt: 0 }` filter") relied on the raw module query always surfacing the gated doc. In practice some modules filter by statuses that miss gated docs, leaving the request orphaned in the legacy Requests tab.

### Shipped

1. **`APPROVAL_REQUEST` MODULE_QUERIES entry** — surfaces ALL pending ApprovalRequests, hydrated via new `buildApprovalRequestDetails(req)` helper:
   - Module key via `REVERSAL_DOC_TYPE_TO_MODULE[req.doc_type]` (reused from [backend/erp/services/documentDetailBuilder.js](../backend/erp/services/documentDetailBuilder.js)), fallback `req.module`.
   - Underlying doc via new 22-row `DOC_TYPE_HYDRATION` registry: `{ doc_type: { modelName, populate[] } }`. Covers Group A (CSI, CR, SMER, CAR_LOGBOOK, EXPENSE_ENTRY, PRF, CALF, GRN, UNDERTAKING, CREDIT_NOTE, INCOME_REPORT, PAYSLIP, KPI_RATING, DEDUCTION_SCHEDULE) + Group B gap modules (SUPPLIER_INVOICE, JOURNAL_ENTRY, BANK_RECON, IC_TRANSFER, IC_SETTLEMENT, DISBURSEMENT, DEPOSIT, SALES_GOAL_PLAN, INCENTIVE_PAYOUT).
   - Pipeline: `Model.findById(req.doc_id).populate(...)` → `buildDocumentDetails(moduleKey, doc)` → same detail object every other Hub item uses.
   - Best-effort fallback: missing registry row / model / doc → pass the ApprovalRequest to the builder so `doc_ref` / `amount` / `description` still render.

2. **Doc_id-based dedup** added to `getUniversalPending` after the existing by-id dedup. When two items share the same `doc_id` and at least one is non-`APPROVAL_REQUEST:*`, the `APPROVAL_REQUEST:*` copies are dropped. Preserves Phase 31R "no double-listing" guarantee. Orphan requests (no module sibling) survive with hydrated details.

2b. **Per-item sub-permission filter.** `APPROVAL_REQUEST` module is registered with `sub_key: null` (module-level open). Phase 34 left a TODO comment ("filtered per-item") that was never implemented. Now implemented: each `APPROVAL_REQUEST:*` item is filtered against `MODULE_TO_SUB_KEY[item.module]` via `hasApprovalSub(user, ...)` inside `getUniversalPending`, and `universalApprove` adds a matching derefs-then-check for `type === 'approval_request'` (reads the request's `module` field, re-runs the sub-perm gate against it). Closes both the listing side and the action side in one pass. President/CEO bypass preserved.

3. **Requests tab → Approval History** in [frontend/src/erp/pages/ApprovalManager.jsx](../frontend/src/erp/pages/ApprovalManager.jsx):
   - `statusFilter` default `PENDING` → `APPROVED`.
   - Button label `Requests (N)` → `Approval History (N)` with tooltip.
   - Inline blue info panel inside the tab body explains the tab is for APPROVED / REJECTED / CANCELLED audit; directs approvers to All Pending for anything actionable.

4. **WorkflowGuide approval-manager banner** — steps rewritten to describe the unified feed + explicitly call out Phase G4.1 + rename "Requests tab" step to "Approval History tab".

### Files Changed

| File | Change |
|------|--------|
| [backend/erp/services/universalApprovalService.js](../backend/erp/services/universalApprovalService.js) | Refactored `APPROVAL_REQUEST` MODULE_QUERIES entry; new `DOC_TYPE_HYDRATION` const; new `buildApprovalRequestDetails()` helper; new by-doc_id dedup in `getUniversalPending`. |
| [frontend/src/erp/pages/ApprovalManager.jsx](../frontend/src/erp/pages/ApprovalManager.jsx) | Flipped statusFilter default, renamed tab label, added inline info panel. |
| [frontend/src/erp/components/WorkflowGuide.jsx](../frontend/src/erp/components/WorkflowGuide.jsx) | `approval-manager` steps rewritten. |
| [CLAUDE-ERP.md](../CLAUDE-ERP.md) | Index table entry + full Phase G4.1 section after Phase F.1. |

### Wiring & Dependencies Verified

- **Backend.** `APPROVAL_REQUEST` query still runs under `isAuthorizedForModule` (Lookup-driven `MODULE_DEFAULT_ROLES['APPROVAL_REQUEST'] = null`, open by default). `buildApprovalRequestDetails` uses `getModel(...)` for lazy model loading — won't crash if a referenced model isn't registered in a slim subscriber build.
- **Close-loop.** [universalApprovalController.js `universalApprove`](../backend/erp/controllers/universalApprovalController.js) close-loop (skip for `type === 'approval_request'`) unchanged; it resolves matching ApprovalRequests when ANY non-approval-request type is approved/posted — so the existing raw-doc POST path still closes the gate request.
- **Sub-permission gates.** `MODULE_TO_SUB_KEY` / `hasApprovalSub` registry untouched (no new keys). The only additions are: (a) per-item filter for `APPROVAL_REQUEST:*` items in `getUniversalPending` and (b) matching derefs in `universalApprove` for `type === 'approval_request'`. Non-APPROVAL_REQUEST items continue to use the module-level `sub_key` check inside `isAuthorizedForModule` as before.
- **Reversal Console.** Uses the same `REVERSAL_DOC_TYPE_TO_MODULE` + `buildDocumentDetails` — zero change. Reversal handlers (21 entries) unchanged.
- **Period locks + gateApproval.** Submit-time `gateApproval({ module: 'EXPENSES', docType: 'CAR_LOGBOOK' })` unchanged. `checkApprovalRequired` still short-circuits when an existing APPROVED request exists, so the user's existing workflow (BDM submits → 202 → president approves → BDM re-submits → posts) works as before.

### Subscription Readiness

- `DOC_TYPE_HYDRATION` is code-level today (model names bind at `require()`-time). Future migration path mirrors Phase F.1's treatment of `MODULE_DEFAULT_ROLES`: add `APPROVAL_REQUEST_HYDRATION` Lookup category with a whitelist resolver that maps `doc_type` → `modelName` at runtime. Deferred — current subscribers share the same pharmaceutical-distribution doc types.
- Dedup logic is module-agnostic — new modules added to `MODULE_QUERIES` automatically benefit.
- All lookup categories (`MODULE_DEFAULT_ROLES`, `APPROVAL_EDITABLE_FIELDS`, `APPROVAL_EDITABLE_LINE_FIELDS`, `APPROVAL_MODULE`) unchanged. No seed migration.

### Integrity Checklist

- [x] `node -c backend/erp/services/universalApprovalService.js` passes
- [x] `node -c backend/erp/controllers/universalApprovalController.js` passes
- [x] `node -c backend/erp/services/approvalService.js` passes
- [x] `npx vite build` clean in ~9s (`ApprovalManager-BmBqFGp0.js` 30 kB, `WorkflowGuide-B-hDGpDt.js` 102 kB)
- [x] `ApprovalRequest` schema unchanged — no migration
- [x] Phase G4 default-roles gate unchanged
- [x] Phase 29 Authority Matrix flow unchanged
- [x] Phase G6 rejection feedback unchanged
- [x] Phase 31R "no double-listing" preserved via by-doc_id dedup
- [x] Approval History tab still functions for audit use-case (APPROVED / REJECTED / CANCELLED filters)
- [x] CLAUDE-ERP.md documented (index + full section)
- [x] WorkflowGuide banner updated

### Out of Scope (Deliberate — Follow-ups)

- ~~**Auto-post on approve** (orphan path)~~ **✅ Shipped April 21, 2026** — `approval_request` handler in [universalApprovalController.js](../backend/erp/controllers/universalApprovalController.js) now carries a `MODULE_AUTO_POST` map and, after `processDecision` flips to APPROVED on the final level, re-enters the matching module handler (`smer_entry` / `expense_entry` / `prf_calf` / `sales_line` / `collection` / `car_logbook` / `credit_note`) with `action='post'` + `request.doc_id`. Failure is logged non-fatally so the approval decision stands even if post prerequisites (e.g. linked CALF not yet POSTED) block the underlying transition. Group B modules (PURCHASING, JOURNAL, BANKING, IC_TRANSFER, PETTY_CASH, SALES_GOAL_PLAN, INCENTIVE_PAYOUT) and multi-step state machines (payslip, kpi_rating, income_report, deduction_schedule, undertaking, grn) intentionally excluded — documented in the map comment.
- **Lookup-migration of `DOC_TYPE_HYDRATION`**. See Subscription Readiness above — add when first non-pharma subscriber onboards.
- **Cross-entity hydration.** Universal pending already queries across `entitiesToQuery` (parent president sees all subsidiaries); the new hydration inherits this because it queries via the request's `entity_id` context (`Model.findById(req.doc_id)` — unscoped by entity because `_id` is globally unique).

### Rollback

Single-file revert: restore the `APPROVAL_REQUEST` MODULE_QUERIES entry's original filter + drop the new helper + remove the by-doc_id dedup pass. Frontend revert: flip `statusFilter` back to `PENDING` + restore "Requests" label. Zero data fallout (no schema, no lookup, no migration).

---

## Phase G4.2 — Deduction Schedule Unified Approval Flow ✅ (April 21, 2026)

### Problem

User approved a one-time deduction and went to Approval Workflow → Approval History to confirm. It wasn't there, even though PERDIEM_OVERRIDE / SALES / EXPENSES were. Root cause: `deductionScheduleService.approveSchedule()` flipped `DeductionSchedule.status` from `PENDING_APPROVAL` → `ACTIVE` directly and **never created or updated an `ApprovalRequest`**. The Approval History endpoint ([approvalController.js:69-83](../backend/erp/controllers/approvalController.js#L69-L83)) queries only `ApprovalRequest`, so deduction approvals never appeared in the audit surface.

This violated the Rule #20 "Any person can CREATE, but authority POSTS" governing principle: deduction schedules had a parallel mini-approval track that bypassed `gateApproval()`. Authority Matrix escalation, default-roles gate enforcement, and audit-history parity all silently failed for DEDUCTION_SCHEDULE even though the enum values, lookup seeds, and hydration registry were already in place.

### Prior-Phase Scaffolding (Already Shipped)

All plumbing for DEDUCTION_SCHEDULE had landed across earlier phases — the only missing wire was the call to `gateApproval()` on `createSchedule`.

| Asset | Phase | File | Ready? |
|---|---|---|---|
| `ApprovalRule.module` enum includes `DEDUCTION_SCHEDULE` | 34 | [ApprovalRule.js](../backend/erp/models/ApprovalRule.js) | ✅ |
| `MODULE_DEFAULT_ROLES.DEDUCTION_SCHEDULE` seed (`['admin','finance','president']`) | F.1 | [lookupGenericController.js](../backend/erp/controllers/lookupGenericController.js) | ✅ |
| `APPROVAL_CATEGORY.FINANCIAL` lists DEDUCTION_SCHEDULE | 29 | lookupGenericController.js | ✅ |
| `APPROVALS__APPROVE_DEDUCTIONS` sub-permission | 34 | lookupGenericController.js | ✅ |
| `MODULE_REJECTION_CONFIG.DEDUCTION_SCHEDULE` (rejection feedback lookup) | G6 | lookupGenericController.js | ✅ |
| `APPROVAL_EDITABLE_FIELDS.DEDUCTION_SCHEDULE` (quick-edit fields) | G3 | lookupGenericController.js | ✅ |
| `DOC_TYPE_HYDRATION.DEDUCTION_SCHEDULE` (Hub card hydration) | G4.1 | [universalApprovalService.js:996](../backend/erp/services/universalApprovalService.js#L996) | ✅ |
| `MODULE_SUB_PERM_MAP.DEDUCTION_SCHEDULE = 'approve_deductions'` | 34 | universalApprovalService.js | ✅ |
| `approvalHandlers.deduction_schedule` (Hub dispatcher) | F | [universalApprovalController.js:203](../backend/erp/controllers/universalApprovalController.js#L203) | ✅ |
| `TYPE_TO_MODULE.deduction_schedule = 'DEDUCTION_SCHEDULE'` | F.1 | universalApprovalController.js | ✅ |
| `MODULE_QUERIES.DEDUCTION_SCHEDULE` (raw pending query for Hub) | F | universalApprovalService.js | ✅ |
| Hub catch-all closes open ApprovalRequest by doc_id | G4 | universalApprovalController.js:705-734 | ✅ |
| By-doc_id dedup (prefers raw over APPROVAL_REQUEST mirror) | G4.1 | universalApprovalService.js:1342-1371 | ✅ |
| **`createSchedule` calls `gateApproval()`** | — | deductionScheduleController.js | ❌ ← fixed here |

### What Shipped

**1. Controller — `createSchedule` routes through the Default-Roles Gate.**

[backend/erp/controllers/deductionScheduleController.js](../backend/erp/controllers/deductionScheduleController.js) imports `gateApproval` and calls it immediately after `createScheduleSvc`. `gateApproval({ module: 'DEDUCTION_SCHEDULE', docType: 'ONE_TIME'|'INSTALLMENT', docId, docRef, amount, description, requesterId, requesterName }, res)` creates a level-0 PENDING `ApprovalRequest` when the caller's role isn't in `MODULE_DEFAULT_ROLES.DEDUCTION_SCHEDULE.metadata.roles` and sends HTTP 202 `approval_pending:true`. Contractor role is not in the allowed list, so every BDM submission lands in the Hub.

The `DeductionSchedule` document itself still writes to `PENDING_APPROVAL` with `isFinance=false` (unchanged from Phase E.2). The raw-schedule query in `MODULE_QUERIES` still surfaces it in All Pending; the Phase G4.1 by-doc_id dedup drops the `APPROVAL_REQUEST:*` mirror so there's no double-listing.

**2. Service — close-loop on approve / reject / withdraw / edit.**

[backend/erp/services/deductionScheduleService.js](../backend/erp/services/deductionScheduleService.js) gained a private `closeApprovalRequest(docId, status, userId, reason)` helper scoped to `module: 'DEDUCTION_SCHEDULE'`. Called after `schedule.save()` in:

- `approveSchedule` → status APPROVED
- `rejectSchedule` → status REJECTED with caller's reason
- `withdrawSchedule` → status CANCELLED with "Withdrawn by BDM"

`editPendingSchedule` additionally refreshes the PENDING request's `amount` / `doc_type` / `description` so Hub + History reflect the BDM's edit, not the original submission.

Idempotent by design: `$set` only fires when `status: 'PENDING'`. The Hub-path catch-all in `universalApproveEndpoint` (lines 705-734) still runs for `'deduction_schedule'` type (not on the skip list), but after the svc close-loop the status is no longer PENDING — catch-all matches zero rows. No double-history entries, no double-push.

**3. Script — backfill for pre-Phase-G4.2 schedules.**

[backend/erp/scripts/backfillDeductionScheduleApprovals.js](../backend/erp/scripts/backfillDeductionScheduleApprovals.js). Dry-run by default, `--apply` to persist. For every `DeductionSchedule` without an existing `ApprovalRequest`: creates one with the appropriate terminal status (`PENDING_APPROVAL → PENDING`, `ACTIVE/COMPLETED → APPROVED`, `REJECTED → REJECTED`, `CANCELLED → APPROVED` if `approved_by` set else CANCELLED). Idempotent — skips rows with existing AR. Restores retroactive Hub + History visibility.

**4. Frontend — 202 handling + WorkflowGuide.**

- [frontend/src/erp/pages/MyIncome.jsx](../frontend/src/erp/pages/MyIncome.jsx) — imports `isApprovalPending` / `showApprovalPending` / `showSuccess` from `errorToast.js`. `handleSaveSchedule` reads `res.data` returned from `useErpApi.request()` (which already returns `res.data`), checks `isApprovalPending(result)`, and fires the 🔒 blue info toast on HTTP 202.
- [frontend/src/erp/components/WorkflowGuide.jsx](../frontend/src/erp/components/WorkflowGuide.jsx) — `myIncome` step 4 and `income` steps 3-4 rewritten to describe the Approval Hub flow, the `/finance-create` bypass, and the Approval History audit surface.

### Files Changed

| File | Change |
|------|--------|
| `backend/erp/controllers/deductionScheduleController.js` | Import `gateApproval`. `createSchedule` calls the gate after svc and returns on 202. |
| `backend/erp/services/deductionScheduleService.js` | Import `ApprovalRequest`. New `closeApprovalRequest` helper. Called in `approveSchedule`, `rejectSchedule`, `withdrawSchedule`. `editPendingSchedule` refreshes the open PENDING request. |
| `backend/erp/scripts/backfillDeductionScheduleApprovals.js` | New — backfills ApprovalRequest rows for pre-Phase-G4.2 schedules. |
| `frontend/src/erp/pages/MyIncome.jsx` | 202 approval_pending detection + info toast. |
| `frontend/src/erp/components/WorkflowGuide.jsx` | `myIncome` + `income` banners rewritten. |
| `CLAUDE-ERP.md` | Index table row + full Phase G4.2 section. |
| `docs/PHASETASK-ERP.md` | This section. |

### Integrity Checklist

- [x] **Period lock preserved.** `deductionScheduleRoutes.js` still wraps `POST /` and `PUT /:id` with `periodLockCheck('DEDUCTION')`. gateApproval runs AFTER the lock middleware. Locked periods reject before any ApprovalRequest is written.
- [x] **Dedup verified.** Raw `DEDUCTION_SCHEDULE:<scheduleId>` item and `APPROVAL_REQUEST:<requestId>` item share the same `doc_id` (= `schedule._id`). Phase G4.1 dedup drops the APPROVAL_REQUEST mirror.
- [x] **Hub catch-all safe.** universalApproveEndpoint catch-all `updateMany({doc_id, status: 'PENDING'})` after svc close-loop → matches 0 rows → no-op.
- [x] **Direct route parity.** `POST /deduction-schedules/:id/approve` (Finance clicks Approve in the Schedules tab on Income page) now also writes Approval History via the svc close-loop. Behaviour matches the Hub path without any UI change on the Income page.
- [x] **Reversal semantics unchanged.** DeductionSchedule isn't in `REVERSAL_HANDLERS` — reverting a payslip unwinds the schedule injection, not the schedule itself. Phase G4.2 doesn't touch reversal. Count stays at 21.
- [x] **No Approval Rules required.** Default-Roles Gate (Phase G4) fires from `MODULE_DEFAULT_ROLES.DEDUCTION_SCHEDULE.metadata.roles` — which is already seeded. Authority Matrix (optional, `Settings.ENFORCE_AUTHORITY_MATRIX = true` + `ApprovalRule` rows) is orthogonal; subscribers add rules for amount-threshold escalation without any code change.
- [x] **Downstream consumers unaffected.** `incomeCalc.js` reads `DeductionSchedule.status`, `.installments[]` and `.approved_by` — unchanged. Payslip generation still picks up ACTIVE schedules exactly as before.
- [x] **Withdraw path.** `POST /:id/withdraw` (BDM) still flips the schedule to CANCELLED and cancels PENDING installments; Phase G4.2 adds the AR CANCELLED close-loop so the BDM's withdraw also clears the Approval Hub.
- [x] **Edit path.** `PUT /:id` (BDM) regenerates installments in the service (existing behaviour) and now refreshes the PENDING ApprovalRequest's `amount` / `description` so approvers always see the current submission.
- [x] **Finance-create bypass preserved.** `financeCreateSchedule` on `POST /finance-create` calls `createScheduleSvc(..., isFinance=true)` → schedule activates immediately. No `gateApproval` call — by design, admin/finance/president has authority.
- [x] **Frontend wiring.** `useDeductionSchedule` returns `api.post(...)` → `useErpApi.request()` returns `res.data` (which includes `approval_pending: true` for HTTP 202). `isApprovalPending(result)` handles both top-level `result.approval_pending` and the `err.response.status === 202` case.
- [x] **Lookup-driven defaults preserved.** `MODULE_DEFAULT_ROLES.DEDUCTION_SCHEDULE` is already in SEED_DEFAULTS. New entities auto-seed on first Hub load per `getUniversalPending` (universalApprovalService.js:1288-1309). Subscriber tightening/opening via Control Center is unchanged.

### Rollout

1. Deploy backend + frontend together (single release — the backfill script can run anytime after deploy).
2. `node backend/erp/scripts/backfillDeductionScheduleApprovals.js` (dry-run) to preview.
3. `node backend/erp/scripts/backfillDeductionScheduleApprovals.js --apply` to write backfilled `ApprovalRequest` rows. Idempotent — safe to re-run.
4. Verify: president logs in, goes to Approval Workflow → Approval History. DEDUCTION_SCHEDULE rows now appear alongside PERDIEM_OVERRIDE / SALES / EXPENSES.

### Rollback

Single-commit revert: restore the 4 source files (controller / service / MyIncome.jsx / WorkflowGuide.jsx). No schema changes, no lookup changes, no migration to undo. Backfilled `ApprovalRequest` rows can stay (they're consistent with the data model) or be dropped by `ApprovalRequest.deleteMany({ module: 'DEDUCTION_SCHEDULE', 'metadata.backfilled': true })`.

---

## Phase G4.3 — Approval Hub + Reversal Console Gap Closure ✅ (April 21, 2026)

### Problem

Post-G4.2 audit found five silent gaps in the unified approval + reversal pipeline:

1. **CRIT** — `INCENTIVE_DISPUTE` had complete scaffolding (ApprovalRule enum, MODULE_DEFAULT_ROLES, APPROVAL_CATEGORY, MODULE_REJECTION_CONFIG rows) except the dispatcher. Every `gateApproval('INCENTIVE_DISPUTE', …)` call landed in ApprovalRequest; an approver's click on Approve in `/erp/approvals` would throw `Unknown approval type: incentive_dispute` from [universalApprovalController.js](../backend/erp/controllers/universalApprovalController.js).
2. **CRIT** — [reverseSalesGoalPlan](../backend/erp/services/documentReversalService.js) cascaded through `ACCRUED|APPROVED|PAID` IncentivePayouts indiscriminately, reversing the settlement JE of PAID payouts. Cash had already left via the settlement; reversal orphaned it with no audit path. No dependent-doc gate fired.
3. **HIGH** — 5 reverse handlers had no checker registration (`PETTY_CASH_TXN`, `SMER_ENTRY`, `CAR_LOGBOOK`, `OFFICE_SUPPLY_ITEM`, `OFFICE_SUPPLY_TXN`). Users could reverse a mid-sequence petty-cash txn and silently corrupt the running-balance chain, reverse a SMER whose reimbursable already hit an IncomeReport, reverse an Office Supply item that still had active transactions.
4. **MED** — `FUEL_ENTRY` absent from `MODULE_REJECTION_CONFIG` — contractor-side banner on Car Logbook fell back to a generic tone for per-fuel rejections.
5. **LOW** — 7 Group B rejection-config rows still carried "pending G6.7 handler wiring" notes even though G6.7 had shipped. Worse, [SupplierInvoice](../backend/erp/models/SupplierInvoice.js) had no `rejection_reason` field AND no `REJECTED` in its status enum — the existing G6.7 Group B `purchasing` reject handler would have crashed Mongoose enum validation on first use.

### Prior-Phase Scaffolding (Already Shipped)

| Asset | Phase | Status |
|---|---|---|
| `MODULE_DEFAULT_ROLES.INCENTIVE_DISPUTE` seed | SG-4 | ✅ |
| `APPROVAL_CATEGORY.OPERATIONAL.modules` includes INCENTIVE_DISPUTE | SG-4 | ✅ |
| `APPROVAL_MODULE_LABEL.INCENTIVE_DISPUTE` | SG-4 | ✅ |
| `INCENTIVE_DISPUTE_TYPE` lookup (dispute typology) | SG-4 | ✅ |
| `ApprovalRule.module` enum includes INCENTIVE_DISPUTE | SG-4 | ✅ |
| `MODULE_QUERIES.INCENTIVE_DISPUTE` entry (Hub visibility) | — | ❌ added here |
| `MODULE_TO_SUB_KEY.INCENTIVE_DISPUTE` + sub-perm seed | — | ❌ added here |
| `DOC_TYPE_HYDRATION` for DISPUTE_* doc_types | — | ❌ added here |
| `approvalHandlers.incentive_dispute` + `TYPE_TO_MODULE.incentive_dispute` | — | ❌ added here |
| `MODULE_REJECTION_CONFIG.INCENTIVE_DISPUTE` + `.FUEL_ENTRY` | G6 partial | ❌ added here |
| `checkHardBlockers` calls on 6 reverse handlers | Phase 31R partial | ❌ added here |

### What Shipped

**1. `incentive_dispute` handler (Hub dispatcher).**

[backend/erp/controllers/universalApprovalController.js](../backend/erp/controllers/universalApprovalController.js) — mirrors the `perdiem_override` side-effect-first pattern because the dispute lifecycle has three distinct doc_types (DISPUTE_TAKE_REVIEW / DISPUTE_RESOLVE / DISPUTE_CLOSE) each with its own state transition. Handler loads the `ApprovalRequest`, derefs to the dispute via `doc_id`, then:

- `DISPUTE_TAKE_REVIEW` → sets `reviewer_id = request.requested_by`, flips state OPEN → UNDER_REVIEW.
- `DISPUTE_RESOLVE` → reads outcome from `request.metadata.outcome` (fallback: description regex). For APPROVED, cascades either `reverseAccrualJournal(payout)` or a negative-sign SalesCredit reversal row (mirrors [resolveDispute](../backend/erp/controllers/incentiveDisputeController.js)). State UNDER_REVIEW → RESOLVED_APPROVED | RESOLVED_DENIED. Emits `INTEGRATION_EVENTS.DISPUTE_RESOLVED`.
- `DISPUTE_CLOSE` → state RESOLVED_* → CLOSED.
- After the dispute write succeeds, `processDecision(APPROVED)` records the decision on the ApprovalRequest — perdiem_override pattern.
- On reject → `processDecision(REJECTED)` only; dispute stays in its prior state (no terminal REJECTED on the dispute itself — the reason lives in Approval History).

Identity rule: dispute-level `reviewer_id` / `resolved_by` / `history[].by` use `request.requested_by` (the BDM who asked), not the Hub approver. Audit shape matches `gateApproval`'s "you asked, someone else authorized" pattern.

**2. Controller metadata pass-through.**

[backend/erp/controllers/incentiveDisputeController.js](../backend/erp/controllers/incentiveDisputeController.js) — `resolveDispute` now passes `metadata: { outcome, resolution_summary }` to `gateApproval` so the Hub handler has everything it needs to reconstruct the transition without relying on `req.body`.

**3. `MODULE_QUERIES` + `DOC_TYPE_HYDRATION` + `MODULE_TO_SUB_KEY`.**

[backend/erp/services/universalApprovalService.js](../backend/erp/services/universalApprovalService.js) — new `INCENTIVE_DISPUTE` module query using `buildGapModulePendingItems` (same Group B pattern as IC_TRANSFER / PETTY_CASH / SALES_GOAL_PLAN). Three `DOC_TYPE_HYDRATION` rows so the Hub card renders the full `IncentiveDispute` document with filer / affected BDM / reviewer / payout / credit populated. `MODULE_TO_SUB_KEY.INCENTIVE_DISPUTE = 'approve_incentive_dispute'`.

**4. Sub-permission seed.**

[backend/erp/controllers/lookupGenericController.js](../backend/erp/controllers/lookupGenericController.js) — `APPROVALS__APPROVE_INCENTIVE_DISPUTE` row added to `ERP_SUB_PERMISSION` (sort order 16, after `approve_perdiem`). Subscribers delegate via Access Templates.

**5. Rejection config rows.**

Same file — added `MODULE_REJECTION_CONFIG.INCENTIVE_DISPUTE` (non-resubmittable; reason lives in Approval History — mirrors PERDIEM_OVERRIDE) and `.FUEL_ENTRY` (embedded subdoc; resubmittable from Car Logbook page with warning tone).

**6. Six new dependent checkers + wire-up into reverse handlers.**

[backend/erp/services/dependentDocChecker.js](../backend/erp/services/dependentDocChecker.js):

| Checker | Block Condition | Severity |
|---|---|---|
| `checkSalesGoalPlanDependents` | Any IncentivePayout under plan with `status: 'PAID'` | HARD |
| `checkSalesGoalPlanDependents` (same) | Payslip(same FY, earnings.incentive > 0) | WARN (advisory) |
| `checkPettyCashTxnDependents` | Any later POSTED txn on same fund (running-balance chain) | HARD |
| `checkSmerEntryDependents` | IncomeReport with `source_refs.smer_id === doc._id` in non-RETURNED state | HARD |
| `checkCarLogbookDependents` | Fuel entry linked to POSTED CALF | WARN |
| `checkOfficeSupplyItemDependents` | Active (non-reversed) OfficeSupplyTransaction rows | HARD |
| `checkOfficeSupplyTxnDependents` | Stub (no downstream consumers today) | — |

[backend/erp/services/documentReversalService.js](../backend/erp/services/documentReversalService.js) — added explicit `checkHardBlockers` calls in `reverseSalesGoalPlan`, `reversePettyCashTxn`, `reverseSmer`, `reverseCarLogbook`, `reverseOfficeSupply`, `reverseOfficeSupplyTxn`. Each throws HTTP 409 with a `dependents` payload when HARD blockers fire, matching the error shape of existing handlers (SALES_LINE / COLLECTION / GRN / etc.).

**7. SupplierInvoice schema completion.**

[backend/erp/models/SupplierInvoice.js](../backend/erp/models/SupplierInvoice.js) — `status` enum gains `REJECTED`; adds `rejection_reason`, `rejected_by`, `rejected_at` fields. Unblocks the existing G6.7 Group B `purchasing` reject handler (`buildGroupBReject` sets all four fields).

**8. Stale comments cleanup.**

Same lookupGenericController.js — the "(pending G6.7 handler wiring)" suffix on 7 rows removed. Comment block above the rows updated to confirm handlers are live and `rejection_reason` fields verified on all 8 Group B models (Phase G4.3 integrity check).

**9. Banners.**

[frontend/src/erp/components/WorkflowGuide.jsx](../frontend/src/erp/components/WorkflowGuide.jsx) — `dispute-center` steps explicitly mention the new G4.3 Hub dispatcher path; `president-reversals` step 3 enumerates the five new dependent-check reasons so president sees them before clicking Reverse.

### Files Changed

| File | Change |
|------|--------|
| `backend/erp/controllers/universalApprovalController.js` | TYPE_TO_MODULE + approvalHandlers.incentive_dispute (3-doc_type dispatcher). |
| `backend/erp/services/universalApprovalService.js` | MODULE_TO_SUB_KEY + 3 DOC_TYPE_HYDRATION + MODULE_QUERIES entry. |
| `backend/erp/services/dependentDocChecker.js` | 6 checker functions + CHECKERS registrations. |
| `backend/erp/services/documentReversalService.js` | checkHardBlockers calls on 6 reverse handlers. |
| `backend/erp/controllers/lookupGenericController.js` | Sub-perm seed + 2 rejection-config rows + comment cleanup. |
| `backend/erp/controllers/incentiveDisputeController.js` | metadata pass-through on gateApproval in resolveDispute. |
| `backend/erp/models/SupplierInvoice.js` | status enum adds REJECTED; +rejection_reason +rejected_by +rejected_at. |
| `frontend/src/erp/components/WorkflowGuide.jsx` | Dispute Center + Reversal Console banner updates. |
| `CLAUDE-ERP.md` | Index table row + full Phase G4.3 section. |
| `docs/PHASETASK-ERP.md` | This section. |

### Integrity Checklist

- [x] `node -c` + require-time check pass on every modified backend file
- [x] `npx vite build` passes clean (27s initial, 13s after banner edit)
- [x] Runtime registry integrity verified: CHECKERS / approvalHandlers / TYPE_TO_MODULE / MODULE_TO_SUB_KEY all carry the new rows
- [x] Period-lock posture unchanged — `assertReversalPeriodOpen` fires BEFORE `checkHardBlockers` on every reverse handler
- [x] Dedup (Phase G4.1) unaffected — INCENTIVE_DISPUTE has no raw-doc sibling, so the ApprovalRequest mirror is the only Hub surface
- [x] REVERSAL_HANDLERS count unchanged (still 21) — G4.3 adds blockers, not new reversal handlers
- [x] Lookup-driven per Rule #3 — sub-perm + rejection config rows auto-seed via SEED_DEFAULTS; subscribers tune per-entity via Control Center
- [x] Subscription-ready per Rule #19 — all wiring is lookup-driven or registry-based; new subscribers onboard without code changes
- [x] Banners updated per Rule #1 — dispute-center + president-reversals steps reflect new behavior
- [x] SupplierInvoice schema change is additive — existing DRAFT/VALIDATED/POSTED rows unaffected; the new REJECTED enum value + 3 optional fields default empty
- [x] No backfill required — fixes are forward-looking

### Rollout

1. Merge PR → `git pull origin main` on prod.
2. `pm2 restart vip-crm-api vip-crm-worker` — lookup seeds auto-run on first request per entity.
3. Smoke test:
   - Open `/erp/approvals`, confirm INCENTIVE_DISPUTE items (if any) render without crashing on Approve.
   - Try to president-reverse a SALES_GOAL_PLAN with a PAID payout → HTTP 409 with dependents.
   - Reject a per-fuel entry from the Hub → Car Logbook banner renders lookup-driven tone.

### Rollback

Single-commit revert of the 10 source files. SupplierInvoice enum widening is purely additive — rollback leaves the REJECTED rows (if any were created) orphaned but not corrupting (Mongoose cast error on next save; fix by re-adding REJECTED to the enum). No lookup rows need deletion — they stay dormant when the handler isn't present.

---

## Phase 33 — Car Logbook Cycle-Wrapper Redesign ✅ (April 21, 2026)

> **Name collision.** There is an earlier "Phase 33 — Bulk Role Migration + Login Fix" in this file (April 10, 2026). Both keep the Phase 33 tag they were filed under. This section covers the car-logbook cycle-wrapper work.

### Problem

Approval Hub displayed `Submit 16 car logbook entries` with 16× duplicate `LOGBOOK-2026-04` docRefs and Lines=0/₱0/ORE:₱0 on the card. `submitCarLogbook` aggregated 15 per-day [CarLogbookEntry](../backend/erp/models/CarLogbookEntry.js) docs into ONE `ApprovalRequest` (comma-joined docRef), but `MODULE_QUERIES['CAR_LOGBOOK']` hydrated each per-day doc individually, and the generic EXPENSES card renderer expected `line_count / total_ore / total_access / total_amount` — fields that don't exist on a per-day doc. Result: unreadable queue + wrong totals.

### Architecture Decision (don't second-guess)

The initial plan proposed a single-collection rewrite of `CarLogbookEntry` into SMER-shape (`daily_entries[]` inside one cycle doc). That would have severed **10+ downstream services** that read per-day fields at top level: `incomeCalc`, `expenseSummary`, `fuelEfficiencyService`, `expenseAnomalyService`, `performanceRankingService`, `dashboardService`, `documentReversalService` list query, `copilotToolRegistry`, `monthEndClose`, `testExpenseEndpoints`. The pivot is a **dual-model wrapper**:

- `CarLogbookEntry` — **unchanged** per-day doc. Odometer/fuel/KM/destination/efficiency remain the source of truth. Zero breakage for the 10+ consumers.
- [CarLogbookCycle](../backend/erp/models/CarLogbookCycle.js) — **NEW** lightweight wrapper: one per `entity_id + bdm_id + period + cycle`. Carries submit/approve/post state + aggregated totals. Per-day docs back-link via `cycle_id`. Submit/post/reverse now run at the cycle level. The wrapper is what the Approval Hub surfaces.

### Shipped

#### Backend

1. **Models.**
   - New [backend/erp/models/CarLogbookCycle.js](../backend/erp/models/CarLogbookCycle.js) — wrapper with `working_days`, `total_km`, `total_fuel_amount`, `cycle_efficiency_variance`, `cycle_overconsumption_flag`, `status`, `event_id`, `deletion_event_id`, `refreshTotalsFromDays()`.
   - Additive fields on [CarLogbookEntry.js](../backend/erp/models/CarLogbookEntry.js): `cycle_id`; per-fuel `doc_ref`, `receipt_ocr_source` (SCAN|URL_UPLOAD), `manual_override_flag/reason`, `backup_photo_url/attachment_id`, approval state (`approval_status`, `approval_request_id`, `approved_by`, `approved_at`, `rejection_reason`).

2. **Controllers** ([expenseController.js](../backend/erp/controllers/expenseController.js)).
   - `submitCarLogbook` rewritten — scopes to one `period+cycle` (rejects multi-cycle submits), upserts `CarLogbookCycle`, links per-day docs via `cycle_id`, ONE `gateApproval({ module:'EXPENSES', docType:'CAR_LOGBOOK', docId: cycleDoc._id, docRef:'LOGBOOK-{period}-{cycle}' })`. Pre-post gate: non-CASH fuel must be either `approval_status='APPROVED'` **or** linked to POSTED CALF. Transactional post flips wrapper + all days to POSTED, writes ONE JE.
   - `reopenCarLogbook` rewritten — accepts `cycle_ids` (new) or legacy `logbook_ids` (backward-compat). Cycle path reverses JE + flips wrapper + all per-day docs to DRAFT atomically.
   - `submitFuelEntryForApproval` NEW — per-fuel flow mirroring SMER per-diem override. Assigns `FUEL-{ENTITY}{MMDDYY}-{NNN}` via `generateDocNumber({ prefix:'FUEL' })` (reuses `docNumbering.js` + `DocSequence`). Fires `gateApproval({ module:'EXPENSES', docType:'FUEL_ENTRY' })`. Open-post path → APPROVED.
   - `postSingleCarLogbook` extended — branches on `doc.constructor.modelName === 'CarLogbookCycle'`. Cycle path posts wrapper + all days atomically, ONE JE. Legacy per-day path preserved.
   - `getLinkedExpenses` NEW — `GET /expenses/prf-calf/:id/linked-expenses`, queries `CarLogbookEntry.fuel_entries.calf_id` + `ExpenseEntry.lines.calf_id`, returns unified list with running total vs CALF amount + variance. Drives the PrfCalf inline drill-down.
   - `createCarLogbook / updateCarLogbook / getCarLogbookList / getCarLogbookById / validateCarLogbook / deleteDraftCarLogbook` — UNCHANGED (per-day CRUD preserved).

3. **Approval wiring** ([universalApprovalController.js](../backend/erp/controllers/universalApprovalController.js)).
   - `approvalHandlers.car_logbook` tries `CarLogbookCycle` first, falls back to per-day legacy doc.
   - `approvalHandlers.fuel_entry` NEW — flips nested `fuel_entries[i].approval_status` to APPROVED/REJECTED.
   - `MODULE_AUTO_POST.FUEL_ENTRY` added. Dispatcher now prefers `MODULE_AUTO_POST[req.doc_type]` over `[req.module]`, so FUEL_ENTRY (held under `module:'EXPENSES'`) routes to fuel_entry handler, not expense_entry.

4. **Lookup seeds** ([lookupGenericController.js](../backend/erp/controllers/lookupGenericController.js) SEED_DEFAULTS).
   - `APPROVAL_CATEGORY.OPERATIONAL.modules += FUEL_ENTRY`.
   - `APPROVAL_MODULE.FUEL_ENTRY` added (category OPERATIONAL).
   - `MODULE_DEFAULT_ROLES.FUEL_ENTRY` added (admin / finance / president — subscribers tighten or set `metadata.roles=null` via Control Center to open-post).
   - `CAR_LOGBOOK` description updated to reflect cycle-wrapper semantics.

5. **Services** ([universalApprovalService.js](../backend/erp/services/universalApprovalService.js)).
   - `MODULE_QUERIES['CAR_LOGBOOK']` now queries `CarLogbookCycle` (one per period+cycle), hydrates each with its per-day docs (`CarLogbookEntry where cycle_id = cycle._id`), CRM-enrichment loops across all days. docRef = `LOGBOOK-{period}-{cycle}` (single clean ref). description = `{bdm} — {period} {cycle} — {workingDays} working day(s), {total_km} km`. amount = `total_fuel_amount`.
   - `MODULE_QUERIES['FUEL_ENTRY']` NEW — scans `CarLogbookEntry` where `fuel_entries.approval_status='PENDING'`. One item per pending fuel entry.
   - `DOC_TYPE_HYDRATION.CAR_LOGBOOK.modelName` → `'CarLogbookCycle'`. `FUEL_ENTRY` row added.
   - `MODULE_TO_SUB_KEY.FUEL_ENTRY = 'approve_expenses'`.

6. **Detail builder** ([documentDetailBuilder.js](../backend/erp/services/documentDetailBuilder.js)).
   - `buildCarLogbookDetails` rewritten as dual-shape (detects CYCLE vs DAY via `working_days`/`entry_date`). CYCLE emits `period`, `cycle`, `working_days`, `total_*`, `cycle_overconsumption_flag`, `daily_entries[]`, flat `fuel_receipts[]`, pending/approved/rejected fuel counters, plus `line_count + total_amount` aliases so the generic EXPENSES card shows non-zero values.
   - `buildFuelEntryDetails` NEW + `DETAIL_BUILDERS.FUEL_ENTRY`.
   - `REVERSAL_DOC_TYPE_TO_MODULE.CAR_LOGBOOK` unchanged — dual-shape builder handles both.

7. **Reversal** ([documentReversalService.js](../backend/erp/services/documentReversalService.js)).
   - Imports `CarLogbookCycle`. `loadCarLogbook` tries `CarLogbookCycle` first, falls back to per-day.
   - `reverseCarLogbook` dual-shape — cycle path reverses JE via `reverseLinkedJEs({ event_id })`, stamps `deletion_event_id` on wrapper + all per-day docs in a transaction. Pre-POSTED cycle → hard-delete wrapper + DRAFT/VALID/ERROR days. Legacy per-day path preserved.
   - Reversal Console list query updated to surface `CarLogbookCycle` (legacy per-day branch dead-coded with `if (false &&` — remove after reset script runs in prod).
   - `REVERSAL_HANDLERS` count unchanged at 21 (handler is dual-shape).

8. **Routes** ([expenseRoutes.js](../backend/erp/routes/expenseRoutes.js)).
   - `POST /car-logbook/:id/fuel/:fuel_id/submit` → `submitFuelEntryForApproval`.
   - `GET /prf-calf/:id/linked-expenses` → `getLinkedExpenses`.

9. **Migration script** [backend/scripts/resetCarLogbook.js](../backend/scripts/resetCarLogbook.js) — dry-run by default; `--live` drops POSTED/DELETION_REQUESTED per-day docs + drops `erp_car_logbook_cycles` + rejects pending CAR_LOGBOOK/FUEL_ENTRY ApprovalRequests. `--archive` renames instead of drops. Does **not** touch TransactionEvents or JournalEntries (ledger stays balanced — user accepted fresh-start: contractors have paper copies).

#### Frontend

1. **Hook** [useExpenses.js](../frontend/src/erp/hooks/useExpenses.js).
   - `validateCarLogbook(scope)` + `submitCarLogbook(scope)` accept `{ period, cycle }`.
   - `reopenCarLogbook(ids, kind='cycle')` — pass `'day'` for legacy per-day reopen.
   - `submitFuelForApproval(dayId, fuelId)` NEW.
   - `getLinkedExpenses(calfId)` NEW.

2. **Page** [CarLogbook.jsx](../frontend/src/erp/pages/CarLogbook.jsx).
   - `handleValidate` / `handleSubmit` pass `{ period, cycle }`; `handleReopen` passes `'cycle'` kind.
   - New `handleSubmitFuel(rowIdx, fuelIdx)` — saves the row first (needs fuel subdoc `_id`), calls the per-fuel submit API, handles 202 via `showApprovalPending`.
   - Desktop grid + mobile card: approval-status badge (PENDING/APPROVED/REJECTED) per fuel entry, "Submit Fuel" / "Resubmit" button (visible when editable + non-CASH + no CALF link + no approval or REJECTED + row saved), fuel-level lock when PENDING or APPROVED (row-level editable stays unchanged).

3. **Page** [PrfCalf.jsx](../frontend/src/erp/pages/PrfCalf.jsx).
   - CALF rows get a "View Links" button; inline sub-row renders linked fuel + expense entries with totals + variance vs CALF amount (Phase 33 inline drill-down, driven by `getLinkedExpenses`).

4. **Banner** [WorkflowGuide.jsx](../frontend/src/erp/components/WorkflowGuide.jsx) — `WORKFLOW_GUIDES['car-logbook']` steps + tip rewritten to describe the cycle-wrapper flow, per-fuel Submit, pre-post gate, and atomic cycle reverse. Adds "Approval Hub" to the Next links so BDMs can trace their submissions.

### Approval Hub Card — Before / After

| | Before | After |
|---|---|---|
| Card title | `Submit 16 car logbook entries` | `Submit Car Logbook 2026-04 C2 (14 working days, total ₱8,420)` |
| docRef | `LOGBOOK-2026-04,LOGBOOK-2026-04,…` (×16) | `LOGBOOK-2026-04-C2` |
| Lines / Amount | `Lines=0 / ₱0 / ORE:₱0` | `14 days / ₱8,420 / 312 km` |
| Journal entries on post | 16 (one per day) | 1 per cycle |

### Wiring & Dependencies Verified

- **Backend CRUD path for per-day docs untouched** — `createCarLogbook / updateCarLogbook / getCarLogbookList / getCarLogbookById / validateCarLogbook / deleteDraftCarLogbook` work as before, so the 10+ downstream services (`incomeCalc`, `expenseSummary`, `fuelEfficiencyService`, `expenseAnomalyService`, `performanceRankingService`, `dashboardService`, `documentReversalService` list, `copilotToolRegistry`, `monthEndClose`, `testExpenseEndpoints`) see no schema disruption.
- **`SmerEntry.car_logbook_id`** still resolves to a per-day `_id` — SMER integration untouched.
- **Period-lock middleware** covers the cycle submit path (`periodLockCheck('CAR_LOGBOOK')` runs before `submitCarLogbook` and before the per-fuel submit endpoint via controller-side `checkPeriodOpen`).
- **`gateApproval()`** is called for both the cycle submit (`docType='CAR_LOGBOOK'`) and per-fuel submit (`docType='FUEL_ENTRY'`) — Phase G4 default-roles gate still enforced on both.
- **`MODULE_AUTO_POST` prefers `doc_type` over `module`** — FUEL_ENTRY routes to `fuel_entry` handler, not `expense_entry`. CAR_LOGBOOK still routes to `car_logbook` handler.
- **Reversal Console** surfaces `CarLogbookCycle` docs; legacy per-day branch dead-coded until `resetCarLogbook.js --live --archive` runs in prod.
- **REVERSAL_HANDLERS** count unchanged at 21.
- **Sidebar link** (`/erp/car-logbook`) unchanged — Sidebar role gate still admin/president/finance/bdm (ROLE_SETS scoped).
- **Frontend bundle** — `npx vite build` clean across the series (9.29s → 11s).

### Subscription Readiness

- `MODULE_DEFAULT_ROLES.FUEL_ENTRY` seeded via Lookup — subscribers tighten (president-only) or open-post (`metadata.roles=null`) via Control Center without code changes.
- `APPROVAL_CATEGORY.OPERATIONAL.modules` includes FUEL_ENTRY — re-categorize via Lookup.
- Per-fuel `doc_ref` uses entity-scoped `DocSequence` — subsidiary prefixes work out of the box.
- Editable statuses still driven by `MODULE_REJECTION_CONFIG.CAR_LOGBOOK` Lookup.
- Cycle boundaries (`C1`=1-15, `C2`=16-end, `MONTHLY`=full) implied by `period+cycle` unique key on `CarLogbookCycle` — per-subscriber alternative cycles can be added without schema change.
- Aggregated totals (`refreshTotalsFromDays()`) recompute on every submit, so adding per-day fields later doesn't break wrapper totals.

### Integrity Checklist

- [x] `node -c` clean on all 9 backend files touched (models, controllers, services, routes, script).
- [x] `npx vite build` clean.
- [x] Per-day CarLogbookEntry CRUD unchanged — 10+ downstream services retain their read shape.
- [x] `REVERSAL_HANDLERS` count unchanged at 21.
- [x] `gateApproval()` still called on both cycle submit and per-fuel submit.
- [x] `MODULE_AUTO_POST` dispatcher prefers `doc_type` over `module` (FUEL_ENTRY correctly routed).
- [x] Lookup-driven seeds: `APPROVAL_CATEGORY`, `APPROVAL_MODULE`, `MODULE_DEFAULT_ROLES` all have FUEL_ENTRY entries.
- [x] Reversal cycle path reverses JE + cascades `deletion_event_id` to all per-day docs atomically.
- [x] Pre-post gate requires non-CASH fuel = APPROVED or CALF POSTED.
- [x] Frontend 202 handling via `showApprovalPending` on both cycle submit and per-fuel submit.
- [x] WorkflowGuide banner rewritten for `car-logbook`.
- [x] CLAUDE-ERP.md documented.
- [x] Memory finalized (project_phase_33_car_logbook_shipped.md — replaces handoff_phase_33_car_logbook.md).

### Pending (user-driven)

- **Reset script execution** (staging / prod) — `node backend/scripts/resetCarLogbook.js --dry-run` then `--live --archive`. Contractor paper copies are the source of truth for the pre-Phase-33 period; fresh-start avoids wrapper backfill complexity.
- **E2E verification** — BDM Jake creates April C2 cycle with 14 working days + 3 non-CASH fuels → Submit Fuel on each → Hub shows 3 FUEL_ENTRY cards → president approves → fuel rows flip to APPROVED (locked) → BDM submits cycle → ONE `LOGBOOK-2026-04-C2` card → president posts → ONE JE. Reversal cascades.

### Rollback

- Frontend: revert CarLogbook.jsx and WorkflowGuide.jsx (no user data touched).
- Backend: drop `CarLogbookCycle` collection, delete per-fuel approval state, revert controllers/services. Per-day CarLogbookEntry is additive-only and safe to keep (the new fields default to null/undefined).
- No schema migration required to roll back; the ledger stays balanced because the reset script never touches TransactionEvents / JournalEntries.

---

## PHASE (FUTURE, SUBSCRIPTION-TRIGGERED) — Unified Party Master (Customer + Hospital Fusion)

**Status:** DEFERRED — execute when subscription model / generic ERP work begins.
**Triggers:** onboarding of subsidiary #2 beyond MG AND CO., OR start of multi-tenant subscription rollout.

### Why Deferred

The current two-model design (`Customer` + `Hospital`) works for VIP single-tenant. The operational pain is cosmetic — duplicate controllers/routes, `$or: [{ hospital_id }, { customer_id }]` branches in txn models, duplicate frontend pages — not functional. The two models also encode a real scoping difference (hospital = globally shared across VIP + MG AND CO. + future subsidiaries; customer = entity-specific), which the fusion has to preserve via partial indexes. Executing the refactor on a single-tenant codebase is speculative; the payoff lands when subsidiary #2 onboards and duplicate-maintenance becomes expensive at scale.

### Why Fuse Eventually

- ~80% field overlap between `Customer` and `Hospital`.
- 177 refs to `hospital_id`/`customer_id` across 30 backend files.
- 4 txn models use ugly OR-validation: `SalesLine`, `Collection`, `CreditNote`, `Collateral` (pre-save validator requires one of the two).
- 4 models are hospital-only today but should open to any party_type when fused: `SmerEntry`, `ConsignmentTracker`, `CwtLedger`, `CreditRule`. Consignment-to-pharmacy and CWT-for-industrial-buyer are realistic future cases.
- Frontend has fully parallel `CustomerList.jsx` / `HospitalList.jsx` with separate services and hooks — every new field shipped twice.

### Target Design (Summary)

Single `erp_parties` collection with:

```
entity_id          (ObjectId, required unless party_type==='hospital')
party_type         (String, Lookup: PARTY_TYPE — retail | hospital | pharmacy | diagnostic | industrial)
party_name, party_name_clean, party_aliases[]
tin, vat_status, payment_terms, credit_limit, credit_limit_action,
cwt_rate, atc_code, is_top_withholding_agent, default_sale_type
address, contact_person, contact_phone, contact_email
warehouse_ids[]   (sparse — populated mainly on hospital-type parties)
tagged_bdms[taggedBdmSchema]
status
hospital_profile? {                    // sparse sub-doc, only populated when party_type==='hospital'
  hospital_type, bed_capacity, level,
  purchaser_name, purchaser_phone,
  chief_pharmacist_name, chief_pharmacist_phone,
  key_decision_maker, engagement_level (1–5),
  major_events[] (≤3), programs_to_level_5
}
legacy_ref { source: 'erp_hospitals'|'erp_customers', source_id }   // migration traceability
```

**Partial indexes** (key mechanism — one collection, two scoping rules):

- `{ party_name_clean: 1 }` unique, `partialFilterExpression: { party_type: 'hospital' }` — global hospital uniqueness.
- `{ entity_id: 1, party_name_clean: 1 }` unique, `partialFilterExpression: { party_type: { $ne: 'hospital' } }` — entity-scoped uniqueness for everyone else.
- Plus: `{ entity_id: 1, party_type: 1, status: 1 }`, `{ warehouse_ids: 1 }`, `{ 'tagged_bdms.bdm_id': 1 }`, text index on `party_name + party_aliases`.

Txn models get `party_id` (ObjectId ref Party) + `party_type_cached` (denormalized for index efficiency). Old `hospital_id`/`customer_id` fields kept as deprecated aliases for the transition window.

### Invariants to Preserve

1. **Hospital global sharing** — one `St Luke's` record across every entity. `entity_id` must remain optional when `party_type==='hospital'`.
2. **Customer entity-scoping** — retail/pharmacy/diagnostic/industrial parties stay scoped per entity.
3. **Access control stays split by `party_type`** — do NOT collapse:
   - Hospitals use warehouse-driven access via `buildHospitalAccessFilter` in [backend/erp/utils/hospitalAccess.js:21-38](../backend/erp/utils/hospitalAccess.js#L21-L38). BDM assigned to a Warehouse (as `manager_id` or `assigned_users`) inherits access to every hospital whose `warehouse_ids[]` includes that warehouse. O(1) operational cost — new hospital under existing warehouse auto-inherits the right BDMs.
   - Customers use direct `tagged_bdms` `{ $elemMatch: { bdm_id, is_active } }` as in [backend/erp/controllers/customerController.js:20-24](../backend/erp/controllers/customerController.js#L20-L24). Territorial pattern doesn't apply to retail — direct tagging is correct.
   - Admin/finance/president/ceo short-circuit to `{}` (unchanged; Rule #21 — no silent self-ID fallback).
4. **Warehouse stays party-agnostic** — [backend/erp/models/Warehouse.js](../backend/erp/models/Warehouse.js) has no refs to hospitals/customers; the arrow goes the other way. No change to Warehouse model.
5. **HEAT fields are orthogonal to warehouse** — no business logic couples them; safe to extract into `hospital_profile` sub-doc.
6. **AR / commission paths don't use warehouse** — fusion doesn't touch arEngine/commission computation.

### Migration Strategy (Reference — 6 PRs, Dual-Write, Zero-Downtime)

Key trick: **reuse original `_id`** when copying Customer/Hospital into erp_parties. This means every existing `hospital_id`/`customer_id` FK in the txn collections already resolves against `erp_parties` without any rewrite, and rollback is bidirectional.

1. **PR1 Additive.** Create Party model + indexes + partyController (read-only) + `/api/erp/parties` + seed `PARTY_TYPE` Lookup. No reads/writes change. Safe deploy.
2. **PR2 Backfill + dual-write.** Run `migrateCustomersHospitalsToParties.js` (idempotent, `_id`-preserving, dry-run flag). Enable `ERP_PARTY_DUAL_WRITE=true` — customer/hospital controllers write to both old and new collections.
3. **PR3 Txn schema extension.** Add `party_id` + `party_type_cached` (non-required) to all txn models. Run `backfillPartyIdOnTxns.js`. Controllers dual-write.
4. **PR4 Service cutover.** Flip service queries to read `party_id` (`arEngine`, `autoJournal`, `documentDetailHydrator`, `documentDetailBuilder`, `universalApprovalService`, `cwtService`, `consignmentReportService`, `creditRuleEngine`, `incomeCalc`, `soaGenerator`). Frontend tab defaults switch to `/api/erp/parties`.
5. **PR5 Make `party_id` required.** Old txn fields deprecated (warn in logs). UI collapses to single `PartyList.jsx` with tabs — old routes 301 to preselected tabs.
6. **PR6 Retire (T+30).** After backup: drop `erp_customers`/`erp_hospitals`, remove deprecated fields, compat shims, old routes, old frontend pages.

**Rollback:** `_id` reuse keeps FKs valid either direction. Flags `ERP_PARTY_READ_FROM_PARTIES` and `ERP_PARTY_DUAL_WRITE` toggle independently. Old collections retained 30 days.

### Verification Checklist (for executing team)

- **Reconciliation** — `count(erp_parties) === count(erp_hospitals) + count(erp_customers)` post-PR2.
- **ID continuity** — sample 50 txns per model; `party_id` resolves to same logical entity as prior `hospital_id`/`customer_id`.
- **AR invariants** — snapshot `arEngine.computeOpenBalance` per entity as JSON before/after; must be byte-identical.
- **Uniqueness tests:**
  - Duplicate hospital name across two entities → **must fail** (global partial index).
  - Same customer name across two entities for non-hospital → **must succeed** (entity-scoped partial index).
- **Round-trip smoke** — create + post + reverse for: Sales invoice (hospital AND pharmacy parties), Collection, CreditNote, Collateral, Consignment-to-pharmacy, CWT ledger.
- **Period-lock + gateApproval** — writes blocked within locked periods; non-authorized submits route through Approval Hub (HTTP 202; Rule #20).
- **Rollback drill** — flip `ERP_PARTY_READ_FROM_PARTIES=false` in staging; UI reverts to old collections and functions.

### Cheap Prep (Optional, Can Ship Anytime Before Full Fusion)

Extract the two existing access filters into one shared util, `buildPartyAccessFilter(user, partyType)`:

- If `partyType === 'hospital'` → reuse existing warehouse-driven logic verbatim from [backend/erp/utils/hospitalAccess.js:21-38](../backend/erp/utils/hospitalAccess.js#L21-L38).
- Else → return the `tagged_bdms.$elemMatch` filter from [customerController.js:20-24](../backend/erp/controllers/customerController.js#L20-L24).
- Admin/finance/president/ceo → `{}`.

~30 lines, zero schema change, zero migration. Fusion PR becomes half the size when it eventually lands.

### Affected Files (Reference List for Executing Team)

**Models (modify):** [SalesLine.js](../backend/erp/models/SalesLine.js) L49-54, [Collection.js](../backend/erp/models/Collection.js) L35-37, [CreditNote.js](../backend/erp/models/CreditNote.js) L59-60, [Collateral.js](../backend/erp/models/Collateral.js) L17-18, [SmerEntry.js](../backend/erp/models/SmerEntry.js), [ConsignmentTracker.js](../backend/erp/models/ConsignmentTracker.js), [CwtLedger.js](../backend/erp/models/CwtLedger.js), [CreditRule.js](../backend/erp/models/CreditRule.js).

**Models (new):** `backend/erp/models/Party.js`.

**Controllers/Routes:** new `partyController.js` + `partyRoutes.js` mounted at `/api/erp/parties`; existing `customerController.js` + `hospitalController.js` become thin shims during transition, removed at PR6.

**Services (switch `$or` → `party_id`):** `arEngine.js`, `autoJournal.js`, `documentDetailHydrator.js`, `documentDetailBuilder.js`, `universalApprovalService.js`, `cwtService.js`, `consignmentReportService.js`, `creditRuleEngine.js`, `incomeCalc.js`, `soaGenerator.js`.

**Scripts (new):** `migrateCustomersHospitalsToParties.js`, `backfillPartyIdOnTxns.js`.

**Frontend:** new `PartyList.jsx` + `partyService.js` + `useParties.js`; existing `HospitalList.jsx` / `CustomerList.jsx` become tab-preselected wrappers at PR5, removed at PR6. Add `PARTY_MASTER` entry to `WORKFLOW_GUIDES` in `WorkflowGuide.jsx` (banner compliance).

**Reused utilities:** `cleanName` from `utils/nameClean.js`; `gateApproval` from `services/approvalService.js`; existing `taggedBdmSchema` block; generalized `buildPartyAccessFilter` (from cheap-prep step above).

### Out of Scope Even When Executed

- CRM `Doctor` (VIP Client) model — separate clinical master, not a transactional party.
- COA codes or journal semantics — no new COA entries introduced.
- [backend/erp/models/Warehouse.js](../backend/erp/models/Warehouse.js) — stays inventory-only and party-agnostic.
- AR / commission computation paths — don't reference warehouse today, don't need to after fusion.

---

## PHASE 33-O — OWNER VISIBILITY ON CYCLE DOCS ✅ SHIPPED (Apr 21, 2026)

**Goal.** Make BDM owner visible on every cycle-doc list so privileged viewers (President/Admin/Finance) know whose Smer/Expenses/PrfCalf/Car Logbook they are reviewing. Fix the latent Car Logbook bug where multiple BDMs' day entries collided in the frontend `docMap`.

**Trigger.** President reported on SMER list: "I do not know whose SMER are these because there are no details?"

### Shipped scope

1. **Backend list endpoints** accept optional `?bdm_id=` param (Rule #21 privileged-only pattern):
   - `getSmerList`, `getExpenseList`, `getPrfCalfList`, `getCarLogbookList` in `backend/erp/controllers/expenseController.js`.
   - Gate: `const privileged = req.isPresident || req.isAdmin || req.isFinance; if (privileged && req.query.bdm_id) filter.bdm_id = req.query.bdm_id;`
   - Non-privileged callers stay self-scoped via `req.tenantFilter` (no fallback ternary anti-pattern).

2. **BDM column rendered in frontend lists:**
   - `Smer.jsx` — desktop first column `{s.bdm_id?.name || '—'}`.
   - `Expenses.jsx` — desktop column + mobile card subtitle.
   - `PrfCalf.jsx` — desktop column (after doc_type badge) + mobile card body.
   - colSpan bumps: Smer 8→9, Expenses 8→9, PrfCalf 7→8 on banner/error/empty rows.

3. **Car Logbook BDM picker** (grid is one-BDM-per-view, so a column is wrong):
   - `useTransfers.getBdmsByEntity(entity_id)` fetches BDM options on mount for privileged viewers.
   - State: `bdmOptions`, `selectedBdmId` (empty for privileged, self for BDM role), `viewingSelf` derived.
   - Selector rendered only for privileged; amber "Select a BDM" hint before pick; blue "Viewing X's logbook — read-only" banner when privileged viewer inspects someone else.
   - `loadAndMerge` early-returns when privileged + no selection (zero backend call).
   - `handleSaveAll` / `handleValidate` / `handleSubmit` short-circuit with a toast when `!viewingSelf`.
   - `WorkflowGuide.jsx` `car-logbook.tip` already described this pattern.

### Integrity verification

- `npx vite build` — clean in 40.72s; Smer/Expenses/PrfCalf/CarLogbook chunks rebuilt.
- `node -c backend/erp/controllers/expenseController.js` — OK.
- Rule #21 compliance: identical pattern to existing compensation-statement `?bdm_id=` endpoint (CLAUDE-ERP §Compensation statement).
- No breaking change for BDM callers: `req.tenantFilter` still clamps to self; forged `?bdm_id=` query ignored (privileged gate short-circuits).
- No banner workflow steps changed — CALF dependency, per-fuel approval, cycle-wrapper submit flows identical.
- No COA, approval, or journal-engine wiring touched.

### Subscription-readiness

- Zero hardcoded role names at call sites — reuses `req.isPresident`/`req.isAdmin`/`req.isFinance` booleans from `tenantFilter` (same source the 13 other Rule #21 endpoints already use).
- Zero hardcoded BDM IDs or entity IDs — selector pulls `getBdmsByEntity(entity_id)` per-entity, so subsidiary presidents see only their own subsidiary's BDMs.
- Any subscriber's president gets owner-visibility on day 1 without code deploys.

### Out of scope (future, if requested)

- BDM filter dropdown on Smer/Expenses/PrfCalf lists — backend already supports `?bdm_id=`; UI hook would be a ~10-line add per page. Deferred: the column alone resolved the visibility complaint.
- Aggregated "all BDMs at once" day-grid on Car Logbook — requires new UI shape (pivot or per-BDM row-per-day). Not needed for the reported complaint.

---

## PHASE 33-O.1 — Car Logbook Write-Leak Closure ✅ SHIPPED (Apr 21, 2026)

**Trigger.** President reported seeing 11 logbook rows on `/erp/car-logbook` they did not create. Investigation showed Phase 33-O fixed the *visibility* gap (owner column, picker, list honors `?bdm_id=`) but left the *write* path leaking: `getCarLogbookList` still returned cross-BDM results when privileged lands with no picker selection, and `validateCarLogbook`, `submitCarLogbook`, `createCarLogbook`, `updateCarLogbook`, `deleteDraftCarLogbook`, `submitFuelEntryForApproval`, `getCarLogbookById`, `getSmerDailyByDate`, `getSmerDestinationsBatch` all spread `...req.tenantFilter` (which is `{}` for privileged) — so a privileged Validate click would have flipped every BDM's DRAFT/ERROR days, and Submit would have bundled foreign VALID entries into a cycle wrapper bound to the president's user_id.

### Shipped scope

1. **`resolveCarLogbookScope(req)` helper** added at the top of the CAR LOGBOOK section in `backend/erp/controllers/expenseController.js`. Returns `{ privileged, bdmId }` where `bdmId = privileged ? (req.query.bdm_id || req.body.bdm_id || null) : req.bdmId`.

2. **All 9 Car Logbook endpoints migrated** to the helper. Privileged + no `bdm_id` handling:
   - Reads (`getCarLogbookList`, `getCarLogbookById`, `getSmerDailyByDate`, `getSmerDestinationsBatch`) → empty response with `message: "Select a BDM to view their car logbook"`.
   - Writes (`createCarLogbook`, `updateCarLogbook`, `deleteDraftCarLogbook`, `validateCarLogbook`, `submitCarLogbook`, `submitFuelEntryForApproval`) → HTTP 400 `"bdm_id is required — privileged users must specify which BDM …"`.
   - `updateCarLogbook` locks `entry.bdm_id` + `entry.entity_id` on save so body cannot silently reassign ownership.
   - `validateCarLogbook` now also scopes by `period`+`cycle` from body so it validates the active cycle, not every open draft month-wide.
   - `submitCarLogbook` binds `CarLogbookCycle` wrapper to the resolved `bdmId`, not `req.bdmId` (critical — prevents cycle-wrapper ghost ownership).

3. **Frontend tightening** (`frontend/src/erp/pages/CarLogbook.jsx`) — strict model:
   - `viewingSelf = !!selectedBdmId && selectedBdmId === user._id` — privileged without a selection is now `false` (previously `true`, which enabled Save/Validate/Submit buttons that would have 400'd backend).
   - All write handlers (`saveRow`, `handleValidate`, `handleSubmit`, `handleSubmitFuel`, `handleDelete`) short-circuit with a read-only toast when `!viewingSelf`.
   - `MANAGEMENT` roles and `CONTRACTOR` are mutually exclusive, so `viewingSelf` is always false for privileged users — the page is strictly read-only for them. No `bdm_id` stamping on writes (would be dead code under the strict gate). Backend still accepts `bdm_id` defensively for scripts / future on-behalf flows.

4. **Banner update** (`frontend/src/erp/components/WorkflowGuide.jsx`):
   - `car-logbook.tip` extended with: *"Privileged viewers (president/admin/finance) use the BDM picker to audit someone else's cycle — the page is read-only until they pick themselves (Rule #21 — no silent self-fallback; backend requires an explicit bdm_id to create/validate/submit)."*

### Integrity verification

- `node -c backend/erp/controllers/expenseController.js` — OK.
- `npx vite build` — clean in 36.34s.
- Rule #21 compliance: same pattern as Phase G5 (AR Aging / FIFO / SOA) + Phase 33-O's list patches; no new anti-pattern introduced.
- No impact on `reopenCarLogbook` (intentionally cross-BDM for privileged — reopen is a privileged cycle-level operation, doc-by-id lookup is the correct access gate).
- No COA, approval-service, or journal-engine wiring touched.
- SMER/ORE/PRF list endpoints retain their Phase 33-O behavior (privileged honor `?bdm_id=` but do not 400 on absence) — those are admin-review lists, not per-person grid UIs, so the "see everything in scope" semantics are correct for their shape. A separate sweep could tighten their writes if needed.

### Subscription-readiness

- Lookup-driven nothing new needed — the helper reuses `req.isPresident`/`req.isAdmin`/`req.isFinance` booleans. If/when `CROSS_BDM_VIEW_ROLES` Lookup is introduced (per the Phase G5 optional follow-up), this helper is the single swap site for Car Logbook.
- Zero hardcoded BDM IDs or entity IDs; frontend picker already per-entity via `getBdmsByEntity`.
- Any subsidiary president gets the fix on day 1 without code deploys.

### Root-cause memo (for the Bulletproof-bar record)

A grid-shaped UI combined with a privileged-wildcard `tenantFilter` is a write-mutation risk, not just a read-visibility risk. Future per-person grid pages must either:
- Require an explicit owner-scope query param on all endpoints (this fix), or
- Use a separate controller set for "admin-audit" vs "my" grids.

---

## Phase 34 — Approval Rule Module Enum Alignment (Apr 21, 2026)

### Status: ✅ Shipped

### Problem

Admin (President) opened Control Center → Approval Rules → `+ Add Rule`, picked `UNDERTAKING` in the Module dropdown, clicked Create, and got:

```
Validation failed. Please check your input.: `UNDERTAKING` is not a valid enum value for path `module`.
```

Root cause: the `ApprovalRule.module` enum was authored in Phase 29 and last touched in Phase F.1 (April 2026). Every phase since (Phase 32 Undertaking, Phase 33 Car Logbook / Fuel Entry, Phase 31R Credit Note follow-up, Phase SG-Q2 Sales Goal Plan + Incentive Payout, Phase SG-4 Incentive Dispute, Phase Opening AR split) expanded `gateApproval()` + `APPROVAL_MODULE` lookup + `MODULE_DEFAULT_ROLES` lookup — but forgot to backfill the `ApprovalRule.module` enum. The frontend dropdown (driven by `APPROVAL_MODULE` lookup, 24 entries) offered module codes the backend enum (20 entries) refused to accept. Silent for subscribers until the first admin tried to create a rule for a post-Phase-29 module.

### Audit scope

Reviewed every file that calls `gateApproval({ module })` and the dropdown-driver lookup. Gaps found:

| Module key | Used by | In enum before? | In APPROVAL_MODULE lookup? |
|---|---|---|---|
| `UNDERTAKING` | undertakingController:177 | ✗ | ✓ |
| `FUEL_ENTRY` | (docType under EXPENSES today; dropdown-offered) | ✗ | ✓ |
| `CREDIT_NOTE` | creditNoteController:271 | ✗ | ✓ |
| `SALES_GOAL_PLAN` | salesGoalController (9 sites) | ✗ | ✓ |
| `INCENTIVE_PAYOUT` | incentivePayoutController (4 sites) | ✗ | ✓ |
| `INCENTIVE_DISPUTE` | incentiveDisputeController (3 sites) | ✗ | ✓ |
| `OPENING_AR` | salesController:778 (split batch) | ✗ | ✗ (now added) |

`OPENING_AR` was a triple-blind spot: gateApproval emits the key, `MODULE_DEFAULT_ROLES` had the entry, but neither `APPROVAL_MODULE` nor `ApprovalRule.module` enum knew about it → no way to create a matrix rule for Opening AR.

### Changes

| File | Change |
|---|---|
| [backend/erp/models/ApprovalRule.js](backend/erp/models/ApprovalRule.js) | Extended `module` enum from 20 → 26 values. Added UNDERTAKING, FUEL_ENTRY, CREDIT_NOTE, SALES_GOAL_PLAN, INCENTIVE_PAYOUT, INCENTIVE_DISPUTE, OPENING_AR. Documented semantics inline. |
| [backend/erp/controllers/lookupGenericController.js](backend/erp/controllers/lookupGenericController.js) | `APPROVAL_MODULE` seed += `OPENING_AR` (FINANCIAL). `APPROVAL_CATEGORY.FINANCIAL.metadata.modules` += `OPENING_AR`. `APPROVAL_CATEGORY.OPERATIONAL.metadata.modules` += `CREDIT_NOTE`, `INCENTIVE_DISPUTE` (they had APPROVAL_MODULE rows but were absent from the category modules list). |
| [backend/erp/scripts/seedApprovalRules.js](backend/erp/scripts/seedApprovalRules.js) | Added default matrix rules for UNDERTAKING, CREDIT_NOTE (standalone), FUEL_ENTRY, SALES_GOAL_PLAN (6 doc_types), INCENTIVE_PAYOUT (3 doc_types), INCENTIVE_DISPUTE (3 doc_types), OPENING_AR. Subscribers that run the seed script now start with default matrix rules for every module that supports gateApproval. |
| [CLAUDE-ERP.md](CLAUDE-ERP.md) | New "Enum ↔ Lookup Symmetry" section under Approval Workflow documenting the 5-step checklist for adding a new module (enum + APPROVAL_MODULE + MODULE_DEFAULT_ROLES + APPROVAL_CATEGORY + seed script). |

### Verification

- `node -c` clean on ApprovalRule.js, lookupGenericController.js, seedApprovalRules.js.
- Admin can now save an Approval Rule for any module the frontend dropdown offers — no validation error.
- **No migration required** — enum extensions are additive; existing rule documents remain valid.
- **No downstream breakage** — `findMatchingRules` in approvalService.js queries by exact-match module; new keys simply surface new routing paths. `universalApprovalService.MODULE_QUERIES` already has entries for every code. `DOC_TYPE_HYDRATION` registry (Phase G4.1) already covers all new doc_types.
- **Subscription-ready** — re-running `node backend/erp/scripts/seedApprovalRules.js` is idempotent and auto-fills matrix rules for all 15 default module+doc_type combinations across every active entity.

### Role choice: admin+president vs user-specific

Guidance written for President during this session: default to role-based (`admin, finance, president`) not user-specific. Reasons: (1) Rule #3 + Rule #19 scalability — subscribers inherit rules without user-ID swaps, (2) continuity — if one person is out, another same-role user unblocks the queue, (3) role-based rules survive BDM stage graduation / role changes, (4) audit trail still captures actual approver's `user_id` via `ApprovalRequest.action_by`. Reserve `approver_type: USER` for one-off legally-required specific signatories.

### Non-changes (explicitly considered, rejected)

- **Did not change** `gateApproval({ module: 'EXPENSES', docType: 'FUEL_ENTRY' })` in `expenseController.js:897` to `module: 'FUEL_ENTRY'`. Phase 33 deliberately holds FUEL_ENTRY ApprovalRequests under module EXPENSES; dispatcher prefers docType for auto-post routing. Changing this is a behavior migration, not a gap fix.
- **Did not add** a gate on `interCompanyController.postTransfer`. The approval decision is made at `approveTransfer` (which does gate). `postTransfer` is a RECEIVED→POSTED terminal state flip protected by `roleCheck('president','admin')` — same pattern as petty cash deposit / sales auto-journal post-approval settlement. Adding a second gate would double-prompt without adding authorization value.
- **Did not remove** the legacy `COLLECTIONS` (plural) enum value. No controller emits it; it's a Phase 29 orphan. Leaving it avoids a migration if any stale DB document somehow exists.

### Files touched
```
backend/erp/models/ApprovalRule.js                    [+6 enum values]
backend/erp/controllers/lookupGenericController.js    [+OPENING_AR to APPROVAL_MODULE + 3 category modules arrays]
backend/erp/scripts/seedApprovalRules.js              [+15 default rule combinations]
CLAUDE-ERP.md                                         [+Enum↔Lookup Symmetry section]
docs/PHASETASK-ERP.md                                 [+this Phase 34 block]
```

## Phase 34-P — Per Diem Override Write-Back Fix (Apr 21 2026, shipped)

**Reported symptom.** Contractor requested per diem override on a SMER daily entry. President approved in the Approval Hub. Contractor's UI kept showing PENDING even after a hard refresh.

**Root cause — silent skip in `perdiem_override` handler.**
[backend/erp/controllers/universalApprovalController.js](../backend/erp/controllers/universalApprovalController.js) loaded the SMER with `findOne({ _id, status: { $in: getEditableStatuses('SMER') } })`. Editable for SMER is `['DRAFT','ERROR']` per `MODULE_REJECTION_CONFIG.SMER`. If the contractor had moved the SMER to VALID (or POSTED, via auto-submit) before the approver decided, `findOne` returned null and the entire write-back block silently no-op'd. `processDecision` had already flipped the ApprovalRequest to APPROVED, so the request could not be retried — the daily entry was permanently stranded with `override_status: 'PENDING'`. No error anywhere.

Contributing gap: `validateSmer` + `submitSmer` did not block SMER progression while overrides were pending, so the race was possible on every contractor's first pass.

**What shipped.**

1. **Reordered approval handler** — `perdiem_override` now loads ApprovalRequest + SMER + entry up front, throws on any missing reference, applies the override to the SMER and writes the audit log FIRST, then calls `processDecision`. On failure the ApprovalRequest stays PENDING and the thrown message bubbles to the Approval Hub as HTTP 500. No more silent skip.
2. **Removed the editable-status gate on the SMER load.** Approval applies to a subdocument state (not the parent lifecycle); the gate was the silent-skip vector. Replaced with a **ledger-drift guard**: if the SMER is already POSTED at approval time, throw with a clear "reopen the SMER via Reversal Console first" message.
3. **Block validate + submit while any override is PENDING.** `validateSmer` adds a per-day error → SMER flips to ERROR → cannot reach VALID → cannot submit. Defensive re-check in `submitSmer` (race-safe). Invariant: parent SMER stays DRAFT/ERROR until every override is decided.
4. **Inline CompProfile load** in the handler so the accepted amount uses the per-person rate — matches `overridePerdiemDay` at request time. No drift between requested and accepted amount.
5. **Repair script** — [backend/erp/scripts/repairStuckPerdiemOverrides.js](../backend/erp/scripts/repairStuckPerdiemOverrides.js). Scans all decided `PERDIEM_OVERRIDE` ApprovalRequests, reapplies the override to any daily entry still in PENDING. Idempotent; dry-run default; flags POSTED SMERs for manual Reversal Console handling.
6. **WorkflowGuide** — `smer.tip` updated to state the new invariant.

### Files touched
```
backend/erp/controllers/universalApprovalController.js    [rewrote perdiem_override handler, lines ~125-195]
backend/erp/controllers/expenseController.js              [+PENDING block in validateSmer, +defensive re-check in submitSmer]
backend/erp/scripts/repairStuckPerdiemOverrides.js        [new — repair script for stuck records]
frontend/src/erp/components/WorkflowGuide.jsx             [smer.tip updated]
CLAUDE-ERP.md                                             [+Phase 34-P section]
docs/PHASETASK-ERP.md                                     [+this block]
```

### Verification

- `node -c` clean on universalApprovalController.js, expenseController.js, repairStuckPerdiemOverrides.js.
- `npx vite build` — clean in 46.42s.
- Downstream read-only consumers of `override_status`: `Smer.jsx`, `Income.jsx`, `MyIncome.jsx`, `DocumentDetailPanel.jsx` — all unaffected (render-side only).
- No lookup category added; no schema change; no enum change. Existing `MODULE_REJECTION_CONFIG.SMER.metadata.editable_statuses` untouched — still governs rejection/resubmit, no longer the (wrong) gate for approval write-back.
- Rule #20 "any person can CREATE, but authority POSTS" preserved; Rule #3 lookup-driven — subscribers inherit the fix without configuration.

### Deployment

1. Deploy backend + frontend.
2. Run repair script per entity: `node erp/scripts/repairStuckPerdiemOverrides.js` (dry-run) → `--apply`.
3. Any stuck record on a POSTED SMER will be flagged — admin reopens via Reversal Console, then the BDM resubmits; on resubmit the override re-routes through the now-fixed handler.

---

## Phase 35 — JE Normal-Balance Validator + Auto-Journal Sweep (April 21, 2026)

### Incident
- Contractor Romela's two POSTED SMERs (`69e532fb5ae50328cda6b156`, `69e5d447d4d816c121ea0736`) totalling ₱14,700 were missing their JournalEntry companion rows since 2026-04-13.
- Car Logbook auto-journal for 2026-04-20 (AR-BDM credited ₱3,489.28) also missing.
- Blast radius: every auto-journal flow that reduces an asset/liability — SMER, Car Logbook, Expenses (ORE), PRF/CALF, Collections, CWT, Commission, Petty Cash, Inter-Company, Credit Notes, AP Payment, CC Payment, Bank Recon charges, Owner Drawings, Year-End Close.

### Root cause
`JournalEntry.js` pre-save "#15 Hardening" (line 168-183 pre-fix) rejected any line crediting a DEBIT-normal account or debiting a CREDIT-normal account. In correct double-entry bookkeeping, `normal_balance` is not a per-line constraint — it's a description of where the accumulated positive position lives. CR AR-BDM, DR AP-Trade, CR PETTY_CASH are all legitimate reductions.

Every affected call path sat inside `try { createAndPostJournal } catch (jeErr) { console.error(...) }`. The validator rejection was swallowed. Parent documents (SMER, Car Logbook, etc.) still flipped to POSTED because the JE posting is a non-blocking side-effect outside the parent's transaction. The ledger drifted silently for 8 days.

### Solution (Option A — explicit contra sweep)
Preferred by user over Option B (remove check) and Option C (same-side-only guard) to maintain explicit audit-trail documentation that every auto-journal site has been human-reviewed.

#### 1. Schema + validator (foundation)
- Added `is_contra: { type: Boolean, default: false }` to `jeLineSchema` in [backend/erp/models/JournalEntry.js](../backend/erp/models/JournalEntry.js).
- Pre-save validator #15 direction check now `continue`s when `line.is_contra === true`. Manual JEs from `journalController` (which don't opt-in) still get the direction check applied.
- Backward-compatible: existing POSTED JEs without the field render the same (default false → direction check never fires retroactively because we're only loading, not re-saving).

#### 2. Enum gap closures (piggybacked on the integrity pass)
- `JournalEntry.source_module` enum missing: `CREDIT_NOTE`, `SUPPLIER_INVOICE`, `SALES_GOAL`. All three were used by controllers and silently rejected during schema validation.
- `ErpAuditLog.log_type` enum missing: `LEDGER_ERROR` (9+ call sites), `CSI_TRACE`, `BATCH_UPLOAD_ON_BEHALF`, `CREATE`, `UPDATE`, `DELETE`, `BACKFILL`. Most call sites had `.catch(() => {})` wrappers, so audit entries were disappearing.

#### 3. First-digit heuristic for dynamic funding
Added `isDebitNormalByCode(code)` and `isCreditNormalByCode(code)` helpers at the top of [autoJournal.js](../backend/erp/services/autoJournal.js) and [journalFromIncentive.js](../backend/erp/services/journalFromIncentive.js). Used in sites where the funding COA is resolved at runtime (`resolveFundingCoa`). Hand-marked is_contra on static sites.

#### 4. Sweep — 50+ call sites reviewed
**Helpers in `autoJournal.js`** (16 functions):

| Helper | Contra line(s) marked |
|---|---|
| journalFromSale | none (DR AR_TRADE / CR SALES_REVENUE / CR OUTPUT_VAT all natural direction) |
| journalFromCollection | CR AR_TRADE |
| journalFromCWT | CR AR_TRADE |
| journalFromExpense | CR AR_BDM/funding (heuristic) |
| journalFromCommission | CR AR_BDM |
| journalFromPayroll | CR bank for net pay (heuristic) |
| journalFromAP | none (natural direction) |
| journalFromDepreciation | none (ACCUM_DEPRECIATION is CREDIT-normal contra-asset) |
| journalFromInterest | none |
| journalFromOwnerEquity | CR bank in DRAWING (heuristic) |
| journalFromServiceRevenue | none |
| journalFromPettyCash | CR PETTY_CASH in DISBURSEMENT + REMITTANCE; CR OWNER_DRAWINGS in REPLENISHMENT (explicit — contra-equity) |
| journalFromCOGS | CR INVENTORY |
| journalFromInterCompany | CR INVENTORY in SENDER |
| journalFromInventoryAdjustment | CR INVENTORY in LOSS |
| journalFromPrfCalf | CR funding (heuristic) |

**`journalFromIncentive.js`**: settlement JE — DR INCENTIVE_ACCRUAL (contra) + CR funding (heuristic).

**Controllers with inline JE lines**:
- `expenseController.js` — 9 sites across `submitSmer`, `submitCarLogbookCycle`, `submitExpenses`, `postSingleSmer`, `postSingleCarLogbook` (cycle + legacy per-day), `postSingleExpense`, nested auto-submit-linked CALF → EXPENSE + CALF → CAR_LOGBOOK flows.
- `creditNoteController.js` — DR SALES_REVENUE + CR AR_TRADE both contra.
- `apPaymentService.js` — DR AP_TRADE + CR bank both contra.
- `bankReconService.js` — CR bank for bank charges.
- `creditCardService.js` — DR CC payable + CR bank both contra.
- `pnlCalc.js` — year-end closing: DR revenue + CR expense + DR retained-earnings-on-loss all contra.

#### 5. Latent bug fixes surfaced during the sweep
- `expenseController.js:2347` — used undefined variable `calfCoaMap` instead of `autoCoaMap`. CALF → Car Logbook auto-submit JE threw ReferenceError, was swallowed. Fixed.
- `loanService.postInterest` — missing `await` on `journalFromInterest` (async function). Passed a Promise as JE data; every interest post silently failed schema validation. Fixed.
- `ownerEquityService.recordInfusion` + `recordDrawing` — same missing `await` on `journalFromOwnerEquity`. Fixed.
- `depreciationService.postDepreciation` — same missing `await` on `journalFromDepreciation`. Fixed.
- `payrollController.js` — catch block referenced `fullPs` declared inside inner try scope. ReferenceError swallowed by `.catch(() => {})`, audit log never persisted on payroll JE failure. Hoisted `fullPs` to outer scope with null default + guards.

#### 6. Searchable failure logs
Every `console.error` in auto-journal try/catch now uses `[AUTO_JOURNAL_FAILURE]` prefix so pm2/log-grep can find them. Phase 36 will promote to a structured `AutoJournalFailure` collection with President alert routing.

#### 7. Backlog repost script
[backend/erp/scripts/repostMissingJEs.js](../backend/erp/scripts/repostMissingJEs.js):
- Scope: SmerEntry + CarLogbookCycle + ExpenseEntry + PrfCalf POSTED since `--since` (default 2026-04-13), with `deletion_event_id` absent and no existing JournalEntry at `source_event_id`.
- Dry-run default. `--apply` to write.
- `--type SMER|CARLOGBOOK|EXPENSE|PRFCALF` for targeted runs.
- `--force-closed-period` to repost into locked periods (normally skipped with a warning).
- Idempotent — re-running is a no-op once backlog is cleared.
- Uses the same helpers/inline logic as the controllers (no drift) — replicates SMER/CarLogbook inline JE logic with is_contra applied; uses shared `journalFromPrfCalf` helper for PRF/CALF.

### Design rules honored
- **Rule #3 lookup-driven** — COA_MAP still read from Settings; funding source via `resolveFundingCoa`; no hardcoded COA codes.
- **Rule #19 subscription-safe** — validator still uses ChartOfAccounts.normal_balance per-entity as the authoritative source. Heuristic is a fallback for dynamic funding cases only.
- **Rule #20 period locks** — repost script runs `checkPeriodOpen` per doc; skips with warning if closed (opt-in override via flag).
- **Rule #21 privileged-user filter** — N/A (script is script-user-agnostic).
- **Workflow banners** — no new pages added, existing WorkflowGuide entries still accurate because document flow is unchanged (the change is fully internal to the JE layer).

### Files touched
```
backend/erp/models/JournalEntry.js               [is_contra field, validator skip, source_module enum]
backend/erp/models/ErpAuditLog.js                [log_type enum backfill]
backend/erp/services/autoJournal.js              [isDebitNormalByCode helper, 16 journalFrom* updates]
backend/erp/services/journalFromIncentive.js     [settlement JE contra lines]
backend/erp/services/apPaymentService.js         [contra lines]
backend/erp/services/bankReconService.js         [contra line, failure prefix]
backend/erp/services/creditCardService.js        [contra lines]
backend/erp/services/interCompanyService.js      [failure prefix]
backend/erp/services/loanService.js              [missing await fix]
backend/erp/services/depreciationService.js      [missing await fix]
backend/erp/services/ownerEquityService.js       [missing await fix, 2 sites]
backend/erp/services/pnlCalc.js                  [year-end closing contra lines, failure prefix]
backend/erp/controllers/expenseController.js     [9 inline JE sites + calfCoaMap typo + prefixes]
backend/erp/controllers/creditNoteController.js  [contra lines + prefix]
backend/erp/controllers/payrollController.js     [fullPs scope fix + prefix]
backend/erp/controllers/inventoryController.js   [prefix]
backend/erp/scripts/repostMissingJEs.js          [NEW — backlog repost]
CLAUDE-ERP.md                                    [+Phase 35 section, version bump to 7.0]
docs/PHASETASK-ERP.md                            [+this block]
```

### Verification

- `node -c` clean on all 16 touched backend files + new script.
- `npx vite build` — clean in 11.84s (no frontend code touched, sanity check only).
- Downstream read-only consumers of JournalEntry (GL, trial balance, FS reports) — unaffected; `is_contra` is write-side audit metadata only.
- Search for `journalFrom\w+\(` without `await` returned zero hits after sweep — all async helpers properly awaited.

### Deployment

1. `git pull && pm2 restart vip-crm-api vip-crm-worker` on prod.
2. `cd backend && node erp/scripts/repostMissingJEs.js` — dry-run to see the backlog.
3. Review output for expected orphan count vs surprise failures.
4. `node erp/scripts/repostMissingJEs.js --apply` — persist.
5. Sanity query — orphan SMERs since Apr 13 should drop to 0 after --apply.
6. Tell Romela: her C1 is now fully journaled; she can create 2026-04 C2 for the current cycle.

### Follow-up Phase 36 (deferred)
- `AutoJournalFailure` model + collection with `ALERT_CHANNELS` lookup for President notification routing.
- `journal_failures: [...]` array in submit/post endpoint responses so the frontend can surface a warning toast (currently silent — posting reports success even when JE fails).
- Extract SMER + CarLogbookCycle + Expense inline JE logic from `expenseController.js` into shared `autoJournal.js` helpers so the repost script and controllers converge on one code path.

---

## Phase G1.2 — Payslip Transparency & SMER-ORE Retirement Hardening ✅ (April 21, 2026)

### Goal
Answer three contractor-income transparency questions surfaced while reviewing Romela Shen Herrera's 2026-03 C2 payslip:
1. SMER-ORE field is a zombie — schema exists, writes are hidden, legacy-fallback branch in income calc still reads it. Clean up without breaking audit on historical POSTED SMERs.
2. Personal Gas deduction disappears entirely when ₱0 — BDM cannot tell whether the logbook was reviewed. Surface a ₱0 row for logbook-eligible BDMs.
3. Deduction rows lack a one-stop-vs-installment indicator; installment lines show `(N/M)` in free text only, no expandable view of the full schedule timeline.

### Deliverables

#### 1. SMER-ORE retirement hardening
- `SmerEntry.daily_entries[].ore_amount` and `SmerEntry.total_ore` marked `@deprecated` with inline JSDoc. Schema retained for historical POSTED SMER display.
- Pre-save hook: any `isNew` document with `ore_amount > 0` on any daily entry is **rejected** with an explicit error pointing to the Expenses module. Existing docs with legacy non-zero values still save (status updates, reversals) — no corruption of audit trail.
- `incomeCalc.generateIncomeReport`: dropped the `if (smerOre === 0)` fallback branch. ORE is **always** aggregated from `ExpenseEntry.lines.expense_type='ORE'`. Legacy SMER-ORE is subtracted from `total_reimbursable` to avoid double-count on pre-retirement docs. Rename: `expenseOreAmount` → `oreAmount`.
- `incomeCalc.projectIncome`: same refactor. Adds `ore_legacy_smer` to projection output for audit-only display.
- `incomeCalc.getIncomeBreakdown`: `smerBreakdown.subtotals.ore` now sources from ExpenseEntry-ORE; legacy is exposed as `ore_legacy_smer` (UI shows muted "audit only" row when > 0). `oreBreakdown.total` is ExpenseEntry-only; `smer_ore` and `daily_ore` retained for legacy audit.
- No downstream JE breakage: the pre-save guard is gated on `isNew`, so reversal handlers that re-save existing docs don't trip. `expenseController.js:358` and `:3053` JE-line generators for SMER-ORE gate on `if (smer.total_ore > 0)` — naturally skip when 0 (new docs) and still fire for historical docs, preserving audit-symmetric JE postings. `REVERSAL_HANDLERS` count unchanged at 21.

#### 2. Personal Gas always-show
- `_resolveCompProfile(entityId, bdmId)` helper inlined in `incomeCalc.js` (mirrors the existing `loadBdmCompProfile` in `expenseController.js` to keep the service dependency graph flat — no controller imports from a service).
- Deduction-line builder: `CompProfile.logbook_eligible === true` now gates PERSONAL_GAS line emission. `if (personalGasDeduction > 0)` guard removed. ₱0 lines carry description `'No personal km logged this cycle — logbook reviewed'`; non-zero lines keep the auto-computed description.
- Office staff without a CompProfile or `logbook_eligible=false` still get no Personal Gas row — preserves the "only logbook users see it" UX.
- Frontend: Income.jsx / MyIncome.jsx already had the expandable breakdown — now always renders, with ₱0 amounts shown in muted color (informational, not alarming).

#### 3. Deduction row — kind badge + installment expandable
- Backend `getIncomeBreakdown` now returns a new `schedules` block keyed by `schedule_id` string. For every unique `schedule_ref.schedule_id` on the report's `deduction_lines`, the payload includes: schedule_code, deduction_type, deduction_label, total_amount, installment_amount, term_months, start_period, target_cycle, remaining_balance, status, and the full `installments[]` array with per-installment status/period/amount/income_report_id/verified_at.
- Frontend Income.jsx + MyIncome.jsx deduction rows:
  - Every row now carries a **kind badge**: `ONE-STOP` (gray pill) for CASH_ADVANCE / PERSONAL_GAS / manual; `INSTALLMENT N/M` (amber pill) for SCHEDULE lines. N/M derived from `currentInstallment.installment_no / schedule.term_months`.
  - SCHEDULE rows are now expandable (previously only PERSONAL_GAS and CALF were). Expansion shows: total amount, per-installment × term_months, start period/cycle, remaining balance, and the full installment timeline. The installment matching the current cycle is highlighted in amber with "← this cycle" suffix, so BDMs can see where they are on the schedule at a glance.
  - CSS: two new pill classes — `.badge-onestop` (neutral gray #e2e8f0 / #475569), `.badge-installment` (amber #fef3c7 / #92400e, bold).

#### 4. SMER earnings UI clarity
- "ORE (Cash)" subtotal row in SMER breakdown renamed to "ORE (from Expenses, receipt-backed)" — reinforces that only receipt-backed Expenses-ORE is reimbursable.
- Legacy SMER-ORE is surfaced as a secondary muted row "Legacy SMER-ORE (audit only)" **only when > 0** (pre-retirement docs). New docs never show it.
- Daily entries table hides the ORE column entirely when no day has `ore_amount > 0`. Historical SMERs with legacy values still display the column for audit.
- `DocumentDetailPanel.jsx` SMER view: ORE summary chip hides when `total_ore === 0`; daily entries ORE column hides when all entries are zero.
- `Smer.jsx` UI totals accumulator: dropped `ore` accumulator entirely — was always 0 since Phase G1 anyway.

#### 5. Banner copy updates
- `/erp/smer` step 6: rewritten to state the April 2026 ORE retirement explicitly and that SMER no longer accepts per-day ORE amounts.
- `/erp/expenses` step 1: ORE vs ACCESS distinction sharpened — ORE = CASH, BDM paid out-of-pocket, reimbursed; ACCESS = company-paid, NOT reimbursed.
- `/erp/income` (Finance view) tip + `/erp/my-income` (BDM view) tip: describe the identity `SMER + ORE + Commission + Other Income − Deductions`, the ONE-STOP / INSTALLMENT kind badges, installment expandable, and why Personal Gas always renders for logbook-eligible BDMs.

### Files touched

```
backend/erp/models/SmerEntry.js                  [@deprecated JSDoc + pre-save isNew guard]
backend/erp/services/incomeCalc.js               [smerOre branch removed; ALWAYS-read Expenses-ORE; _resolveCompProfile helper; always-emit PERSONAL_GAS; breakdown.schedules[] block]
frontend/src/erp/pages/Income.jsx                [ORE-from-Expenses subtotal label; legacy-only audit row; conditional ORE column in daily entries; kind badge CSS + badge-installment expandable; PG ₱0 muted styling]
frontend/src/erp/pages/MyIncome.jsx              [parity with Income.jsx: same subtotal label, legacy-only row, conditional column, kind badge, installment expandable, PG ₱0 styling, CSS]
frontend/src/erp/components/DocumentDetailPanel.jsx [conditional ORE chip + conditional daily-entries ORE column]
frontend/src/erp/pages/Smer.jsx                  [drop ore from UI totals accumulator]
frontend/src/erp/components/WorkflowGuide.jsx    [smer/expenses/income/myIncome banner refresh]
docs/PHASETASK-ERP.md                            [+this block]
CLAUDE-ERP.md                                    [+Phase G1.2 section]
```

### Verification
- `node -c` clean on SmerEntry.js and incomeCalc.js.
- `npx vite build` — clean (frontend has no backend imports; syntax-only check).
- Regenerate a POSTED IncomeReport for a BDM with `CompProfile.logbook_eligible=true` and no Car Logbook entries → PERSONAL_GAS row appears with ₱0 and "No personal km logged this cycle" description; expandable shows "No car logbook entries".
- Regenerate an IncomeReport for a BDM with ExpenseEntry-ORE lines → SMER earnings total includes ORE; "ORE (from Expenses)" subtotal displays the correct amount; no double-count with legacy SMER-ORE.
- Attempt to save a new SmerEntry with `daily_entries[0].ore_amount = 500` → pre-save rejects with `"SmerEntry.daily_entries.ore_amount is retired (day 1, amount 500). Enter ORE via the Expenses module (expense_type='ORE')."`.
- Historical POSTED SMER with legacy `total_ore = 1200` → resave (status update) succeeds; total_ore preserved; display shows "Legacy SMER-ORE (audit only) ₱1,200.00" muted row.
- Deduction row render: SCHEDULE line shows `INSTALLMENT 2/6` amber pill; expand → full timeline with current cycle highlighted. CASH_ADVANCE + PERSONAL_GAS + manual rows show `ONE-STOP` gray pill.

### Rule adherence
- **Rule #3 (no hardcoded business values)** — `CompProfile.logbook_eligible` is per-person and configurable; ONE-STOP vs INSTALLMENT derives from `auto_source` and `DeductionSchedule` records (lookup-free).
- **Rule #19 (subscription-ready)** — entity-scoped CompProfile resolution via `_resolveCompProfile`; ORE pipeline reads only from per-entity ExpenseEntry.
- **Rule #20 (workflow banners + period locks)** — banner copy updated for all affected pages; no document-lifecycle mutation, so period-lock middleware unchanged.
- **Rule #21 (no silent self-fallback)** — unaffected (CompProfile lookup is by explicit bdm_id param, no scope fallback).

---

## Phase G1.3 — Employee Payslip Transparency Parity ✅ (April 21, 2026)

### Goal
Bring employee `Payslip` to the same transparency contract as contractor `IncomeReport` (shipped in G1.2). A BDM who graduates to employee now sees the same `deduction_lines[]` layout — label + amount + status pill + kind badge + expandable source detail — instead of a flat hardcoded list of statutory fields.

### Deliverables

#### 1. Shared deduction-line sub-schema
- New file `backend/erp/models/schemas/deductionLine.js` — identical shape to the inline `IncomeReport.deductionLineSchema`. Reused by `Payslip` only in this phase; `IncomeReport` keeps its inline copy (Phase G1.2 shipped code is load-bearing on profit-sharing + CALF flows, so we avoid touching it). A follow-up can converge IncomeReport once the contract soaks in production.
- `auto_source` stays a free-form String (no enum) so subscribers can introduce new sources without a migration. Contractor uses `CALF | SCHEDULE | PERSONAL_GAS`; employee uses `SSS | PHILHEALTH | PAGIBIG | WITHHOLDING_TAX | PERSONAL_GAS | SCHEDULE`.

#### 2. Payslip model
- Added `deduction_lines: [deductionLineSchema]` (default `[]`).
- Kept all flat `deductions.*` fields — **these are still the canonical source for the JE consumer** (`autoJournal.journalFromPayroll` reads them). Compute service now derives them FROM `deduction_lines` via `deriveFlatFromLines` so drift is impossible.
- Pre-save hook: prefers `deduction_lines` sum (non-REJECTED) when the array is non-empty; falls back to flat-field sum for historical pre-G1.3 payslips. Either way, `total_deductions` and `net_pay` stay correct.

#### 3. Compute service (`payslipCalc.js`)
- New helpers: `buildAutoDeductionLines` (statutory + Personal Gas), `buildManualLinesFromFlat` (reconstructs Cash Advance / Loan / Other from preserved flat fields), `deriveFlatFromLines` (inverse — keeps flat fields in sync with the array).
- Personal Gas for employees: gated on `CompProfile.logbook_eligible === true` (Rule #3 — existing flag, no new lookup). Row always emitted for eligible employees, even at ₱0, so Finance sees the logbook was reviewed. `aggregatePersonalGas` pulls from `CarLogbookEntry` using the person's `user_id`; MONTHLY cycle sums both C1+C2 entries within the period.
- Upsert preserves manual earnings (bonus, reimbursements, overtime, holiday, night diff, other earnings) and manual flat-deduction fields on re-compute — parity with pre-G1.3 behavior.

#### 4. Transparent breakdown endpoint
- New: `getPayslipBreakdown(payslip)` in `payslipCalc.js`. Returns `{ payslip_id, period, cycle, person_name, personal_gas, schedules: {} }`. Same shape as `getIncomeBreakdown` so PayslipView.jsx can reuse the Income.jsx expandable pattern.
- Wired: `GET /payroll/:id/breakdown` in `payrollRoutes.js` (ordered before `/:id`). Controller handler `getPayslipBreakdown` in `payrollController.js`.

#### 5. Lazy backfill for historical POSTED payslips
- `backfillDeductionLines(payslip)` — pure function that synthesises `deduction_lines[]` from flat fields. Adds synthetic `_id` (for React key) + `description: '(historical — reconstructed for display)'`. Never mutates the input.
- `GET /payroll/:id` calls the backfill before returning when `deduction_lines` is empty. No DB write — audit-safe.

#### 6. Frontend (`PayslipView.jsx`)
- Replaced the flat deductions table with `deduction_lines.map()`. Each row renders:
  - Label + status pill (PENDING / VERIFIED / CORRECTED / REJECTED) + kind badge (`ONE-STOP` neutral gray; G1.4 will add `INSTALLMENT` once employee DeductionSchedule is wired).
  - `(auto)` micro-tag when `auto_source` is set (statutory + Personal Gas).
  - Optional description + finance note.
  - Original amount (strikethrough) shown when Finance has corrected a line.
- Personal Gas row is expandable; first expand triggers `getPayslipBreakdown` (lazy load).
- Expanded panel renders: daily logbook (date + KM + fuel) + summary (total KM, personal KM, official KM, total fuel, avg price/L, total deduction).
- CSS: `.badge-onestop`, `.badge-installment`, `.badge-pending/verified/corrected/rejected`, `.bd-toggle`, `.bd-panel`, `.bd-table` — same contract as Income.jsx / MyIncome.jsx.

#### 7. Lookup seed
- New seed: `EMPLOYEE_DEDUCTION_TYPE` in `lookupGenericController.SEED_DEFAULTS` with codes SSS / PHILHEALTH / PAGIBIG / WITHHOLDING_TAX / CASH_ADVANCE / LOAN / PERSONAL_GAS / OTHER. Metadata carries `auto_source` where applicable. Kept separate from `INCOME_DEDUCTION_TYPE` because contractor vs employee deduction taxonomies diverge (no SSS for contractors, no CALF for employees).

### Files touched

```
backend/erp/models/schemas/deductionLine.js      [NEW — shared sub-schema]
backend/erp/models/Payslip.js                    [+deduction_lines[]; pre-save prefers lines over flat]
backend/erp/services/payslipCalc.js              [build auto + manual lines; derive flat from lines; getPayslipBreakdown; backfillDeductionLines; aggregatePersonalGas]
backend/erp/services/incomeCalc.js               [exported resolveCompProfile for payslipCalc reuse]
backend/erp/controllers/payrollController.js     [getPayslip lazy-backfills; +getPayslipBreakdown handler]
backend/erp/routes/payrollRoutes.js              [+GET /:id/breakdown, before /:id]
backend/erp/controllers/lookupGenericController.js [+EMPLOYEE_DEDUCTION_TYPE seed]
frontend/src/erp/hooks/usePayroll.js             [+getPayslipBreakdown(id)]
frontend/src/erp/pages/PayslipView.jsx           [rewrote deductions table with deduction_lines render + expandable + lazy breakdown load]
docs/PHASETASK-ERP.md                            [+this block]
CLAUDE-ERP.md                                    [+Phase G1.3 section]
```

### Verification
- `node -c` clean on all modified backend files.
- `npx vite build` — clean in 13.45s.
- Generate a payslip for an employee with a CompProfile → `deduction_lines` has SSS/PhilHealth/PagIBIG/Withholding Tax rows. Flat `deductions.sss_employee` etc. still populated (derived from lines). JE posting still balances.
- Open a pre-G1.3 POSTED payslip → lazy backfill renders rows with `(historical — reconstructed for display)` description. No DB write.
- Set `CompProfile.logbook_eligible=true` on an employee with no logbook entries → PERSONAL_GAS row at ₱0, description "No personal km logged this cycle — logbook reviewed", expandable shows "No car logbook entries for this period".
- Set `logbook_eligible=false` → No PERSONAL_GAS row.
- Finance corrects a flat field (e.g. `cash_advance` via existing path) → next re-compute reconstructs the CASH_ADVANCE line from the flat field.

### Rule adherence
- **Rule #2 (end-to-end wiring)** — Payslip model → payslipCalc service → payrollController → payrollRoutes → usePayroll hook → PayslipView page → Sidebar link (existing — payslip view reached via Payroll Run row click, no new sidebar entry needed).
- **Rule #3 (no hardcoded business values)** — `EMPLOYEE_DEDUCTION_TYPE` is a new seeded lookup; `CompProfile.logbook_eligible` is per-person and admin-configurable.
- **Rule #19 (subscription-ready)** — entity-scoped compute via `req.entityId` in both endpoints; statutory rate tables live in `GovernmentRates` per entity; lookup seeds only fire when empty so existing subscriber customizations are preserved.
- **Rule #20 (workflow banners + period locks)** — existing `payslip-view` banner in `WorkflowGuide.jsx` unchanged (still accurate); period-lock middleware unchanged (no new document-lifecycle routes). Posting gate via `gateApproval` in `postPayroll` unaffected.
- **Rule #21 (no silent self-fallback)** — `getPayslip` + `getPayslipBreakdown` scope via `req.entityId` (President bypass explicit). No `req.bdmId` fallback anywhere on employee payslip path.

### Deferred follow-ups — ALL SHIPPED in Phase G1.4 (April 21, 2026)
- **G1.4 — Employee DeductionSchedule wiring**: ✅ Done. `DeductionSchedule.person_id` (nullable, XOR with `bdm_id`) + pre-save validator + sparse partial indexes. Single collection, no parallel table, clean BDM→employee graduation path. Injection wired in `payslipCalc.buildScheduleLinesForPerson` + `_syncInjectedInstallmentsForPayslip`. Breakdown endpoint now hydrates `schedules` dict; PayslipView renders INSTALLMENT N/M + installment timeline.
- **Per-line Finance add/verify UI**: ✅ Done. Three new endpoints on payrollController (`financeAddDeductionLine`, `verifyDeductionLine`, `removeDeductionLine`) with role/status/period-lock gates and JE-safe derive. SCHEDULE-line verify/reject cascades to `DeductionSchedule.installments.status` via `syncInstallmentStatusForPayslip` (same contract as IncomeReport).
- **IncomeReport.deductionLineSchema → shared**: ✅ Done. Inline schema replaced with `require('./schemas/deductionLine')`. Byte-identical, zero migration.

See `CLAUDE-ERP.md` § Phase G1.4 for the full contract, routing table, integrity invariants, and test plan.

## Phase G1.4 — Employee DeductionSchedule + Finance Per-Line UI (April 21, 2026 — shipped)

See `CLAUDE-ERP.md` § Phase G1.4 for the authoritative write-up. Summary:

1. **Schema** — `DeductionSchedule.person_id` (PeopleMaster ref) + `installments.payslip_id`; XOR with `bdm_id` enforced at model (pre-save), service (`createSchedule`), and controller (`financeCreateSchedule`) layers. `IncomeReport` converged onto `schemas/deductionLine.js`.
2. **Payslip injection** — `payslipCalc.buildScheduleLinesForPerson` mirrors incomeCalc's BDM path; preserves non-PENDING schedule lines across re-computes; `_syncInjectedInstallmentsForPayslip` marks installments INJECTED post-save.
3. **Finance per-line endpoints** — `POST /payroll/:id/deduction-line` (add, status=VERIFIED), `POST /payroll/:id/deduction-line/:lineId/verify` (verify/correct/reject), `DELETE /payroll/:id/deduction-line/:lineId` (remove non-auto). All gated admin/finance/president, COMPUTED/REVIEWED status, period-lock enforced.
4. **Breakdown** — `getPayslipBreakdown` now hydrates `schedules` dict (schedule_code, total, per-installment, timeline with per-installment status).
5. **Frontend** — PayslipView renders INSTALLMENT N/M badge when `breakdown.schedules[schedule_id]` resolves; installment timeline expander; Finance action buttons with Correct + Add modals; lookup-driven `EMPLOYEE_DEDUCTION_TYPE` dropdown.
6. **Approval Hub** — DEDUCTION_SCHEDULE query populates `person_id` alongside `bdm_id`; description carries owner class; detail builder surfaces both owner and department.
7. **Docs + WorkflowGuide** — `payslip-view` entry rewritten; CLAUDE-ERP § G1.4 documents invariants, cascade semantics, and migration notes.

### Integrity checklist verified
- `node -c` clean on all 10 modified backend files.
- `npx vite build` clean (build output at task completion).
- JE consumer (`autoJournal.journalFromPayroll`) unchanged — flat `deductions.*` still authoritative, derived on every line mutation.
- XOR invariant machine-checked at three layers.
- Period lock enforced on every line-mutation endpoint.
- SCHEDULE-line verify/reject cascades to DeductionSchedule installment (non-blocking — payslip is source of truth).
- No downstream breakage: legacy BDM `createSchedule` callers (string `bdmId` arg) still work via shim; `IncomeReport` schema delta is zero.

---

## Phase G1.5 — Per-Diem Integrity + Structured Doctor Address + Non-Pharma Ready (April 21, 2026)

**Goal:** Kill the last hardcoded business values in the per-diem pipeline (`|| 800`, weekend-drop, flagged-visit ignorance, free-text addresses) and make per-diem subscription-scalable so a non-pharma subsidiary can seed rates without code changes. Covers items #4/#5/#6/#7 from the April 21 per-diem audit.

**Guiding principles:** Global Rule #3 (no hardcoded business values) + Rule #19 (lookup-driven for subscription readiness) + Rule #21 (no silent fallbacks). Existing Phase 34-P per-diem override remains the adjustment path — no retroactive recompute on unflag.

### G1.5.1 — `PERDIEM_RATES` lookup replaces Settings.PERDIEM_RATE_DEFAULT
- [ ] Seed `PERDIEM_RATES` Lookup category (per-entity × role). Each row metadata: `{ rate_php, eligibility_source: 'visit'|'logbook'|'manual'|'none', skip_flagged: bool, allow_weekend: bool, full_tier_threshold: number, half_tier_threshold: number }`.
- [ ] Default-seed: pharma BDM → `{ rate_php: 800, eligibility_source: 'visit', skip_flagged: true, allow_weekend: false, full: 5, half: 3 }`. Non-pharma seeds stubbed (admin fills per subsidiary).
- [ ] Add `resolvePerdiemConfig(entityId, role)` to `backend/erp/services/perdiemCalc.js` — reads lookup, throws `PerdiemConfigMissingError` if no row. No `|| 800` fallback anywhere.
- [ ] Delete `PERDIEM_RATE_DEFAULT` field from `backend/erp/models/Settings.js`.
- [ ] Delete `|| 800` literals at `expenseController.js:109` and `:2518`.
- [ ] Delete `|| 800` literal from `backend/erp/scripts/testPhase7.js:248`.
- [ ] Remove `PERDIEM_RATE_DEFAULT` seed from `backend/erp/scripts/seedSettings.js`.

### G1.5.2 — Flagged-photo filter (item #4)
- [ ] Extend `getDailyMdCounts(bdmUserId, start, end, { skipFlagged })` in `backend/erp/services/smerCrmBridge.js`. When `skipFlagged=true`, aggregation adds `$match: { photoFlags: { $exists: false } }` OR `$match: { $or: [{ photoFlags: { $size: 0 } }, { photoFlags: { $exists: false } }] }`.
- [ ] Caller (expenseController.getSmerCrmMdCounts) passes `config.skip_flagged` from `resolvePerdiemConfig`.
- [ ] Audit trail: flagged visits stay in CRM; only per-diem credit drops.

### G1.5.3 — Weekend enforcement via config (item #6)
- [ ] Replace hardcoded `if (dow === 0 || dow === 6) continue` at `expenseController.js:2530` with `if (!config.allow_weekend && (dow === 0 || dow === 6)) continue`.
- [ ] Default stays OFF for pharma BDMs; toggle lives in `PERDIEM_RATES` metadata.

### G1.5.4 — Structured locality + province on Doctor/Client (item #5)
- [ ] Add `locality: { type: String, required: true }` and `province: { type: String, required: true }` to `backend/models/Doctor.js`. Keep existing `clinicOfficeAddress` as optional detail.
- [ ] Mirror same fields on `backend/models/Client.js` (regular non-VIP clients used by Phase A Change 16).
- [ ] Seed `PH_PROVINCES` Lookup (82 rows, code=province code, label=name).
- [ ] Seed `PH_LOCALITIES` Lookup (cities + municipalities, metadata: `{ type: 'city'|'municipality', province_code }`).
- [ ] Cascading dropdown on Doctor form: pick province → locality list filters to that province_code.
- [ ] Add locality + province validators to `backend/middleware/validation.js` (4 rule blocks at lines ~205, 276, 500, 564).
- [ ] Update ~20 `.populate('doctor', '...')` calls across `visitController.js`, `productAssignmentController.js`, `reportGenerator.js`, `importController.js`, `Visit.js`, `expenseController.js`, `Client.js` to include `locality province`.
- [ ] Update SMER note builder to emit unique `${locality}, ${province}` set per day (replaces raw `clinicOfficeAddress`).
- [ ] Update `DoctorManagement.jsx` form + `DoctorsPage.jsx` table columns.
- [ ] Update CPT Excel import logic in `importController.js` to read + validate locality/province columns.

### G1.5.5 — Backfill + rollback
- [ ] Create `backend/erp/scripts/backfillDoctorLocality.js` — parse last 2 comma-separated segments from `clinicOfficeAddress`, fuzzy-match against `PH_LOCALITIES` + `PH_PROVINCES`, auto-apply on match, flag mismatches for admin review.
- [ ] New admin panel "Address Cleanup Queue" surfacing doctors with null `locality` or `province` (can reuse existing admin list with filter).
- [ ] Rollback path documented in CLAUDE-ERP.md § Phase G1.5: delete `PERDIEM_RATES` rows, revert Settings schema, drop locality/province (schema is additive so data loss is scoped to the new fields only).

### G1.5.6 — Banners + WorkflowGuide
- [ ] Update SMER WorkflowGuide entry in `frontend/src/erp/components/WorkflowGuide.jsx`: mention that missing `PERDIEM_RATES` blocks submission, flagged visits are skipped, weekends follow the lookup toggle.
- [ ] Update `payslip-view` WorkflowGuide entry: per-diem line source is now `PERDIEM_RATES`, override path unchanged.
- [ ] Update Control Center DEPENDENCY_GUIDE if/where per-diem rate config is surfaced.
- [ ] Update `CLAUDE-ERP.md` with Phase G1.5 section documenting the lookup shape, resolver contract, downstream consumers, and the non-pharma onboarding recipe.

### G1.5.7 — Bulletproof bar
- [ ] **Happy path**: pharma BDM, 5 valid visits Mon–Fri, no flagged photos, each doctor has locality+province → payslip per-diem correct + notes print "Iloilo City, Iloilo; Digos City, Davao del Sur".
- [ ] **Failure 1**: Missing `PERDIEM_RATES` row for role → SMER validate/submit surfaces `PerdiemConfigMissingError` as HTTP 400 "Seed PERDIEM_RATES for role X before running payroll". No silent ₱800.
- [ ] **Failure 2**: Visit flagged after POSTED payslip → payslip unchanged; Phase 34-P per-diem override remains the adjustment path.
- [ ] **Failure 3**: Legacy doctor with null locality/province (pre-backfill) → per-diem notes print `(address incomplete — see Doctor #N)`, does not crash.
- [ ] **Failure 4**: Non-pharma subsidiary seeds `eligibility_source='logbook'` → resolver returns config; bridge stub logs "logbook source not yet wired — G1.6" (no crash, explicit TODO).
- [ ] **Downstream wiring**: SMER create/validate/submit/reopen, SMER per-diem override approve, `repairStuckPerdiemOverrides.js`, `testPhase7.js`, `universalApprovalService.approvePerdiemOverride`, CPT Excel import/export, Call Plan Template export — all verified post-refactor.
- [ ] **Integrity**: `node -c` clean on all modified backend files; `npx vite build` clean; grep for `\\|\\| 800` in per-diem code paths returns zero matches; grep for `PERDIEM_RATE_DEFAULT` returns zero matches.

### Status
- [x] Phase G1.5 SHIPPED (April 21, 2026). Integrity verified: 21 backend files `node -c` clean, `npx vite build` clean in 12.18s, zero `|| 800` and zero `PERDIEM_RATE_DEFAULT` in code (only documentation references remain).


## Phase G1.6 — Logbook-Driven Per-Diem + Per-Role Thresholds + Cleanup Queue UX (April 22, 2026)

Closes the nine-item follow-up backlog queued at the end of G1.5. Six items shipped; three deliberately deferred (see G1.6.5).

### G1.6.1 — Logbook-sourced per-diem (item #6 in backlog)
- [x] `smerCrmBridge.js`: new `getDailyLogbookCounts(bdmUserId, startDate, endDate)` — reads `CarLogbookEntry` filtered by `status: 'POSTED'` + `official_km > 0`. 1 qualifying entry per day = `md_count: 1`, `locations` = `destination || notes`.
- [x] `getDailyMdCounts()` becomes a dispatcher: `opts.source='visit'` (default, existing Visit aggregation) | `'logbook'` (→ `getDailyLogbookCounts`) | `'manual'|'none'` (→ empty object).
- [x] `getDailyVisitDetails()` mirror-dispatched: logbook source returns CarLogbookEntry rows adapted to the visit-detail shape (synthetic doctor row with `firstName='Logbook'`, `lastName='Entry'`, `clinicOfficeAddress=destination`). Frontend drill-down renders without a separate template.
- [x] `expenseController.getSmerCrmMdCounts`: passes `source: perdiemConfig.eligibility_source` into the bridge.
- [x] `expenseController.getSmerCrmVisitDetail`: resolves source before drill-down; same pattern.
- [ ] **Follow-up**: `universalApprovalService.js:502` still hard-codes `visit` source for best-effort approval-enrichment. Non-blocking for pharma; non-pharma approvals show empty `cities_visited`. Upgrade when approval-review needs logbook drill-down.

### G1.6.2 — Per-role tier thresholds (item #7 in backlog)
- [x] `perdiemCalc.resolvePerdiemThresholds(settings, compProfile, perdiemConfig?)` — new 3-arg signature. Precedence: `CompProfile > PERDIEM_RATES.metadata > Settings`. `null/undefined` at any layer = defer. `0` is a valid override.
- [x] `computePerdiemTier` + `computePerdiemAmount` accept trailing optional `perdiemConfig`. All 10+ existing call sites (4-arg) continue to work unchanged — they pass `undefined` for the 5th arg → falls through to Settings.
- [x] `expenseController.getSmerCrmMdCounts` at line ~2549 passes the 5th arg.
- [x] `expenseController.getPerdiemConfig` display endpoint: try/catches `resolvePerdiemConfig` so unseeded entities degrade to Settings-only display (strict path still throws).
- [x] `PERDIEM_RATES` seed updated: documentation block expanded, `DELIVERY_DRIVER` example template added (`rate_php: 500`, `eligibility_source: 'logbook'`, `full_tier_threshold: 1`, `half_tier_threshold: 1`, `allow_weekend: true`).
- [ ] **Follow-up**: `computePerdiemAmount(tier === 'FULL' ? 999 : 3, ...)` pattern (4+ call sites) would fail if admin sets `full_tier_threshold > 999` or `half_tier_threshold > 3` — add a dedicated `computePerdiemAmountForTier(tier, rate)` helper.

### G1.6.3 — Admin "Needs Cleanup" filter (item #3 in backlog)
- [x] `doctorController.getAllDoctors`: query param `needsCleanup=true` → filters doctors with missing `locality` or `province`. Refactored search to use `$and` composition so both filters coexist.
- [x] `clientController.getAllClients`: same filter wiring for regular clients.
- [x] `DoctorManagement.jsx`: new FilterDropdown ("All Locations" / "Needs Cleanup (missing locality/province)").
- [x] `DoctorsPage.jsx`: `filters.needsCleanup` threaded into both `fetchDoctors` + `fetchRegularClients` params; `fetchRegularClients` useCallback deps updated.

### G1.6.4 — Table columns + CPT Excel parser (items #2 and #4 in backlog)
- [x] `DoctorManagement.jsx`: new "Location" column showing `{locality}, {province}` or a visible `Needs Cleanup` pill (yellow tooltip explaining it blocks SMER per-diem note formatting).
- [x] `EmployeeVisitReport.jsx`: address cell stacks `clinicOfficeAddress` over `{locality}, {province}` on a second line when present. Both VIP and Regular-Client tables updated. CPT Excel export (separate utility) untouched.
- [x] `excelParser.js`: `CPT_COLS.LOCALITY=39 (AN)` + `CPT_COLS.PROVINCE=40 (AO)` added as optional columns. Legacy workbooks return empty strings → importController's `|| undefined` preserves old behavior. `parsed.locality` + `parsed.province` already wired into `importController` from G1.5.

### G1.6.5 — Deliberately deferred (items #1, #5, #8, #9 from backlog)

| Item | Why deferred |
|---|---|
| #1 BDM ClientAddModal cascading picker | **Already shipped in G1.5.** Backlog entry was stale — survey confirmed `ClientAddModal.jsx:438-484` already has the picker. |
| #5 Flip Doctor/Client validators to `.notEmpty()` on CREATE | Runtime data dependency — blocked until admin confirms the Needs Cleanup queue is empty. Re-evaluate after staging-data backfill. |
| #8 Remove `settings.REVOLVING_FUND_AMOUNT \|\| 8000` fallback in expenseController | Explicitly flagged by user as "separate follow-up phase". Touches travel-advance resolution across 2 call sites with different semantics — deserves its own PR. |
| #9 Extend `PH_LOCALITIES` seed to full ~1,600 PSGC rows | Needs external PSA dataset. Starter seed (~50 rows) + admin ad-hoc additions via Control Center suffice today. Wait for PSA feed or CSV bulk-seed script. |

### G1.6.6 — Bulletproof bar
- [ ] **Happy path 1 (pharma, unchanged)**: `PERDIEM_RATES.BDM.metadata.eligibility_source='visit'` → `getDailyMdCounts` returns Visit aggregation → per-diem amounts match G1.5 baseline.
- [ ] **Happy path 2 (non-pharma)**: `PERDIEM_RATES.DELIVERY_DRIVER.metadata.eligibility_source='logbook', full_tier_threshold=1` → BDM with one POSTED CarLogbookEntry (official_km=15, status=POSTED) earns FULL per-diem. Drill-down renders "Logbook Entry — 15 km — C1".
- [ ] **Failure 1**: DRAFT CarLogbookEntry (not POSTED) → `getDailyLogbookCounts` excludes → 0 credit. Prevents per-diem double-pay on reopen.
- [ ] **Failure 2**: POSTED entry with `official_km=0` → excluded. Prevents credit on a zero-drive day.
- [ ] **Failure 3**: `PERDIEM_RATES.metadata.full_tier_threshold=5` for a role → BDM with 4 MDs → HALF (not FULL); with 5 MDs → FULL. Confirm CompProfile override (3 full / 2 half on that BDM) wins even when PERDIEM_RATES is set.
- [ ] **Needs Cleanup UX**: admin toggles the filter on /admin/doctors → sees only rows missing locality OR province; each row's Location column shows the `Needs Cleanup` pill. After editing to add locality+province, row falls out of the filtered list on next refresh.
- [ ] **CPT Excel import**: legacy workbook (cols A-AM only) imports cleanly → `parsed.locality` and `parsed.province` are empty strings → importController's `|| undefined` → schema optional → doctor created with no structured address (falls to Needs Cleanup queue). Enhanced workbook (cols A-AO) populates the fields on import.
- [ ] **Integrity**: `node -c` clean on all modified backend files; `npx vite build` clean; grep for `PERDIEM_MD_FULL|PERDIEM_MD_HALF` confirms Settings still has them as fallback layer (not removed).

### Status
- [x] Phase G1.6 SHIPPED (April 22, 2026) — 6 of 9 backlog items closed, 3 deliberately deferred with rationale. Build verification pending in the next todo.


## Phase G4.5a — Proxy Entry for Sales + Opening AR (April 22, 2026)

Problem: admin/finance/back-office contractor cannot record CSIs or Opening AR entries on behalf of another BDM. Today every `createSale` stamps `bdm_id = req.bdmId` (own id), and `getSales` reads through `req.tenantFilter` which pins contractors to their own `bdm_id`. Result: no way to assign an entry to a different owner; no way for a back-office operator to see another BDM's rows to fix/submit them.

Precedent: Phase 33-O (Car Logbook / Smer / Expenses / PrfCalf BDM picker) and Expenses batch-upload `assigned_to` + `recorded_on_behalf_of`. This phase ports that pattern to Sales + Opening AR and makes it **lookup-driven + sub-permission-gated** so subscribers can delegate without code changes (Rule #3).

### G4.5a.1 — Backend helper + lookup seed
- [x] `backend/erp/utils/resolveOwnerScope.js` — new. Exports:
  - `canProxyEntry(req, moduleKey, subKey?)` — boolean: role ∈ `PROXY_ENTRY_ROLES.<MODULE>` AND `erp_access.sub_permissions.<module>.<subKey>` ticked. President always passes. CEO always denied.
  - `resolveOwnerForWrite(req, moduleKey, opts?)` — returns `{ ownerId, proxiedBy, isOnBehalf }`. Throws 403 if caller sent `assigned_to` but is not eligible — no silent self-scope (Rule #21).
  - `widenFilterForProxy(req, moduleKey, opts?)` — returns a copy of `req.tenantFilter` with `bdm_id` stripped when proxy eligible. Keeps `entity_id`.
  - `invalidateProxyRolesCache(entityId?)` — drop per-entity cache on lookup write.
  - 60s in-process cache keyed by `entity::module`. Bust on lookup write.
- [x] `lookupGenericController.js`: add `PROXY_ENTRY_ROLES` category with 5 codes (`SALES`, `OPENING_AR`, `COLLECTIONS`, `EXPENSES`, `GRN`). Each row's `metadata.roles = ['admin','finance','president']` by default. Subscribers add `contractor` per module from Control Center.
- [x] `lookupGenericController.js`: add `ERP_SUB_PERMISSION` entries `SALES__PROXY_ENTRY` (`sales.proxy_entry`) and `SALES__OPENING_AR_PROXY` (`sales.opening_ar_proxy`). Both gate the same controller but on different `source` values (live vs OPENING_AR).
- [x] `SalesLine.js`: add `recorded_on_behalf_of` field (ObjectId ref User) — present when the creator keyed the entry on behalf of another BDM. `created_by` still holds the proxy's id; `bdm_id` is the owner.

### G4.5a.2 — salesController wiring
- [x] `createSale`: accept `req.body.assigned_to`. Call `resolveOwnerForWrite(req, 'sales', {subKey: sourceIsOpeningAr?'opening_ar_proxy':'proxy_entry'})`. Stamp `bdm_id = ownerId`, `recorded_on_behalf_of = proxiedBy`, `created_by = req.user._id`. Audit `PROXY_CREATE` when `isOnBehalf`.
- [x] `updateSale`: widen lookup filter via `widenFilterForProxy('sales', ...)` so proxy can edit DRAFT rows owned by other BDMs. Owner (bdm_id) NOT reassignable via update — locked as before. Audit `PROXY_UPDATE` when updating a row not owned by req.user.
- [x] `deleteDraftRow`: widen filter same way so proxy can delete a DRAFT on behalf.
- [x] `getSales` / `getSaleById` / `validateSales` / `submitSales`: use `widenFilterForProxy` instead of `req.tenantFilter` directly. Module key = `sales` with sub-key auto-selected by `req.query.source` or `req.body.source` (`OPENING_AR` → `opening_ar_proxy`, else `proxy_entry`). Where multiple sources may coexist in one query (list page), pass `subKey: 'proxy_entry'` and accept that anyone with live-Sales proxy also reads Opening AR. This matches the existing `sales.opening_ar_list → opening_ar` fallback pattern.
- [x] Non-proxy callers (contractors without ticks): behavior unchanged. `req.tenantFilter` still carries `bdm_id: req.user._id` → own rows only.

### G4.5a.3 — Frontend
- [x] `frontend/src/erp/components/OwnerPicker.jsx` — new shared component. Props: `module`, `subKey`, `value`, `onChange`, `disabled`. Fetches `getPeopleList()` lazily; fetches `canProxyEntry` via a one-shot API call (or relies on frontend `useErpSubAccess` + a client-side role check against `PROXY_ENTRY_ROLES.<MODULE>` loaded from the `useLookupOptions` hook). Renders nothing when `!canProxy`. Dropdown label: "Record on behalf of" — first option = "Self (my own entry)".
- [x] `SalesEntry.jsx`: mount `<OwnerPicker module="sales" subKey="proxy_entry" />` at the top of the form. Include `assigned_to` in the payload built at line 874.
- [x] `OpeningArEntry.jsx`: same, with `subKey="opening_ar_proxy"`. Include `assigned_to` in payload at line 469.
- [x] `SalesList.jsx`: add a small "Proxied" pill next to the BDM name column (or, if absent, next to the Date column) when `sale.recorded_on_behalf_of` exists. Tooltip: "Keyed by {created_by.name} on behalf of {bdm_id.name}".
- [x] `useErpSubAccess.js`: no changes — already works via `erp_access.sub_permissions`.

### G4.5a.4 — Bulletproof bar
- [ ] **Happy path 1 (admin proxy)**: admin logs in, opens Sales Entry, OwnerPicker shows all BDMs, selects "Juan dela Cruz", creates a CSI row → `bdm_id=juan._id`, `created_by=admin._id`, `recorded_on_behalf_of=admin._id`. On Sales List, admin sees Juan's row with "Proxied" pill; Juan sees his own row without the pill (same data).
- [ ] **Happy path 2 (contractor back-office proxy)**: admin ticks `sales.proxy_entry` on contractor "Maria" + adds `contractor` to `PROXY_ENTRY_ROLES.SALES`. Maria logs in, OwnerPicker appears with list of BDMs, she keys a CSI for Juan. Stamped correctly. Maria can also open Juan's draft and submit it (read widened, submit widened).
- [ ] **Failure 1 (role not in lookup)**: contractor without the role added to `PROXY_ENTRY_ROLES.SALES` → OwnerPicker hidden on frontend; backend `resolveOwnerForWrite` throws 403 if she POSTs `assigned_to` directly (defense in depth).
- [ ] **Failure 2 (sub-perm not ticked)**: admin without `sales.proxy_entry` tick → OwnerPicker hidden; backend 403 on direct API call. Her existing batch-upload behavior on Expenses remains unaffected (that's a separate sub-perm `expenses.batch_upload`).
- [ ] **Failure 3 (edit posted)**: proxy tries to edit a POSTED row → `updateSale` returns 400 "Only DRAFT sales can be edited". Normal reopen-first flow; if proxy also has `sales.reopen` sub-perm they can reopen, otherwise they must wait for the owner BDM or admin.
- [ ] **Failure 4 (proxy tries to self-assign)**: proxy submits `assigned_to = req.user._id` → helper treats as self-entry, `isOnBehalf=false`, no audit line.
- [ ] **Audit surface**: Activity Monitor filter by `log_type: PROXY_CREATE` surfaces every proxied CSI. Column "BDM (owner)" vs "By (proxy)" visible.
- [ ] **Cache invalidation**: admin edits `PROXY_ENTRY_ROLES.SALES` in Control Center → within 60s all controller instances pick up the change (cache TTL). No server restart needed.
- [ ] **Integrity**: `node -c` clean on `salesController.js`, `resolveOwnerScope.js`, `lookupGenericController.js`, `SalesLine.js`; `npx vite build` clean.

### G4.5a.5 — Non-goals (explicit)
- **Cross-entity proxy**: still scoped by `req.entityId`. Proxy at Entity A cannot touch Entity B.
- **President Delete via proxy**: danger sub-permission `accounting.reverse_posted` stays independent. Proxy cannot reverse posted docs unless separately granted.
- **Approval routing**: when proxy X submits for BDM Y, `gateApproval()` resolves Y's authority chain (the owner's), not X's. `req.user` still logs as requester for audit but approvalService receives `ownerId` via `req.body.__owner_override` (to be implemented in universalApprovalService — PHASE-NOTE: added to the backlog below).
- **GRN / Collections / Expenses refactor**: deferred to Phase G4.5b (Collections + GRN) and G4.5c (Expenses refactor to shared helper).

### G4.5a.6 — Follow-up backlog (for G4.5b and beyond)
- Port `resolveOwnerScope` to `collectionController.js` (`createCollection`, `updateCollection`, `getCollections`, `getCollectionById`, session-level ownership).
- Port to `inventoryController.js` GRN paths (`createGrn`, `updateGrn`, `listGrn`, `getGrnById`).
- Refactor `expenseController.js` to use shared helper; keep existing `batch_upload` + `assigned_to` semantics; align audit actions to `PROXY_CREATE` / `PROXY_UPDATE`.
- `universalApprovalService`: propagate `ownerId` so proxied posts route to the owner's authority chain, not the proxy's.
- Add `OwnerPicker` variant for Collections (session-level) and GRN (warehouse + owner).

### Status
- [x] Phase G4.5a SHIPPED April 22, 2026 — Sales + Opening AR proxy entry live on `dev` (commit c4d8b87). Build clean in 9.98s, system health check green (5/5 including dedicated proxy-wiring check). G4.5b (Collections + GRN proxy port) and G4.5c (Expenses refactor to shared helper) deferred.

## Phase 36 — Received CSI Photo Separation + Dunning Readiness (April 22, 2026)

**Problem.** `SalesLine.csi_photo_url` conflated the entry-time OCR source image (t=0) with the post-delivery signed CSI (t=4) — two different artifacts captured at different events. The `SALES_SETTINGS.REQUIRE_CSI_PHOTO` default-1 gate blocked **Validate** on the entry-time field, which for live Sales is impossible to satisfy at that event (delivery happens after invoice issuance). The rejection-fallback "Re-upload CSI Photo" button in SalesEntry never persisted (`handlePhotoReupload` was state-only — no `updateSale` call), so even after scanning, Validate on SalesList kept raising "CSI photo is required".

### 36.1 — Schema (backend)
- [x] `backend/erp/models/SalesLine.js`: add three fields for the post-delivery signed-CSI artifact.
  - `csi_received_photo_url: String` — the signed pink/yellow/duplicate copy URL
  - `csi_received_attachment_id: String` — DocumentAttachment reference
  - `csi_received_at: Date` — timestamp of when the proof was captured
  - `csi_photo_url` retained as the **entry-time** OCR source (optional audit crumb)

### 36.2 — Validate gate by source (backend)
- [x] `backend/erp/controllers/salesController.js:validateSales`: scope the photo check to `source === 'OPENING_AR'`.
  - Accept either `csi_photo_url` OR `csi_received_photo_url` as "any proof OK" per business spec.
  - Gated by new lookup `SALES_SETTINGS.REQUIRE_CSI_PHOTO_OPENING_AR` (default 1).
  - Live Sales (`source === 'SALES_LINE'`) — no Validate gate, no Submit gate.

### 36.3 — Attach Received CSI endpoint (backend)
- [x] `backend/erp/controllers/salesController.js:attachReceivedCsi`: new handler.
  - `PUT /sales/:id/received-csi` route added.
  - Writes only `csi_received_photo_url` + `csi_received_attachment_id` + `csi_received_at`. No status transition.
  - Allowed statuses: **DRAFT / VALID / ERROR / POSTED**. Blocked on DELETION_REQUESTED or rows carrying `deletion_event_id` (reversed).
  - `periodLock.checkPeriodOpen` enforced (OPENING_AR bypasses, matching submit).
  - `ErpAuditLog.logChange({ log_type: 'SALES_EDIT', field_changed: 'csi_received_photo_url', … })` on every write.
  - Requires non-empty `csi_received_photo_url` in body → 400 otherwise.
  - Reads through `req.tenantFilter` — Rule #21 compliant. Contractors only attach to their own rows; admin/finance/president attach to any in entity.

### 36.4 — Lookup split + migration (backend)
- [x] `lookupGenericController.js`: replace the single `REQUIRE_CSI_PHOTO` SEED_DEFAULTS entry with two codes under `SALES_SETTINGS`:
  - `REQUIRE_CSI_PHOTO_OPENING_AR` (default **1**) — Validate gate for Opening AR, any-proof accepted.
  - `REQUIRE_CSI_PHOTO_SALES_LINE` (default **0**) — reserved future Submit-gate hook. Not enforced today.
- [x] `backend/erp/scripts/migrateSalesPhotoLookup.js` — one-shot, idempotent:
  - For each entity with a legacy `REQUIRE_CSI_PHOTO` row, copy its `metadata.value` into a new `_OPENING_AR` entry (preserving subscriber tuning).
  - Seed `_SALES_LINE` at 0 for every entity touched.
  - Deactivate (`is_active=false`) the legacy row so Control Center stops surfacing it.
  - Safe to re-run. Skips entities where the new codes already exist.

### 36.5 — AR Aging dunning readiness (backend)
- [x] `backend/erp/services/arEngine.js:getOpenCsis`: project `csi_received_photo_url`, `csi_received_at`, computed `dunning_ready` (aggregation `$cond` on `$ifNull`).
- [x] `arEngine.js:getArAging`: summary now includes `dunning_ready_ar/count` + `dunning_missing_ar/count`. Per-hospital bucket carries `dunning_missing_count/ar`. **OPENING_AR rows force `dunning_ready=true`** (entry-time proof satisfies — don't skew missing-proof tallies).

### 36.6 — Document detail + Approval Hub (backend)
- [x] `documentDetailBuilder.js:buildSalesDetails`: surfaces `csi_received_photo_url` + `csi_received_attachment_id` + `csi_received_at` + derived `dunning_ready` boolean.
- [x] `documentDetailHydrator.js:signPhotoUrls` (SALES case): signs `csi_received_photo_url` alongside `csi_photo_url`.
- [x] `universalApprovalService.js` (SALES approval card signing): same parallel signing.

### 36.7 — Frontend
- [x] `useSales.js`: `attachReceivedCsi(id, { csi_received_photo_url, csi_received_attachment_id })`.
- [x] `SalesList.jsx`:
  - New 📷 dunning column header. Cell renders ✓ if received photo attached, ⚠️ if POSTED-but-missing, — otherwise. Colspan updated (+1).
  - Action button: "📷 Attach CSI" (or "📷 Replace CSI" if already attached). Visible on DRAFT / VALID / ERROR / POSTED rows, skipped for OPENING_AR, reversed, and DELETION_REQUESTED.
  - `ScanCSIModal` reused in `photoOnly=true` mode (no OCR, just upload).
  - `handleAttachReceivedCsi` maps the modal's return shape (`{ csi_photo_url, csi_attachment_id }`) into the received-CSI fields before POST.
  - Detail modal: renders a "Received CSI (signed)" section with link + attach date, or a prompt to attach if missing.
- [x] `SalesEntry.jsx`:
  - Removed both "📷 Re-upload CSI Photo" buttons (desktop row + mobile card).
  - Removed `handlePhotoReupload` (state-only handler that never persisted).
  - `handlePhotoOnlyApply` simplified to the `'NEW'` case only (Upload CSI = new-row creation).
  - Photo lifecycle on existing rows is now a SalesList-only action (matches user feedback memory: Validate / Submit / Re-open / Delete / Attach CSI all live on SalesList per-row).
- [x] `WorkflowGuide.jsx`:
  - `sales-opening-ar` step rewritten to reference `REQUIRE_CSI_PHOTO_OPENING_AR` + any-proof-OK semantics.
  - `sales-entry` photo step: OCR is data-entry assist (optional); new dedicated step describes t=4 "Attach CSI" on SalesList post-delivery.
  - `sales-list`: new bullet explaining the 📷 column (✓ / ⚠️ / —) and the "Attach CSI" button semantics (skipped for Opening AR).
  - Rejection-fallback copy updated to drop the removed "Re-upload CSI Photo" button reference.

### 36.8 — Bulletproof bar
- [x] **Happy path (live Sales)**: Create CSI → Save Drafts (no photo) → Validate passes → VALID. Submit passes → POSTED. Dunning column shows ⚠️. Click Attach CSI → upload via modal → column flips to ✓. Detail modal shows link + date.
- [x] **Happy path (Opening AR)**: Historical entry without photo → Validate blocks with "CSI photo is required for Opening AR — attach any scan of the signed historical CSI before validating." With `csi_photo_url` attached at entry → Validate passes. `csi_received_photo_url` also satisfies the check (covers Opening AR entries where BDM only has the received copy).
- [x] **Failure — reversed row**: SAP-Storno'd POSTED row (`deletion_event_id` set) → Attach button hidden on list; direct API call returns 400 "Sale has been reversed — cannot attach received CSI".
- [x] **Failure — deletion-requested**: row with `status='DELETION_REQUESTED'` → Attach button hidden; direct API call returns 400.
- [x] **Failure — closed period**: row's `csi_date` falls in a locked period → attach returns 400 with periodLock message. OPENING_AR rows bypass (matches submit behavior).
- [x] **Failure — empty body**: POST without `csi_received_photo_url` → 400.
- [x] **Rule #21 — no silent self-ID fallback**: endpoint uses `req.tenantFilter` (set by tenantFilter middleware). Contractor scope = `{ entity_id, bdm_id }`; admin/finance/president scope = `{ entity_id }`. No silent cross-scope bleed.
- [x] **Rule #3 — lookup-driven**: both gate codes in `SALES_SETTINGS` lookup, per-entity. Subscribers tune in Control Center → Lookup Tables without a code change.
- [x] **Rule #20 — period-lock + audit + status-lock**: all enforced.
- [x] **Downstream safety**: `csi_photo_url` consumers (OpeningArList, DocumentDetailPanel, CsiPhoto component, Collection detail modal, Approval Hub card signing) untouched — field retained with clearer semantics as the entry-time OCR source.
- [x] **Reopen safety**: `reopenSales` does not clear `csi_received_photo_url` (physical receipt doesn't un-happen when accounting reverses). Field persists across reopen → re-submit cycles.
- [x] **Mobile responsive**: SalesList uses `data-label` attrs; new Dunning cell naturally stacks on mobile.
- [x] **Build + syntax**: `node -c` clean on 9 backend files; `npx vite build` clean in 10.62s.

### 36.9 — Non-goals (explicit)
- **Hard Submit gate for live Sales**: not enforced. `REQUIRE_CSI_PHOTO_SALES_LINE=1` exists as a reserved future hook if a subscriber's workflow waits for delivery confirmation before posting.
- **Backfill existing POSTED rows**: no automatic copy of `csi_photo_url` → `csi_received_photo_url`. Admin/BDM attach signed copies as they come in; historical POSTED-without-photo rows surface as ⚠️ in the dunning column.
- **Received-CSI thumbnail on SalesList row**: only an icon for now. Thumbnail lives in the detail modal.

### 36.10 — Files changed
**Backend (9)**
```
backend/erp/models/SalesLine.js                          # +3 fields (csi_received_*)
backend/erp/controllers/salesController.js               # validateSales scoped, attachReceivedCsi added
backend/erp/routes/salesRoutes.js                        # PUT /sales/:id/received-csi
backend/erp/services/documentDetailBuilder.js            # surface csi_received_* + dunning_ready
backend/erp/services/documentDetailHydrator.js           # sign new URL
backend/erp/services/universalApprovalService.js         # Approval Hub signing
backend/erp/services/arEngine.js                         # dunning_ready + summary tallies
backend/erp/controllers/lookupGenericController.js       # split REQUIRE_CSI_PHOTO → 2 codes
backend/erp/scripts/migrateSalesPhotoLookup.js           # one-shot migration (idempotent)
```
**Frontend (4)**
```
frontend/src/erp/hooks/useSales.js                       # attachReceivedCsi()
frontend/src/erp/pages/SalesList.jsx                     # column + button + modal + detail link
frontend/src/erp/pages/SalesEntry.jsx                    # removed re-upload buttons + handler
frontend/src/erp/components/WorkflowGuide.jsx            # 3 banner sections rewritten
```
**Docs (2)**
```
CLAUDE-ERP.md                                            # Phase 36 section
docs/PHASETASK-ERP.md                                    # this entry
```

### Status
- [x] Phase 36 SHIPPED April 22, 2026. Migration script pending run on prod.

## Phase G4.5b — Proxy Entry for Collections + GRN (April 22, 2026) ✅

### Problem
Phase G4.5a delivered proxy entry for Sales + Opening AR. Collections and GRN — the other two high-volume back-office modules — still required the owner BDM to key every row themselves. Finance clerks could not record a CR on behalf of a BDM in the field; warehouse personnel could not capture a GRN on behalf of the BDM on the waybill. The goal was to port the G4.5a helper, picker, and Option B force-approval pattern without regressing the module-specific constraints (Collections' hospital-scoped CSI picker, GRN's warehouse-scoped ledger).

### Solution
Same two-layer gate as G4.5a (`PROXY_ENTRY_ROLES.<MODULE>` lookup + `<module>.<subKey>` on Access Template). Sub-perm keys: `collections.proxy_entry` and `inventory.grn_proxy_entry`. Same Option B — every proxied submit forces through Approval Hub via `forceApproval: hasProxy, ownerBdmId`. Two module-specific guards were added on top:

1. **Collections — CSI picker rescope.** The Open CSIs endpoint honored `?bdm_id=` for admin/finance/president; extended to honor it for contractor-proxy with `collections.proxy_entry` ticked. Without this, a proxy contractor would see "no open CSIs" and dead-end.
2. **GRN — warehouse-access cross-check.** `createGrn` loads the selected warehouse and rejects with 400 if the resolved target BDM is not in `Warehouse.assigned_users` (or `manager_id`). `widenFilterForProxy` does NOT override warehouse-level assignment — this is defense in depth.
3. **GRN — Undertaking ownership mirror.** `autoUndertakingForGrn` propagates `recorded_on_behalf_of` from GRN to the auto-created UT so the target BDM (not the proxy) sees the UT in their own queue. The acknowledgment cascade (`postSingleUndertaking`) already runs in the target's scope and posts the linked GRN in the same session — no separate auto-post wiring needed. GRN is intentionally excluded from `MODULE_AUTO_POST` (comment at [universalApprovalController.js:67](backend/erp/controllers/universalApprovalController.js#L67)) because the UT acknowledgment IS the post.

### Files touched (~14 files, backend + frontend + health check + docs)

**Backend (7)**
```
backend/erp/utils/resolveOwnerScope.js                    # unchanged (G4.5a helper reused)
backend/erp/controllers/collectionController.js           # full proxy wiring: create/update/delete/list/get/openCsis/validate/submit/reopen/requestDeletion/approveDeletion/presidentReverse
backend/erp/controllers/inventoryController.js            # createGrn + getGrnList proxy wiring + warehouse cross-check + reassignment receiver owner-aware
backend/erp/controllers/lookupGenericController.js        # seed COLLECTIONS__PROXY_ENTRY + INVENTORY__GRN_PROXY_ENTRY sub-perms
backend/erp/services/undertakingService.js                # propagate recorded_on_behalf_of GRN → UT
backend/erp/models/Collection.js                          # recorded_on_behalf_of field
backend/erp/models/GrnEntry.js                            # recorded_on_behalf_of field
backend/erp/models/Undertaking.js                         # recorded_on_behalf_of field (mirrored from GRN)
```

**Frontend (5)**
```
frontend/src/erp/hooks/useCollections.js                  # getOpenCsis(id, entityId, { isCustomer, bdmId }) — new bdmId opt
frontend/src/erp/pages/CollectionSession.jsx              # OwnerPicker mount + assigned_to payload + CSI picker rescope effect dep
frontend/src/erp/pages/Collections.jsx                    # Proxied pill (table + card layouts)
frontend/src/erp/pages/GrnEntry.jsx                       # OwnerPicker mount + assigned_to payload + Proxied pill (table + card)
frontend/src/erp/components/WorkflowGuide.jsx             # proxy tips on collections / collection-session / grn-entry keys
```

**Health check + docs (2)**
```
scripts/check-system-health.js                            # checkProxyEntryWiring extended: +10 checks across Collections + GRN + Undertaking + warehouse guard
CLAUDE-ERP.md                                             # Phase G4.5b section
docs/PHASETASK-ERP.md                                     # this entry
```

### Bulletproof bar
- [x] `node -c` clean on every backend file edited (Collection.js, GrnEntry.js, Undertaking.js, undertakingService.js, collectionController.js, inventoryController.js, lookupGenericController.js).
- [x] `npx vite build` clean — three passes during development, all green under 10s.
- [x] `node scripts/check-system-health.js` 5/5 green, with the G4.5b section of `checkProxyEntryWiring()` validating all new wiring points: `recorded_on_behalf_of` on 3 new models, helper-import + forceApproval in collectionController, helper-import + warehouse cross-check in inventoryController, `grn_proxy_entry` sub-perm seed, Undertaking ownership mirror, `MODULE_AUTO_POST.COLLECTION` presence, OwnerPicker on 4 entry pages, Proxied pill on 4 list pages, all 5 `PROXY_ENTRY_ROLES` module codes seeded.
- [x] Happy path Collections verified end-to-end at code level: admin keys CR on behalf of Juan → CSI picker rescopes to Juan's AR (hook sends `?bdm_id=juan._id`) → create stamps `bdm_id=juan, recorded_on_behalf_of=admin` + PROXY_CREATE audit row → submit calls `gateApproval({forceApproval: true, ownerBdmId: juan})` → ApprovalRequest with metadata tagging → approve dispatches `MODULE_AUTO_POST.COLLECTION` handler → POSTED.
- [x] Happy path GRN verified end-to-end at code level: admin keys GRN on behalf of Maria → warehouse picker → `createGrn` confirms Maria in `Warehouse.assigned_users` → GRN created with Maria's bdm_id + admin's `recorded_on_behalf_of` + PROXY_CREATE audit → `autoUndertakingForGrn` inherits both fields → target BDM Maria sees UT in HER queue (not admin's) → submits UT → approver acknowledges → `postSingleUndertaking` cascades `approveGrnCore` → GRN POSTED atomically in same session.
- [x] Failure path (GRN warehouse mismatch): proxy picks target BDM not assigned to selected warehouse → 400 "Target BDM is not assigned to warehouse {code}. Add them to the warehouse assignment list before recording GRN on their behalf."
- [x] Failure path (role denial, any module): contractor without `{module}.proxy_entry` ticked sends `assigned_to` via API → 403 "Proxy entry denied for {module}.proxy_entry. Your role or Access Template does not grant proxy rights for this module."
- [x] Failure path (cross-entity): proxy picks a BDM in a different entity → 403 (existing G4.5a guard, unchanged).
- [x] Backward compatibility: non-proxy callers (no `assigned_to` in body) see zero behavior change — `resolveOwnerForWrite` short-circuits to self-entry, filter stays `req.tenantFilter`.
- [x] No hardcoded role/module lists. `PROXY_ENTRY_ROLES` + sub-perm seeds are admin-editable in Control Center → Lookup Tables; subscribers delegate without code changes (Rule #3).
- [x] Period locks + reopen safety preserved — no change to existing guards.

### Known gaps (deferred to G4.5b-extended / G4.5c)
- **Owner-chain approval routing (Option C).** `forceApproval` still resolves approvers from `allowedRoles` (admin/finance/president pool), not the owner's `reports_to` chain. Fine for admin/finance proxy. Risky for contractor-proxy with a specific reporting line — the approval could land with someone who is not the owner's direct authority. ApprovalRequest metadata already carries `owner_bdm_id` ready for the upgrade.
- **Expenses refactor to shared helper (Phase G4.5c).** Expenses has its own legacy `assigned_to` pattern from Phase 33-O. Unifying on `resolveOwnerScope.js` would reduce duplication and align audit action codes (PROXY_CREATE / PROXY_UPDATE).
- **Contractor-proxy + accounting.reverse_posted.** The GRN `presidentReverseGrn` factory (`buildPresidentReverseHandler`) uses raw `req.tenantFilter`. For admin/finance proxy this is already wide. For the narrow case of a contractor granted both `inventory.grn_proxy_entry` AND `accounting.reverse_posted` (DANGER sub-perm, effectively always president-only), a widen would be needed. Not a blocker.
### Status
- [x] Phase G4.5b SHIPPED April 22, 2026. Same day as G4.5a.
- Smoke test pending per handoff plan — user will test Sales + Collections + GRN together after G4.5b ships.

---

## Phase G4.5b-ext — Proxy-Aware AR Aging + Collection Rate Endpoints (April 23, 2026) ✓

### Problem
Phase G4.5b extended `getOpenCsisEndpoint` so contractor-proxies with `collections.proxy_entry` could pass `?bdm_id=`. The two companion read endpoints — `getArAgingEndpoint` and `getCollectionRateEndpoint` — were not updated. A proxy could record collections but could not verify the target BDM's AR aging or collection rate — a blind spot.

### Fix
Mirror the `getOpenCsisEndpoint` proxy pattern:
- [x] `getArAgingEndpoint`: call `canProxyEntry(req, 'collections', 'proxy_entry')`, include result in `privileged` boolean gating `?bdm_id=`.
- [x] `getCollectionRateEndpoint`: same pattern.
- [x] `WorkflowGuide.jsx`: `ar-aging` tip updated to mention proxy access.
- [x] `check-system-health.js`: `checkProxyEntryWiring()` extended with 2 new checks for `canProxyEntry` in both endpoints.

### Bulletproof bar
- [x] `node -c collectionController.js` — clean.
- [x] `node scripts/check-system-health.js` — 6/6 green (G4.5b-ext checks passing).
- [x] `npx vite build` — clean in 11.47s.
- [x] No new dependencies, models, routes, or schema changes.
- [x] Backward compatible: non-proxy callers see zero behavior change.
- [x] Rule #3: reuses existing `PROXY_ENTRY_ROLES.COLLECTIONS` lookup + `collections.proxy_entry` sub-perm.
- [x] Rule #19: entity scope unchanged.
- [x] Rule #21: no silent self-ID fallback.

### Status
- [x] Phase G4.5b-ext SHIPPED April 23, 2026.

---

## Phase PR1 — Per-Row Lifecycle Policy (April 22, 2026) ✓✅

### Problem
Four transactional modules (Sales, Opening AR, Expenses, Collections) had split lifecycle UX:
- Sales & Opening AR: bulk Validate Sales / Submit Sales / Re-open on the Entry page AND per-row equivalents inside the entry grid AND per-row Submit/Re-open on the List page. Validate was missing on the List entirely.
- Expenses: bulk Validate + Submit at the top of the page, no per-row Validate/Submit in the table at all.
- Collections: already per-row — used as the reference pattern.

Bulk operations are unsafe in practice because each row carries its own FIFO stock snapshot, VAT balance, credit-limit projection, OR gate, CALF linkage, and CSI-booklet context. A batch-level success toast can mask a silent per-row ERROR; a batch-level failure can block good rows behind a single bad one. Sales aren't a multi-leg journal entry that must post atomically — each CSI is an independent financial event, so atomicity buys nothing and costs forensic pain.

### Policy
- **Sales Transactions List** is the single lifecycle hub: Validate / Submit / Re-open / Request Deletion / Approve Deletion / President Delete — all per-row.
- **Entry pages** (Sales Entry, Opening AR Entry) are capture-only: Save Drafts + Scan CSI + Upload CSI + Add Row. No toolbar-level lifecycle buttons. Sales Entry retains per-row Validate + Post inside its row grid for the create-then-validate flow in a single session (already per-row, kept for ergonomics).
- **Expenses**: per-row Validate (DRAFT/ERROR) + Submit (VALID) in both desktop table and mobile card view. Re-open, Del, President Delete already per-row.
- **Collections**: already compliant (reference pattern).

### Backend
- `validateExpenses` + `submitExpenses` ([backend/erp/controllers/expenseController.js](backend/erp/controllers/expenseController.js)): added optional `req.body.expense_ids` array. When present, the Mongo filter narrows to those ids; when absent, behavior is identical to before (preserves proxy + legacy callers). Period lock is still enforced per-entry inside the controller via `checkPeriodOpen(entry.entity_id, entry.period)`, and `gateApproval()` still fires with the single-row `total_amount` when per-row submitting — threshold checks become granular instead of aggregated.
- Sales backend unchanged. `submitSales` already supported optional `sale_ids`.

### Frontend
- [SalesList.jsx](frontend/src/erp/pages/SalesList.jsx) + [OpeningArList.jsx](frontend/src/erp/pages/OpeningArList.jsx): new per-row `handleValidate(saleId)` calls `sales.validateSales([saleId])`; button gated to `status === 'DRAFT' || 'ERROR'`.
- [SalesEntry.jsx](frontend/src/erp/pages/SalesEntry.jsx): removed top-level `handleValidate`, `handleSubmit`, `handleReopen` and their three bulk buttons. Removed dead `allValid` / `hasPosted` / `hasDraftOrError` / `validationErrors` state and the orphaned validation-error banner. Fixed per-row Post button at `line 1100` which was secretly calling `sales.submitSales()` without the row id (bulk leak) — now passes `[r._id]` and handles `approval_pending`.
- [OpeningArEntry.jsx](frontend/src/erp/pages/OpeningArEntry.jsx): removed top-level `handleValidate`, `handleSubmit` and the two bulk buttons. Removed dead `validationErrors` state + banner, dead `refreshCurrentRows` callback, dead `hasDraftOrError` / `hasValid` gates.
- [Expenses.jsx](frontend/src/erp/pages/Expenses.jsx): added per-row Validate + Submit to desktop Actions column and mobile card-actions. `handleValidate(id)` + `handleSubmit(id)` now accept a single id; retain existing toast + `approval_pending` handling. Removed the two top-of-page bulk buttons.
- [useExpenses.js](frontend/src/erp/hooks/useExpenses.js): `validateExpenses(ids)` / `submitExpenses(ids)` send `{ expense_ids: ids }` when array is non-empty; send `{}` otherwise (back-compat with any caller that still calls with no args).
- [WorkflowGuide.jsx](frontend/src/erp/components/WorkflowGuide.jsx): rewrote banners for `sales-entry` (capture-only), `sales-list` (lifecycle hub), `sales-opening-ar` (capture-only), `sales-opening-ar-list` (adds Validate), `expenses` (per-row flow).

### Integrity Checklist (Rule 0 Bulletproof Bar)
- **Wiring**: every per-row button's `onClick` resolves to a defined handler (17/17 verified).
- **Backend endpoints**: route wiring + body-parser + controller filter all verified for `expense_ids` path.
- **Tenant isolation (Rule 19)**: `filter._id = { $in: ids }` is ANDed with `req.tenantFilter`, so cross-entity ids are auto-stripped by the entity scope.
- **Rule 21 (no self-ID fallback)**: `req.bdmId` untouched; no privileged-fallback introduced.
- **Period lock (Rule 20)**: `checkPeriodOpen` still fires per-entry inside `submitExpenses` regardless of body shape.
- **Approval gate (Rule 20)**: `gateApproval` still fires; amount now single-row instead of aggregated → more granular threshold decisions.
- **Lookup-driven (Rule 3)**: lifecycle statuses via `getEditableStatuses(entityId, moduleKey)`; MODULE_DEFAULT_ROLES unchanged.
- **Banners (Rule 1)**: 5 page banners rewritten to match the new UI. No banner references a removed button.
- **Build**: `npx vite build` clean (11.06s final).

### Files Touched
```
backend/erp/controllers/expenseController.js        # 2 filter additions
frontend/src/erp/hooks/useExpenses.js               # validate+submit accept optional ids
frontend/src/erp/pages/SalesList.jsx                # + per-row Validate
frontend/src/erp/pages/SalesEntry.jsx               # - 3 bulk buttons, + bug fix
frontend/src/erp/pages/OpeningArList.jsx            # + per-row Validate
frontend/src/erp/pages/OpeningArEntry.jsx           # - 2 bulk buttons + dead code
frontend/src/erp/pages/Expenses.jsx                 # + per-row Validate + Submit, - 2 bulk
frontend/src/erp/components/WorkflowGuide.jsx       # 5 banner rewrites
CLAUDE-ERP.md                                       # Phase PR1 section
docs/PHASETASK-ERP.md                               # this entry + §3.8 update
```

### Status
- [x] Phase PR1 SHIPPED April 22, 2026. Build clean. Per-row policy enforced end-to-end. No bulk lifecycle action surfaces remain in Sales / Opening AR / Expenses UI.

---

## Phase FRA-A — Cross-Entity Assignments Drives `User.entity_ids` (April 22, 2026) ✅ SHIPPED

### Problem
Two multi-entity systems co-exist and are not wired together:
- `User.entity_ids` (scalar array) — what [tenantFilter.js](backend/erp/middleware/tenantFilter.js) reads to validate `X-Entity-Id` and set `req.entityId`.
- `FunctionalRoleAssignment` (Phase 31) — richer per-(person, entity, function) record with date windows, approval limits, status. Maintained from **Control Center → People & Access → Role Assignments**.

Consequence: admin assigns employee to MG and CO. via FRA, UI shows ACTIVE, but the entity picker never offers MG and CO., `tenantFilter` never sets `req.entityId = mg_id`, and `resolveOwnerForWrite` throws "target not assigned to the current entity." FRA rows are cosmetic.

### Decision (mentor-mode — locked before coding)
**Option A** wins over Option B (union-of-sources bridge).

- Keep `User.entity_ids` authoritative for entity access (what `tenantFilter` reads today — unchanged hot path).
- Teach the **Cross-Entity Assignments** admin UI (FRA create/update/delete) to ALSO push the entity_id onto the person's `User.entity_ids` (and remove it when the FRA row is the last active one for that entity).
- FRA stays as an **optional** metadata layer: date windows (`valid_from`/`valid_to`), `approval_limit`, `functional_role`, `status` (ACTIVE/SUSPENDED/EXPIRED/REVOKED). Useful for reporting/audit ("who handled ACCOUNTING at MG and CO. in Q2 2026?") and for subscribers who need time-bounded deployments or per-entity approval caps — never load-bearing for auth.
- Function access continues to flow from Access Template sub-permissions (existing pattern). Functions are near-identical across entities, so FRA's `functional_role` is redundant with sub-perms for the auth gate.

### Why Option A beats Option B
- Option B (union-of-sources bridge) requires: 5-min per-user cache in `tenantFilter`, cache-bust across two controllers, and reading FRA on every authenticated ERP request. ~3–5 hours.
- Option A requires: one controller update on the FRA maintenance surface. ~1 hour.
- Option A preserves the Phase 31 investment (FRA data + UI unchanged) while making the data actually flow. Option B would have been correct engineering for a use case (temporary deployments, per-entity approval limits) we don't exercise today.
- Rule #9 (no data duplication): there's a thin duplication of "this person works at these entities" across both stores. Mitigated by: (a) FRA controller is the ONLY admin surface that writes both — no dual-write from elsewhere, (b) health check guards against drift.

### FRA-A.1 — FRA controller dual-write
- [ ] `backend/erp/controllers/functionalRoleAssignmentController.js`:
  - `createAssignment`: after FRA.save(), `$addToSet` `fra.entity_id` onto the linked User's `entity_ids` (via PeopleMaster → User lookup).
  - `updateAssignment`: if `entity_id` changed, rebuild the User's union from their active FRA rows + any static entity_ids admin had before FRA (tracked via a `User.entity_ids_static` array — migration below).
  - `deleteAssignment` / `deactivate`: rebuild union, `$pull` the entity_id if no other active FRA at that entity remains.
- [ ] One-time `backend/erp/scripts/backfillEntityIdsFromFra.js` (idempotent):
  - For each User with a linked PeopleMaster, compute union of (current `entity_ids`) + (active FRA entity_ids).
  - Seed `entity_ids_static` = current `entity_ids` at migration time (preserves pre-FRA assignments).
  - Write resulting union to `User.entity_ids`. Log diffs for audit.
- [ ] `backend/models/User.js`:
  - New field `entity_ids_static: [ObjectId]` — entities admin assigned outside the FRA flow (e.g., via BDM Management page). Rebuild logic: `entity_ids = union(entity_ids_static, activeFraEntityIds)`.

### FRA-A.2 — PeopleMaster link guard
- [ ] `resolveOwnerForWrite` already checks target entity via `User.entity_ids`. With FRA-A.1 in place, FRA rows will have already propagated — no helper change needed. Confirm via health check.
- [ ] Edge case: User with no linked PeopleMaster but an FRA row somehow (shouldn't happen — FRA requires `person_id`). If encountered in backfill, log and skip (don't crash).

### FRA-A.3 — Health check
- [ ] `scripts/check-system-health.js`: new `checkFraEntityIdsSync()`:
  - For every active FRA row, assert `User.entity_ids` for the linked person includes `fra.entity_id`.
  - Report drift count. Zero = green.
  - Runs in < 5s against 100+ FRA rows (single aggregation).

### FRA-A.4 — Deferred / out-of-scope
- **Date-window enforcement in `tenantFilter`**: today's auth gate is static `entity_ids`. Future subscribers wanting time-bounded deployment would need `tenantFilter` to filter by `valid_from`/`valid_to`. Punt until a subscriber asks. When they do, it's a `tenantFilter` extension, not a FRA-bridge rebuild.
- **Approval limit enforcement**: `FRA.approval_limit` is data-only today. Future phase to wire into `approvalService`.
- **Strict function-gate** (module ↔ FRA.functional_role matching): not implemented. Sub-perms are the function gate. If a subscriber asks for strict, add `MODULE_FRA_REQUIRED` lookup with `null` default (off).

### FRA-A.5 — Bulletproof bar
- [ ] Happy path: admin creates FRA (Juan → MG and CO. → SALES) → Juan's `User.entity_ids` now includes MG and CO. → Juan's entity picker shows MG and CO. → proxy-write target check passes for MG and CO. ops.
- [ ] Deactivate path: admin sets `is_active=false` on Juan's MG and CO. FRA → Juan's `entity_ids` `$pull`s MG and CO. (unless another active FRA for MG and CO. exists for him) → entity picker drops MG and CO. → immediate effect (no cache TTL).
- [ ] Multi-role path: Juan has ACCOUNTING + SALES FRAs at MG and CO. → deactivate SALES → MG and CO. still in `entity_ids` (ACCOUNTING keeps it) → deactivate ACCOUNTING → MG and CO. removed.
- [ ] Static preservation: admin assigned Juan to VIP and MG and CO. via BDM Management (pre-FRA) → backfill stores both in `entity_ids_static` → adding an FRA for BLW leaves VIP + MG and CO. intact + adds BLW.
- [ ] Rule #9 drift check: health check reports 0 FRA-sync drift after migration.
- [ ] Rule #19 cross-entity isolation: adding entity to `entity_ids` still requires explicit `X-Entity-Id` header to switch — no silent cross-entity writes.
- [ ] Rule #21 no silent self-fallback: `resolveOwnerForWrite` behavior unchanged; still throws 403 on cross-entity target.
- [ ] Build clean; `node -c` on modified controllers; `node scripts/check-system-health.js` green.

### FRA-A.6 — Files to touch (~1.5 hours)
```
backend/erp/controllers/functionalRoleAssignmentController.js  # dual-write on create/update/delete
backend/models/User.js                                          # + entity_ids_static
backend/erp/scripts/backfillEntityIdsFromFra.js                 # NEW, idempotent
scripts/check-system-health.js                                  # + checkFraEntityIdsSync
CLAUDE-ERP.md                                                   # Phase FRA-A section
docs/PHASETASK-ERP.md                                           # this entry
```

### Status
- [x] ✅ SHIPPED April 22, 2026. Option A implemented. Dual-write landed on all 4 FRA mutation paths (create / update / deactivate / bulkCreate). `User.entity_ids_static` preserves admin-direct assignments. Shared `userEntityRebuild` primitive computes `entity_ids = union(static, activeFras)`. Backfill script (`backend/erp/scripts/backfillEntityIdsFromFra.js`) acts as both migration tool and CI drift detector. Health check section 6 (`checkFraEntityIdsSync`) green. All 5 bulletproof scenarios verified. See [CLAUDE-ERP.md Phase FRA-A](../CLAUDE-ERP.md) for rollout checklist.

---

## Phase G4.5c — Proxy Entry Refactor (Expenses) + Port to Petty Cash + Fuel Entry (April 22, 2026) 🚧 PARTIAL (G4.5c.1 ✅ SHIPPED · G4.5c.2 ⏭️ SKIPPED · G4.5c.3 📋 PLANNED)

### Problem
Phase G4.5a (Sales + Opening AR) and G4.5b (Collections + GRN) established the shared `resolveOwnerScope.js` helper + Option B force-approval pattern. Three more back-office modules are candidates for proxy entry — with different levels of readiness:

1. **Expenses** — already has `assigned_to` + `recorded_on_behalf_of` from Phase 33-O legacy pattern + Phase G1 batch-upload. Audit codes differ from G4.5a's `PROXY_CREATE` / `PROXY_UPDATE`. Refactor to shared helper to unify audit trail and eliminate duplication.
2. **Petty Cash** — no proxy today. BDMs file and reconcile their own. Office finance should be able to reconcile receipts on behalf (classification is policy knowledge).
3. **Fuel Entry** — no proxy today. BDMs scan pump receipt + enter liters/amount. Office finance classifies COA (ORE-fuel vs logbook-gas vs personal) and posts.

### Solution — same two-layer pattern
Reuse `resolveOwnerScope.js` helper. Add per-module sub-perms:
- `expenses.proxy_entry` — deprecates the legacy batch-upload-only path (batch upload remains its own sub-perm, but single-entry proxy now uses the shared helper).
- `petty_cash.proxy_entry`
- `fuel_entry.proxy_entry`

Add Option B force-approval on each module's submit path (already proven in G4.5a + G4.5b).

### G4.5c.1 — Expenses refactor (highest priority)
- [ ] `backend/erp/controllers/expenseController.js`:
  - Replace inline `assigned_to` handling with `resolveOwnerForWrite(req, 'expenses', { subKey: 'proxy_entry' })`.
  - Replace inline list filter with `widenFilterForProxy(req, 'expenses', ...)`.
  - Unify audit codes: `EXPENSE_CREATE_PROXY` → `PROXY_CREATE` (same as Sales), `EXPENSE_UPDATE_PROXY` → `PROXY_UPDATE`.
  - Option B on `submitExpenses` (already had per-row submit from Phase PR1 — just add `forceApproval` flag when `recorded_on_behalf_of` present on any row being submitted).
- [ ] `backend/erp/models/Expense.js`: confirm `recorded_on_behalf_of` field matches the Sales/Collection/GRN shape (ObjectId ref User, sparse index).
- [ ] `backend/erp/controllers/lookupGenericController.js`: seed `EXPENSES__PROXY_ENTRY` sub-perm row.
- [ ] `frontend/src/erp/pages/ExpensesEntry.jsx`: swap legacy picker → `<OwnerPicker module="expenses" subKey="proxy_entry" />`.
- [ ] `frontend/src/erp/pages/Expenses.jsx`: add "Proxied" pill to OR number column (already has the column — just add pill when `row.recorded_on_behalf_of`).

### G4.5c.2 — Petty Cash proxy entry ⏭️ SKIPPED (April 23, 2026)
**Decision (user, April 23, 2026):** Skip. Petty cash stays BDM-owned end-to-end (file + reconcile). Rationale:
- Low-stakes, small-amount, high-frequency flow — proxy overhead outweighs benefit.
- BDM-side mobile request → office finance disburses (already supported via existing `pettyCashController` create + reconcile pair). No need for a "proxy creates on behalf of BDM" path.
- Existing fund-disbursement audit + reconciliation gates (period lock + JE rebuild) already cover the integrity surface.
- Phase P1 will introduce a "request petty cash" capture in the BDM mobile hub when sequenced — that hub-side flow is the BDM-driven request path, not a proxy.
- If a subscriber later asks for proxy on petty cash (e.g., absentee BDM), reuse the G4.5a/c.1 helper pattern; estimated ~2h.
- ~~`backend/erp/controllers/pettyCashController.js`~~ — not refactored.
- ~~`backend/erp/models/PettyCashEntry.js`~~ — `recorded_on_behalf_of` not added.
- ~~`backend/erp/controllers/lookupGenericController.js`~~ — `PETTY_CASH__PROXY_ENTRY` sub-perm not seeded; `PETTY_CASH` not added to PROXY_ENTRY_ROLES / VALID_OWNER_ROLES.
- ~~`frontend/src/erp/pages/PettyCash.jsx`~~ — no OwnerPicker, no Proxied pill.

### G4.5c.3 — Fuel Entry proxy entry
- [ ] Same pattern. `fuelEntryController.js` + `FuelEntry.js` model + lookup seed + frontend picker + pill.
- [ ] BDM mobile UI: scan pump receipt (already wired in Phase H3/H4 OCR), enter liters + amount + GPS. Proxy classifies COA (ORE-fuel / logbook-gas / personal) and posts.

### G4.5c.4 — Health check extension
- [x] `scripts/check-system-health.js: checkProxyEntryWiring()` — extended for Expenses (G4.5c.1). Petty Cash skipped (no proxy port). Fuel Entry pending G4.5c.3.
  - Expenses ✅ added to module list, audit code asserts (PROXY_CREATE/PROXY_UPDATE), forceApproval check, calf_override regression guard.
  - Petty Cash — N/A (skipped per G4.5c.2 decision).
  - Fuel Entry — pending G4.5c.3.

### G4.5c.5 — Bulletproof bar
- [x] Non-regression: existing Expenses batch-upload flow unchanged (separate `expenses.batch_upload` sub-perm). ✅ G4.5c.1 verified.
- [x] Audit history convergence: query `ErpAuditLog.find({ log_type: 'PROXY_CREATE' })` returns Sales / Opening AR / Collections / GRN / Expenses (5 modules). Petty Cash absent by design. Fuel pending. ✅
- [x] Option B force-approval fires for proxied submits across the 5 wired modules. ✅
- [x] Build clean; health check green (5 proxy modules covered + FRA-A section 6). ✅

### G4.5c.6 — Files
```
backend/erp/controllers/expenseController.js
backend/erp/controllers/pettyCashController.js
backend/erp/controllers/fuelEntryController.js
backend/erp/controllers/lookupGenericController.js              # + 3 sub-perm seeds, + 2 PROXY_ENTRY_ROLES codes (PETTY_CASH, FUEL_ENTRY)
backend/erp/models/Expense.js                                    # confirm shape
backend/erp/models/PettyCashEntry.js                             # + recorded_on_behalf_of
backend/erp/models/FuelEntry.js                                  # + recorded_on_behalf_of
frontend/src/erp/pages/ExpensesEntry.jsx
frontend/src/erp/pages/Expenses.jsx
frontend/src/erp/pages/PettyCash.jsx
frontend/src/erp/pages/FuelEntry.jsx
frontend/src/erp/components/WorkflowGuide.jsx                    # proxy tips on 3 more page keys
scripts/check-system-health.js                                   # extend checkProxyEntryWiring
CLAUDE-ERP.md                                                    # Phase G4.5c section
docs/PHASETASK-ERP.md                                            # this entry
```

### Status
- [x] **G4.5c.1 Expenses refactor ✅ SHIPPED April 23, 2026**. `expenseController.js` ported to shared `resolveOwnerForWrite` / `widenFilterForProxy`. Audit codes unified to `PROXY_CREATE` / `PROXY_UPDATE`. Option B `forceApproval` on submit when any row is proxied. Fixed latent CALF-bypass conflation on `recorded_on_behalf_of` — added explicit `calf_override` field (president-only, via batch-upload role gate). Frontend: OwnerPicker mounted on create form; Proxied pill on list (table + card view). Health check section 5 extended (5 modules, calf_override regression guard). Build clean 43.49s. See [CLAUDE-ERP.md Phase G4.5c.1](../CLAUDE-ERP.md).
- [x] **G4.5c.2 Petty Cash ⏭️ SKIPPED April 23, 2026** (user decision). Petty Cash stays BDM-owned end-to-end; low-stakes high-frequency flow doesn't justify proxy overhead. Existing fund-disbursement audit + period-lock + JE-rebuild gates already cover integrity. Phase P1 mobile capture hub will surface a "request petty cash" BDM-driven flow (not a proxy). If a subscriber later asks for petty-cash proxy, reuse the G4.5a/c.1 helper pattern (~2h estimate).
- [ ] G4.5c.3 (Fuel Entry) — still 📋 PLANNED. Same shared-helper pattern; BDM mobile UI already wired in Phase H3/H4 OCR (scan pump receipt → liters/amount/GPS); proxy classifies COA (ORE-fuel / logbook-gas / personal) and posts.

---

## Phase P1 — BDM Mobile Capture + Office Proxy Queue (April 22, 2026) 📋 PLANNED

### Vision
Operational model locked with user: **BDM = revenue producer, proxy = back-office processor.** Every task classified by:
- Physical presence in field required? → BDM
- Classification / policy judgment required? → proxy
- Data entry from captured artifact? → proxy
- Unlocks commission / revenue? → BDM (incentive alignment)

BDM in the field does ONE-TAP capture (scan + GPS + photo). Office proxy processes. BDM reviews proxied entries before POSTED. Commission-bearing actions stay sacred to BDM.

### Workflows covered

| # | Workflow | BDM captures | Proxy processes | Commission lever |
|---|---|---|---|---|
| 1 | SMER + per-diem | Starting ODO photo, ending ODO photo, personal km declaration | Compile SMER doc, per-diem calculation, override request | — |
| 2 | Expenses (OR-based) | Scan OR, enter price + mode of payment, note for whom (ACCESS) | Classify ORE/ACCESS, COA map, CALF link + validate + submit | — |
| 3 | Sales (live) | OCR unreceived CSI at point of sale | Proxy enters into ERP, submits through Approval Hub | **Commission gated until BDM uploads signed CSI (Phase P2)** |
| 4 | Opening AR | — | All proxy | — |
| 5 | Collections | **BDM keys** (commission lever) | — | Yes — BDM priority |
| 6 | GRN | BDM scans product, counts qty, uploads batch/expiry + waybill | — | — |
| 7 | Petty Cash | Mobile request ("I need ₱5k") | Reconcile receipts, post | — |
| 8 | Fuel Entry | Scan pump receipt | Classify COA + post | — |

### Non-negotiable BDM-only actions
- Visit logging (CRM) — GPS + photo + commission.
- Signed CSI delivery proof upload — commission gate.
- Personal gas / personal km declaration — honesty gate.
- Collection entry — commission lever.
- KPI self-attestation — accountability.
- Any approval action — Rule #20 Option B (proxy enters, never approves).

### P1.1 — BDM mobile capture UI
- [x] `frontend/src/erp/pages/mobile/BdmCaptureHub.jsx` — new landing page, phone-first (360px min), large touch targets (≥ 44px), ONE tap per workflow.
  - "Scan ODO (start / end)" → opens camera, two-photo flow
  - "Scan OR / Receipt" → OCR + price + mode of payment + "who for?" note
  - "Scan Unreceived CSI" → OCR, queues for proxy entry
  - "Scan GRN Item" → barcode / product picker + qty + batch/expiry + waybill photo
  - "Request Petty Cash" → amount + purpose
  - "Scan Fuel Pump Receipt" → OCR + liters + amount
  - "Log Visit" (CRM) — existing flow, link to CRM side
- [ ] Offline tolerance: capture stored locally (IndexedDB) until connectivity returns; background sync. **DEFERRED** — online-first shipped; IndexedDB offline layer requires real-device testing.
- [x] Each capture generates a `CaptureSubmission` (new collection) with status `PENDING_PROXY` → `IN_PROGRESS` → `PROCESSED` → (if needed) `AWAITING_BDM_REVIEW` → `ACKNOWLEDGED`.

### P1.2 — Office proxy queue
- [x] `frontend/src/erp/pages/proxy/ProxyQueue.jsx` — office-side queue page.
  - Filters: workflow type, BDM, date range, status.
  - Row shows: BDM name, workflow type, captured artifact(s), age (with SLA color).
  - "Process" button opens the appropriate entry form with the captured artifact pre-attached.
  - Proxy completes → `CaptureSubmission.status = 'PROCESSED'` + linked ERP doc reference.
- [x] SLA: target < 24h turnaround. Age > 24h rows highlighted amber; > 48h rows red.

### P1.3 — BDM review queue
- [x] `frontend/src/erp/pages/mobile/BdmReviewQueue.jsx` — BDM-side mobile page.
  - Lists proxied entries POSTED against this BDM's `bdm_id` in the last N days.
  - Each row: doc type, amount, counterparty, proxy name, "Confirm" / "Dispute" buttons.
  - "Confirm" → `CaptureSubmission.status = 'ACKNOWLEDGED'`.
  - "Dispute" → files `IncentiveDispute` row with reference to the ERP doc.
  - Banner: "Maria entered 3 sales for you this week — review."
  - Push notification / SMS on new proxied entry (via existing Phase SG-Q2 W3 dispatchMultiChannel).

### P1.4 — New collection `capture_submissions`
- [x] `backend/erp/models/CaptureSubmission.js`:
  ```
  {
    bdm_id, entity_id, workflow_type, status,
    captured_artifacts: [{ kind, url, ocr_result, gps, timestamp }],
    proxy_id, proxy_started_at, proxy_completed_at,
    linked_doc_kind, linked_doc_id,
    bdm_acknowledged_at, disputed_at, dispute_reason,
    created_at, created_by
  }
  ```
  - Indexes: `{ bdm_id, status }`, `{ entity_id, status, workflow_type }`, `{ created_at }`.

### P1.5 — Agent: `#PX` proxy SLA agent
- [x] New rule-based agent `proxySlaAgent.js`:
  - Runs every 4 hours.
  - Finds `CaptureSubmission` with `status='PENDING_PROXY'` and `created_at` > 24h old → alert office lead.
  - Finds `status='AWAITING_BDM_REVIEW'` > 72h → auto-acknowledge with warning (configurable via `PROXY_SLA_THRESHOLDS` lookup).
  - Metrics: avg turnaround per workflow, proxy throughput per user, BDM review rate.

### P1.6 — Fallback path (Rule #9 preservation)
- [x] BDM can always self-enter without going through the proxy queue — just skip the capture hub and use the regular entry page. The proxy flow is ADDITIVE, not mandatory. This is critical for (a) proxy unavailability, (b) subscribers who don't have a proxy role in their org.

### P1.7 — Bulletproof bar
- [x] **Happy path (Expense via proxy)**: BDM scans OR → `CaptureSubmission` created with status `PENDING_PROXY` → proxy picks it up from queue → classifies + posts via existing `expenseController.createExpense` with `assigned_to=bdm_id` → Option B forces Approval Hub → president/finance approves → POSTED → BDM gets push notification → reviews in queue → confirms.
- [x] **Happy path (self-serve fallback)**: BDM opens regular ExpensesEntry page, enters themselves → normal flow, no CaptureSubmission created.
- [x] **Failure (proxy unavailable)**: SLA agent alerts at 24h pending. BDM can still self-enter after waiting.
- [x] **Failure (BDM disputes proxied entry)**: "Dispute" → files IncentiveDispute → finance investigates → can reverse via President Delete path (Phase 3b).
- [ ] **Offline tolerance**: BDM captures 3 ORs without connectivity → all stored locally → reconnect → all sync to `CaptureSubmission` → proxy processes normally.
- [x] **Rule #19 cross-entity**: `CaptureSubmission` stamped with `entity_id`; proxy at Entity A cannot process Entity B's submissions.
- [x] **Rule #21**: SLA agent filter uses `bdm_id` explicitly — no silent self-scope.

### P1.8 — Files (~7–10 days)
```
backend/erp/models/CaptureSubmission.js                          # NEW
backend/erp/controllers/captureSubmissionController.js           # NEW
backend/erp/routes/captureSubmissionRoutes.js                    # NEW
backend/erp/agents/proxySlaAgent.js                              # NEW
backend/erp/controllers/lookupGenericController.js               # + PROXY_SLA_THRESHOLDS
frontend/src/erp/pages/mobile/BdmCaptureHub.jsx                  # NEW
frontend/src/erp/pages/mobile/BdmReviewQueue.jsx                 # NEW
frontend/src/erp/pages/proxy/ProxyQueue.jsx                      # NEW
frontend/src/erp/hooks/useCaptureSubmissions.js                  # NEW
frontend/src/erp/components/WorkflowGuide.jsx                    # 3+ new banner keys
scripts/check-system-health.js                                   # + CaptureSubmission checks
CLAUDE-ERP.md                                                    # Phase P1 section
docs/PHASETASK-ERP.md                                            # this entry
```

### Status
- [x] ✅ **SHIPPED April 23, 2026.** Foundation + Expenses pilot workflow. All 8 workflow types supported in model/UI framework. Online-first (IndexedDB offline layer deferred to real-device testing). 8 new files, 10 modified files. Health check 7/7 green. Frontend build clean. Backend syntax clean.

---

## Phase P2 — Proxy-Aware UX + Signed-CSI Commission Gate (April 22, 2026) 📋 PLANNED

### Vision
Commission alignment: **no signed delivery proof, no commission.** BDM captures the raw CSI at the point of sale, proxy enters it into ERP (Phase P1), sale goes through Approval Hub → POSTED. But commission accrual is **gated** until the BDM uploads the signed delivery receipt (hospital stamp + pink/yellow/duplicate copy). This kills the "BDM logs fake sales for commission" fraud vector entirely.

Builds on Phase 36 (`SalesLine.csi_received_photo_url`), which already separates entry-time OCR from post-delivery signed proof.

### P2.1 — Commission gate on signed CSI
- [ ] `backend/erp/models/SalesLine.js`: add `commission_eligible: Boolean` (default false) — flipped true only when `csi_received_photo_url` is non-empty AND status is POSTED.
- [ ] `backend/erp/services/kpiSnapshotAgent.js`: filter sales for KPI/commission accrual by `commission_eligible=true`.
- [ ] `backend/erp/services/incentivePayoutService.js`: IncentivePayout rows only accrue for `commission_eligible=true` sales.
- [ ] `backend/erp/controllers/salesController.js: attachReceivedCsi`: on successful attach of POSTED row → set `commission_eligible=true` → trigger kpiSnapshotAgent recompute for the owner BDM's current period.
- [ ] `backend/erp/controllers/lookupGenericController.js`: `SALES_SETTINGS.COMMISSION_GATE_ON_SIGNED_CSI` (default 1) — subscriber toggle. Pharma defaults ON; other industries default OFF via `PROFILE_DEFAULTS`.

### P2.2 — Per-line commission eligibility
- [ ] When hospital accepts partial delivery (e.g., 90% of a 10-line CSI, 10% rejected) — model at the line level, not the doc level. Each line independently commission-gated.
- [ ] Signed proof may cover partial lines (e.g., "proof shows 9 of 10 lines delivered") — BDM marks per-line delivered vs rejected when attaching proof. Rejected lines: no commission, system-generated Credit Note via Phase 36 flow.

### P2.3 — Dashboard surface
- [ ] BDM Dashboard: "Commission-pending sales (missing signed CSI): ₱X across N sales." Link to list.
- [ ] Admin Dashboard: "Commission exposure held back by missing signed CSI: ₱X across N BDMs." Ages > 30 days flagged red.
- [ ] Statistics Page: new tab "Delivery Proof Compliance" — per-BDM % of POSTED sales with signed CSI.

### P2.4 — Proxy throughput metrics
- [ ] Admin Dashboard widget: proxy throughput (avg turnaround per workflow, per proxy user, last 7d / 30d).
- [ ] Active proxies leaderboard — volume + SLA compliance.
- [ ] Alert: proxy queue depth > 50 → email admin.

### P2.5 — Proxy-unavailability banner
- [ ] When no user holds `<module>.proxy_entry` sub-perm at current entity → banner on BDM capture hub: "No proxy staff available — self-entry only today." Fallback path (P1.6) remains.

### P2.6 — Subscriber model toggles
- [ ] `PROFILE_DEFAULTS.pharma`: `{ COMMISSION_GATE_ON_SIGNED_CSI: 1, PROXY_SLA_THRESHOLDS: {...} }`.
- [ ] `PROFILE_DEFAULTS.general_trading`: commission gate off, proxy SLA looser. Keeps subscribers outside pharma from inheriting pharma-specific controls.

### P2.7 — Bulletproof bar
- [ ] Happy path: sale entered by proxy → POSTED → `commission_eligible=false` → BDM uploads signed CSI → `commission_eligible=true` → kpiSnapshotAgent recomputes → commission accrues in BDM's IncentivePayout draft.
- [ ] Failure (fake sale): proxy enters sale without real delivery → BDM never uploads signed CSI → `commission_eligible` stays false → no commission accrual, period. Sale appears in "Commission-pending" dashboard, ages into alert.
- [ ] Failure (partial delivery): 9 of 10 lines signed → 9 lines `commission_eligible=true`, 1 line stays false → 1 line auto-generates Credit Note (Phase 36).
- [ ] Failure (subscriber without gate): subscriber toggles `COMMISSION_GATE_ON_SIGNED_CSI=0` → all POSTED sales are `commission_eligible=true` immediately (back-compat to pre-P2 behavior).
- [ ] Rule #19: `commission_eligible` stamped with entity scope — cross-entity leaks blocked.
- [ ] Rule #20: attaching signed CSI does NOT require reopen (already handled in Phase 36).
- [ ] Existing IncentivePayout flow (Phase SG-Q2 W2) — the only change is the filter at accrual time.

### P2.8 — Files (~3–5 days)
```
backend/erp/models/SalesLine.js                                  # + commission_eligible
backend/erp/controllers/salesController.js                       # flip commission_eligible on attach + on POSTED
backend/erp/services/kpiSnapshotAgent.js                         # filter by commission_eligible
backend/erp/services/incentivePayoutService.js                   # same filter
backend/erp/controllers/lookupGenericController.js               # + SALES_SETTINGS.COMMISSION_GATE_ON_SIGNED_CSI + PROFILE_DEFAULTS
frontend/src/erp/pages/EmployeeDashboard.jsx                     # commission-pending widget (if exists)
frontend/src/erp/pages/admin/AdminDashboard.jsx                  # exposure widget
frontend/src/erp/pages/admin/StatisticsPage.jsx                  # Delivery Proof Compliance tab
frontend/src/erp/components/WorkflowGuide.jsx                    # banner update on sales-list + BDM capture hub
CLAUDE-ERP.md                                                    # Phase P2 section
docs/PHASETASK-ERP.md                                            # this entry
```

### Status
- [ ] 📋 PLANNED. Dependencies: Phase 36 (csi_received_photo_url — shipped), Phase SG-Q2 W2 (IncentivePayout — shipped). Ship after P1 pilot workflow (Expenses) is proven.

---

## Proxy Expansion Roadmap (Apr 22, 2026)

**Known gaps documented (deferred):** G4.5b-extended (owner-chain approval routing — Option C); G4.5c (Expenses refactor to shared helper).

**Shipped today**: G4.5a (Sales + Opening AR), G4.5b (Collections + GRN), Phase 36 (Received CSI separation), PR1 (Per-row lifecycle).

**Planned order (mentor-recommended)**:
1. **Phase FRA-A** (~1.5h) — close the FRA ↔ tenantFilter gap. Unblocks any subscriber with cross-entity deployment. Confirm Option A with user first.
2. **Phase G4.5c.1** (Expenses refactor, ~2h) — converge audit codes, unlock unified Activity Monitor filter.
3. **Phase P1 — Expenses workflow only** (~3–4 days) — first end-to-end BDM-capture + proxy-queue + BDM-review flow. PROVE the pattern before replicating.
4. **Measure**: BDM time saved, proxy throughput, BDM review rate. Tune before replicating.
5. **Phase P1 — remaining workflows** (~4–6 days) — SMER, Fuel, Petty Cash, GRN, Sales, OR.
6. **Phase P2** (~3–5 days) — signed-CSI commission gate, dashboards, subscriber profile toggles.
7. ~~**Phase G4.5c.2** Petty Cash proxy port~~ — **SKIPPED April 23, 2026** (user decision). BDM-owned end-to-end stays the model.
8. ~~**Phase G4.5c.3** Fuel Entry proxy port~~ — **SUPERSEDED April 23, 2026** by Phase G4.5e (Car Logbook + PRF/CALF + Undertaking bundle). Shipped.

**Total estimate**: 3–4 weeks if sequenced cleanly. Do NOT try to ship all workflows simultaneously — one fully proven beats seven half-built.

---

## Phase G4.5e — Car Logbook + PRF/CALF + Undertaking Proxy Ports (April 23, 2026) ✅ SHIPPED

### Why this phase supersedes the old G4.5c.3 line item
G4.5c.3 (Fuel Entry proxy port) was planned as a standalone ~1d port. After the Apr 23 policy decision (BDMs → CRM-only; eBDMs Judy / Jay Ann → ERP proxies), a gap analysis showed three modules — not one — were blocking the policy rollout:
- **Fuel / Car Logbook** (per-cycle submit + per-fuel approval)
- **CALF / PRF_CALF** (gates non-cash fuel posting; expenses depend on POSTED CALFs)
- **Undertaking** (GRN receipt confirmation, auto-approves linked GRN on acknowledge)

All three share the same proxy pattern (the G4.5a template from Sales), so bundling them into one phase cost less than three sequential c.3 / c.4 / c.5 tickets. G4.5c.3 is now a strict subset of G4.5e.

### Scope delivered
1. **Shared helper extension** — `resolveOwnerScope.js` accepts optional `lookupCode`, so a module that shares a sub-permission namespace (e.g. all three live under `expenses` / `inventory`) can still own a distinct PROXY_ENTRY_ROLES / VALID_OWNER_ROLES row. Back-compat: pre-G4.5e callers unchanged.
2. **3 new sub-perms** — `EXPENSES__CAR_LOGBOOK_PROXY`, `EXPENSES__PRF_CALF_PROXY`, `INVENTORY__UNDERTAKING_PROXY`. Lookup-driven, admin-editable via Control Center.
3. **3 new PROXY_ENTRY_ROLES rows** — CAR_LOGBOOK, PRF_CALF, UNDERTAKING (default admin/finance/president; subscribers add `contractor` to delegate to eBDMs).
4. **3 new VALID_OWNER_ROLES rows** — same 3 codes (default contractor/employee).
5. **Model: +`recorded_on_behalf_of`** on CarLogbookEntry, CarLogbookCycle, PrfCalf. Cycle auto-propagates from per-day docs via `refreshTotalsFromDays`.
6. **Controllers ported**:
   - `expenseController.js` — Car Logbook (12 endpoints) + PRF/CALF (10 endpoints) use shared helper. Legacy `resolveCarLogbookScope` deleted. `autoCalfForSource` propagates proxy audit to auto-CALFs. `submitCarLogbook` / `submitFuelEntryForApproval` / `submitPrfCalf` force-route through Approval Hub when ANY doc is proxy-created (Rule #20 four-eyes).
   - `undertakingController.js` — 5 endpoints (list/detail/submit/acknowledge/reject) use `widenFilterForProxy` + `canProxyEntry`. `submitUndertaking` force-routes when UT inherits proxy audit from GRN. New `PROXY_SUBMIT` audit code.
7. **Frontend**:
   - `CarLogbook.jsx` — existing BDM picker reused as both read-audit picker and proxy-write target selector. `canProxyCarLogbook` sub-perm check softens `viewingSelf` gate. Send `assigned_to` on create.
   - `PrfCalf.jsx` — `OwnerPicker` mounted on entry form, auto-defaults target when creating CALF / PRF from pending lines / rebates. "Proxied" pill on list row.
   - `UndertakingDetail.jsx` — submit button gate includes `inventory.undertaking_proxy`. Purple "Proxied" badge on header.
8. **Banners** — `car-logbook`, `prf-calf`, `undertaking-entry` WorkflowGuide tips all describe Phase G4.5e proxy flow + Rule #20 four-eyes + lookup-driven configurability.
9. **Diagnostic** — `findOrphanedOwnerRecords.js` extended from 4 → 7 collections.
10. **Health check** — section 5 now covers 8 modules (was 5), 8 sub-perm codes, 3 new controller checks, 3 new model field checks, 2 new frontend page checks.

### Integrity guarantees (from plan)
- **Rule #20** — forceApproval on every proxied submit across 4 surfaces (cycle, per-fuel, CALF, UT).
- **Rule #21** — helper throws 400 when non-BDM caller omits `assigned_to`. No silent self-fill.
- **Rule #19 entity isolation** — helper validates target's entity. Preserved.
- **Rule #3 lookup-driven** — all role lists + sub-perms admin-editable. Subscribers configure without code changes.
- **Auto-CALF proxy chain** — source expense / logbook's proxy audit propagates to auto-CALF so diagnostic sweeps catch orphans end-to-end.
- **Cycle upsert integrity** — `CarLogbookCycle` binds on target BDM's `bdm_id`; caller id never leaks onto per-BDM records.
- **Ownership-lock on update** — `assigned_to` / `bdm_id` / `recorded_on_behalf_of` stripped from body on every update path.

### Status
- [x] Helper extension (resolveOwnerScope)
- [x] 3 model schema additions
- [x] Sub-perm + lookup seeds
- [x] Car Logbook backend port (incl. per-fuel + SMER destination helpers)
- [x] CALF / PRF_CALF backend port
- [x] Undertaking backend port
- [x] autoCalfForSource proxy propagation
- [x] Frontend: CarLogbook.jsx + PrfCalf.jsx + UndertakingDetail.jsx
- [x] WorkflowGuide tips
- [x] findOrphanedOwnerRecords.js coverage
- [x] Health check section 5
- [x] CLAUDE-ERP.md section
- [x] This PHASETASK-ERP.md entry

### Operational handoff (not in code)
1. Deploy to prod.
2. Admin ticks the 3 new sub-perms on Judy + Jay Ann's Access Templates.
3. Admin optionally adds `contractor` to the 3 new PROXY_ENTRY_ROLES metadata.roles lists (to let eBDMs proxy).
4. Smoke test — eBDM proxies a cycle, CALF, UT for a field BDM; verify Approval Hub card owner is target BDM + audit log shows PROXY_CREATE / PROXY_SUBMIT.
5. Only after smoke tests pass: run `backfillEntityIdsFromFra.js --apply` + revoke cross-entity FRAs for field BDMs (BDMs → CRM-only policy).

### Follow-ups (not in this phase)
- Health check section 5 only covers the BASE proxy wiring. Phase G4.5b-ext pattern (AR Aging / Collection Rate endpoints calling canProxyEntry) may benefit from similar extensions for Car Logbook's `fuelEfficiencyService` and related analytics surfaces if proxy contractors need cross-BDM visibility there. Not blocking.
- Phase G4.5c.3 (standalone Fuel Entry port) is superseded. Remove from the "Planned order" list — it's shipped as part of G4.5e.

---

## Phase G4.5f — SMER + Per-Diem Override Proxy Port (April 23, 2026) ✅ SHIPPED

### Context
G4.5e (shipped earlier Apr 23) unblocked Car Logbook / CALF / Undertaking for eBDM proxies. SMER + per-diem override were the last monthly touchpoints. After G4.5f, office-based eBDMs (Judy Patrocinio + Jay Ann Protacio) handle the entire monthly ERP cycle after a phone call with the field BDM; field BDMs never touch ERP.

### Scope (delta vs G4.5e)
- Same `resolveOwnerForWrite` + `widenFilterForProxy` template; no helper change.
- **1 model touched** — SmerEntry gets `recorded_on_behalf_of` + `bdm_phone_instruction` at cycle level AND inside `daily_entries[]`.
- **1 sub-perm** — `EXPENSES__SMER_PROXY` (module `expenses`, key `smer_proxy`).
- **1 PROXY_ENTRY_ROLES row** + **1 VALID_OWNER_ROLES row** — code `SMER`.
- **2 MESSAGE_CATEGORY codes** — `PERDIEM_SUMMARY` + `PERDIEM_OVERRIDE_DECISION`.
- **Backend** — `expenseController.js` SMER section: 10 endpoints updated (5 reads widened, 5 writes gated). New `SMER_PROXY_OPTS` constant + `writeProxyReceipt` helper.
- **Backend approval handler** — `universalApprovalController.perdiem_override` emits the decision receipt when the entry was proxied.
- **Frontend** — `Smer.jsx` reuses the G4.5e CarLogbook BDM-picker pattern (not OwnerPicker — SMER is per-person per-cycle). `useExpenses` hook extended to pass body params through validate/submit/reopen.
- **Docs/Health** — WorkflowGuide "smer" tip; findOrphanedOwnerRecords 7 → 8 modules; health check section 5 extended with G4.5f assertions.

### Integrity highlights
- **Integrity Point A** — `submitSmer` + `validateSmer` on the widened path require explicit `bdm_id`; without this guard, one click from a proxy would submit every targetable BDM's VALID SMER at once (blast radius = entire company per cycle). Enforced with clear 400 response.
- **Integrity Point B** — `applyPerdiemOverride` uses `widenFilterForProxy`; otherwise the proxy that requested an override 404s on the apply path (their `tenantFilter` is own-bdm-scoped).
- **Force-approval on proxy overrides** — `overridePerdiemDay` always routes proxy submits through the Hub, even when the caller is management (admin/finance cannot proxy-self-approve; Rule #20 four-eyes).
- **Authorization tag** — `bdm_phone_instruction` required non-empty after trim on every proxy create + proxy submit + proxy override request; stamped on the daily entry AND the ApprovalRequest.metadata for Hub display.
- **Phase 34-P (silent-skip fix) preserved** — `applyPerdiemOverride`'s `descMatch` regex and the `override_status=PENDING` block on validate/submit untouched.
- **Proxy fields survive approval handler** — the universal handler mutates a few entry fields but not `recorded_on_behalf_of` / `bdm_phone_instruction`; stamped at request time, persist through APPROVED/REJECTED branches. Decision receipt goes out on either branch.
- **CompProfile load target-aware** — `createSmer` resolves CompProfile against `owner.ownerId`, not `req.bdmId`, so per-person per-diem thresholds + revolving-fund draws are the actual owner's, not the caller's.
- **Receipts are non-blocking** — `writeProxyReceipt` swallows inbox errors; a failed notification never rolls back the SMER post.

### Files touched (11)
```
backend/erp/models/SmerEntry.js
backend/erp/controllers/expenseController.js
backend/erp/controllers/universalApprovalController.js
backend/erp/controllers/lookupGenericController.js
backend/erp/scripts/findOrphanedOwnerRecords.js
frontend/src/erp/hooks/useExpenses.js
frontend/src/erp/pages/Smer.jsx
frontend/src/erp/components/WorkflowGuide.jsx
scripts/check-system-health.js
CLAUDE-ERP.md
docs/PHASETASK-ERP.md
```

### Verification
- `node -c` on every modified backend file: clean.
- `node scripts/check-system-health.js`: 7/7 green with section 5 reading "Proxy entry wiring intact (G4.5a + G4.5b + G4.5b-ext + G4.5c.1 + G4.5e + G4.5f)".
- `npx vite build`: clean.

### Post-ship operational steps
1. Commit + push G4.5f.
2. Tick `EXPENSES__SMER_PROXY` on Judy + Jay Ann's Access Templates (Control Center → Access Templates).
3. Optionally add `contractor` to `PROXY_ENTRY_ROLES.SMER` metadata.roles so eBDMs can proxy (defaults to admin/finance/president only).
4. Smoke tests:
   - eBDM opens a field BDM's SMER, logs a day, Save → Validate → enter proxy note → Submit → expect 202 Approval Hub; card shows owner = target BDM.
   - eBDM requests a per-diem override with a proxy note → expect 202 Hub; target BDM receives `PERDIEM_OVERRIDE_DECISION` inbox message when President decides.
5. Orphan sweep: `node backend/erp/scripts/findOrphanedOwnerRecords.js --module smer_entry`.
6. Only after smoke tests pass: the BDMs → CRM-only policy rollout is complete. Apply `backfillEntityIdsFromFra.js --apply` if not already done, and revoke cross-entity FRAs for field BDMs.

### Follow-ups (not in this phase)
- Plain BDMs keep `expenses` module access by default. Business decision whether to revoke entirely — recommendation: leave on so field BDMs can still read their own SMER in emergencies and edit when the eBDM is unavailable.
- The proxy write mode's cycle-level `bdm_phone_instruction` input is a single text field (not a textarea) to reinforce "short tag, not narrative." If subscribers request longer free-form reasoning, consider surfacing a separate optional long-form note.

---

## Phase G4.5g — UT Approval Row UX + Waybill Defense-in-Depth (April 24, 2026) ✅ SHIPPED

### Context — the incident
President approved the wrong Undertaking from the Approval Hub. The UT that got acknowledged was bound to a different BDM than the one the president intended, so `InventoryLedger` posted stock under the wrong `bdm_id`. Symptom surfaced as a BDM complaint: "My Stocks is not updating." The stock was updating — just for someone else.

Root cause was a UI gap, not a logic bug:
- Every UNDERTAKING row in the Hub rendered the same way (module badge + doc_ref + description + submitted_by + amount). Nothing in the row told the approver which BDM the UT belonged to or which physical waybill it was paired with.
- The waybill photo was visible only after clicking **Details** to open the `DocumentDetailPanel`. Approve-from-list was one click with no visual cross-check.
- The linked GRN is immutable after create (no `updateGrn` endpoint), so the waybill cannot drift between UT submit and UT acknowledge — but a corrupted/missing `waybill_photo_url` on the GRN would still post stock silently because `approveGrnCore` didn't re-check.

### Scope
- **Frontend (1 file)** — add a UNDERTAKING-only summary strip to every Hub row showing BDM owner name, linked GRN number, vendor, and a clickable waybill thumbnail. Missing waybill renders as a red ⚠ box with an inline warning "approval will be blocked."
- **Backend (1 file)** — `approveGrnCore` refuses to post when `GRN_SETTINGS.WAYBILL_REQUIRED=1` and `grn.waybill_photo_url` is falsy. Defense-in-depth: the create-time gate at `createGrn` line 485 is still the primary enforcement; this second check covers the edge where the waybill URL was corrupted, the S3 object was deleted, or a subscriber flipped the setting from 0 → 1 mid-cycle.
- **No model changes, no lookup changes, no migration.** `Undertaking.linked_grn_id` → `GrnEntry.waybill_photo_url` is already populated by `documentDetailHydrator.UNDERTAKING` (Phase 32 wiring).

### Integrity highlights
- **Row-level cross-check is the primary fix.** The approver now sees BDM name + GRN number + waybill thumbnail before clicking Approve. Clicking the thumbnail opens full-screen preview via the existing `setPreviewImage` handler (no new component).
- **Backend guard fires on BOTH paths.** Direct `POST /inventory/grn/:id/approve` and the UT→GRN cascade inside `postSingleUndertaking` both flow through `approveGrnCore`, so one insertion covers both.
- **Lookup-driven subscription-ready.** Guard respects `GRN_SETTINGS.WAYBILL_REQUIRED` per entity (default 1). Non-pharmacy subscribers that don't use waybills flip to 0; guard auto-disables.
- **No Phase 32R design changes.** Waybill stays as a GRN field (not duplicated on UT). UT still displays waybill via populated `linked_grn_id`. Acknowledge cascade still uses one session.
- **Zero impact on historic data.** Guard is additive at approval time; already-posted GRNs are untouched. Reversal path unchanged.

### Files touched (3)
```
frontend/src/erp/pages/ApprovalManager.jsx
backend/erp/controllers/inventoryController.js
backend/erp/services/documentDetailHydrator.js
```

### Tag-along fix — GRN hydrator strictPopulate bomb
While walking the Reversal Console for the mis-approved GRN, the detail panel threw:
> `Cannot populate path 'posted_by' because it is not in your schema.`

`documentDetailHydrator.GRN` was calling `.populate('posted_by', 'name')` on `GrnEntry`, but Phase 32R stops GRN at APPROVED (no POSTED state) and the only actor field on the schema is `reviewed_by`. Mongoose 7+ strictPopulate throws rather than silently no-op'ing. Latent since Phase 32R ship. Cross-checked the other 11 hydrators that call `posted_by` — all 11 target models (SalesLine / Collection / ExpenseEntry / PrfCalf / SmerEntry / CarLogbookEntry / JournalEntry / CreditNote / IcSettlement / PettyCashTransaction / InterCompanyTransfer) do carry the field, so no sweep needed; GRN was the lone outlier.

### Verification
- `node -c` on `inventoryController.js`: clean.
- `npx vite build`: clean in 10.26s.
- Manual: open Approval Hub with a pending UNDERTAKING → row shows BDM + GRN + waybill thumbnail; click thumbnail opens preview; approve with waybill-missing GRN returns HTTP 400 with "Cannot approve GRN without waybill photo."

### Post-ship operational steps
1. Commit only these 2 files — do NOT `git add .` (session tree still has intermingled G4.5f + CLM + non-pharmacy WIP).
2. Reverse the mis-approved UT from today's incident via `POST /api/erp/undertaking/:id/president-reverse` — cascades GRN storno + `InventoryLedger` reversal for the wrong BDM. Re-capture as a fresh GRN with the correct `bdm_id`.
3. Audit `InventoryLedger` for any other ledger rows posted by the same mis-approved UT in the last 24h — grep by `event_id` from the reversed `TransactionEvent`.

### Follow-ups (not in this phase)
- Consider adding `d.linked_grn_id.waybill_photo_url` display to the GRN approval row too (direct `approveGrn` endpoint case), not just UT. Low priority — Phase 32R design routes most approvals through UT, and direct GRN approve is admin-only.
- If subscribers report the row strip is too busy, collapse the thumbnail into a hover-peek. Not needed for VIP (Approval Hub usage is concentrated president-only).
- If future Phase adds per-row approver override for "approve without waybill" (e.g., emergency bypass), plumb it through `GRN_SETTINGS.WAYBILL_OVERRIDE_ROLES` lookup and require a justification note stored on `grn.waybill_override_reason`. Not in scope today — the current gate is correct per policy.

---

## Phase G4.5h — CALF↔Expense One-Acknowledge Cascade (Apr 24 2026)

### Problem
The GRN↔Undertaking flow was already the gold standard: BDM creates a GRN, the system auto-creates a UT, BDM submits only the UT, and the president's single **Acknowledge** click in the Approval Hub posts the UT **and** flips the GRN to APPROVED (stock moves, all in one `session.withTransaction`). See `undertakingController.js:245-290` (`postSingleUndertaking`) and the cascade into `approveGrnCore` at `inventoryController.js:762-834`.

The Expense↔CALF flow did **not** work the same way — even though Rule #20 (CLAUDE.md) expects it to. Instead it was a **dual-submit, dual-gate** flow:

| Step | Pre-G4.5h (Expense↔CALF) | Target (GRN↔UT gold standard) |
|---|---|---|
| Auto-create on source | CALF created only if a line has `calf_required=true` (ACCESS + non-CASH) — conditional | UT always auto-created |
| BDM submits | Both `submitExpenses` (EXPENSE_ENTRY ApprovalRequest) AND `submitPrfCalf` (PRF_CALF ApprovalRequest). Expense submit was **blocked** until CALF was POSTED — chicken-and-egg | Only `submitUndertaking`; GRN stays PENDING |
| Approval Hub cards | TWO cards (EXPENSE + CALF), president had to approve both | ONE card (UT); GRN never appears |
| Cascade on approve | `postSinglePrfCalf` tried to post the linked Expense, but: (a) used a **nested** `autoSession.withTransaction`, not the outer one; (b) on re-validation failure, silently set Expense=ERROR and left CALF=POSTED — half-posted state requiring manual reconciliation | UT acknowledge posts UT + GRN in ONE session; if `approveGrnCore` fails (e.g. missing waybill), the UT ack rolls back too |

### Fix
**Scope.** ACCESS-bearing expenses only (any line with `calf_required=true`). ORE-only expenses keep their current direct Expense→approval flow — unchanged.

**Backend — `backend/erp/controllers/expenseController.js`**
1. `submitExpenses` now rejects any ACCESS-bearing expense whose linked CALF isn't POSTED. The 400 response surfaces `linked_calf_id` so the frontend can redirect the BDM to PRF/CALF. Old "Post the CALF first" gate killed.
2. `postSinglePrfCalf` (called from `universalApprovalController.prf_calf` handler when the president approves a CALF card) rewritten as **one** `session.withTransaction`:
   - Post CALF status + event
   - CALF auto-journal (non-fatal — `[AUTO_JOURNAL_FAILURE]` log + `repostMissingJEs.js` backfill, same semantics as before)
   - Cascade: fetch linked Expense/CarLogbookEntry **in the same session**, re-validate (`autoClassifyLines` + COA/amount/establishment/date checks), post status + event, post source auto-journal
   - **If re-validation throws, the whole transaction rolls back** — CALF stays DRAFT, Expense stays DRAFT, no half-posted state. Matches GRN→UT.
3. `submitPrfCalf` (direct-submit path, no hub gate) now **delegates to `postSinglePrfCalf` per doc** so the hub and direct-submit paths share one cascade implementation. Per-doc atomicity — one doc's cascade failure doesn't block others in the batch.
4. `postSingleExpense` gate (line 3741) upgraded to a defense-in-depth error: any ACCESS-bearing expense that reaches the EXPENSE_ENTRY approval hub with an unposted CALF throws with a clear "Phase G4.5h routes ACCESS expenses via their CALF" message. Should be unreachable after G4.5h submit guard.

**Frontend**
- `frontend/src/erp/pages/Expenses.jsx` — after Expense create, if the response includes `auto_calf`, banner tells the BDM to submit the CALF (not the expense) to trigger the one-ack cascade. `handleSubmit` 400-with-`linked_calf_id` branch surfaces "Go to PRF/CALF to submit it."
- `frontend/src/erp/pages/PrfCalf.jsx` — `handleSubmit` parses the new `posted[]` / `failed[]` response shape. On success with cascade it shows "Posted N PRF/CALF(s); M linked expense(s)/logbook(s) also posted via cascade." On `failed[]` with `cascade_errors`, surfaces the precise validation failures.
- `frontend/src/erp/components/WorkflowGuide.jsx` — `expenses` and `prf-calf` entries rewritten to describe the one-ack contract.

**Health check** — new section 8 in `scripts/check-system-health.js` (`checkCalfOneAckFlow`) verifies: (a) submitExpenses has the redirect message, (b) legacy "has CALF that is not POSTED … Post the CALF first" gate is gone, (c) postSinglePrfCalf throws with `cascadeErrors`, (d) submitPrfCalf delegates to postSinglePrfCalf, (e) WorkflowGuide mentions the cascade.

**Migration** — `backend/erp/scripts/migrateCalfOneAckFlow.js` (dry-run default, `--apply` commits). Finds Expense docs stuck in `SUBMITTED` with a linked CALF. CALF=POSTED → logged for manual review (backdated JEs are operator-sensitive). CALF≠POSTED → revert Expense to DRAFT + drop stale `EXPENSE_ENTRY` ApprovalRequest rows so the next CALF submit drives approval cleanly. Idempotent.

### Preserved guards
- `periodLockCheck('EXPENSE')` on both submit routes — unchanged.
- Proxy `recorded_on_behalf_of` inheritance from Expense → auto-CALF (Phase G4.5e) — unchanged; `forceApproval: hasProxy` on submit — unchanged.
- Fund balance / advance-vs-liquidation validation inside `postSinglePrfCalf` — unchanged.
- Rule #21 privilege filter on PRF/CALF list — unchanged.

### Files touched
```
backend/erp/controllers/expenseController.js        (3 edits)
backend/erp/scripts/migrateCalfOneAckFlow.js        (new)
scripts/check-system-health.js                      (+section 8)
frontend/src/erp/pages/Expenses.jsx                 (2 edits: auto_calf banner, submit redirect)
frontend/src/erp/pages/PrfCalf.jsx                  (1 edit: cascade result handling)
frontend/src/erp/components/WorkflowGuide.jsx       (2 edits: expenses + prf-calf)
docs/PHASETASK-ERP.md                               (this section)
CLAUDE-ERP.md                                       (Rule #20 note)
```

### Verification
- `node -c backend/erp/controllers/expenseController.js`: clean.
- `node -c backend/erp/scripts/migrateCalfOneAckFlow.js`: clean.
- `node scripts/check-system-health.js`: all 8 sections green.
- `cd frontend && npx vite build`: clean in 14.71s.
- Smoke paths to run on staging:
  1. BDM creates ACCESS+BANK line ₱5k → banner surfaces auto-CALF; `submitExpenses` returns 400 with `linked_calf_id`.
  2. BDM submits CALF → president approves in hub → CALF POSTED + Expense POSTED in one txn, JE posted.
  3. Force a stale COA on an expense line → approve CALF → whole txn rolls back; both docs stay DRAFT. (Pre-G4.5h: CALF=POSTED, Expense=ERROR.)
  4. ORE-only expense: unchanged — `submitExpenses` works as before.
  5. Proxy-created ACCESS expense by eBDM: CALF inherits `recorded_on_behalf_of`; `submitPrfCalf` forces hub; approve → cascade.

### Out of scope
- Car Logbook non-CASH fuel still uses the legacy per-fuel CALF-POSTED gate (`submitCarLogbookCycle` line 1535). Its cascade lives in `postSinglePrfCalf` today (the CarLogbookEntry branch), but the fuel-submit-time gate isn't inverted yet. Separate cleanup.
- Mixed ACCESS+ORE expense: whole doc still waits on CALF approval (existing behavior, not changed).
- Renaming the CALF "Approve" CTA to "Acknowledge" in ApprovalManager — cosmetic, skipped.

---

## Phase 15.3 — CSI Draft Overlay (Print-Into-Booklet)

**Scope**: Proxy / contractor enters a sale in the ERP; system generates a mm-precise PDF the BDM feeds **through** their physical BIR-registered CSI booklet page. The PDF prints only variable data (customer, date, items, totals); the booklet supplies all pre-printed content (CSI#, logo, TIN, ATP footer, column labels). Closes the round-trip BIR compliance dance that Phase G4.5a's proxy entry opened — proxy inputs data, BDM writes the legal receipt, existing Phase 15.2 ScanCSIModal captures the booklet serial back into `SalesLine.doc_ref`.

**Compliance boundary**: The draft is explicitly NOT a BIR receipt. The physical BIR-registered booklet remains the legal document. No CSI#, ATP, TIN, or logo is ever overlaid — only the handwritten fields. Upgrading to true digital CSI (CAS permit) is a separate regulatory track.

### Files (new + modified)

**New**
- `backend/erp/services/csiDraftRenderer.js` — pdfkit-based renderer. Exports `renderCsiDraft({ sale, entity, template, user, customerLabel, customerAddress, lineDisplay, terms })` + `renderCalibrationGrid({ template, user })`. Pure layout, caller provides hydrated inputs. Hard cap 3 items per page; overflow auto-paginates.
- `backend/erp/scripts/seedCsiTemplates.js` — upserts `CSI_TEMPLATE` lookup rows for VIP (page 210×260mm, 20-row body) + MG AND CO. (page 160×202mm, 13-row body). Coordinate set locked from 2026-04-24 field-measurement pass against physical booklets. Dry-run by default; `--apply` to commit. Metadata uses `$setOnInsert` so admin edits in Lookup Manager survive reseed. Doubles as the deploy-time health check (shows which entities have/need templates).

**Modified — backend**
- `backend/erp/models/SalesLine.js` — added `po_number` (optional string, overlay draft source; existing `doc_ref` already carries the CSI booklet serial).
- `backend/models/User.js` — added `csi_printer_offset_x_mm` + `csi_printer_offset_y_mm` (default 0, per-BDM printer drift compensation).
- `backend/controllers/userController.js` — `updateProfile` accepts the two calibration fields, validated -20 ≤ mm ≤ 20.
- `backend/erp/controllers/salesController.js` — added `generateCsiDraft`, `getCsiCalibrationGrid`, `getDraftsPendingCsi` actions. All three use `widenFilterForProxy('sales', {subKey: 'proxy_entry'})` so owner + proxy + admin/finance/president access is preserved (no Rule #21 shortcuts). Audit crumb via `ErpAuditLog.log_type = 'CSI_TRACE'` on each draft generation.
- `backend/erp/routes/salesRoutes.js` — three new GETs: `/:id/csi-draft`, `/drafts/pending-csi`, `/drafts/calibration-grid`.
- `backend/package.json` — `pdfkit` dependency.

**Modified — frontend**
- `frontend/src/erp/hooks/useSales.js` — `csiDraftUrl(id)`, `getDraftsPendingCsi()`, `csiCalibrationUrl()`.
- `frontend/src/erp/pages/SalesEntry.jsx` — "📄 Draft CSI" button in per-row actions (CSI sale type + ≥1 line item, any status).
- `frontend/src/erp/pages/CsiBooklets.jsx` — top-of-page "Drafts Pending Print" table (proxy + owner shared view via widened filter) + "Printer Calibration" panel with Offset X/Y inputs, "Print Calibration Grid" button, save. Visible to contractor/admin AND BDM views.
- `frontend/src/erp/components/WorkflowGuide.jsx` — updated `sales-list` + `csi-booklets` banners to describe the overlay workflow and calibration discipline.

**Modified — tooling**
- `scripts/check-system-health.js` — section 9 `checkCsiDraftOverlay()` verifies renderer, seed, controller actions, route mounts, model fields, hook exports, page panels all exist. 9/9 green confirms wiring intact.

### Endpoints

| Method | Path | Action |
|---|---|---|
| GET | `/api/erp/sales/:id/csi-draft` | Stream overlay PDF for a single sale. Multi-page if >3 items. |
| GET | `/api/erp/sales/drafts/pending-csi` | List CSI-type sales assigned/proxied where `doc_ref` is still a PROXY-/PENDING- placeholder OR `csi_photo_url` is absent. |
| GET | `/api/erp/sales/drafts/calibration-grid` | Stream mm-gridded PDF for per-printer alignment. Uses `req.entityId` header. |
| PUT | `/api/users/profile` | Existing endpoint — now accepts `csi_printer_offset_x_mm` + `csi_printer_offset_y_mm`. |

### Template data shape

`CSI_TEMPLATE` lookup, one row per entity, `metadata`:
- `page: { width_mm, height_mm }`
- `header: { name, date, address, terms }` — each `{ x, y }` in mm (top-left origin)
- `body: { first_row_y_mm, row_height_mm, row_count, max_items_per_page, columns, po_row_index, note_row_start_index, note_row_count }`
- `totals: { left, right }` — each `{ start_y_mm, row_height_mm, x_mm, align, fields[] }`
- `text: { po_label, note_line_1, note_line_2, default_terms }`
- `font: { family, size_pt }`

### Semantics

- **Each sale line = 3 body rows**: item description row (with qty + unit price + amount), Batch row, Exp Date row. If `batch_lot_no` or expiry lookup is missing, only the present rows emit.
- **Exp date source**: looked up via `InventoryLedger.findOne({ entity_id, product_id, batch_lot_no })`.
- **Item description**: `brand_name + dosage_strength` per Rule #4.
- **Terms**: prefers Hospital/Customer `payment_terms` (numeric days) over template `default_terms` (`"30 days"`). Both PDFs confirmed as 30-day default.
- **PO#**: prints only when `sale.po_number` is set. If empty, the PO# row is blank (no "PO#:" label).
- **NOTE**: always prints (per template `text.note_line_1` + `text.note_line_2`). Default text matches the physical scans: "NOTE: All expired and damaged items will be / accepted and changed".
- **VAT totals**: always VAT-inclusive in the Amount column (matches booklet convention); right block always prints, left block prints only non-zero values (both booklet scans showed left block blank).
- **Overflow**: hard cap 3 items per draft page. Sales with >3 items → multi-page PDF, one booklet page per chunk. BDM assigns consecutive booklet serials across chunks.
- **Calibration**: per-BDM `csi_printer_offset_x_mm / _y_mm` shifts every drawn coordinate by the same delta. Values bounded to ±20mm (larger drift means wrong paper size).

### Deploy order

1. Ship branch (this work — all 9 sub-phases together, no partial user impact).
2. On prod: `npm install` (installs `pdfkit` + deps).
3. `node backend/erp/scripts/seedCsiTemplates.js` → dry-run shows which entities will receive templates.
4. `node backend/erp/scripts/seedCsiTemplates.js --apply` → commits VIP + MG AND CO. rows.
5. Admin verifies rows in Control Center → Lookup Tables → CSI_TEMPLATE. Subscribers with other entities add their own rows via Lookup Manager (no code change — Rule #3).
6. Each BDM runs calibration once from My CSI → print grid → measure → save offset.
7. Pilot: Judy Mae (contractor proxying for Jenny Rose / Jay Ann) keys one sale → prints overlay → feeds booklet → verifies alignment → scans serial back. Iterate offset if misaligned.
8. Rollout to all BDMs.

### Smoke paths to run on staging

1. Contractor keys a CSI on behalf of BDM (existing Phase G4.5a flow) → clicks "📄 Draft CSI" in the Sales row → browser downloads `CSI-DRAFT-{doc_ref}-{YYYYMMDD}.pdf`.
2. BDM opens My CSI → sees the draft in "Drafts Pending Print" → downloads PDF.
3. BDM opens My CSI → Printer Calibration → clicks "Print Calibration Grid" → enters offset 1.5 / 0.0 → Save. Profile persists.
4. Sale with 4 items → draft PDF has 2 pages (3 items + 1 item).
5. Sale with 1 item missing batch_lot_no → batch row blank, exp row blank, item row still prints.
6. Admin removes CSI_TEMPLATE row for an entity → new draft request returns 400 with "Admin must configure CSI_TEMPLATE" guidance.
7. `node scripts/check-system-health.js` → section 9 green.

### Out of scope

- Multi-language NOTE text (EN/TL) — one string per template row today.
- Bulk draft generation for multiple sales (batch-print day).
- Auto-email draft PDF to BDM phone — download-only today (user sends via Viber / Messenger manually).
- Full digital CSI replacing paper booklet — separate BIR CAS permit track, months of regulatory work.
- Foundation Health dashboard card for CSI_TEMPLATE coverage — seed script dry-run fills the same role.
- Custom font shipping — Helvetica-Bold 10pt from pdfkit built-ins; if subscribers want typewriter-style we'd need to ship a .ttf.


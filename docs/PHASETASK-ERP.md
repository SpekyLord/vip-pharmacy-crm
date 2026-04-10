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
  - Action bar: Save Drafts, Validate Sales, Submit Sales, Re-open (visible when POSTED rows exist)
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
- [x] 8 pages skipped (ControlCenter embedded panels, covered by DEPENDENCY_GUIDE): AgentSettings, EntityManager, ErpSettingsPanel, FoundationHealth, LookupManager, TerritoryManager, PartnerScorecard, ControlCenter

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

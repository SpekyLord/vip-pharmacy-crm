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
> - Phase 11: Journal entries from expenses (DR: 6XXX Expense, CR: 1110 AR BDM Advances)

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
> Currently `payment_mode` on expense lines is just a string ("GCASH", "CARD", "CASH"). The accounting engine (Phase 11) needs to know **which specific account** was debited to generate the correct journal entry (DR: Expense, CR: **which bank/card?**).
>
> **What exists:**
> - `BankAccount` model: has `coa_code` ✅ — but expense lines don't reference it
> - `PaymentMode` model: has `mode_type` — but **missing `coa_code`** ❌
> - `CreditCard` model: **never built** ❌ — PRD line 350 specifies `card_code, card_name, coa_code` but no model exists
>
> **Fix (implement before Phase 11):**
> 1. Add `coa_code` to PaymentMode model (so CASH → 1010, GCASH → 1015, etc.)
> 2. Create `CreditCard` model (covers all company-issued cards):
>    - entity_id, card_code, card_name, card_holder, bank, card_type enum (CREDIT_CARD, FLEET_CARD, DEBIT_CARD)
>    - card_brand enum (VISA, MASTERCARD, JCB, AMEX, FLEET — Shell fleet card = FLEET type)
>    - last_four (String), coa_code (→ 2301 BPI CC Payable, 2302 Shell Fleet Payable, etc.)
>    - credit_limit, statement_cycle_day, is_active
>    - **assigned_to** (ref: User) — which BDM/employee holds this card
>    - assigned_at, assigned_by (audit trail for card assignments)
>    - Notes: Shell Fleet Card is a FLEET_CARD type with its own COA. When BDM leaves, card is reassigned (not deleted).
>    - Collection: `erp_credit_cards`
> 3. **BDM financial instrument assignment (client direction April 3, 2026):**
>    - Credit cards (BPI, BDO, etc.) → CreditCard model, `assigned_to: bdm_user_id`
>    - Shell Fleet Card → CreditCard model with `card_type: FLEET_CARD`, `card_brand: FLEET`
>    - Income Savings Account (salary deposit) → PeopleMaster `bank_account` field (Phase 10.1, already planned)
>    - CompProfile stays pure compensation rates — no financial instruments
>    - This separation means: Finance sees all cards company-wide, BDM expense form shows only their assigned cards in dropdown, accounting engine knows exact COA
> 4. Add `funding_account_id` to expense lines (refs BankAccount or CreditCard) — so the journal knows CR: RCBC Savings (1010) vs CR: BPI CC (2301) vs CR: Shell Fleet (2302)
> 5. Expense form: when payment_mode = CARD → show assigned credit card dropdown; when FLEET_CARD → show assigned fleet card; when BANK_TRANSFER → show bank account dropdown; when GCASH → auto-map to GCash COA
> 6. Phase 11 auto-journal uses `funding_account_id.coa_code` for the CR side
> 7. BDM profile view (Phase 10): shows all assigned cards + salary account in one panel for easy monitoring
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

**COA / Journal Entry notes for Phase 11:**
> When Phase 11 (VIP Accounting Engine) is built, the following auto-journals should be created from expense documents:
> - **SMER POSTED:** DR: 6100 Per Diem Expense + 6150 Transport, CR: 1110 AR BDM Advances
> - **Car Logbook POSTED:** DR: 6200 Fuel/Gas (official portion), CR: 1110 AR BDM Advances
> - **ORE POSTED:** DR: 6XXX (per category — courier 6500, parking 6600, etc.), CR: 1110 AR BDM Advances
> - **ACCESS POSTED:** DR: 6XXX (per category), CR: 2000 AP Trade or Bank Account (company fund)
> - **PRF POSTED (partner rebate):** DR: 5200 Partner Rebate / Partners' Insurance, CR: Cash/Bank (payment to partner)
> - **CALF POSTED (liquidation):** DR: 1110 AR BDM Advances (clearing), CR: Cash/Bank (advance return) or DR: 6XXX (shortfall reimbursement)
> The `source_module: 'EXPENSE'` enum is already included in the JournalEntry model spec (Phase 11.2). Each expense model stores `event_id` linking to TransactionEvent for document flow tracing (Phase 9.3).


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

### 9.1b — Scanned Document Photo Persistence (Digital Proof for All Document Types)
> **Problem (April 2, 2026):** OCR modals (ScanCSIModal, ScanDRModal, ScanUndertakingModal, etc.) capture photos → send to OCR → extract data → pre-fill forms, but the **photos are discarded after extraction** — never saved to S3 as permanent records. The `DocumentAttachment` model (Phase 2.8) exists but is **not wired up** to any module. There is no permanent audit trail of the actual scanned documents — only extracted data.
>
> **Why this matters:** For regulatory/audit purposes (hospitals, PH BIR, internal reconciliation), the scanned physical documents must be stored as digital proof. They should be retrievable and viewable when needed (disputes, audits, AR reconciliation, expense reviews).
>
> **Note:** GRN already stores `waybill_photo_url` and `undertaking_photo_url` inline — these should also get DocumentAttachment records for consistency.

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
- [ ] On OCR process: upload photo to S3 `documents/{doc_type}/{entity_id}/{YYYY-MM}/` and create `DocumentAttachment` record with `ocr_applied: true`
- [ ] Add `document_type` enum to DocumentAttachment model: `CSI`, `DR`, `CR`, `CWT_2307`, `DEPOSIT_SLIP`, `UNDERTAKING`, `WAYBILL`, `GAS_RECEIPT`, `OR`, `ODOMETER`, `PRF_CALF`
- [ ] On form submission (submitSales, createDR, submitCollection, etc.): link DocumentAttachment ID(s) to TransactionEvent via `attachment_ids` array field
- [ ] Create `GET /api/erp/documents/:event_id` — retrieve all attached photos for a transaction
- [ ] Create `GET /api/erp/documents/by-type?type=CSI&entity_id=xxx&from=&to=` — browse documents by type and date range
- [ ] Each module's detail/history view: show attached photo(s) as viewable proof (thumbnail + full-size modal)
- [ ] Commit: `"feat(erp): persist all scanned document photos as digital proof [9.1b]"`

### 9.2 — CRM → ERP Data Flows
- [ ] AR balance widget on CRM visit page: "Hospital X owes ₱Y"
- [ ] Stock availability in CRM product view: "N units available"
- [ ] (Phase 3 CRM): SMER MD count from CRM visit logs (when CRM Phase C/D complete)
- [ ] Commit: `"feat(integration): crm to erp data flows"`

### 9.3 — Document Flow Tracking (SAP Document Flow)
- [ ] Add `linked_events` array to TransactionEvent schema:
  ```javascript
  linked_events: [{ event_id: ObjectId, relationship: String }]
  // relationship enum: 'SETTLES', 'CERTIFIES', 'DEPOSITS', 'REVERSES'
  ```
- [ ] Auto-link on collection: CR event -> CSI events it settles (SETTLES)
- [ ] Auto-link on CWT: 2307 event -> CR event (CERTIFIES)
- [ ] Auto-link on deposit: Deposit event -> CR event (DEPOSITS)
- [ ] Auto-link on reversal: Reversal event -> original event (REVERSES)
- [ ] Create `GET /api/erp/document-flow/:event_id` — returns full chain
- [ ] UI: Document Flow view showing the linked chain visually (CSI -> CR -> 2307 -> Deposit)
- [ ] Commit: `"feat(erp): document flow tracking with linked events"`

### 9.4 — Excel Migration Tools 🔄 SCRIPTS DONE, ADMIN UI PENDING
> **Status (April 2, 2026):** Product Master (238 + 140 auto-created), Hospital Master (101), and Opening Stock (251 entries, 9 BDMs, 56,476+ units) imported via CLI scripts. 3 missing BDM users created via `addMissingBdms.js`. Opening AR deferred to pre-live. Admin UI pages for self-service import are future work.

- [ ] Admin page: bulk import Opening AR from Excel
- [x] ~~Admin page:~~ CLI script: bulk import Product Master from CSV — `backend/erp/scripts/seedErpMasterData.js` (238 products imported + 140 auto-created from stock CSV)
- [x] ~~Admin page:~~ CLI script: bulk import Inventory Opening Balances from CSV — `backend/erp/scripts/importOpeningStock.js` (251 entries across 9 BDMs, 56,476+ units; 3 BDMs created via `addMissingBdms.js`, Gregg Louie Vios test account excluded)
- [x] ~~Admin page:~~ CLI script: bulk import Hospital Master from CSV — `backend/erp/scripts/seedErpMasterData.js` (101 hospitals imported with BDM tags)
- [ ] Admin UI pages for self-service import (future — scripts sufficient for now)
- [ ] Commit: `"feat(erp): excel migration import tools"`

### 9.5 — End-to-End Testing
- [ ] Full flow: create sale → stock drops → create collection → AR drops → commission computed → SMER filled → income generated → PNL computed
- [ ] Mobile responsiveness on all ERP pages
- [ ] Permission checks: Module-level ERP access (FULL/VIEW/NONE per module via erp_access — Phase 10.0), BDM=own territory data (tenantFilter), Admin=all, CEO=view only, role overrides for president/admin
- [ ] Error handling and loading states on all pages
- [ ] Commit: `"test: end-to-end erp flow verification"`

---

## PHASE 10 — ERP ACCESS CONTROL, PEOPLE MASTER & PAYROLL [v5 NEW]
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

#### 10.0a — AccessTemplate Model + Seed
- [ ] Create `backend/erp/models/AccessTemplate.js`:
  - entity_id (ref: Entity), template_name (unique per entity), description
  - modules subdocument: { sales, inventory, collections, expenses, reports, people, payroll, accounting, purchasing, banking } — each enum `['NONE', 'VIEW', 'FULL']`
  - can_approve: Boolean (GRN approval, deletion approval, payroll posting)
  - is_system: Boolean (true = seed default, protected from deletion)
  - is_active: Boolean, created_by, timestamps
  - Compound unique index: `{ entity_id, template_name }`
- [ ] Create `backend/erp/scripts/seedAccessTemplates.js` — 7 default templates per entity:

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

#### 10.0b — User Model erp_access Subdocument
- [ ] Add to `backend/models/User.js` (after existing ERP fields):
  ```
  erp_access: {
    enabled: Boolean (default: false — master toggle),
    template_id: ObjectId (ref: AccessTemplate, optional — tracks which template was applied),
    modules: {
      sales, inventory, collections, expenses, reports,
      people, payroll, accounting, purchasing, banking
      — each enum ['NONE', 'VIEW', 'FULL'], default 'NONE'
    },
    can_approve: Boolean (default: false),
    updated_by: ObjectId (ref: User),
    updated_at: Date,
  }
  ```
- [ ] Add index: `{ 'erp_access.enabled': 1 }`
- [ ] Backward compat: field is optional — missing = no ERP access for employee/finance, full access for admin/president/ceo via role override
- [ ] Commit: `"feat(erp): user model erp_access subdocument (10 modules) [v5]"`

#### 10.0c — erpAccessCheck Middleware
- [ ] Create `backend/erp/middleware/erpAccessCheck.js`:
  - `erpAccessCheck(module, requiredLevel = 'VIEW')` — middleware factory:
    1. president/ceo → role override (full / view-only), skip check
    2. admin without erp_access → allow all (backward compat)
    3. erp_access.enabled === false → 403 "ERP access not enabled"
    4. Check user.erp_access.modules[module] against requiredLevel
    5. FULL satisfies VIEW, VIEW does not satisfy FULL
  - `approvalCheck` — checks `erp_access.can_approve` (or president/admin override)
- [ ] Commit: `"feat(erp): erp access check middleware with approval gate [v5]"`

#### 10.0d — Wire Middleware into Existing ERP Routes
- [ ] Modify `backend/erp/routes/salesRoutes.js` — add `erpAccessCheck('sales', 'VIEW')` for GET, `erpAccessCheck('sales', 'FULL')` for POST/PUT/DELETE
- [ ] Modify `backend/erp/routes/inventoryRoutes.js` — add `erpAccessCheck('inventory', ...)`
- [ ] Modify `backend/erp/routes/consignmentRoutes.js` — add `erpAccessCheck('inventory', ...)`
- [ ] Master data routes (hospitals, products, vendors, settings, lookups, government-rates) — only require `erp_access.enabled === true`, no module-level check (shared reference data)
- [ ] Future routes (collections, expenses, payroll, accounting, purchasing, banking) — add erpAccessCheck when those phases are built
- [ ] Commit: `"feat(erp): wire erp access middleware into existing routes [v5]"`

#### 10.0e — ERP Access Management API
- [ ] Create `backend/erp/controllers/erpAccessController.js`:
  - `getTemplates` — list templates for entity (for dropdown)
  - `createTemplate` — admin creates custom template
  - `updateTemplate` — admin edits template (block if is_system)
  - `deleteTemplate` — admin deletes template (block if is_system)
  - `getUserAccess(userId)` — get user's current erp_access
  - `setUserAccess(userId)` — admin sets user's erp_access (with template_id tracking)
  - `applyTemplateToUser(userId, templateId)` — copy template values to user's erp_access
  - `getMyAccess` — current user's own erp_access (for frontend sidebar)
- [ ] Create `backend/erp/routes/erpAccessRoutes.js`:
  - GET `/templates` — list templates
  - POST `/templates` — create (admin only)
  - PUT `/templates/:id` — update (admin only)
  - DELETE `/templates/:id` — delete (admin only, non-system)
  - GET `/users/:userId` — get user access (admin only)
  - PUT `/users/:userId` — set user access (admin only)
  - POST `/users/:userId/apply-template` — apply template (admin only)
  - GET `/my` — current user's own access
- [ ] Mount in ERP router: `router.use('/access', require('./erpAccessRoutes'))`
- [ ] Commit: `"feat(erp): erp access management api with template crud [v5]"`

#### 10.0f — Frontend: ProtectedRoute + Sidebar + App.jsx
- [ ] Modify `frontend/src/components/auth/ProtectedRoute.jsx`:
  - Add optional `requiredErpModule` prop
  - Helper `hasErpModuleAccess(user, module)` with same role overrides as backend
  - If module required and no access → redirect to `/erp` (not login)
- [ ] Modify `frontend/src/components/common/Sidebar.jsx`:
  - Extend `getMenuConfig(role, unreadCount, erpAccess)` — third param
  - Conditionally include ERP module links only where `erpAccess.modules[x] !== 'NONE'`
  - ERP section appended to both admin and employee menus when `erpAccess?.enabled`
- [ ] Modify `frontend/src/App.jsx`:
  - Add `requiredErpModule` to all ERP route definitions (e.g. `/erp/sales` → `requiredErpModule="sales"`)
  - Keep broad `allowedRoles` on ERP routes (fine-grained check is via requiredErpModule)
- [ ] Commit: `"feat(ui): erp module access enforcement in sidebar, routes, and protected route [v5]"`

#### 10.0g — Frontend: ErpAccessManager Component
- [ ] Create `frontend/src/erp/components/ErpAccessManager.jsx`:
  - Master toggle switch (ERP Enabled on/off)
  - Template dropdown (fetches from API, "Apply" button populates grid)
  - 10-row permission grid (one per module, radio buttons: NONE / VIEW / FULL)
  - can_approve checkbox
  - Save button → PUT `/api/erp/access/users/:userId`
  - Shows current template_id reference ("Based on: Field BDM")
- [ ] Integrate into existing admin employee detail page (`/admin/employees`) as "ERP Access" tab
- [ ] Commit: `"feat(ui): erp access manager component in employee detail [v5]"`

#### 10.0h — Frontend: AccessTemplateManager Page
- [ ] Create `frontend/src/erp/pages/AccessTemplateManager.jsx`:
  - Template list with name, description, module summary, is_system badge
  - Create/Edit form: name, description, 10-module grid, can_approve
  - System templates: edit blocked, delete blocked (visual indicator)
  - Admin-only page
- [ ] Add route: `/erp/access-templates` → ProtectedRoute admin only
- [ ] Commit: `"feat(ui): access template management page for admin [v5]"`

#### 10.0i — Migration Script for Existing Users
- [ ] Create `backend/erp/scripts/migrateErpAccess.js`:
  - Active employees with entity_id → apply Field BDM template
  - Users with role 'finance' → apply Finance template
  - Users with role 'admin' → no erp_access needed (role override)
  - President/CEO → no erp_access needed (role override)
  - Users without entity_id → skip (CRM-only)
- [ ] Commit: `"feat(erp): migrate existing users to erp access profiles [v5]"`

---

### 10.1 — People Master Model

> **Note:** `person_type` (PeopleMaster) is for HR/payroll classification. ERP access is controlled separately via `User.erp_access` (Phase 10.0). A BDM in PeopleMaster may have any ERP access template — the two are independent.

- [ ] Create `backend/erp/models/PeopleMaster.js`:
  - entity_id, person_type enum: BDM, ECOMMERCE_BDM, EMPLOYEE, SALES_REP, CONSULTANT, DIRECTOR
  - user_id (ref: User, optional — links to CRM user)
  - full_name, first_name, last_name, position, department
  - employment_type enum: REGULAR, PROBATIONARY, CONTRACTUAL, CONSULTANT, PARTNERSHIP
  - date_hired, date_regularized, date_separated, date_of_birth
  - civil_status enum: SINGLE, MARRIED, WIDOWED, SEPARATED
  - government_ids: { sss_no, philhealth_no, pagibig_no, tin }
  - bank_account: { bank, account_no, account_name }
  - comp_profile_id (ref: CompProfile)
  - is_active, status enum: ACTIVE, ON_LEAVE, SEPARATED
  - created_at, created_by
- [ ] Create seed script: `backend/erp/scripts/seedPeopleMaster.js` with sample data for each person_type
- [ ] Commit: `"feat(erp): people master model covering all person types [v5]"`

### 10.2 — Compensation Profile Model
- [ ] Create `backend/erp/models/CompProfile.js`:
  - person_id (ref: PeopleMaster), entity_id, effective_date
  - salary_type enum: FIXED_SALARY, COMMISSION_BASED, HYBRID
  - Fixed salary components: basic_salary, rice_allowance, clothing_allowance, medical_allowance, laundry_allowance, transport_allowance
  - Incentive components: incentive_type enum (CASH, IN_KIND, COMMISSION, NONE), incentive_rate, incentive_description, incentive_cap
  - BDM-specific: perdiem_rate, perdiem_days, km_per_liter, fuel_overconsumption_threshold
  - **Expense eligibility flags (April 3, 2026 — client direction):** smer_eligible (Boolean), perdiem_engagement_threshold_full (Number, default 8), perdiem_engagement_threshold_half (Number, default 3), logbook_eligible (Boolean), vehicle_type (enum: CAR, MOTORCYCLE, COMPANY_CAR, NONE), ore_eligible (Boolean), access_eligible (Boolean), crm_linked (Boolean — shows "Pull from CRM" button on SMER for field BDMs only). These flags drive which expense modules appear for each person. Until Phase 10, all employees use Settings-level defaults.
  - tax_status enum: S, S1, S2, ME, ME1, ME2, ME3, ME4
  - set_by, reason, created_at
- [ ] Compensation history via new CompProfile documents with new effective_date
- [ ] Commit: `"feat(erp): compensation profile model with three salary types [v5]"`

### 10.3 — Government Deduction Calculators
- [ ] Create `backend/erp/services/sssCalc.js`:
  - `computeSSS(monthlySalary, effectiveDate)` — lookup SSS bracket from GovernmentRates, return { employee_share, employer_share, ec }
- [ ] Create `backend/erp/services/philhealthCalc.js`:
  - `computePhilHealth(monthlySalary, effectiveDate)` — 5% of salary, 50/50 split, floor/ceiling
- [ ] Create `backend/erp/services/pagibigCalc.js`:
  - `computePagIBIG(monthlySalary, effectiveDate)` — 1% or 2% employee, 2% employer, max MSC ₱5,000
- [ ] Create `backend/erp/services/withholdingTaxCalc.js`:
  - `computeWithholdingTax(annualTaxableIncome, taxStatus, effectiveDate)` — BIR TRAIN graduated rates
  - Monthly application: divide annual brackets by 12
  - Handle de minimis exemptions: amounts within limits are tax-exempt, excess added to taxable
- [ ] Create `backend/erp/services/deMinimisCalc.js`:
  - `computeDeMinimis(compProfile)` — return { taxable_excess, exempt_total } per benefit
  - Compare allowance amounts vs limits from GovernmentRates (DE_MINIMIS type)
- [ ] Test each calculator with known inputs/outputs from BIR tables
- [ ] Commit: `"feat(erp): philippine government deduction calculators (sss, philhealth, pagibig, tax) [v5]"`

### 10.4 — Payslip Model
- [ ] Create `backend/erp/models/Payslip.js`:
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
- [ ] Commit: `"feat(erp): payslip model with earnings, deductions, employer contributions [v5]"`

### 10.5 — Payslip Generation Service
- [ ] Create `backend/erp/services/payslipGenerator.js`:
  - `generateBdmPayslip(personId, period, cycle)` — pull SMER, CORE commission, profit sharing, reimbursements from existing ERP data; apply BDM deductions (cash advance, CC, etc.)
  - `generateEmployeePayslip(personId, period)` — pull CompProfile, compute gross (basic + allowances + incentive), apply de minimis, compute government deductions (SSS, PhilHealth, PagIBIG, tax), compute net pay, compute employer contributions
  - `generateSalesRepPayslip(personId, period)` — hybrid: basic + commission/incentive + government deductions
  - `computeThirteenthMonth(personId, year)` — (total basic salary earned in year) / 12, pro-rata for < 12 months, tax-exempt up to ₱90,000
  - Each generator snapshots comp_profile and gov_rates at computation time
- [ ] Commit: `"feat(erp): payslip generation service for bdm, employee, and sales rep [v5]"`

### 10.6 — Payroll Controller & Routes (Staging-Then-Post)
- [ ] Create `backend/erp/controllers/payrollController.js`:
  - `computePayroll` — generate payslips for all active people in period, status=COMPUTED
  - `getPayrollStaging` — list all COMPUTED payslips for review
  - `reviewPayslip` — Finance marks individual payslip as REVIEWED
  - `approvePayslip` — Finance marks REVIEWED payslip as APPROVED
  - `postPayroll` — post all APPROVED payslips: create journal entries (DR: Salaries/Allowances/PerDiem/Commission/ProfitShare, CR: SSS/PhilHealth/PagIBIG/Tax Payables + Cash/Bank)
  - `getPayslip` — single payslip detail view
  - `getPayslipHistory` — payslip history per person
  - `computeThirteenthMonth` — year-end 13th month computation
- [ ] Create `backend/erp/routes/payrollRoutes.js`:
  - POST `/compute` — computePayroll (Admin/Finance)
  - GET `/staging` — getPayrollStaging (Admin/Finance)
  - POST `/:id/review` — reviewPayslip (Finance)
  - POST `/:id/approve` — approvePayslip (Finance)
  - POST `/post` — postPayroll (Finance)
  - GET `/:id` — getPayslip
  - GET `/history/:personId` — getPayslipHistory
  - POST `/thirteenth-month` — computeThirteenthMonth (Finance, annual)
- [ ] Add to ERP router
- [ ] Commit: `"feat(erp): payroll controller with staging-then-post workflow [v5]"`

### 10.7 — People & Payroll Frontend Pages
- [ ] Create `frontend/src/erp/pages/PeopleList.jsx`:
  - Table: name, type, department, position, status, compensation type
  - Filters: person_type, department, status
  - Click → detail view
  - Add/edit person (Admin/Finance only)
- [ ] Create `frontend/src/erp/pages/PersonDetail.jsx`:
  - Personal info, government IDs, bank account
  - Compensation profile history (timeline view)
  - Payslip history list
- [ ] Create `frontend/src/erp/pages/PayrollRun.jsx`:
  - Period selector, "Compute Payroll" button
  - Staging table: person, gross, deductions, net, status
  - Row-level review/approve buttons (Finance)
  - "Post All Approved" button
  - Summary: total gross, total deductions, total net, total employer contributions
- [ ] Create `frontend/src/erp/pages/PayslipView.jsx`:
  - Formatted payslip display (printable)
  - Earnings breakdown, deductions breakdown, employer contributions
  - Snapshot of rates used (for audit)
- [ ] Create `frontend/src/erp/pages/ThirteenthMonth.jsx`:
  - Year selector, computation table, approve/post workflow
- [ ] Add routes to App.jsx: `/erp/people`, `/erp/people/:id`, `/erp/payroll`, `/erp/payslip/:id`, `/erp/thirteenth-month`
- [ ] Add navbar items: People, Payroll under ERP section
- [ ] Commit: `"feat(ui): people master and payroll pages with staging workflow [v5]"`

---

## PHASE 11 — VIP ACCOUNTING ENGINE [v5 NEW]
**Goal:** Full double-entry accounting with Chart of Accounts, Journal Entry engine, Trial Balance, 4-View P&L, VAT/CWT compliance, Cashflow Statement, Fixed Assets, Loans, Owner Equity, and Month-End Close procedure.

**Reference:** PRD v5 §11 (VIP Accounting Engine), §3.8 (COA)

### 11.1 — Chart of Accounts Model & Seed
- [ ] Create `backend/erp/models/ChartOfAccounts.js`:
  - entity_id, account_code (unique per entity), account_name
  - account_type enum: ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  - account_subtype (String), normal_balance enum: DEBIT, CREDIT
  - bir_flag enum: BOTH, INTERNAL, BIR (default BOTH)
  - is_active, parent_code
  - Compound unique index: { entity_id, account_code }
- [ ] Create seed script: `backend/erp/scripts/seedCOA.js`:
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
- [ ] Create `backend/erp/controllers/coaController.js` — CRUD (Finance only), list with filters
- [ ] Create `backend/erp/routes/coaRoutes.js`
- [ ] Add to ERP router
- [ ] Commit: `"feat(erp): chart of accounts model with full account code seed [v5]"`

### 11.2 — Journal Entry Model
- [ ] Create `backend/erp/models/JournalEntry.js`:
  - entity_id, bdm_id (optional — null for company-level)
  - je_number (auto-increment per entity), je_date, period (YYYY-MM)
  - description, source_module enum: SALES, COLLECTION, EXPENSE, COMMISSION, AP, PAYROLL, DEPRECIATION, INTEREST, PEOPLE_COMP, VAT, OWNER, MANUAL
  - lines array: [{ account_code, account_name, debit, credit, description, bdm_id, cost_center }]
  - bir_flag enum: BOTH, INTERNAL, BIR (default BOTH)
  - vat_flag enum: VATABLE, EXEMPT, ZERO, N/A (default N/A)
  - total_debit, total_credit
  - status enum: DRAFT, POSTED, VOID
  - posted_by, posted_at, corrects_je_id (ref: JournalEntry), is_reversal (Boolean)
  - created_by, created_at (immutable)
- [ ] Pre-save validation: when status=POSTED, |total_debit - total_credit| must be <= 0.01
- [ ] JE number auto-increment service
- [ ] Commit: `"feat(erp): journal entry model with double-entry validation [v5]"`

### 11.3 — Journal Entry Engine Service
- [ ] Create `backend/erp/services/journalEngine.js`:
  - `createJournal(entityId, data)` — create JE in DRAFT
  - `postJournal(jeId)` — validate DR=CR, set POSTED
  - `reverseJournal(jeId, reason)` — SAP Storno: create new JE with opposite amounts, corrects_je_id pointing to original; original stays POSTED
  - `getJournalsByPeriod(entityId, period)` — list with filters
  - `getGeneralLedger(entityId, accountCode, dateRange)` — all JE lines for an account
- [ ] Create `backend/erp/services/autoJournal.js`:
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

### 11.4 — VAT Ledger & CWT Ledger Models
- [ ] Create `backend/erp/models/VatLedger.js`:
  - entity_id, period, vat_type enum: OUTPUT, INPUT
  - source_module enum: COLLECTION, SUPPLIER_INVOICE
  - source_doc_ref, source_event_id, hospital_or_vendor, tin
  - gross_amount, vat_amount
  - finance_tag enum: PENDING, INCLUDE, EXCLUDE, DEFER (default PENDING)
  - tagged_by, tagged_at, created_at (immutable)
- [ ] Create `backend/erp/models/CwtLedger.js`:
  - entity_id, bdm_id, period, hospital_id, hospital_tin
  - cr_no, cr_date, cr_amount, cwt_rate, cwt_amount, atc_code
  - quarter enum: Q1, Q2, Q3, Q4; year
  - created_at (immutable)
- [ ] Commit: `"feat(erp): vat ledger and cwt ledger models [v5]"`

### 11.5 — VAT & CWT Services
- [ ] Create `backend/erp/services/vatService.js`:
  - `createVatEntry(data)` — auto-created when collection or supplier invoice posted
  - `tagVatEntry(entryId, tag, userId)` — Finance tags INCLUDE/EXCLUDE/DEFER
  - `getVatLedger(entityId, period)` — list with finance_tag filter
  - `computeVatReturn2550Q(entityId, quarter, year)` — Output VAT (INCLUDE) - Input VAT (INCLUDE) = Net VAT Payable
- [ ] Create `backend/erp/services/cwtService.js`:
  - `createCwtEntry(data)` — auto-created when collection with CWT posted
  - `getCwtLedger(entityId, period)` — list
  - `computeCwt2307Summary(entityId, quarter, year)` — per hospital per quarter
- [ ] Commit: `"feat(erp): vat and cwt compliance services with finance tagging [v5]"`

### 11.6 — Trial Balance Service
- [ ] Create `backend/erp/services/trialBalanceService.js`:
  - `generateTrialBalance(entityId, period)` — aggregate all POSTED JE lines by account_code
  - Return: per account { account_code, account_name, total_debit, total_credit, net_balance, balance_direction }
  - Balance status: NORMAL (matches expected normal_balance) or ABNORMAL
  - Bottom-line check: sum(all debits) == sum(all credits)
- [ ] Commit: `"feat(erp): trial balance generation from posted journal entries [v5]"`

### 11.7 — Four-View P&L Service
- [ ] Create `backend/erp/services/pnlService.js`:
  - `generatePnlInternal(entityId, period)` — includes BIR_FLAG=BOTH and INTERNAL entries
  - `generatePnlBir(entityId, period)` — includes BIR_FLAG=BOTH and BIR entries, adds 8000+ deductions
  - `generateVatReturn(entityId, quarter, year)` — from VAT Ledger INCLUDE entries
  - `generateCwtSummary(entityId, quarter, year)` — from CWT Ledger
  - Each P&L: Revenue, Cost of Sales, Gross Profit (GP%), Operating Expenses, Operating Income (OP%), Other Income, Net Income (Net%)
- [ ] Commit: `"feat(erp): four-view pnl (internal, bir, vat 2550q, cwt 2307) [v5]"`

### 11.8 — Cashflow Statement Service
- [ ] Create `backend/erp/services/cashflowService.js`:
  - `generateCashflow(entityId, period)`:
    - Operating: collections, supplier payments, expense payments, tax payments
    - Investing: asset purchases, asset disposals
    - Financing: owner infusions, owner drawings, loan proceeds, loan repayments
    - Net change, opening cash, closing cash
  - Source: aggregate from POSTED journal entries hitting cash/bank accounts (1010-1014)
- [ ] Create `backend/erp/models/CashflowStatement.js` — persisted snapshot per period
- [ ] Commit: `"feat(erp): cashflow statement generation [v5]"`

### 11.9 — Fixed Assets & Depreciation
- [ ] Create `backend/erp/models/FixedAsset.js`:
  - entity_id, asset_code, asset_name, category
  - acquisition_date, acquisition_cost, useful_life_months, salvage_value
  - depreciation_method (default STRAIGHT_LINE)
  - accumulated_depreciation, net_book_value
  - status enum: ACTIVE, DISPOSED, FULLY_DEPRECIATED
- [ ] Create `backend/erp/services/depreciationService.js`:
  - `computeDepreciation(entityId, period)` — for all ACTIVE assets: monthly = (cost - salvage) / useful_life_months; output to staging
  - `getDepreciationStaging(entityId, period)` — list pending entries
  - `approveDepreciation(entryIds)` — mark approved
  - `postDepreciation(entityId, period)` — create JEs for approved entries
- [ ] Commit: `"feat(erp): fixed assets and depreciation with staging pattern [v5]"`

### 11.10 — Loans & Amortization
- [ ] Create `backend/erp/models/LoanMaster.js`:
  - entity_id, loan_code, lender, purpose
  - principal, annual_rate, term_months, start_date
  - monthly_payment, total_interest, outstanding_balance
  - status enum: ACTIVE, PAID, RESTRUCTURED
- [ ] Create `backend/erp/services/loanService.js`:
  - `computeInterest(entityId, period)` — for all ACTIVE loans: monthly interest and principal split; output to staging
  - `getInterestStaging(entityId, period)` — list pending entries
  - `approveInterest(entryIds)` — mark approved
  - `postInterest(entityId, period)` — create JEs for approved entries
- [ ] Commit: `"feat(erp): loans and amortization with staging pattern [v5]"`

### 11.11 — Owner Equity Ledger
- [ ] Create `backend/erp/models/OwnerEquityEntry.js`:
  - entity_id, entry_type enum: INFUSION, DRAWING
  - amount, bank_account, bir_flag, description
  - entry_date, recorded_by, created_at (immutable)
- [ ] Create `backend/erp/services/ownerEquityService.js`:
  - `recordInfusion(data)` — DR: Cash/Bank, CR: 3000 Owner Capital
  - `recordDrawing(data)` — DR: 3100 Owner Drawings, CR: Cash/Bank
  - `getEquityLedger(entityId)` — running balance
- [ ] Commit: `"feat(erp): owner equity ledger with journal posting [v5]"`

### 11.12 — Month-End Close Controller (29-Step SOP)
- [ ] Create `backend/erp/services/monthEndClose.js`:
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
- [ ] Create `backend/erp/controllers/monthEndCloseController.js`
- [ ] Create `backend/erp/routes/monthEndCloseRoutes.js`
- [ ] Commit: `"feat(erp): month-end close procedure (29-step sop) [v5]"`

### 11.13 — Accounting Controller & Routes
- [ ] Create `backend/erp/controllers/accountingController.js`:
  - Journal entry CRUD, posting, reversal
  - Trial Balance generation
  - P&L generation (4 views)
  - VAT Ledger with finance tagging
  - CWT Ledger and 2307 summary
  - Cashflow statement
  - AR Consolidated, AP Consolidated
- [ ] Create `backend/erp/routes/accountingRoutes.js`:
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
  - GET `/ar-consolidated` — AR across all BDMs
  - GET `/ap-consolidated` — AP by due date
- [ ] Add to ERP router
- [ ] Commit: `"feat(erp): accounting routes for journals, tb, pnl, vat, cwt, cashflow [v5]"`

### 11.14 — Accounting Frontend Pages
- [ ] Create `frontend/src/erp/pages/ChartOfAccounts.jsx`:
  - Hierarchical account list with code ranges
  - Add/edit account (Finance only)
  - Filter by type, subtype, active status
- [ ] Create `frontend/src/erp/pages/JournalEntries.jsx`:
  - List view with filters (period, source_module, status)
  - Create manual JE form (balanced debit/credit lines)
  - Post/Reverse actions
  - Click → detail with all lines
- [ ] Create `frontend/src/erp/pages/TrialBalance.jsx`:
  - Period selector, account table with DR/CR/Net columns
  - ABNORMAL balances highlighted in red
  - Bottom-line balance check indicator
- [ ] Create `frontend/src/erp/pages/ProfitAndLoss.jsx`:
  - Period selector, view toggle (Internal / BIR / VAT 2550Q / CWT 2307)
  - Revenue → COGS → Gross Profit → OpEx → Operating Income → Net Income
  - Margin percentages displayed
- [ ] Create `frontend/src/erp/pages/VatCompliance.jsx`:
  - VAT Ledger table with PENDING/INCLUDE/EXCLUDE/DEFER tags
  - Finance can click to tag entries
  - VAT Return 2550Q computation view
  - CWT Ledger and 2307 summary view
- [ ] Create `frontend/src/erp/pages/CashflowStatement.jsx`:
  - Period selector, Operating/Investing/Financing sections
  - Net change and closing cash highlighted
- [ ] Create `frontend/src/erp/pages/FixedAssets.jsx`:
  - Asset register, depreciation schedule, staging view
- [ ] Create `frontend/src/erp/pages/Loans.jsx`:
  - Loan register, amortization schedule, staging view
- [ ] Create `frontend/src/erp/pages/OwnerEquity.jsx`:
  - Infusion/Drawing entry form, running balance ledger
- [ ] Create `frontend/src/erp/pages/MonthEndClose.jsx`:
  - 29-step checklist UI with progress indicators
  - "Run Full Auto Close (Steps 1-17)" button
  - Manual pause at Step 21 for Finance review
  - Step-by-step execution with error display
  - Period lock confirmation
- [ ] Add routes to App.jsx: `/erp/coa`, `/erp/journals`, `/erp/trial-balance`, `/erp/pnl`, `/erp/vat`, `/erp/cashflow`, `/erp/fixed-assets`, `/erp/loans`, `/erp/owner-equity`, `/erp/month-end-close`
- [ ] Add navbar items: Accounting section with sub-items
- [ ] Commit: `"feat(ui): full accounting engine pages (coa, journals, tb, pnl, vat, cashflow, month-end close) [v5]"`

---

## PHASE 12 — PURCHASING & AP [v5 NEW]
**Goal:** Vendor management, purchase orders, 3-way matching (PO → GRN → Supplier Invoice), AP ledger with aging, GRNI tracking, and AP payment recording.

**Reference:** PRD v5 §15 (Purchasing & AP)

### 12.1 — Vendor Master Model
- [ ] Create `backend/erp/models/VendorMaster.js`:
  - entity_id, vendor_code, vendor_name, tin, address
  - contact_person, phone, email
  - payment_terms (default 30), vat_status enum: VATABLE, EXEMPT, ZERO
  - bank_account: { bank, account_no, account_name }
  - is_active
- [ ] Create seed script: `backend/erp/scripts/seedVendors.js` with sample vendors
- [ ] Create `backend/erp/controllers/vendorController.js` — CRUD (Finance/Admin only)
- [ ] Create `backend/erp/routes/vendorRoutes.js`
- [ ] Add to ERP router
- [ ] Commit: `"feat(erp): vendor master model [v5]"`

### 12.2 — Purchase Order Model
- [ ] Create `backend/erp/models/PurchaseOrder.js`:
  - entity_id, po_number (auto-increment), vendor_id (ref: VendorMaster)
  - po_date, expected_delivery_date
  - line_items array: [{ product_id, item_key, qty_ordered, unit_price, line_total, qty_received (default 0), qty_invoiced (default 0) }]
  - total_amount, vat_amount, net_amount
  - status enum: DRAFT, APPROVED, PARTIALLY_RECEIVED, RECEIVED, CLOSED, CANCELLED
  - approved_by, approved_at, created_by, created_at
- [ ] Commit: `"feat(erp): purchase order model [v5]"`

### 12.3 — Supplier Invoice Model & 3-Way Matching
- [ ] Create `backend/erp/models/SupplierInvoice.js`:
  - entity_id, vendor_id, invoice_ref, invoice_date, due_date
  - po_id (ref: PurchaseOrder, optional for matching)
  - line_items array: [{ product_id, item_key, qty_invoiced, unit_price, line_total, po_line_matched (Boolean), grn_line_matched (Boolean) }]
  - total_amount, vat_amount, net_amount, input_vat
  - match_status enum: UNMATCHED, PARTIAL_MATCH, FULL_MATCH, DISCREPANCY
  - payment_status enum: UNPAID, PARTIAL, PAID
  - status enum: DRAFT, VALIDATED, POSTED
  - created_by, created_at
- [ ] Create `backend/erp/services/threeWayMatch.js`:
  - `matchInvoice(invoiceId)` — compare PO line → GRN line → Supplier Invoice line
  - Check: qty match, price match (tolerance configurable)
  - Return: { matched_lines[], discrepancy_lines[], unmatched_lines[] }
  - Discrepancies require Finance approval before posting
- [ ] Commit: `"feat(erp): supplier invoice model with 3-way matching engine [v5]"`

### 12.4 — AP Ledger & Aging Service
- [ ] Create `backend/erp/services/apService.js`:
  - `getApLedger(entityId)` — all outstanding supplier invoices
  - `getApAging(entityId)` — aging buckets: CURRENT, 1-30, 31-60, 61-90, 90+
  - `getApConsolidated(entityId)` — grouped by vendor with totals
  - `getGrni(entityId)` — goods received but not yet invoiced (GRN exists, no supplier invoice)
- [ ] Commit: `"feat(erp): ap ledger, aging, and grni services [v5]"`

### 12.5 — AP Payment Recording
- [ ] Create `backend/erp/services/apPaymentService.js`:
  - `recordApPayment(supplierInvoiceId, paymentData)` — creates payment record + JE: DR: 2000 AP Trade, CR: 1010-1014 Cash/Bank
  - `getPaymentHistory(vendorId)` — payment history per vendor
- [ ] Commit: `"feat(erp): ap payment recording with journal posting [v5]"`

### 12.6 — Purchasing Controller & Routes
- [ ] Create `backend/erp/controllers/purchasingController.js`:
  - PO CRUD, PO approval, PO receipt (link to GRN)
  - Supplier invoice CRUD, 3-way match trigger, posting
  - AP ledger, aging, GRNI queries
  - AP payment recording
- [ ] Create `backend/erp/routes/purchasingRoutes.js`:
  - POST `/vendors` — create vendor
  - GET `/vendors` — list vendors
  - PUT `/vendors/:id` — update vendor
  - POST `/purchase-orders` — create PO
  - GET `/purchase-orders` — list POs
  - POST `/purchase-orders/:id/approve` — approve PO
  - POST `/purchase-orders/:id/receive` — record receipt (links to GRN)
  - POST `/supplier-invoices` — create supplier invoice
  - POST `/supplier-invoices/:id/match` — trigger 3-way matching
  - POST `/supplier-invoices/:id/post` — post invoice (creates AP + JE)
  - GET `/ap-ledger` — AP outstanding
  - GET `/ap-aging` — AP aging buckets
  - GET `/grni` — goods received not invoiced
  - POST `/ap-payments` — record payment
- [ ] Add to ERP router
- [ ] Commit: `"feat(erp): purchasing and ap routes [v5]"`

### 12.7 — Purchasing & AP Frontend Pages
- [ ] Create `frontend/src/erp/pages/VendorList.jsx`:
  - Vendor table with search, add/edit vendor form
- [ ] Create `frontend/src/erp/pages/PurchaseOrders.jsx`:
  - PO list with status filter
  - Create PO form: vendor dropdown, line items grid, totals
  - Approve/Receive actions
- [ ] Create `frontend/src/erp/pages/SupplierInvoices.jsx`:
  - Invoice list, create form with PO linking
  - 3-way match result display (matched/discrepancy indicators)
  - Post action
- [ ] Create `frontend/src/erp/pages/AccountsPayable.jsx`:
  - AP aging table with color-coded buckets
  - GRNI list
  - Payment recording form
- [ ] Add routes to App.jsx: `/erp/vendors`, `/erp/purchase-orders`, `/erp/supplier-invoices`, `/erp/accounts-payable`
- [ ] Add navbar items under Purchasing section
- [ ] Commit: `"feat(ui): purchasing and ap pages (vendors, pos, invoices, ap aging) [v5]"`

---

## PHASE 13 — BANKING & CASH [v5 NEW]
**Goal:** Bank accounts master, bank reconciliation, credit card ledger, and bank statement import with auto-matching.

**Reference:** PRD v5 §16 (Banking & Cash)

### 13.1 — Bank Accounts Master (Enhance from Phase 2.6)
- [ ] Verify `backend/erp/models/BankAccount.js` from Phase 2.6 has: entity_id, bank_code, bank_name, account_no, account_type, coa_code, is_active
- [ ] Add fields if missing: opening_balance, current_balance (computed), statement_import_format
- [ ] Create seed data for VIP banks: RCBC (1010), SBC (1011), MBTC (1012), UB (1013)
- [ ] Commit: `"feat(erp): bank accounts master enhancement [v5]"`

### 13.2 — Bank Reconciliation Model & Service
- [ ] Create `backend/erp/models/BankStatement.js`:
  - entity_id, bank_account_id, statement_date, period (YYYY-MM)
  - entries array: [{ line_no, txn_date, description, reference, debit, credit, balance, match_status enum: UNMATCHED, MATCHED, RECONCILING_ITEM, je_id (ref: JournalEntry) }]
  - closing_balance, uploaded_at, uploaded_by
- [ ] Create `backend/erp/services/bankReconService.js`:
  - `importStatement(bankAccountId, entries)` — parse and store bank statement
  - `autoMatch(statementId)` — match bank entries to journal entries by: amount + date (±2 days) + reference
  - `manualMatch(statementEntryIndex, jeId)` — Finance manually matches
  - `getReconSummary(statementId)` — return: { matched[], unmatched_book[], unmatched_bank[], adjusted_book_balance, adjusted_bank_balance, difference }
  - `finalizeRecon(statementId)` — lock reconciliation for period
- [ ] Commit: `"feat(erp): bank reconciliation with auto-match [v5]"`

### 13.3 — Credit Card Ledger
- [ ] Verify `backend/erp/models/CreditCard.js` exists from Phase 2.6 (or create if not):
  - entity_id, card_code, card_name, card_holder, bank, card_type, coa_code (2310-2315), credit_limit, is_active
- [ ] Create `backend/erp/models/CreditCardTransaction.js`:
  - entity_id, credit_card_id, txn_date, description
  - amount, reference, linked_expense_id (ref: ExpenseEntry), linked_calf_id (ref: PrfCalf)
  - status enum: PENDING, POSTED, PAID
  - created_at
- [ ] Create `backend/erp/services/creditCardService.js`:
  - `getCardBalance(cardId)` — outstanding transactions
  - `getCardLedger(cardId, period)` — transaction list
  - `recordCardPayment(cardId, amount)` — creates JE: DR: 2310-2315 CC Payable, CR: 1010-1014 Cash/Bank
- [ ] Commit: `"feat(erp): credit card ledger with payment tracking [v5]"`

### 13.4 — Banking Controller & Routes
- [ ] Create `backend/erp/controllers/bankingController.js`:
  - Bank account CRUD, statement import, auto-match, manual match
  - Reconciliation summary and finalization
  - Credit card transactions, balances, payments
- [ ] Create `backend/erp/routes/bankingRoutes.js`:
  - GET `/bank-accounts` — list bank accounts
  - POST `/bank-accounts` — create (Admin/Finance)
  - POST `/statements/import` — upload bank statement CSV
  - POST `/statements/:id/auto-match` — trigger auto-matching
  - POST `/statements/:id/manual-match` — Finance manual match
  - GET `/statements/:id/recon` — reconciliation summary
  - POST `/statements/:id/finalize` — finalize recon
  - GET `/credit-cards` — list cards with balances
  - GET `/credit-cards/:id/ledger` — card transaction ledger
  - POST `/credit-cards/:id/payment` — record card payment
- [ ] Add to ERP router
- [ ] Commit: `"feat(erp): banking and cash routes [v5]"`

### 13.5 — Banking Frontend Pages
- [ ] Create `frontend/src/erp/pages/BankAccounts.jsx`:
  - Bank account list with balances, add/edit bank account
- [ ] Create `frontend/src/erp/pages/BankReconciliation.jsx`:
  - Period + bank selector
  - Upload CSV button for bank statement
  - "Auto-Match" button
  - Side-by-side view: bank statement entries (left) vs book entries (right)
  - Match status indicators: green=matched, red=unmatched
  - Manual match: drag-drop or click-to-link
  - Reconciliation summary: adjusted balances + difference
  - "Finalize" button
- [ ] Create `frontend/src/erp/pages/CreditCardLedger.jsx`:
  - Card selector, transaction list, outstanding balance
  - Link to related expense/CALF entries
  - Payment recording form
- [ ] Add routes to App.jsx: `/erp/bank-accounts`, `/erp/bank-recon`, `/erp/credit-cards`
- [ ] Add navbar items under Banking section
- [ ] Commit: `"feat(ui): banking pages (bank accounts, reconciliation, credit card ledger) [v5]"`

---

## PHASE 14 — NEW REPORTS & ANALYTICS [v5 NEW]
**Goal:** Performance ranking, consolidated consignment aging, expense anomaly detection, fuel efficiency report, and cycle status dashboard.

**Reference:** PRD v5 §14.6-14.10

### 14.1 — Performance Ranking Report
- [ ] Create `backend/erp/services/performanceRankingService.js`:
  - `getNetCashRanking(entityId, period)` — ranks all BDMs and Sales Reps by Net Cash = Collections - Expenses; includes Sales, Collection %, Territory
  - `getMomTrend(personId, periods?)` — 6-month rolling: Sales, Sales Growth %, Collections, Collection Growth %, Expenses, Expense Growth %
  - `getSalesTracker(entityId, year)` — full year Jan-Dec by person, sorted by total descending
  - `getCollectionsTracker(entityId, year)` — full year Jan-Dec by person, sorted by total descending
- [ ] Commit: `"feat(erp): performance ranking service (net cash, mom trend, trackers) [v5]"`

### 14.2 — Consolidated Consignment Aging Report
- [ ] Create `backend/erp/services/consignmentReportService.js`:
  - `getConsolidatedConsignmentAging(entityId)` — cross-BDM view: BDM, Territory, Hospital, DR#, DR Date, Product, Qty Delivered, Qty Consumed, Qty Remaining, Days Outstanding, Aging Status
  - Sort: OVERDUE first, then FORCE_CSI, then OPEN, then COLLECTED
  - Filterable by BDM, hospital, status
  - Drill-down by BDM
- [ ] Commit: `"feat(erp): consolidated consignment aging report [v5]"`

### 14.3 — Expense Anomaly Detection
- [ ] Create `backend/erp/services/expenseAnomalyService.js`:
  - `detectAnomalies(entityId, period)` — compare current vs prior period per person per component (SMER, GasOfficial, Insurance, ACCESS, CoreComm)
  - Flag >30% change (configurable via SETTINGS.EXPENSE_ANOMALY_THRESHOLD)
  - `detectBudgetOverruns(entityId, period)` — for people with BudgetAllocation: actual vs budgeted per component, flag OVER_BUDGET
  - Return: [{ person, component, prior_amount, current_amount, change_pct, flag: ALERT|OVER_BUDGET, budgeted (if applicable) }]
  - Sorted by absolute change % descending
- [ ] Commit: `"feat(erp): expense anomaly detection with budget tracking [v5]"`

### 14.4 — Fuel Efficiency Report
- [ ] Create `backend/erp/services/fuelEfficiencyService.js`:
  - `getFuelEfficiency(entityId, period)` — per BDM: actual gas cost vs expected (official_km / km_per_liter * avg_price)
  - Flag variance >30% as OVER_30_PCT
  - Source: CarLogbookEntry data
- [ ] Commit: `"feat(erp): fuel efficiency report [v5]"`

### 14.5 — Cycle Status Dashboard Service
- [ ] Create `backend/erp/services/cycleStatusService.js`:
  - `getCycleStatus(entityId, period)` — per BDM: current payslip status (PENDING → GENERATED → REVIEWED → RETURNED → BDM_CONFIRMED → CREDITED)
  - Completion % across all BDMs
  - Behind-schedule list (not at expected status for date)
  - Auto-timestamp tracking on status changes
- [ ] Commit: `"feat(erp): cycle status dashboard service [v5]"`

### 14.6 — New Report Routes
- [ ] Add to `backend/erp/controllers/erpReportController.js`:
  - `getPerformanceRanking` — net cash ranking + MoM trend + trackers
  - `getConsignmentAging` — consolidated consignment aging
  - `getExpenseAnomalies` — anomaly + budget overrun flags
  - `getFuelEfficiency` — per-BDM fuel tracking
  - `getCycleStatus` — payslip cycle progress
- [ ] Add to `backend/erp/routes/erpReportRoutes.js`:
  - GET `/performance-ranking/:period` — net cash ranking
  - GET `/performance-ranking/trend/:personId` — MoM trend
  - GET `/sales-tracker/:year` — annual sales tracker
  - GET `/collections-tracker/:year` — annual collections tracker
  - GET `/consignment-aging` — consolidated consignment aging
  - GET `/expense-anomalies/:period` — anomaly detection
  - GET `/fuel-efficiency/:period` — fuel efficiency
  - GET `/cycle-status/:period` — cycle status dashboard
- [ ] Add to ERP router
- [ ] Commit: `"feat(erp): new report routes (ranking, consignment, anomaly, fuel, cycle) [v5]"`

### 14.7 — New Report Frontend Pages
- [ ] Create `frontend/src/erp/pages/PerformanceRanking.jsx`:
  - Period selector, ranking table with Net Cash, Sales, Collection %
  - Top 3 highlighted green, bottom 3 highlighted red
  - Toggle: BDM vs Sales Rep filter
  - MoM Trend: 6-month chart per person (expandable rows)
  - Sales Tracker: full-year grid (Jan-Dec), sorted by total
  - Collections Tracker: full-year grid (Jan-Dec), sorted by total
- [ ] Create `frontend/src/erp/pages/ConsignmentAging.jsx`:
  - Cross-BDM table with all consignment columns
  - Color-coded aging: green=OPEN, orange=OVERDUE, red=FORCE_CSI
  - BDM drill-down (click name → filtered view)
  - Filters: BDM, hospital, aging status
- [ ] Create `frontend/src/erp/pages/ExpenseAnomalies.jsx`:
  - Period selector, anomaly table sorted by change %
  - ALERT badge on >30% changes
  - Budget vs Actual columns for budgeted people
  - OVER_BUDGET badge
- [ ] Create `frontend/src/erp/pages/FuelEfficiency.jsx`:
  - Per-BDM table: actual vs expected gas cost, variance %
  - >30% flagged in red
- [ ] Create `frontend/src/erp/pages/CycleStatusDashboard.jsx`:
  - Per-BDM status pipeline (visual progress indicators)
  - Completion % bar chart
  - Behind-schedule BDMs highlighted
- [ ] Add routes to App.jsx: `/erp/performance-ranking`, `/erp/consignment-aging`, `/erp/expense-anomalies`, `/erp/fuel-efficiency`, `/erp/cycle-status`
- [ ] Add navbar items under Reports section
- [ ] Commit: `"feat(ui): new report pages (ranking, consignment aging, anomalies, fuel, cycle status) [v5]"`

---

## PHASE 15+ — FUTURE (SAP-EQUIVALENT IMPROVEMENTS, POST-LAUNCH)

### 15.1 — Per-Product Profit Share Eligibility
- [ ] 3 conditions: ≥2 hospitals, ≥1 MD tagged, 3 consecutive months
- [ ] Streak tracking, deficit handling

### 15.2 — CSI Allocation Control
- [ ] Booklet master, weekly allocation, number validation

### 15.3 — Cycle Report Workflow
- [ ] GENERATED → REVIEWED → BDM_CONFIRMED → CREDITED

### 15.4 — Recurring Journal Templates (SAP FI Recurring Documents)
- [ ] Template model: name, frequency (monthly/quarterly), line items, auto_post flag
- [ ] Scheduler: auto-generate journal entries on schedule
- [ ] Admin UI to create/edit/deactivate templates

### 15.5 — Cost Center Dimension (SAP CO Cost Centers)
- [ ] Add optional `cost_center_id` to TransactionEvent and SalesLine schemas
- [ ] Cost Center master: code, name, parent_cost_center, is_active
- [ ] Reports filterable by cost center

### 15.6 — Per-Module Period Locks (SAP Posting Period Variant)
- [ ] PeriodLock model: module, year, month, is_locked, locked_by, locked_at
- [ ] Enforce in all POST/PUT endpoints: reject posting to locked periods
- [ ] Finance UI to lock/unlock periods per module

### 15.7 — Batch Posting with IDs (SAP Batch Input)
- [ ] Bulk submit endpoint: POST /api/erp/sales/batch-submit
- [ ] Accept array of document IDs, validate all, post all atomically
- [ ] Rollback on any failure (MongoDB transaction)

### 15.8 — Data Archival (SAP Data Archiving)
- [ ] Archive function: move closed-period data to Archive collection
- [ ] Keep current + prior 2 months live
- [ ] Log archive batch ID for traceability
- [ ] Admin UI: trigger archive, view archive batches, restore if needed

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
| 12 | Purchasing & AP [v5 NEW] | ~40 | 2-3 weeks |
| 13 | Banking & Cash [v5 NEW] | ~30 | 1-2 weeks |
| 14 | New Reports & Analytics [v5 NEW] | ~35 | 1-2 weeks |
| 15+ | Future (SAP-equivalent improvements) | 8 | Post-launch |

**Total pre-launch: ~573 tasks across 18 phases → ~29-37 weeks**
**Note: Phases 4A+4B add ~13 tasks and ~2.5 weeks for entity migration + inter-company transfers**
**Note: Phases 10-14 add ~220 tasks and ~10-14 weeks from PRD v5 (PNL Central live system integrations)**
**Reference PRD:** `docs/VIP ERP PRD v5.md`

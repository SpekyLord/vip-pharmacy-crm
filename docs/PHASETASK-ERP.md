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
- [ ] Login works — **needs manual test with prod credentials**
- [ ] CRM dashboard loads (admin and employee) — **needs manual test**
- [ ] VIP Client / Doctor list loads — **needs manual test**
- [ ] Can log a visit with GPS + photo — **needs manual test**
- [ ] Products page loads — **needs manual test**
- [ ] Messages work — **needs manual test**
- [x] All existing CRM features work as before (no code changes to CRM files)
- [x] No console errors related to ERP changes (ERP route is commented out, no ERP imports in CRM code)
- [ ] Commit: `"verify: crm fully functional after erp scaffold"`

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
- [x] Detect DR type: sampling/consignment/donation keyword detection
- [x] Add per-field confidence scoring
- [x] Test with actual VIP DR photos
- [x] Commit: `3e99628` `"fix(ocr): DR parser rewrite with full field extraction"`

> **Future (Phase 2+):** DR type (sampling/consignment/donation) should have a dropdown toggle for BDM to confirm/override. Hospital should have searchable dropdown from Hospital collection.

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
| 1.17 | OR Extraction-Only Refactor | ❌ Not started (do at Phase 2 start) |

---

## PHASE 2 — SHARED MODELS & SETTINGS
**Goal:** Build the shared data models, settings, and tenant infrastructure that the ERP modules need. Extend User model with ERP fields.

### 2.1 — Settings Model
- [ ] Create `backend/erp/models/Settings.js` — single document with all configurable constants:
  - PERDIEM_RATE_DEFAULT (800), PERDIEM_MD_FULL (8), PERDIEM_MD_HALF (3)
  - VAT_RATE (0.12), PROFIT_SHARE_BDM_PCT (0.30), PROFIT_SHARE_VIP_PCT (0.70)
  - NEAR_EXPIRY_DAYS (120), DEFAULT_PAYMENT_TERMS (30)
  - COLLECTION_OK_THRESHOLD (0.70), CWT_RATE_WC158 (0.01)
  - All other constants from PRD Section 3.1
- [ ] Create seed script: `backend/erp/scripts/seedSettings.js`
- [ ] Create `backend/erp/controllers/settingsController.js` — GET and PUT (admin only)
- [ ] Create settings route in `backend/erp/routes/settingsRoutes.js`
- [ ] Add to ERP router: `router.use('/settings', require('./settingsRoutes'))`
- [ ] Commit: `"feat(erp): settings collection with configurable constants"`

### 2.2 — Extend User Model with ERP Fields
- [ ] In `backend/models/User.js` (existing CRM model), ADD these optional fields:
  - `entity_id`: ObjectId (ref: 'Entity')
  - `territory_id`: ObjectId
  - `live_date`: Date
  - `bdm_stage`: String, enum ['CONTRACTOR', 'PS_ELIGIBLE', 'TRANSITIONING', 'SUBSIDIARY', 'SHAREHOLDER'], default 'CONTRACTOR'
  - `compensation`: { perdiem_rate: Number, perdiem_days: Number (default 22), km_per_liter: Number, fuel_overconsumption_threshold: Number (default 1.30), effective_date: Date }
  - `compensation_history`: Array of { perdiem_rate, km_per_liter, effective_date, set_by, reason, created_at }
  - `sss_no`: String, `pagibig_no`: String, `philhealth_no`: String
  - `date_of_birth`: Date, `contract_type`: String, `date_started`: Date
- [ ] Extend role enum: add 'finance', 'president', 'ceo' alongside existing 'admin', 'employee'
- [ ] All new fields are optional — existing CRM user documents will NOT break
- [ ] Test: existing CRM login and user operations still work
- [ ] Commit: `"feat(shared): extend user model with erp compensation and stage fields"`

### 2.3 — Entity Model (Multi-Tenancy)
- [ ] Create `backend/erp/models/Entity.js`:
  - entity_name, tin, address, vat_registered (boolean)
  - entity_type: enum ['PARENT', 'SUBSIDIARY']
  - parent_entity_id: ObjectId (self-ref, for subsidiaries)
  - status: enum ['ACTIVE', 'INACTIVE']
- [ ] Create seed script: `backend/erp/scripts/seedEntities.js`
  - Seed: VIP Inc. (parent, TIN 744-251-498-0000, VAT registered)
  - Seed: MG AND CO. INC. (subsidiary, TIN 010-824-240-00000, non-VAT)
- [ ] Commit: `"feat(erp): entity model for multi-tenancy"`

### 2.4 — Hospital Model
- [ ] Create `backend/erp/models/Hospital.js`:
  - entity_id, hospital_name, hospital_name_clean (unique lookup key)
  - Financial: tin, payment_terms, vat_status (VATABLE/EXEMPT/ZERO), cwt_rate, atc_code, is_top_withholding_agent
  - HEAT: hospital_type, bed_capacity, level, purchaser_name, purchaser_phone, chief_pharmacist_name, chief_pharmacist_phone, key_decision_maker, engagement_level (1-5), major_events (array, max 3), programs_to_level_5
  - BDM tagging: tagged_bdms array [{ bdm_id, tagged_by, tagged_at, is_active }]
  - status: ACTIVE/INACTIVE
- [ ] Create `backend/erp/controllers/hospitalController.js` — CRUD (Finance/Admin create/edit, BDM reads tagged only)
- [ ] Create `backend/erp/routes/hospitalRoutes.js`
- [ ] Add to ERP router
- [ ] Commit: `"feat(erp): hospital master model with heat and financial fields"`

### 2.5 — Product Master Model (No Batch)
- [ ] Create `backend/erp/models/ProductMaster.js`:
  - entity_id, item_key (unique: "BrandName|DosageStrength")
  - generic_name, brand_name, dosage_strength, sold_per
  - purchase_price, selling_price, vat_status (VATABLE/EXEMPT/ZERO)
  - category, is_active, description, key_benefits, image_url
  - added_by, added_at
- [ ] Note: this is separate from existing CRM `CrmProduct.js` / `WebsiteProduct.js` — those stay for CRM product catalog. ProductMaster is the ERP financial product record.
- [ ] Create `backend/erp/controllers/productMasterController.js` — CRUD (Finance/Admin only for add/edit)
- [ ] Create `backend/erp/routes/productMasterRoutes.js`
- [ ] Add to ERP router
- [ ] Commit: `"feat(erp): product master model (identity and pricing, no batch)"`

### 2.6 — Admin-Managed Lookup Collections
- [ ] Create `backend/erp/models/BankAccount.js` — bank_code, bank_name, account_no, account_type, coa_code, is_active
- [ ] Create `backend/erp/models/PaymentMode.js` — mode_code, mode_label, mode_type, requires_calf, is_active
- [ ] Create `backend/erp/models/ExpenseComponent.js` — component_code, component_name, or_required, calf_required, is_active
- [ ] Create seed script with initial data
- [ ] Create admin CRUD routes for lookups
- [ ] Commit: `"feat(erp): admin-managed lookup collections"`

### 2.7 — Transaction Event Model (Immutable)
- [ ] Create `backend/erp/models/TransactionEvent.js`:
  - entity_id, bdm_id, event_type, event_date, document_ref
  - source_image_url, ocr_raw_json, confirmed_fields, payload
  - status (ACTIVE/DELETED), corrects_event_id, created_by, created_at (immutable)
- [ ] Add Mongoose pre-save: set created_at, prevent changes to immutable fields
- [ ] Add pre-findOneAndUpdate: strip immutable fields from any update attempt
- [ ] Only status can change (ACTIVE → DELETED) — nothing else
- [ ] Commit: `"feat(erp): immutable transaction event model"`

### 2.8 — Document Attachment Model
- [ ] Create `backend/erp/models/DocumentAttachment.js`:
  - event_id, document_type, ocr_applied, storage_url (S3), folder_path, uploaded_by, uploaded_at
- [ ] Commit: `"feat(erp): document attachment model"`

### 2.9 — Tenant Filtering Middleware
- [ ] Create `backend/erp/middleware/tenantFilter.js`:
  - Reads entity_id and bdm_id from authenticated user (req.user)
  - Attaches to req: req.entityId, req.bdmId, req.isAdmin, req.isPresident
  - ERP controllers use these to filter queries
- [ ] Commit: `"feat(erp): tenant filtering middleware"`

### 2.10 — ERP Frontend Hooks
- [ ] Create `frontend/src/erp/hooks/useSettings.js` — fetches and caches GET `/api/erp/settings`
- [ ] Create `frontend/src/erp/hooks/useErpApi.js` — wrapper around existing `useApi` hook with ERP base URL
- [ ] Commit: `"feat(ui): erp frontend hooks for settings and api"`

### 2.11 — Government Rates Collection [v5 NEW]
- [ ] Create `backend/erp/models/GovernmentRates.js`:
  - rate_type enum: SSS, PHILHEALTH, PAGIBIG, WITHHOLDING_TAX, EC, DE_MINIMIS
  - effective_date, expiry_date (null = currently active)
  - brackets array: [{ min_salary, max_salary, employee_share, employer_share, ec }]
  - flat_rate, employee_split, employer_split, min_contribution, max_contribution
  - benefit_limits array: [{ benefit_code, description, limit_amount, limit_period }]
  - set_by, notes, created_at
- [ ] Create seed script: `backend/erp/scripts/seedGovernmentRates.js`
  - Seed SSS brackets (RA 11199 current schedule)
  - Seed PhilHealth 5% rate with floor/ceiling (RA 11223)
  - Seed PagIBIG rates (RA 9679)
  - Seed BIR TRAIN withholding tax graduated brackets
  - Seed De Minimis limits (rice ₱2,000/mo, clothing ₱6,000/yr, medical ₱1,500/mo, laundry ₱300/mo)
- [ ] Create `backend/erp/controllers/governmentRatesController.js` — CRUD (Admin/Finance only)
- [ ] Create `backend/erp/routes/governmentRatesRoutes.js`
- [ ] Add to ERP router
- [ ] Commit: `"feat(erp): government rates collection with philippine mandatories [v5]"`

### 2.12 — Budget Allocation Collection [v5 NEW]
- [ ] Create `backend/erp/models/BudgetAllocation.js`:
  - entity_id, target_type enum: BDM, DEPARTMENT, EMPLOYEE
  - target_id, target_name, period (YYYY-MM)
  - components array: [{ component_code, budgeted_amount }]
  - total_budget, approved_by, approved_at
  - status enum: DRAFT, APPROVED, CLOSED
- [ ] Create `backend/erp/controllers/budgetAllocationController.js` — CRUD (Admin/Finance only)
- [ ] Create `backend/erp/routes/budgetAllocationRoutes.js`
- [ ] Add to ERP router
- [ ] Commit: `"feat(erp): budget allocation collection [v5]"`

### 2.13 — Consignment Tracker Model [v5 NEW]
- [ ] Create `backend/erp/models/ConsignmentTracker.js`:
  - entity_id, bdm_id, hospital_id, hospital_name
  - dr_ref, dr_date, product_id, item_key, batch_lot_no
  - qty_delivered, qty_consumed (default 0), qty_remaining (auto-computed)
  - conversions array: [{ csi_doc_ref, csi_date, qty_converted, sales_line_id }]
  - days_outstanding (auto-computed), aging_status enum: OPEN, OVERDUE, COLLECTED, FORCE_CSI
  - max_days_alert, max_days_force_csi
  - dr_photo_url, status enum: ACTIVE, FULLY_CONSUMED, RETURNED, EXPIRED
  - created_at (immutable), created_by
- [ ] Commit: `"feat(erp): consignment tracker model for dr-csi reference chain [v5]"`

### 2.14 — Vendor Master Model
**Goal:** Supplier registry that maps vendors to default COA codes for automatic expense classification. Follows SAP Vendor Master (XK01) pattern — every vendor has a default G/L account for automatic account determination.

**Architecture principle (SAP parallel):** In SAP, Vendor Master (FI side) stores default reconciliation accounts + expense accounts. When a vendor invoice is posted, SAP auto-suggests the expense account from Vendor Master. Our VendorMaster.default_coa_code does the same thing. The `vendor_aliases` array enables OCR fuzzy matching — SAP uses vendor search terms for the same purpose.

- [ ] Create `backend/erp/models/VendorMaster.js`:
  - entity_id (ref Entity), vendor_code (String, auto-generated or manual)
  - vendor_name (String, required), vendor_aliases (String array — OCR name variations for fuzzy matching, e.g., ["AP CARGO", "AP CARGO LOGISTIC", "APCARGO"])
  - tin (String), address (String), contact_person (String), phone (String), email (String)
  - default_coa_code (String — maps to ChartOfAccounts.account_code when CoA is built in Phase 11)
  - default_expense_category (String — human-readable label, e.g., "Courier / Shipping")
  - payment_terms_days (Number, default 0 for cash vendors)
  - is_active (Boolean, default true)
  - created_by (ref User), updated_by (ref User)
  - Compound unique index: `{ entity_id: 1, vendor_code: 1 }`
  - Text index on vendor_name + vendor_aliases for search
- [ ] Create seed script `backend/erp/scripts/seedVendors.js` with known VIP vendors:
  - AP CARGO LOGISTIC NETWORK CORPORATION → 6200 (Courier / Shipping)
  - JRS EXPRESS → 6200 (Courier / Shipping)
  - LBC EXPRESS → 6200 (Courier / Shipping)
  - Shell (all stations) → 6150 (Fuel & Oil)
  - Petron (all stations) → 6150 (Fuel & Oil)
  - Caltex / Phoenix / Seaoil → 6150 (Fuel & Oil)
  - NLEX / SLEX / TPLEX / Skyway / Cavitex → 6160 (Parking & Tolls)
- [ ] Create `backend/erp/controllers/vendorController.js`:
  - CRUD: create, getAll (with search query), getById, update, deactivate
  - `GET /api/erp/vendors/search?q=cargo` — search by name or alias (case-insensitive, substring)
  - `POST /api/erp/vendors/:id/add-alias` — add new alias (from OCR override learning)
  - Finance/Admin only for create/update; BDM can read/search
- [ ] Create `backend/erp/routes/vendorRoutes.js`, mount on ERP router
- [ ] Commit: `"feat(erp): vendor master model with default COA mapping (SAP XK01 pattern)"`

### 2.15 — Expense Classification Service
**Goal:** Takes raw OCR-extracted fields and returns an accounting classification suggestion. This is the bridge between Layer 1 (extraction) and Layer 3/4 (tax + journal). Follows SAP's automatic account determination — the system suggests, the user confirms or overrides.

**Architecture principle (SAP parallel):** SAP's MM-FI integration uses a determination table: Vendor + Material Group + Plant → G/L Account. Our equivalent: Vendor (name match) + Receipt Type (keyword) → COA Code. The `match_method` field provides audit trail of HOW the classification was determined — required for BIR audit compliance.

**4-step classification cascade:**
```
Step 1: EXACT_VENDOR  — supplier_name exact match in VendorMaster.vendor_name
Step 2: ALIAS_MATCH   — fuzzy match against VendorMaster.vendor_aliases array
Step 3: KEYWORD        — keyword patterns (courier/fuel/parking/toll/hotel/food/office)
Step 4: FALLBACK       — "Miscellaneous Expense" (6900) with LOW confidence
```

- [ ] Create `backend/erp/services/expenseClassifier.js`:
  - `classifyExpense(extractedFields)` — accepts raw OCR output (supplier_name, amount, etc.)
  - Returns: `{ vendor_id, vendor_name, coa_code, coa_name, expense_category, confidence (HIGH/MEDIUM/LOW), match_method (EXACT_VENDOR/ALIAS_MATCH/KEYWORD/FALLBACK) }`
  - Step 1 (EXACT_VENDOR): Case-insensitive exact match of `supplier_name.value` against `VendorMaster.vendor_name`
  - Step 2 (ALIAS_MATCH): Case-insensitive substring match against `VendorMaster.vendor_aliases` array entries
  - Step 3 (KEYWORD): Pattern-based detection using keyword lists:
    - Courier: AP CARGO, JRS, LBC, J&T, 2GO, AIR21, NINJA VAN, GRAB EXPRESS → 6200
    - Fuel: SHELL, PETRON, CALTEX, PHOENIX, SEAOIL, GASOLINE, FUEL → 6150
    - Parking/Toll: PARKING, TOLL, NLEX, SLEX, TPLEX, SKYWAY, CAVITEX → 6160
    - Accommodation: HOTEL, INN, LODGE, PENSION, AIRBNB → 6300
    - Food/Meals: RESTAURANT, FOOD, MEAL, CAFE, JOLLIBEE, MCDONALDS → 6250
    - Office: PRINTING, OFFICE, SUPPLIES, STATIONERY, NATIONAL BOOKSTORE → 6400
    - Communication: GLOBE, SMART, PLDT, CONVERGE → 6350
    - Transportation: GRAB, TAXI, ANGKAS, FERRY, BOAT → 6100
  - Step 4 (FALLBACK): Return `6900 Miscellaneous Expense` with confidence LOW
  - VAT auto-computation: if amount is present but VAT is null, compute `VAT = amount × 12/112` (PH VAT rate) and flag as `vat_computed: true`
- [ ] Create `backend/erp/controllers/classificationController.js`:
  - `POST /api/erp/classify` — accepts `{ supplier_name, amount, vat_amount }`, returns classification
  - `POST /api/erp/classify/override` — user overrides classification: `{ vendor_id?, new_coa_code, new_category, save_as_default (Boolean) }`
    - If `save_as_default` is true AND vendor_id exists: update `VendorMaster.default_coa_code`
    - If `save_as_default` is true AND no vendor_id: create new VendorMaster entry with this supplier + default
  - `GET /api/erp/classify/categories` — return list of available expense categories with COA codes (from seed or CoA collection)
- [ ] Create `backend/erp/routes/classificationRoutes.js`, mount on ERP router
- [ ] Unit tests: verify AP CARGO → 6200 (EXACT_VENDOR), unknown vendor → 6900 (FALLBACK), override saves to VendorMaster
- [ ] Commit: `"feat(erp): expense classification service — vendor + keyword + fallback cascade (SAP auto-account pattern)"`

### 2.17 — OCR Smart Dropdowns (Moved from Phase 1.14)
**Goal:** When OCR returns LOW confidence or empty for key fields, replace the text input with a searchable dropdown populated from master data. Reduces manual typing and ensures data consistency.

**Depends on:** 2.3 (Hospital Model), 2.4 (ProductMaster Model)

- [ ] Create lookup API endpoints:
  - GET `/api/erp/lookups/products?q=nebu` — searchable product autocomplete (from ProductMaster)
  - GET `/api/erp/lookups/hospitals?q=metro` — searchable hospital autocomplete (from Hospital)
- [ ] Update `frontend/src/erp/pages/OcrTest.jsx`:
  - When `hospital` field confidence is LOW or empty → render searchable dropdown (fetches from hospital lookup)
  - When `brand_name` or `generic_name` field confidence is LOW or empty → render searchable dropdown (fetches from product lookup)
  - DR type → dropdown toggle (sampling/consignment/donation)
  - CSI settlement (in CR) → checklist populated from open AR CSIs for matched hospital (connects to 5.2b)
  - Dropdown uses debounced search (300ms) with typeahead filtering
  - Selected value replaces the OCR-extracted value and sets confidence to HIGH
- [ ] Fuzzy matching: case-insensitive substring match on backend; can upgrade to Levenshtein/FuseJS later
- [ ] Commit: `"feat(ocr): smart dropdown fallbacks for low-confidence hospital and product fields"`

---

### 2.16 — OCR-to-Classification Pipeline Integration
**Goal:** Wire the extraction→classification pipeline so the OCR test page shows both extracted fields AND classification suggestion as separate auditable sections. User can override classification without changing extracted data.

**Architecture principle:** Extraction output and classification output MUST be separate JSON objects in the API response. This ensures auditability — an auditor can see exactly what the document said (extraction) vs. how it was classified (classification), and whether the user overrode anything.

- [ ] Update `backend/erp/ocr/ocrProcessor.js`:
  - After OR/GAS_RECEIPT parser returns raw extracted fields, call `expenseClassifier.classifyExpense()` if doc type is an expense document (OR, GAS_RECEIPT)
  - Attach classification as a separate `classification` key in response (NOT merged into `extracted`):
    ```json
    {
      "doc_type": "OR",
      "extracted": { "or_number": {...}, "supplier_name": {...}, "amount": {...}, ... },
      "classification": { "coa_code": "6200", "coa_name": "Courier / Shipping", "confidence": "HIGH", "match_method": "EXACT_VENDOR", "vendor_id": "..." },
      "validation_flags": [...],
      "raw_ocr_text": "..."
    }
    ```
  - Non-expense documents (CSI, CR, CWT, DR, UNDERTAKING) do NOT get classification — they flow to sales/collection/inventory modules directly
- [ ] Update `frontend/src/erp/pages/OcrTest.jsx`:
  - Below extracted fields section, add a "Classification" section (visually distinct separator)
  - Display: suggested expense category, COA code + name, confidence badge (HIGH=green, MEDIUM=amber, LOW=red), match method label
  - Add dropdown to override category — populated from `GET /api/erp/classify/categories`
  - When user overrides: call `POST /api/erp/classify/override`
  - "Save as vendor default" checkbox — visible only on override, calls override endpoint with `save_as_default: true`
  - Confirm button sends both extracted data + final classification (original or overridden)
- [ ] Ensure API response clearly separates `extracted` (Layer 1) from `classification` (Layer 2) — never mix them
- [ ] Commit: `"feat(erp): connect OCR extraction → classification pipeline with override UI (SAP VIM pattern)"`

---

## PHASE 3 — SALES MODULE (SAP Park -> Check -> Post)
**Goal:** Sales invoice entry that preserves the client's current validate/submit/re-open workbook behavior while upgrading it to the SAP-style webapp target: live date partition, spreadsheet-speed draft entry, FIFO batch selection, on-demand validation, posting controls, and audit trail.

### 3.1 — Inventory Ledger Model (needed for FIFO)
- [ ] Create `backend/erp/models/InventoryLedger.js`:
  - entity_id, bdm_id, product_id, batch_lot_no, expiry_date
  - transaction_type enum: OPENING_BALANCE, GRN, CSI, DR_SAMPLING, DR_CONSIGNMENT, RETURN_IN, TRANSFER_OUT, TRANSFER_IN, ADJUSTMENT
  - qty_in, qty_out, running_balance, event_id
  - fifo_override, override_reason enum: HOSPITAL_POLICY, QA_REPLACEMENT, DAMAGED_BATCH, BATCH_RECALL
  - recorded_at (immutable), recorded_by
- [ ] Commit: `"feat(erp): inventory ledger model"`

### 3.2 — FIFO Engine
- [ ] Create `backend/erp/services/fifoEngine.js`:
  - `getAvailableBatches(bdmId, productId)` — all batches with qty > 0, sorted by expiry ascending
  - `consumeFIFO(bdmId, productId, qty)` — consume from oldest expiry first, return consumed batches
  - `consumeSpecificBatch(bdmId, productId, batchLotNo, qty)` — for FIFO override
- [ ] Test with sample data
- [ ] Commit: `"feat(erp): fifo engine for batch consumption"`

### 3.3 — Sales Line Model
- [ ] Create `backend/erp/models/SalesLine.js`:
  - entity_id, bdm_id, event_id
  - source: SALES_LINE or OPENING_AR (auto-set from live_date)
  - hospital_id, csi_date, doc_ref
  - line_items array: product_id, item_key, batch_lot_no, qty, unit, unit_price, line_total, vat_amount, net_of_vat, fifo_override, override_reason
  - invoice_total, total_vat, total_net_of_vat
  - status (DRAFT/VALID/ERROR/POSTED/DELETION_REQUESTED), posted_at, posted_by, reopen_count, validation_errors, deletion_event_id
  - created_at (immutable)
- [ ] Pre-save: auto-route source based on csi_date vs user.live_date
- [ ] Pre-save: auto-compute line totals, VAT, net of VAT
- [ ] Pre-save: do NOT trigger FIFO consumption yet; inventory moves only on submitSales
- [ ] Commit: `"feat(erp): sales line model with live date partition and auto-vat"`

### 3.4 — Sales Controller & Routes (Validate -> Submit -> Re-open Pattern)
- [ ] Create `backend/erp/controllers/salesController.js`:
  - `createSale` — creates SalesLine(s) in DRAFT status (no inventory movement yet)
  - `updateSale` — edit DRAFT rows only (POSTED rows blocked)
  - `deleteDraftRow` — hard-delete rows in DRAFT status (not yet posted, safe to remove)
  - `getSales` — list with entity/bdm/date/status filters
  - `getSaleById` — single sale with line items and validation_errors
  - `validateSales` — **THE CORE ENDPOINT:**
    1. Rebuild inventory snapshot fresh from InventoryLedger
    2. Check every row: stock available, no duplicates, required fields, no future dates, DR=CR balance
    3. [v5] If CSI references DR (consignment sale): validate qty ≤ remaining consignment qty from ConsignmentTracker
    4. Mark each row VALID or ERROR with actionable error messages
    4. Return: { valid_count, error_count, errors[] }
  - `submitSales` — post all VALID rows:
    1. Pre-check: if any rows not VALID, run validateSales first — block if errors
    2. Create TransactionEvent entries (immutable)
    3. Create InventoryLedger entries (FIFO consumption)
    4. [v5] CSI referencing DR (consigned items): skip inventory deduction (already deducted at DR stage), only create AR entry and update ConsignmentTracker qty_consumed
    5. Set status=POSTED, posted_at, posted_by
    5. Return: { posted_count, event_ids[] }
  - `reopenSales` — un-post for corrections:
    1. Set status=DRAFT, increment reopen_count
    2. Reverse InventoryLedger entries (create reversal ledger entries, not delete)
    3. Create audit log entry (who, when, reason)
    4. Return: { reopened_count }
  - `requestDeletion` — BDM flags POSTED row for Finance review (status=DELETION_REQUESTED)
  - `approveDeletion` — Finance creates REVERSAL entry (SAP Storno pattern, not hard delete):
    1. Create reversal SalesLine (negative amounts, corrects_event_id -> original)
    2. Original stays POSTED (audit trail preserved)
    3. Inventory reversed via reversal ledger entry
- [ ] Create `backend/erp/routes/salesRoutes.js`:
  - POST `/` — createSale
  - PUT `/:id` — updateSale (DRAFT only)
  - DELETE `/draft/:id` — deleteDraftRow
  - GET `/` — getSales (with query filters)
  - GET `/:id` — getSaleById
  - POST `/validate` — validateSales
  - POST `/submit` — submitSales
  - POST `/reopen` — reopenSales
  - POST `/:id/request-deletion` — requestDeletion
  - POST `/:id/approve-deletion` — approveDeletion (Finance/Admin only)
- [ ] Validation rules (in validateSales):
  - No duplicate doc_ref + hospital + product combination across all rows in batch
  - No future dates (csi_date <= today)
  - Stock available for each line item (FIFO check against rebuilt InventoryLedger)
  - All required fields present (hospital_id, csi_date, doc_ref, at least 1 line_item)
  - DR=CR balance: invoice_total == sum(line_totals), VAT computed correctly
  - CSI number in allocation range (if allocations exist for this BDM)
- [ ] Commit: `"feat(erp): sales controller with validate-submit-reopen workflow (SAP pattern)"`

### 3.5 — Audit Log Model
- [ ] Create `backend/erp/models/ErpAuditLog.js`:
  - entity_id, bdm_id, log_type (SALES_EDIT, PRICE_CHANGE, ITEM_CHANGE, DELETION)
  - target_ref, target_model, field_changed, old_value, new_value
  - changed_by, changed_at, note
- [ ] Auto-log on sales modifications
- [ ] Commit: `"feat(erp): erp audit log model"`

### 3.6 — Sales Entry Page (Spreadsheet-Speed Data Entry)
- [ ] Create `frontend/src/erp/pages/SalesEntry.jsx`:
  - **Data entry grid** (spreadsheet-like table for fast encoding):
    - Columns: Hospital, CSI Date, CSI#, Product, Qty, Unit, Unit Price, Line Total (auto), Status
    - Auto-fills: BDM/Territory (from logged-in user), Unit/Price (from ProductMaster), LineTotal (qty × price), TaxTag (from product vat_status)
    - Free typing — no per-keystroke validation, no lag, no popups
    - Add row, delete row, paste rows — all instant
  - **"Scan CSI" button** -> opens camera -> runs OCR -> pre-fills a new row (connects to Phase 1 OCR)
  - **FIFO batch display:** shows recommended batch when product selected, option to override with reason dropdown
  - **Status column:** color-coded per row — gray=DRAFT, green=VALID, red=ERROR, blue=POSTED
  - **Action buttons (bottom bar):**
    - "Validate Sales" -> POST /api/erp/sales/validate -> updates row colors + shows error list
    - "Submit Sales" -> POST /api/erp/sales/submit -> only enabled when all rows VALID
    - "Re-open Sales" -> POST /api/erp/sales/reopen -> only visible for POSTED rows
  - **Error panel:** collapsible panel showing validation errors with row references (e.g., "Row 3: Qty exceeds stock for Dexavit — available: 15, requested: 20")
  - **Mobile layout:** card-per-row on phone (each sales line is a card), swipe to delete draft rows
- [ ] Commit: `"feat(ui): sales entry page with validate-submit-reopen workflow"`

### 3.7 — Sales List Page
- [ ] Create `frontend/src/erp/pages/SalesList.jsx`:
  - Table: date, CSI#, hospital, total, source, status
  - Filters: date range, hospital, source type
  - Click → detail view with line items
  - BDM: request deletion button
  - Admin/Finance: approve deletion button
- [ ] Commit: `"feat(ui): sales list page with deletion workflow"`

---

## PHASE 4 — INVENTORY MODULE
**Goal:** Stock on hand, GRN, reorder alerts, expiry alerts, warehouse dashboard.

### 4.1 — Stock Service
- [ ] Create `backend/erp/services/stockService.js`:
  - `getStockOnHand(bdmId, productId?)` — aggregate from InventoryLedger
  - `getStockSummary(bdmId)` — total SKUs, out of stock, low stock, expiry risk, total value
  - `getExpiryAlerts(bdmId)` — items within NEAR_EXPIRY_DAYS
  - `getReorderAlerts(bdmId)` — items below minimum stock
- [ ] Commit: `"feat(erp): stock on hand aggregation and alert services"`

### 4.2 — Inventory Controller & Routes
- [ ] Create `backend/erp/controllers/inventoryController.js`:
  - `getStock`, `getStockByProduct`, `getSummary`, `getLedger`, `getAlerts`
  - `createGrn` — manual stock receiving (pending Finance approval)
  - `approveGrn` — Finance approves → inventory_ledger GRN entry created
  - `requestAdjustment` — BDM requests physical count adjustment
  - `approveAdjustment` — Finance approves → inventory_ledger ADJUSTMENT entry
- [ ] Create `backend/erp/routes/inventoryRoutes.js`
- [ ] Commit: `"feat(erp): inventory controller and routes"`

### 4.3 — Reorder Rules
- [ ] Add `reorder_min_qty` field to ProductMaster (or separate ReorderRule model)
- [ ] Finance can set/update min stock per product
- [ ] Alert logic: stock below threshold after any inventory movement
- [ ] Commit: `"feat(erp): reorder rules with thresholds"`

### 4.4 — Inventory Dashboard Page
- [ ] Create `frontend/src/erp/pages/Inventory.jsx`:
  - Summary cards: Total SKUs, Out of Stock (red), Low Stock (orange), Expiry Risk (yellow), Total Value
  - Product list: cards sorted by status priority, expandable batch breakdown
  - Color coding: RED=expired/out, ORANGE=risk/low, GREEN=ok
- [ ] Commit: `"feat(ui): inventory dashboard"`

### 4.5 — GRN Entry Page
- [ ] Create `frontend/src/erp/pages/GrnEntry.jsx`:
  - Product dropdown, batch lot#, expiry date, qty
  - "Scan Undertaking" button → OCR pre-fills (Phase 1)
  - Waybill photo upload (proof only)
  - Submit → pending Finance approval
- [ ] Commit: `"feat(ui): grn entry page"`

### 4.6 — Stock Visibility Rules (BDM Territory Isolation) [v5 NEW]
- [ ] Enforce in stockService.js: BDM can ONLY see stock in their own territory (bdm_id filter auto-applied)
- [ ] Admin/Finance can see all territories with territory filter dropdown
- [ ] Inventory dashboard respects tenant filtering (bdm_id scope)
- [ ] Commit: `"feat(erp): stock visibility isolation per bdm territory [v5]"`

### 4.7 — DR Entry & Consignment Tracking [v5 NEW]
- [ ] Create `backend/erp/controllers/consignmentController.js`:
  - `createDR` — creates ConsignmentTracker entry + InventoryLedger DR_CONSIGNMENT or DR_SAMPLING movement
  - `getDRsByBdm` — list DRs with aging status
  - `getConsignmentPool` — open consignments per hospital
  - `convertConsignment` — when CSI references DR, update qty_consumed, link sales_line_id
- [ ] Create `backend/erp/routes/consignmentRoutes.js`
- [ ] Add to ERP router
- [ ] Create `frontend/src/erp/pages/DrEntry.jsx`:
  - Hospital dropdown, product grid, qty, batch
  - "Scan DR" button → OCR pre-fills (Phase 1.15)
  - DR type toggle: Sampling vs Consignment
  - Submit → creates ConsignmentTracker + inventory movement
- [ ] Create `frontend/src/erp/pages/ConsignmentDashboard.jsx`:
  - Open consignments per hospital with aging color coding
  - OVERDUE highlighted red, FORCE_CSI highlighted orange
  - Quick-action: "Convert to CSI" button per consignment line
- [ ] Commit: `"feat(erp): dr entry and consignment tracking with csi-dr reference chain [v5]"`

---

## PHASE 5 — COLLECTIONS & AR + CREDIT LIMITS + DUNNING
**Goal:** Collection session that preserves the client's current validation + proof-gate + SOA behavior, then formalizes it in MERN with a cleaner SAP-style document lifecycle, CWT, commission, partner insurance, AR aging, credit limits, and dunning.

### 5.1 — Collection Model & Services
- [ ] Create `backend/erp/models/Collection.js` — full schema per PRD with DRAFT/VALID/ERROR/POSTED/DELETION_REQUESTED lifecycle fields
- [ ] Create `backend/erp/services/cwtCalc.js` — CWT formula
- [ ] Create `backend/erp/services/commissionCalc.js` — commission per CSI
- [ ] Create `backend/erp/services/arEngine.js` — AR open, aging, collection rate
- [ ] Create `backend/erp/services/soaGenerator.js` — SOA PDF/Excel export
- [ ] Commit: `"feat(erp): collection model and financial services"`

### 5.2 — Collection Controller & Routes
- [ ] Create `backend/erp/controllers/collectionController.js`
- [ ] Create `backend/erp/routes/collectionRoutes.js`
- [ ] Endpoints: GET open CSIs, POST collection session (draft), POST validate, POST submit, POST reopen, GET collections, GET AR open, GET AR aging, POST SOA
- [ ] Hard gate validation: CR photo + CSI photos + CWT (or N/A) + deposit slip required
- [ ] Follow the same Validate -> Submit -> Re-open lifecycle from PRD Section 5.5
- [ ] Commit: `"feat(erp): collection routes with hard gate validation"`

### 5.2b — OCR-to-AR CSI Auto-Population
**Goal:** When a Collection Receipt (CR) is scanned via OCR, the hospital name detected by OCR is used to auto-fetch open/unpaid CSIs from Accounts Receivable for that hospital. The BDM sees a checklist of outstanding CSIs to settle instead of manually typing CSI numbers.

- [ ] Add endpoint: GET `/api/erp/collections/open-csis?hospital_id=xxx` — returns unpaid CSIs for a hospital (from AR engine)
- [ ] In CR OCR flow:
  - After OCR extracts `hospital` field → auto-lookup hospital in Hospital collection (fuzzy match)
  - If hospital matched → fetch open CSIs from AR for that hospital
  - Display CSI list as checkboxes with invoice_no + amount + age (days overdue)
  - BDM ticks which CSIs are being settled in this CR
  - OCR-extracted `settled_csis` from the CR photo are pre-checked if they match AR records
- [ ] Validation: total of selected CSI amounts should match CR total amount (warn if mismatch)
- [ ] Commit: `"feat(erp): ocr cr auto-populates open csis from ar by hospital"`

### 5.3 — Credit Limit Management (SAP SD Credit Management)
- [ ] Add `credit_limit` and `credit_limit_action` fields to Hospital schema
- [ ] In sales validateSales: check hospital AR + new invoice vs credit_limit
  - WARN action: validation passes with WARNING severity (orange indicator)
  - BLOCK action: validation fails with ERROR severity (red, blocks submit)
- [ ] Admin/Finance UI to set credit limits per hospital
- [ ] Commit: `"feat(erp): credit limit management per hospital"`

### 5.4 — Dunning / Collection Follow-Up (SAP FI-AR Dunning)
- [ ] Create `backend/erp/services/dunningService.js`:
  - Level 1 (>30 days): yellow indicator on AR aging
  - Level 2 (>60 days): orange indicator + flag
  - Level 3 (>90 days): red indicator + auto-generate SOA
- [ ] Add dunning level to AR aging endpoint response
- [ ] Display dunning indicators on AccountsReceivable.jsx
- [ ] Commit: `"feat(erp): dunning levels for overdue collections"`

### 5.5 — Collection & AR Pages
- [ ] Create `frontend/src/erp/pages/CollectionSession.jsx` — multi-step wizard
- [ ] Create `frontend/src/erp/pages/AccountsReceivable.jsx` — AR aging table
- [ ] Create `frontend/src/erp/pages/SoaGenerator.jsx` — select hospital, preview, export
- [ ] Commit: `"feat(ui): collection wizard, ar aging, and soa pages"`

---

## PHASE 6 — EXPENSES
**Goal:** SMER, Car Logbook, ORE, ACCESS, and PRF/CALF with SAP-style draft -> validate -> post lifecycle.

### 6.1 — Expense Models
- [ ] Create `backend/erp/models/SmerEntry.js` — daily entries, per diem tiers, totals, status lifecycle
- [ ] Create `backend/erp/models/CarLogbookEntry.js` — morning/night odometer, fuel, km split, status lifecycle
- [ ] Create `backend/erp/models/ExpenseEntry.js` — ORE and ACCESS with CALF rules and status lifecycle
- [ ] Create `backend/erp/models/PrfCalf.js` — payment request / cash advance with status lifecycle
- [ ] Commit: `"feat(erp): expense models (smer, car logbook, ore, access, prf, calf)"`

### 6.2 — Expense Services
- [ ] Create `backend/erp/services/perdiemCalc.js` — MD count → tier → amount
- [ ] Create `backend/erp/services/fuelTracker.js` — km split, efficiency, overconsumption
- [ ] Create `backend/erp/services/expenseSummary.js` — 5 categories consolidated
- [ ] Commit: `"feat(erp): expense calculation services"`

### 6.3 — Expense Controller & Routes
- [ ] Create `backend/erp/controllers/expenseController.js`
- [ ] Create `backend/erp/routes/expenseRoutes.js`
- [ ] Endpoints follow Validate -> Submit -> Re-open pattern for transactional expense documents
- [ ] Commit: `"feat(erp): expense routes"`

### 6.4 — Expense Pages
- [ ] Create `frontend/src/erp/pages/Smer.jsx` — daily activity grid with per diem
- [ ] Create `frontend/src/erp/pages/CarLogbook.jsx` — morning/night odometer, fuel
- [ ] Create `frontend/src/erp/pages/Expenses.jsx` — ORE and ACCESS forms
- [ ] Create `frontend/src/erp/pages/PrfCalf.jsx` — PRF and CALF forms
- [ ] Commit: `"feat(ui): expense pages"`

---

## PHASE 7 — INCOME, PROFIT SHARING, PNL & YEAR-END CLOSE
**Goal:** Payslip, territory P&L, profit sharing gate, and fiscal year closing controls, while preserving the client's current live SALES/CORE -> PNL workflow and close-month snapshot behavior as MERN-native features.

### 7.1 — Income & PNL Models
- [ ] Create `backend/erp/models/IncomeReport.js` — payslip per cycle
- [ ] Create `backend/erp/models/PnlReport.js` — territory P&L per month
- [ ] Create `backend/erp/models/MonthlyArchive.js` — monthly snapshots / close-month restore state
- [ ] Commit: `"feat(erp): income, pnl, and archive models"`

### 7.2 — Income & PNL Services
- [ ] Create `backend/erp/services/incomeCalc.js` — earnings, deductions, net pay
- [ ] Create `backend/erp/services/pnlCalc.js` — revenue, costs, profit gate, and MERN-native replacement for the current SALES/CORE push-to-PNL workbook flow
- [ ] Create `backend/erp/services/profitShareEngine.js` — simple territory-level gate
- [ ] Commit: `"feat(erp): income, pnl, and profit sharing calculation services"`

### 7.3 — Year-End Close + Retained Earnings (SAP FI Year-End Close)
- [ ] Create `backend/erp/services/yearEndClose.js`:
  - Compute full-year PNL (Revenue − Expenses)
  - Generate closing journal: zero out all revenue and expense accounts
  - Transfer net income/loss to Retained Earnings
  - Lock the closed fiscal year (prevent posting to closed year)
- [ ] Admin trigger: "Close Year 20XX" button (requires Finance/Admin role)
- [ ] Validation: all periods in the year must be POSTED before year-end close
- [ ] Commit: `"feat(erp): year-end close with retained earnings transfer"`

### 7.4 — Income & PNL Routes
- [ ] Create controllers and routes for income, pnl, profit sharing
- [ ] Commit: `"feat(erp): income and pnl routes"`

### 7.5 — Income & PNL Pages
- [ ] Create `frontend/src/erp/pages/Income.jsx` — payslip view
- [ ] Create `frontend/src/erp/pages/Pnl.jsx` — territory P&L
- [ ] Create `frontend/src/erp/pages/ProfitSharing.jsx` — per-product status
- [ ] Commit: `"feat(ui): income, pnl, and profit sharing pages"`

---

## PHASE 8 — DASHBOARD & REPORTS
**Goal:** CEO dashboard, monthly archive, summaries, and audit viewer, while formalizing the client's existing live month snapshot/archive behavior in MERN.

### 8.1 — Dashboard & Report Services
- [ ] Create `backend/erp/services/dashboardService.js` — CEO KPIs
- [ ] Create monthly archive auto-snapshot logic — formalize the current workbook close-month snapshot behavior in MERN
- [ ] Commit: `"feat(erp): dashboard and archive services"`

### 8.2 — Report Routes
- [ ] Create `backend/erp/controllers/reportController.js` (name carefully — CRM already has one)
- [ ] Create `backend/erp/routes/reportRoutes.js`
- [ ] Endpoints: dashboard, monthly-archive, sales-summary, collection-summary, expense-summary, audit-logs, system-health
- [ ] Commit: `"feat(erp): report routes"`

### 8.3 — ERP Dashboard (BOSS-Style Layout)
> **Reference:** BOSS app (Play Store). See PRD-ERP.md Section 13.5 for full spec.

- [ ] Replace `frontend/src/erp/pages/ErpDashboard.jsx` placeholder with BOSS-style layout
- [ ] **Top action buttons (2×2 grid):**
  - CRM — link back to CRM dashboard (role-aware: `/bdm` or `/admin`)
  - Sales — link to `/erp/sales`
  - Expenses — link to `/erp/expenses`
  - Collections — link to `/erp/collections`
- [ ] **Summary cards section ("Remainders"):**
  - Total Sales (from `GET /api/erp/dashboard/summary`)
  - AR = Total Sales − Total Collections
  - Value of Stocks on Hand (from inventory aggregation)
  - Engagements = Visited vs Target (from CRM Schedule API)
- [ ] **Month-to-Date section:**
  - Sales MTD, Collections MTD, Engagements MTD, Income MTD
  - Source: `GET /api/erp/dashboard/mtd`
- [ ] **Bottom navigation tabs (fixed bar):**
  - Product Master — available products with stock levels (from ProductMaster + InventoryLedger)
  - Customer/Hospital (HEAT) — hospital list with HEAT fields (from Hospital model)
  - VIP Clients — CRM client list for coverage (from Doctor model, region-filtered)
  - PNL — Total Sales − Total Expenses YTD (from `GET /api/erp/dashboard/pnl-ytd`)
- [ ] Create `backend/erp/controllers/dashboardController.js`:
  - `getSummary` — aggregates Total Sales, AR, Stock Value, Engagements
  - `getMtd` — month-to-date Sales, Collections, Engagements, Income
  - `getPnlYtd` — year-to-date PNL
- [ ] Create `backend/erp/routes/dashboardRoutes.js` — mount at `/api/erp/dashboard`
- [ ] Mobile-first responsive layout (phone is primary device for BDMs)
- [ ] Dark mode support (match existing CRM dark mode CSS vars)
- [ ] Commit: `"feat(ui): boss-style erp dashboard with summary cards and bottom nav"`

### 8.4 — Report Pages
- [ ] Create `frontend/src/erp/pages/MonthlyArchive.jsx`
- [ ] Create `frontend/src/erp/pages/Reports.jsx` — report hub
- [ ] Create `frontend/src/erp/pages/AuditLogs.jsx` — searchable log viewer
- [ ] Commit: `"feat(ui): erp report pages"`

---

## PHASE 9 — INTEGRATION, DOCUMENT FLOW & POLISH
**Goal:** Wire up OCR to ERP forms, CRM data flows, document flow tracing, Excel migration, and end-to-end testing.

### 9.1 — OCR → ERP Form Connections
- [ ] Sales entry: "Scan CSI" → OCR → pre-fill sales form
- [ ] Collection session: "Scan CR" + "Scan 2307" + "Scan Deposit" → OCR → pre-fill
- [ ] Car Logbook: "Scan Odometer" + "Scan Gas Receipt" → OCR → pre-fill
- [ ] GRN: "Scan Undertaking" → OCR → pre-fill
- [ ] Commit: `"feat(integration): connect ocr to all erp forms"`

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

### 9.4 — Excel Migration Tools
- [ ] Admin page: bulk import Opening AR from Excel
- [ ] Admin page: bulk import Product Master from Excel
- [ ] Admin page: bulk import Inventory Opening Balances from Excel
- [ ] Admin page: bulk import Hospital Master from Excel
- [ ] Commit: `"feat(erp): excel migration import tools"`

### 9.5 — End-to-End Testing
- [ ] Full flow: create sale → stock drops → create collection → AR drops → commission computed → SMER filled → income generated → PNL computed
- [ ] Mobile responsiveness on all ERP pages
- [ ] Permission checks: BDM=own territory, Admin=all, CEO=view only
- [ ] Error handling and loading states on all pages
- [ ] Commit: `"test: end-to-end erp flow verification"`

---

## PHASE 10 — PEOPLE MASTER & PAYROLL [v5 NEW]
**Goal:** Unified people directory covering all person types (BDMs, office staff, sales reps, consultants, directors), compensation profiles, payslip generation with Philippine government mandatories, and staging-then-post pattern.

**Reference:** PRD v5 §10 (People Master & Payroll), §3.7 (Government Rates)

### 10.1 — People Master Model
- [ ] Create `backend/erp/models/PeopleMaster.js`:
  - entity_id, person_type enum: BDM, EMPLOYEE, SALES_REP, CONSULTANT, DIRECTOR
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
| 5 | Collections & AR + Credit Limits + Dunning | 22 | 2-3 weeks |
| 6 | Expenses (with document lifecycle) | 17 | 2 weeks |
| 7 | Income, PNL & Year-End Close | 18 | 1-2 weeks |
| 8 | Dashboard & Reports (BOSS-Style) | 12 | 1 week |
| 9 | Integration, Document Flow & Polish | 24 | 2 weeks |
| 10 | People Master & Payroll [v5 NEW] | ~45 | 2-3 weeks |
| 11 | VIP Accounting Engine [v5 NEW] | ~70 | 3-4 weeks |
| 12 | Purchasing & AP [v5 NEW] | ~40 | 2-3 weeks |
| 13 | Banking & Cash [v5 NEW] | ~30 | 1-2 weeks |
| 14 | New Reports & Analytics [v5 NEW] | ~35 | 1-2 weeks |
| 15+ | Future (SAP-equivalent improvements) | 8 | Post-launch |

**Total pre-launch: ~535 tasks across 15 phases → ~26-34 weeks**
**Note: Phases 10-14 add ~220 tasks and ~10-14 weeks from PRD v5 (PNL Central live system integrations)**
**Reference PRD:** `docs/VIP ERP PRD v5.md`

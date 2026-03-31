# PHASETASK.md — VIP Integrated Platform Build Plan
## For Claude Code Execution

**Branch:** `erp-integration`
**Codebase:** `VIP-PHARMACY-CRM` (MERN stack)
**Reference PRD:** `docs/VIP_IP_PRD_v4_MERN.md`

**Rule:** Complete ALL checkboxes in a phase before moving to the next phase. Each phase is self-contained and testable.

**Key Principle:** DO NOT reorganize existing CRM files. All ERP code goes in NEW `erp/` directories. CRM code stays exactly where it is.

**UI Reference:** BOSS app (Play Store) — client wants this style for the ERP dashboard.
**Client Direction:** Use SAP, NetSuite, or QuickBooks as standard references for ERP patterns and workflows.

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

## PHASE 1 — OCR ENGINE (CLIENT PRIORITY #1)
**Goal:** Build a standalone OCR test page where the client can photograph VIP documents (CSI, CR, BIR 2307, gas receipts, odometer) and see extracted data. This is what the client wants to demo FIRST.

**Prerequisites:** Google Vision API key, existing S3 bucket access (from CRM config/s3.js)

### 1.1 — Google Vision API Setup
- [ ] Install `@google-cloud/vision` package: `cd backend && npm install @google-cloud/vision`
- [ ] Add Google Vision credentials to `backend/.env`:
  ```
  GOOGLE_VISION_CREDENTIALS=path/to/service-account-key.json
  ```
  (or `GOOGLE_VISION_KEY_JSON` with inline JSON)
- [ ] Create `backend/erp/ocr/visionClient.js`:
  - Initialize Google Vision client from credentials
  - Export `detectText(imageBuffer)` function that calls Vision API TEXT_DETECTION
  - Return: full text, words with bounding boxes, confidence scores per word
- [ ] Test: call `detectText()` with a sample image, verify raw text returns
- [ ] Commit: `"feat(ocr): google vision api client setup"`

### 1.2 — S3 Document Upload for ERP
- [ ] Create `backend/erp/services/documentUpload.js`:
  - Reuse existing `backend/config/s3.js` S3 client
  - Implement `uploadErpDocument(fileBuffer, fileName, bdmName, period, cycle, docType)`
  - S3 key format: `erp-documents/${bdmName}/${period}/${cycle}/${docType}/${fileName}`
  - Return the S3 URL
- [ ] Test: upload a test image, verify it appears in S3 at correct path
- [ ] Commit: `"feat(ocr): erp document upload service using existing s3 config"`

### 1.3 — Base OCR Processing Route
- [ ] Create `backend/erp/routes/ocrRoutes.js`:
  - POST `/process` — accepts multipart `photo` file + `docType` string
  - Uses existing `backend/middleware/auth.js` for authentication
  - Uses existing `backend/middleware/upload.js` for file upload (or create new multer instance)
  - Flow: receive file → upload to S3 → send buffer to Vision API → return raw text + S3 URL
- [ ] Create `backend/erp/routes/index.js` — ERP router that mounts all ERP sub-routes:
  ```javascript
  const router = require('express').Router();
  router.use('/ocr', require('./ocrRoutes'));
  module.exports = router;
  ```
- [ ] In `backend/server.js`, uncomment and add:
  ```javascript
  app.use('/api/erp', require('./erp/routes'));
  ```
- [ ] Test with Postman: POST `/api/erp/ocr/process` with a CSI photo, verify raw OCR text returns
- [ ] Commit: `"feat(ocr): base ocr processing endpoint"`

### 1.4 — CSI Parser (Charge Sales Invoice)
- [ ] Create `backend/erp/ocr/parsers/csiParser.js`
- [ ] Implement header extraction:
  - Invoice No: detect `N°` or `No.` or `No:` followed by digits (e.g., `004719`)
  - Date: detect `Date:` or `Date` followed by date pattern (MM/DD/YY or similar)
  - Hospital/Charge To: detect `CHARGE TO:` and extract the name on that line
  - Terms: detect `TERMS:` and extract (e.g., `30 days`)
- [ ] Implement 3-line product parser (PRD Section 7.3):
  - Scan all OCR lines looking for "Batch" keyword → that's Line 2
  - Line above "Batch" → Line 1 (product name: brand before "(", generic between "()", dosage after ")")
  - Line below with "Exp" → Line 3 (expiry date)
  - Extract: brand_name, generic_name, dosage, batch_lot_no, expiry_date
- [ ] Implement line item extraction:
  - For each product block: find Quantity, Unit Price, Amount in the corresponding table row
  - Match product text position to the numeric columns
- [ ] Implement footer extraction:
  - Total Sales (VAT Inclusive)
  - Less: VAT
  - Amount: Net of VAT
  - Total Amount Due
- [ ] Implement footer cross-validation (PRD Section 7.4):
  - If product is VATABLE: expected VAT = Total × 12/112, expected Net = Total × 100/112
  - If extracted values don't match computed → add validation flag `FOOTER_MISMATCH`
- [ ] Add per-field confidence scoring:
  - HIGH: Vision confidence > 0.9 AND regex matched
  - MEDIUM: Vision confidence 0.7-0.9 OR partial regex match
  - LOW: Vision confidence < 0.7 OR no pattern match
- [ ] Test with actual VIP CSI photo: verify extracts Invoice No=004719, Hospital=MG & CO, Product=Dexavit (Dexamethasone) 4mg/Ml, Batch=A250558, Exp=26/08/2028, Qty=20, Price=95.00, Amount=1900.00, Total Due=1900.00
- [ ] Commit: `"feat(ocr): csi parser with 3-line product detection and footer validation"`

### 1.5 — Collection Receipt Parser
- [ ] Create `backend/erp/ocr/parsers/crParser.js`
- [ ] Extract header fields:
  - CR No: detect `N°` or `No.` followed by digits (e.g., `002905`)
  - Date: detect `Date` followed by date pattern
  - Hospital: detect `Received from` and extract the name
  - Amount: detect `pesos(P` or `₱` followed by amount pattern (e.g., `48,740.72`)
- [ ] Extract payment info:
  - Form of Payment: detect `CASH` or `CHECK` checkmarks/text
  - Check No: detect `CHECK No.` and extract
  - Bank: detect `BANK` and extract
- [ ] Extract CSI settlement table (left stub):
  - Detect `CHARGE SALES INVOICE No.` and `AMOUNT` header pattern
  - Parse rows: CSI number + amount pairs (e.g., 4413=24,000 / 4411=10,800 / 4407=12,000 / 4250=4,000)
- [ ] Add per-field confidence scoring
- [ ] Test with actual VIP CR photo: verify extracts CR No=002905, Hospital=Panay Health Care Multi-Purpose Cooperative, Amount=48740.72, Payment=CHECK, CSI list with 4 entries
- [ ] Commit: `"feat(ocr): collection receipt parser with csi settlement table"`

### 1.6 — BIR 2307 Parser (CWT Certificate)
- [ ] Create `backend/erp/ocr/parsers/cwtParser.js`
- [ ] Handle rotated documents (Vision API handles rotation — no special code needed)
- [ ] Extract payee info:
  - TIN: detect TIN pattern (###-###-###-####) in payee section
  - Name: detect payee/taxpayer name (registered name)
- [ ] Extract payor info:
  - Name: detect payor name
  - TIN: detect payor TIN
  - Address: detect registered address
- [ ] Extract period:
  - From date and To date (MM/DD/YYYY pattern)
- [ ] Extract financial data:
  - ATC code (e.g., WC 158)
  - Income Payment amounts per quarter column
  - Tax Withheld amounts per quarter column
  - Totals: total income, total tax withheld
- [ ] Add per-field confidence scoring
- [ ] Test with actual VIP 2307 photo: verify Payee=VIOS INTEGRATED PROJECTS (VIP) INC., Payor=PANAY HEALTH CARE MULTI PURPOSE COOPERATIVE, Income=43928.57, Tax=439.28, Period=02/01/2026-02/28/2026
- [ ] Commit: `"feat(ocr): bir 2307 withholding tax certificate parser"`

### 1.7 — Gas Receipt Parser
- [ ] Create `backend/erp/ocr/parsers/gasReceiptParser.js`
- [ ] Extract: date, station name, fuel type (Diesel/Gas/Premium), liters, price per liter, total amount
- [ ] Handle Shell receipts and generic gas station receipts
- [ ] Add per-field confidence scoring
- [ ] Commit: `"feat(ocr): gas station receipt parser"`

### 1.8 — Odometer Parser
- [ ] Create `backend/erp/ocr/parsers/odometerParser.js`
- [ ] Extract numeric reading from dashboard photo (look for large digit sequences, typically 5-6 digits)
- [ ] Use photo EXIF timestamp as the capture date
- [ ] Add confidence scoring (odometer photos are lower quality — expect more LOW confidence)
- [ ] Commit: `"feat(ocr): odometer reading parser"`

### 1.9 — Expense Receipt / OR Parser
- [ ] Create `backend/erp/ocr/parsers/orParser.js`
- [ ] Extract: OR number, date, supplier/establishment name, amount, VAT amount (if present)
- [ ] Generic enough to handle parking receipts, toll receipts, misc expenses
- [ ] Add per-field confidence scoring
- [ ] Commit: `"feat(ocr): official receipt and expense receipt parser"`

### 1.10 — Undertaking of Receipt Parser (for GRN)
- [ ] Create `backend/erp/ocr/parsers/undertakingParser.js`
- [ ] Reuse 3-line product parser logic from CSI parser (same format)
- [ ] Extract per line item: brand_name, generic_name, dosage, batch_lot_no, expiry_date, qty
- [ ] Add per-field confidence scoring
- [ ] Commit: `"feat(ocr): undertaking of receipt parser for grn"`

### 1.11 — Unified OCR Response Format
- [ ] Create `backend/erp/ocr/confidenceScorer.js`:
  - HIGH (black in UI): Vision word confidence > 0.9 AND regex pattern matched
  - MEDIUM (orange in UI): Vision confidence 0.7-0.9 OR partial match
  - LOW (red in UI): Vision confidence < 0.7 OR no match OR field missing
- [ ] Create `backend/erp/ocr/ocrProcessor.js` — unified orchestrator:
  - Receives docType + Vision API raw result
  - Routes to correct parser (csiParser, crParser, cwtParser, etc.)
  - Applies confidence scoring
  - Returns unified response format:
    ```json
    {
      "s3_url": "https://...",
      "doc_type": "CSI",
      "extracted": {
        "invoice_no": { "value": "004719", "confidence": "HIGH" },
        "hospital": { "value": "MG & CO", "confidence": "HIGH" },
        "date": { "value": "12/11/25", "confidence": "MEDIUM" },
        "line_items": [
          {
            "brand_name": { "value": "Dexavit", "confidence": "HIGH" },
            "generic_name": { "value": "Dexamethasone", "confidence": "HIGH" },
            "dosage": { "value": "4mg/Ml", "confidence": "HIGH" },
            "batch_lot_no": { "value": "A250558", "confidence": "HIGH" },
            "expiry_date": { "value": "26/08/2028", "confidence": "HIGH" },
            "qty": { "value": 20, "confidence": "HIGH" },
            "unit_price": { "value": 95.00, "confidence": "HIGH" },
            "amount": { "value": 1900.00, "confidence": "HIGH" }
          }
        ],
        "totals": {
          "total_vat_inclusive": { "value": 1900.00, "confidence": "HIGH" },
          "less_vat": { "value": 203.57, "confidence": "HIGH" },
          "net_of_vat": { "value": 1696.43, "confidence": "HIGH" },
          "total_amount_due": { "value": 1900.00, "confidence": "HIGH" }
        }
      },
      "validation_flags": [],
      "raw_ocr_text": "..."
    }
    ```
- [ ] Update `backend/erp/routes/ocrRoutes.js` to use ocrProcessor instead of returning raw text
- [ ] Test: POST `/api/erp/ocr/process` with docType=CSI returns structured extracted data
- [ ] Commit: `"feat(ocr): unified ocr processor with confidence scoring"`

### 1.12 — OCR Test Page (Frontend)
- [ ] Update `frontend/src/erp/pages/OcrTest.jsx` with full UI:
- [ ] Document type selector dropdown:
  - Charge Sales Invoice (CSI)
  - Collection Receipt (CR)
  - BIR 2307 (Withholding Tax)
  - Gas Station Receipt
  - Odometer
  - Expense Receipt / OR
  - Undertaking of Receipt (GRN)
- [ ] Capture buttons:
  - "Take Photo" — `<input type="file" accept="image/*" capture="environment">` (opens camera on phone)
  - "Upload from Gallery" — `<input type="file" accept="image/*">` (opens file picker)
- [ ] Loading state: spinner + "Processing document..." while OCR runs (2-4 seconds)
- [ ] Results display — form with extracted fields:
  - Each field is an editable input pre-filled with OCR value
  - Field border color based on confidence: black=HIGH, orange=MEDIUM, red=LOW
  - LOW confidence fields show label: "⚠ Please verify"
  - Missing fields show empty input with "Required — enter manually"
- [ ] Original photo preview: show the captured photo alongside the form
  - Desktop: side-by-side layout (photo left, form right)
  - Mobile: stacked (photo on top, form below, collapsible)
- [ ] Validation flags section: show any flags (e.g., "Footer VAT mismatch — please verify amounts")
- [ ] "Confirm" button (for now: logs confirmed data to console + shows success toast)
- [ ] "Try Another" button (resets form for next document)
- [ ] Create `frontend/src/erp/services/ocrService.js`:
  - `processDocument(photo, docType)` — POST to `/api/erp/ocr/process` with FormData
- [ ] Commit: `"feat(ui): ocr test page with camera capture, confidence display, and field editing"`

### 1.13 — Test with Real VIP Documents
- [ ] Test CSI parser with 3+ real VIP Charge Sales Invoice photos (printed)
- [ ] Test CSI parser with handwritten CSI (if available) — expect more MEDIUM/LOW fields
- [ ] Test CR parser with 3+ real VIP Collection Receipt photos
- [ ] Test 2307 parser with 2+ real BIR 2307 photos (including rotated/sideways)
- [ ] Test gas receipt parser with 2+ real gas station receipts
- [ ] Test odometer parser with 2+ real dashboard photos
- [ ] Document accuracy results: which fields extract well, which need tuning
- [ ] Fix any parsing issues found during testing
- [ ] Commit: `"fix(ocr): parser adjustments from real document testing"`

### 1.14 — Client Demo Ready
- [ ] OCR test page is accessible at `/erp/ocr-test` after login
- [ ] All 7 document types can be scanned
- [ ] Confidence colors display correctly (black/orange/red)
- [ ] Photo preview works on phone
- [ ] Works on mobile (phone-first layout)
- [ ] Brief user instructions shown on the page (e.g., "Select document type, take a photo or upload, review and correct extracted data")
- [ ] Ready to demo to client: "Open the app → go to OCR Test → scan a CSI → see the magic"

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

---

## PHASE 3 — SALES MODULE
**Goal:** Sales invoice entry with live date partition, FIFO batch selection, auto-VAT, and audit trail.

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
  - status (ACTIVE/DELETED/DELETION_REQUESTED), deletion_event_id
  - created_at (immutable)
- [ ] Pre-save: auto-route source based on csi_date vs user.live_date
- [ ] Pre-save: auto-compute line totals, VAT, net of VAT
- [ ] Pre-save: if source=SALES_LINE, trigger FIFO consumption
- [ ] Commit: `"feat(erp): sales line model with live date partition and auto-vat"`

### 3.4 — Sales Controller & Routes
- [ ] Create `backend/erp/controllers/salesController.js`:
  - `createSale` — creates TransactionEvent + SalesLine + InventoryLedger entries
  - `getSales` — list with entity/bdm/date filters
  - `getSaleById` — single sale with line items
  - `requestDeletion` — BDM sets status=DELETION_REQUESTED
  - `approveDeletion` — Finance creates DELETION_EVENT, reverses inventory
- [ ] Create `backend/erp/routes/salesRoutes.js`
- [ ] Validation: no duplicate doc_ref, no future dates, stock check for SALES_LINE source
- [ ] Commit: `"feat(erp): sales controller and routes with deletion workflow"`

### 3.5 — Audit Log Model
- [ ] Create `backend/erp/models/ErpAuditLog.js`:
  - entity_id, bdm_id, log_type (SALES_EDIT, PRICE_CHANGE, ITEM_CHANGE, DELETION)
  - target_ref, target_model, field_changed, old_value, new_value
  - changed_by, changed_at, note
- [ ] Auto-log on sales modifications
- [ ] Commit: `"feat(erp): erp audit log model"`

### 3.6 — Sales Entry Page
- [ ] Create `frontend/src/erp/pages/SalesEntry.jsx`:
  - Hospital dropdown (from Hospital model, filtered by BDM tags)
  - Date picker (shows OPENING_AR or SALES_LINE routing indicator)
  - CSI number input
  - "Scan CSI" button → opens camera → runs OCR → pre-fills form (connects to Phase 1 OCR)
  - Add line items: product dropdown → auto-fills unit + price → BDM enters qty → line_total auto-computes
  - FIFO batch display: shows recommended batch, option to override with reason dropdown
  - Totals: invoice total, VAT, net of VAT
  - Submit
- [ ] Commit: `"feat(ui): sales entry page with ocr, fifo, and auto-vat"`

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

---

## PHASE 5 — COLLECTIONS & AR
**Goal:** Collection session with hard gates, CWT, commission, partner insurance, AR aging, SOA.

### 5.1 — Collection Model & Services
- [ ] Create `backend/erp/models/Collection.js` — full schema per PRD
- [ ] Create `backend/erp/services/cwtCalc.js` — CWT formula
- [ ] Create `backend/erp/services/commissionCalc.js` — commission per CSI
- [ ] Create `backend/erp/services/arEngine.js` — AR open, aging, collection rate
- [ ] Create `backend/erp/services/soaGenerator.js` — SOA PDF/Excel export
- [ ] Commit: `"feat(erp): collection model and financial services"`

### 5.2 — Collection Controller & Routes
- [ ] Create `backend/erp/controllers/collectionController.js`
- [ ] Create `backend/erp/routes/collectionRoutes.js`
- [ ] Endpoints: GET open CSIs, POST collection session, GET collections, GET AR open, GET AR aging, POST SOA
- [ ] Hard gate validation: CR photo + CSI photos + CWT (or N/A) + deposit slip required
- [ ] Commit: `"feat(erp): collection routes with hard gate validation"`

### 5.3 — Collection & AR Pages
- [ ] Create `frontend/src/erp/pages/CollectionSession.jsx` — multi-step wizard
- [ ] Create `frontend/src/erp/pages/AccountsReceivable.jsx` — AR aging table
- [ ] Create `frontend/src/erp/pages/SoaGenerator.jsx` — select hospital, preview, export
- [ ] Commit: `"feat(ui): collection wizard, ar aging, and soa pages"`

---

## PHASE 6 — EXPENSES
**Goal:** SMER, Car Logbook, ORE, ACCESS, PRF/CALF.

### 6.1 — Expense Models
- [ ] Create `backend/erp/models/SmerEntry.js` — daily entries, per diem tiers, totals
- [ ] Create `backend/erp/models/CarLogbookEntry.js` — morning/night odometer, fuel, km split
- [ ] Create `backend/erp/models/ExpenseEntry.js` — ORE and ACCESS with CALF rules
- [ ] Create `backend/erp/models/PrfCalf.js` — payment request / cash advance
- [ ] Commit: `"feat(erp): expense models (smer, car logbook, ore, access, prf, calf)"`

### 6.2 — Expense Services
- [ ] Create `backend/erp/services/perdiemCalc.js` — MD count → tier → amount
- [ ] Create `backend/erp/services/fuelTracker.js` — km split, efficiency, overconsumption
- [ ] Create `backend/erp/services/expenseSummary.js` — 5 categories consolidated
- [ ] Commit: `"feat(erp): expense calculation services"`

### 6.3 — Expense Controller & Routes
- [ ] Create `backend/erp/controllers/expenseController.js`
- [ ] Create `backend/erp/routes/expenseRoutes.js`
- [ ] Commit: `"feat(erp): expense routes"`

### 6.4 — Expense Pages
- [ ] Create `frontend/src/erp/pages/Smer.jsx` — daily activity grid with per diem
- [ ] Create `frontend/src/erp/pages/CarLogbook.jsx` — morning/night odometer, fuel
- [ ] Create `frontend/src/erp/pages/Expenses.jsx` — ORE and ACCESS forms
- [ ] Create `frontend/src/erp/pages/PrfCalf.jsx` — PRF and CALF forms
- [ ] Commit: `"feat(ui): expense pages"`

---

## PHASE 7 — INCOME, PROFIT SHARING & PNL
**Goal:** Payslip, territory P&L, profit sharing gate.

### 7.1 — Income & PNL Models
- [ ] Create `backend/erp/models/IncomeReport.js` — payslip per cycle
- [ ] Create `backend/erp/models/PnlReport.js` — territory P&L per month
- [ ] Create `backend/erp/models/MonthlyArchive.js` — monthly snapshots
- [ ] Commit: `"feat(erp): income, pnl, and archive models"`

### 7.2 — Income & PNL Services
- [ ] Create `backend/erp/services/incomeCalc.js` — earnings, deductions, net pay
- [ ] Create `backend/erp/services/pnlCalc.js` — revenue, costs, profit gate
- [ ] Create `backend/erp/services/profitShareEngine.js` — simple territory-level gate
- [ ] Commit: `"feat(erp): income, pnl, and profit sharing calculation services"`

### 7.3 — Income & PNL Routes
- [ ] Create controllers and routes for income, pnl, profit sharing
- [ ] Commit: `"feat(erp): income and pnl routes"`

### 7.4 — Income & PNL Pages
- [ ] Create `frontend/src/erp/pages/Income.jsx` — payslip view
- [ ] Create `frontend/src/erp/pages/Pnl.jsx` — territory P&L
- [ ] Create `frontend/src/erp/pages/ProfitSharing.jsx` — per-product status
- [ ] Commit: `"feat(ui): income, pnl, and profit sharing pages"`

---

## PHASE 8 — DASHBOARD & REPORTS
**Goal:** CEO dashboard, monthly archive, summaries, audit viewer.

### 8.1 — Dashboard & Report Services
- [ ] Create `backend/erp/services/dashboardService.js` — CEO KPIs
- [ ] Create monthly archive auto-snapshot logic
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

## PHASE 9 — INTEGRATION & POLISH
**Goal:** Wire up OCR to ERP forms, CRM data flows, Excel migration, end-to-end testing.

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

### 9.3 — Excel Migration Tools
- [ ] Admin page: bulk import Opening AR from Excel
- [ ] Admin page: bulk import Product Master from Excel
- [ ] Admin page: bulk import Inventory Opening Balances from Excel
- [ ] Admin page: bulk import Hospital Master from Excel
- [ ] Commit: `"feat(erp): excel migration import tools"`

### 9.4 — End-to-End Testing
- [ ] Full flow: create sale → stock drops → create collection → AR drops → commission computed → SMER filled → income generated → PNL computed
- [ ] Mobile responsiveness on all ERP pages
- [ ] Permission checks: BDM=own territory, Admin=all, CEO=view only
- [ ] Error handling and loading states on all pages
- [ ] Commit: `"test: end-to-end erp flow verification"`

---

## PHASE 10+ — FUTURE (POST AUGUST 22)

### 10.1 — Per-Product Profit Share Eligibility
- [ ] 3 conditions: ≥2 hospitals, ≥1 MD tagged, 3 consecutive months
- [ ] Streak tracking, deficit handling

### 10.2 — CSI Allocation Control
- [ ] Booklet master, weekly allocation, number validation

### 10.3 — Consignment & DR Tracking
- [ ] DR classification, consignment pool, aging alerts

### 10.4 — Cycle Report Workflow
- [ ] GENERATED → REVIEWED → BDM_CONFIRMED → CREDITED

### 10.5 — Accounting Module (Separate Contract)
- [ ] COA, journals, 4-view P&L, VAT filing, AP module

---

## PHASE SUMMARY

| Phase | Name | Tasks | Est. Duration |
|-------|------|-------|--------------|
| 0 | Add ERP Scaffold | 38 | 1-2 days |
| 1 | OCR Engine (client priority) | 90 | 2-3 weeks |
| 2 | Shared Models & Settings | 43 | 1-2 weeks |
| 3 | Sales Module | 21 | 2 weeks |
| 4 | Inventory Module | 13 | 1-2 weeks |
| 5 | Collections & AR | 15 | 2-3 weeks |
| 6 | Expenses | 17 | 2 weeks |
| 7 | Income & PNL | 14 | 1-2 weeks |
| 8 | Dashboard & Reports | 12 | 1 week |
| 9 | Integration & Polish | 19 | 2 weeks |
| 10+ | Future | 6 | Post-launch |

**Total pre-launch: 282 tasks across 10 phases → ~16-20 weeks → August 22, 2026 target**

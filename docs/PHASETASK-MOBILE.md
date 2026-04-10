# PHASETASK-MOBILE.md
## VIP Mobile App Build Plan
## For Flutter + Backend Delivery

**Last Updated:** April 10, 2026
**Planning Home:** `vip-pharmacy-crm/docs`
**Implementation Target:** Separate Flutter mobile repo
**Primary Reference:** `docs/mobile_flutter_prd.md`
**Scope:** Long-range mobile roadmap with MVP-first sequencing. Phases 0-7 are the real MVP critical path.

**Rule:** Complete ALL checkboxes in a phase before moving to the next phase. Only check a box after implementation, tests, and manual verification are fully complete.

**Key Principle:** The backend remains the source of truth. Mobile owns presentation, local cache, local media storage, outbox state, and sync orchestration only. Business rules stay on the server.

**Terminology Note:** Business docs say VIP Client. Existing backend code may use Doctor, Client, Visit, or ERP entity-specific names. Mobile UI should use user-facing business terms while mapping safely to current API contracts.

**Default Mobile Stack:** Flutter, Riverpod, Dio, GoRouter, Drift, flutter_secure_storage, connectivity_plus, image_picker.

**V1 Scope Boundary:** Offline support is CRM-only. ERP remains online-only in V1. Heavy accounting, purchasing, banking, payroll, people admin, and control center workflows remain web-first unless explicitly re-approved later.

**Current ERP Module Baseline:** `sales`, `inventory`, `collections`, `expenses`, `reports`, `people`, `payroll`, `accounting`, `purchasing`, `banking`

---

## Cross-Cutting Contracts

### Auth Contract
- [ ] Use token-based mobile bootstrap instead of cookie-only web semantics
- [ ] Define mobile login response shape with `accessToken`, `refreshToken`, `user`, and access snapshot
- [ ] Define refresh contract for Dio interceptors and queued request replay
- [ ] Define logout contract that revokes refresh token server-side and clears mobile secure storage

### Create Idempotency Contract
- [ ] Require client-generated request UUID for `create_vip_visit`
- [ ] Require client-generated request UUID for `create_regular_client`
- [ ] Require client-generated request UUID for `create_regular_client_visit`
- [ ] Define duplicate-safe server response behavior for retried create requests

### Error Contract
- [ ] Standardize stable error codes for `SESSION_EXPIRED`
- [ ] Standardize stable error codes for `ACCESS_REVOKED`
- [ ] Standardize stable error codes for `DUPLICATE_SUBMISSION`
- [ ] Standardize stable error codes for `SCHEDULE_CONFLICT`
- [ ] Standardize stable error codes for `VISIT_QUOTA_CONFLICT`
- [ ] Standardize stable error codes for `UPLOAD_RETRYABLE_FAILURE`
- [ ] Standardize stable error codes for generic retryable transport failures

### Local Mobile Types
- [ ] Define `SyncQueueItem`
- [ ] Define `LocalVipVisitDraft`
- [ ] Define `LocalRegularClientDraft`
- [ ] Define `LocalRegularClientVisitDraft`
- [ ] Define `SyncFailureReason`
- [ ] Define `AccessSnapshot`

---

## Phase 0 - Flutter Repo Scaffold (MVP)
**Goal:** Stand up a clean Flutter codebase with agreed architecture, tooling, environments, and CI so feature work starts from a stable baseline.

**Exit Criteria**
- [ ] Flutter repo initializes cleanly and runs on Android emulator and one physical Android device
- [ ] Environment strategy is documented for local, staging, and production
- [ ] Basic CI passes for formatting, static analysis, and unit tests
- [ ] App shell boots to a placeholder authenticated/unauthenticated split without crashes

### Backend Tasks
- [ ] Confirm backend base URL strategy for local, staging, and production mobile builds
- [ ] Confirm CORS / origin policy does not block mobile token-based requests
- [ ] Confirm staging environment exists or define temporary mobile QA environment

### Flutter Tasks
- [ ] Create Flutter app structure with `lib/app`, `lib/core`, `lib/features`, `lib/shared`
- [ ] Add Riverpod, Dio, GoRouter, Drift, flutter_secure_storage, connectivity_plus, image_picker
- [ ] Add codegen/build_runner strategy for Drift and typed models
- [ ] Set up environment configuration for local, staging, and production
- [ ] Set up theme tokens, typography, spacing, and status colors for online/offline/sync states
- [ ] Add app-level logging, crash capture hook, and top-level error UI
- [ ] Add CI workflow for `flutter format --set-exit-if-changed`, `flutter analyze`, and test suite
- [ ] Add initial architecture docs and folder conventions

### QA / Verification
- [ ] Fresh clone setup verified by another machine or clean environment
- [ ] CI fails on formatting/analyzer violations and passes on clean branch
- [ ] Android debug build launches without runtime setup errors

### Docs / Release Notes
- [ ] Add repo README section for setup, flavors, and required secrets
- [ ] Add architecture note for state management, navigation, and persistence choices

---

## Phase 1 - Backend Mobile Compatibility (MVP)
**Goal:** Close the backend gaps that would otherwise block reliable Flutter auth, sync, and duplicate-safe offline submission.

**Exit Criteria**
- [ ] Mobile login/refresh/logout flow works without relying on browser cookie behavior
- [ ] Protected APIs accept Bearer tokens consistently
- [ ] Create endpoints accept client request UUIDs and behave idempotently
- [ ] Sync-safe error payloads are stable enough for mobile retry logic

### Backend Tasks
- [ ] Add mobile-friendly auth bootstrap endpoint or login mode returning tokens in JSON
- [ ] Confirm `/api/auth/me` returns everything needed for app bootstrap and role/access gating
- [ ] Confirm refresh endpoint supports mobile token refresh without cookie-only dependency
- [ ] Confirm logout invalidates refresh token for mobile sessions
- [ ] Add request UUID handling for VIP visit create
- [ ] Add request UUID handling for regular client create
- [ ] Add request UUID handling for regular client visit create
- [ ] Return canonical server IDs and timestamps for successful create responses
- [ ] Standardize error code + message payloads for auth, access, schedule, quota, duplicate, and upload failures
- [ ] Verify multipart upload contract for visit photos remains stable for mobile FormData
- [ ] Verify signed-photo refresh endpoints for synced visit media

### Flutter Tasks
- [ ] Capture finalized API contract in mobile repo docs with example requests/responses
- [ ] Create DTOs and failure mappings aligned to final backend contract
- [ ] Add contract tests or mocked integration tests for login, refresh, and idempotent create flows

### QA / Verification
- [ ] Manual login via Postman/HTTP client using token-based flow
- [ ] Retry same create request UUID returns duplicate-safe deterministic result
- [ ] Expired token path returns `SESSION_EXPIRED` consistently
- [ ] Access removal path returns `ACCESS_REVOKED` consistently

### Docs / Release Notes
- [ ] Document auth contract, refresh strategy, and idempotency contract in the mobile repo
- [ ] Record all error codes and retry expectations in a single reference page

---

## Phase 2 - Core App Foundation (MVP)
**Goal:** Build the authenticated shell, secure session handling, navigation, and common network behavior the rest of the app depends on.

**Exit Criteria**
- [ ] User can log in, restore session, refresh expired token, and log out
- [ ] Navigation reflects role plus ERP module access snapshot
- [ ] App clearly shows online/offline state and handles basic request failures gracefully
- [ ] Shared data layer is ready for CRM and ERP features

### Backend Tasks
- [ ] Confirm bootstrap payload includes role, entity access, and ERP access snapshot
- [ ] Confirm admin/president/CEO overrides are represented clearly for mobile gating

### Flutter Tasks
- [ ] Build auth repository using secure storage for tokens and sensitive session metadata
- [ ] Build app bootstrap flow with splash/loading gate
- [ ] Build session restore on cold launch
- [ ] Build refresh-token interceptor with serialized refresh and safe request replay
- [ ] Build logout flow that clears secure storage, cache, and queued sensitive drafts per policy
- [ ] Build GoRouter navigation shell with authenticated and unauthenticated branches
- [ ] Build role-aware and `erp_access`-aware navigation visibility
- [ ] Build shared API client, DTO mapping, and domain error mapping layer
- [ ] Build offline banner, stale-data badge, and last-synced timestamp component primitives
- [ ] Build app-level settings/state providers for auth, connectivity, sync health, and access snapshot

### QA / Verification
- [ ] Login success with valid account
- [ ] Deactivated account shows correct error state
- [ ] Expired access token refreshes automatically during active session
- [ ] Failed refresh sends user back to login safely
- [ ] Contractor/BDM, admin, finance, president, and CEO each see correct navigation set

### Docs / Release Notes
- [ ] Document auth state machine and navigation gating rules
- [ ] Document secure storage policy and logout cleanup behavior

---

## Phase 3 - Local Persistence and Sync Engine (MVP)
**Goal:** Create the local database and sync engine that make offline CRM work trustworthy instead of best-effort.

**Exit Criteria**
- [ ] Drift schema exists for caches, drafts, outbox items, and local media metadata
- [ ] Outbox processor handles reconnect, foreground, manual retry, and ordered dependencies
- [ ] Sync state is observable and durable across app restarts
- [ ] Drafts survive process death without corruption

### Backend Tasks
- [ ] Confirm sync-relevant timestamps and identifiers required for reconciliation
- [ ] Confirm response payloads include enough data to mark draft as synced and refresh related caches

### Flutter Tasks
- [ ] Create Drift database schema for user snapshot and `AccessSnapshot`
- [ ] Create Drift tables for assigned VIP clients cache
- [ ] Create Drift tables for schedule snapshot cache
- [ ] Create Drift tables for product reference cache
- [ ] Create Drift tables for recent synced visit metadata cache
- [ ] Create Drift tables for `LocalVipVisitDraft`
- [ ] Create Drift tables for `LocalRegularClientDraft`
- [ ] Create Drift tables for `LocalRegularClientVisitDraft`
- [ ] Create Drift tables for `SyncQueueItem` and sync attempts/history
- [ ] Create local media reference table for unsynced photos
- [ ] Build sync coordinator triggered by connectivity regain, app foreground, and manual retry
- [ ] Build dependency ordering so regular client create runs before dependent visit create
- [ ] Build retry policy separating retryable transport failures from hard business-rule failures
- [ ] Build queue persistence so in-progress sync can resume after restart
- [ ] Build local file lifecycle helpers for draft photo retention and deletion

### QA / Verification
- [ ] Draft data persists after app restart
- [ ] Pending outbox resumes after app restart
- [ ] Ordered sync is preserved for dependent records
- [ ] Retryable network failures retry with capped backoff
- [ ] Hard business-rule failures stop auto-looping and move to failed state

### Docs / Release Notes
- [ ] Document local schema and sync queue state model
- [ ] Document retry rules and failure classification table

---

## Phase 4 - CRM Read Foundation (MVP)
**Goal:** Deliver the baseline online and cached CRM reference experience users need before they can trust field capture flows.

**Exit Criteria**
- [ ] Assigned VIP client list/detail works online and cached data is viewable offline
- [ ] Schedule snapshot is cached and visibly stale when offline
- [ ] Recent visit history and product context are available for field prep
- [ ] Pull-to-refresh updates caches and last-synced timestamps correctly

### Backend Tasks
- [ ] Confirm minimal fields required for mobile VIP client list/detail payloads
- [ ] Confirm schedule endpoint shape needed for active cycle snapshot
- [ ] Confirm product context payload shape and target-product references needed for mobile

### Flutter Tasks
- [ ] Build assigned VIP client list screen with online + cached states
- [ ] Build VIP client detail screen with offline-safe subset
- [ ] Build schedule snapshot screen for current cycle
- [ ] Build recent visit history list with cached metadata
- [ ] Build product context/reference screens for field prep
- [ ] Build repository cache refresh policies and stale-state labels
- [ ] Build last-synced UI across CRM read screens

### QA / Verification
- [ ] First online sync populates local cache correctly
- [ ] Offline launch shows cached VIP clients and schedule snapshot
- [ ] Pull-to-refresh updates timestamps and resolves stale banner
- [ ] Missing network does not crash read screens

### Docs / Release Notes
- [ ] Document which CRM fields are cached locally and which remain online-only

---

## Phase 5 - Offline VIP Visit Capture (MVP)
**Goal:** Make VIP visit logging fully usable in the field without requiring immediate network access.

**Exit Criteria**
- [ ] User can create, edit, and delete unsynced VIP visit drafts offline
- [ ] Draft supports notes, engagement types, optional GPS, next-visit context, and 1-5 photos
- [ ] Successful sync reconciles local draft to canonical server record
- [ ] Failed sync preserves editable draft with actionable reason

### Backend Tasks
- [ ] Confirm VIP visit create validation contract and required payload fields for mobile
- [ ] Confirm photo count/file-size limits returned clearly for mobile enforcement
- [ ] Confirm successful create response includes canonical visit identifiers for reconciliation

### Flutter Tasks
- [ ] Build offline-safe VIP visit form bound to cached VIP client record
- [ ] Build local draft save/update/delete flows
- [ ] Build photo attach flow with 1-5 image limit enforcement
- [ ] Build optional GPS capture that does not block local save when unavailable
- [ ] Build local validation for required fields before draft is queued
- [ ] Build sync mapping from local draft to multipart create request with request UUID
- [ ] Build post-sync reconciliation that links local draft to server visit and refreshes related caches
- [ ] Build failed-state editing and manual resubmit flow

### QA / Verification
- [ ] Create draft fully offline
- [ ] Edit and delete draft while offline
- [ ] Reconnect and sync draft successfully
- [ ] Retry duplicate-safe submission after simulated timeout
- [ ] Server-side schedule or quota rejection preserves failed draft with clear message

### Docs / Release Notes
- [ ] Document VIP visit draft schema and sync lifecycle
- [ ] Document GPS behavior as best-effort unless backend policy changes later

---

## Phase 6 - Offline Regular Client and Extra-Call Flow (MVP)
**Goal:** Support field-created regular clients and their dependent extra-call visits with durable ordering and clear recovery behavior.

**Exit Criteria**
- [ ] User can create regular client drafts offline
- [ ] User can create dependent regular client visit drafts offline
- [ ] Sync preserves parent-before-child ordering
- [ ] Parent rejection leaves child draft recoverable and understandable

### Backend Tasks
- [ ] Confirm minimal regular client create payload for mobile
- [ ] Confirm regular client visit create payload and dependency on created client ID
- [ ] Confirm current extra-call limits and any UI-only enforcement assumptions

### Flutter Tasks
- [ ] Build regular client draft form and local persistence
- [ ] Build regular client visit draft flow linked to cached or newly drafted regular client
- [ ] Build queue dependency linking between client create and child visit create
- [ ] Build failed dependency handling so child does not sync if parent failed
- [ ] Build edit-and-retry flow for parent and child drafts after rejection

### QA / Verification
- [ ] Offline create of regular client then extra-call visit
- [ ] Ordered sync sends client before visit
- [ ] Parent rejection blocks child sync and shows recovery message
- [ ] Manual correction + retry succeeds after previous failure

### Docs / Release Notes
- [ ] Document dependency ordering rules for parent/child offline creates

---

## Phase 7 - Outbox and Sync Trust UX (MVP)
**Goal:** Expose the sync system clearly so users trust that offline work is safe, visible, and recoverable.

**Exit Criteria**
- [ ] User can see queue count, item states, last attempt, and failure reasons
- [ ] User can retry failed items and cancel editable local drafts
- [ ] Upload-heavy items show meaningful progress where feasible
- [ ] No silent loss or invisible background behavior remains

### Backend Tasks
- [ ] Confirm enough failure detail is returned for user-facing conflict and retry messaging
- [ ] Confirm safe behavior when duplicate request is replayed after uncertain network failure

### Flutter Tasks
- [ ] Build outbox screen with `draft`, `pending`, `synced`, and `failed` states
- [ ] Build per-item detail view with payload summary and timestamps
- [ ] Build retry, cancel, edit, and inspect actions per allowed state
- [ ] Build upload progress UI for photo-heavy sync items where transport layer supports progress
- [ ] Build sync history/audit view for recent completed items
- [ ] Build conflict messaging patterns for duplicate, quota, schedule, and access failures
- [ ] Build stale cache refresh triggers when sync failure indicates server-side drift

### QA / Verification
- [ ] Pending queue is visible after reconnect
- [ ] Failed queue item retains local content and exact retry guidance
- [ ] Duplicate-safe retry does not create extra server records
- [ ] User can distinguish transport failure from business-rule failure

### Docs / Release Notes
- [ ] Document user-facing queue states and allowed actions per state

---

## Phase 8 - Online CRM Expansion
**Goal:** Expand the mobile CRM experience beyond MVP capture so daily work can stay in the app for more scenarios.

**Exit Criteria**
- [ ] Message inbox works online
- [ ] Richer visit history and visit detail work within mobile-friendly constraints
- [ ] Synced visit edits follow existing server limitations
- [ ] Client profile lookup/edit support matches real role permissions

### Backend Tasks
- [ ] Confirm mobile-safe inbox endpoints and required unread/read actions
- [ ] Confirm synced visit update rules and editable field limits
- [ ] Confirm assigned BDM client edit permissions and payload rules

### Flutter Tasks
- [ ] Build message inbox list/detail and refresh behavior
- [ ] Build richer visit detail screen with signed-photo refresh handling
- [ ] Build limited synced-visit edit flow only for fields current API allows
- [ ] Build online VIP client profile edit flow for allowed roles

### QA / Verification
- [ ] Inbox loads and refreshes online without affecting offline queue
- [ ] Signed photo refresh works when URLs expire
- [ ] Forbidden edit attempt is blocked both in UI and via API handling

### Docs / Release Notes
- [ ] Document CRM features that remain online-only even after expansion

---

## Phase 9 - ERP Mobile Read Phase
**Goal:** Add high-value mobile ERP visibility for field users, reviewers, and executives without overloading the first mobile release.

**Exit Criteria**
- [ ] ERP dashboard and selected read views work online
- [ ] Navigation honors `erp_access.enabled` plus module-level `NONE/VIEW/FULL`
- [ ] President and CEO views behave according to current server-side access rules
- [ ] Non-authorized modules remain hidden or blocked

### Backend Tasks
- [ ] Confirm bootstrap or access endpoint returns current ERP access snapshot reliably
- [ ] Confirm mobile-safe payloads for dashboard, My Stock, hospital/customer lookup, AR, and income snapshots
- [ ] Confirm approval/status review endpoints suitable for lightweight mobile usage

### Flutter Tasks
- [ ] Build ERP dashboard summary screen
- [ ] Build My Stock / inventory visibility screens
- [ ] Build hospital/customer lookup screens
- [ ] Build AR and income snapshot views
- [ ] Build lightweight approval/status review surfaces for authorized users
- [ ] Build executive summary screens for president and CEO mobile use
- [ ] Build access guard wrappers for module-level and role-level ERP gating

### QA / Verification
- [ ] User with module `NONE` cannot see or enter hidden module
- [ ] User with module `VIEW` can access read views only
- [ ] President gets broad access expected by current live rules
- [ ] CEO gets view-only experience with no write actions shown

### Docs / Release Notes
- [ ] Document ERP modules included in mobile read phase and those still excluded

---

## Phase 10 - ERP Mobile Write Phase
**Goal:** Add only the online ERP write flows that are genuinely mobile-suitable and already supported by current server behavior.

**Exit Criteria**
- [ ] Selected expense, collections, and sales entry flows work online for authorized users
- [ ] No heavy back-office module accidentally ships on mobile
- [ ] Write actions respect `FULL` access and any approval gates

### Backend Tasks
- [ ] Confirm mobile-approved ERP write endpoints and request payloads
- [ ] Confirm current approval lifecycle and write constraints for collections, expenses, and sales
- [ ] Confirm unsupported back-office modules remain explicitly out of scope

### Flutter Tasks
- [ ] Build selected expenses flows that are field-friendly on mobile
- [ ] Build selected collections flow screens for online-only use
- [ ] Build selected sales entry/list screens where module access allows
- [ ] Build write permission guards requiring `FULL` module access
- [ ] Keep accounting, purchasing, banking, payroll, people admin, and control center absent from mobile write scope

### QA / Verification
- [ ] User with `VIEW` cannot submit write actions
- [ ] User with `FULL` can complete approved mobile write flows
- [ ] Unsupported heavy modules do not appear in mobile navigation

### Docs / Release Notes
- [ ] Document ERP write flows included vs explicitly deferred

---

## Phase 11 - Hardening
**Goal:** Harden security, stability, performance, and storage behavior before wider rollout.

**Exit Criteria**
- [ ] Sensitive session and cached data handling passes review
- [ ] Device lock/reopen behavior is safe and user-friendly
- [ ] Performance and crash baselines are acceptable on target devices
- [ ] Draft media cleanup and logout cleanup are reliable

### Backend Tasks
- [ ] Review token expiry and revocation policy for mobile session risk
- [ ] Review upload limits, request size limits, and observability around sync failures
- [ ] Confirm monitoring hooks for auth failure spikes and sync-related backend errors

### Flutter Tasks
- [ ] Add biometric or device-auth relock for reopening app if approved by product/security
- [ ] Finalize logout cleanup and sensitive cache clearing rules
- [ ] Add storage cleanup for obsolete media and synced draft remnants
- [ ] Add crash reporting and structured mobile logs
- [ ] Add analytics events for sync success/failure, login, and major screen usage if approved
- [ ] Add performance profiling and startup time budget checks
- [ ] Audit app for screenshot/privacy handling where feasible

### QA / Verification
- [ ] Lost-session and logout cleanup tested on real device
- [ ] Draft media deleted after successful sync or explicit draft deletion
- [ ] Crash reporting and error logging verified in test environment
- [ ] Low-storage and app-kill scenarios do not corrupt queue state

### Docs / Release Notes
- [ ] Add security checklist for mobile-specific risks
- [ ] Add operational notes for crash logs, analytics, and storage cleanup

---

## Phase 12 - Release Readiness
**Goal:** Prepare the mobile app for internal alpha, pilot rollout, and production support without treating release as an afterthought.

**Exit Criteria**
- [ ] Internal alpha build is distributed with a defined test script
- [ ] Pilot rollout checklist exists
- [ ] Production API smoke checklist exists for mobile release day
- [ ] Support, rollback, and monitoring docs are ready

### Backend Tasks
- [ ] Define release-day smoke checks for auth, cache bootstrap, sync, photo upload, and signed URL refresh
- [ ] Confirm staging vs production monitoring dashboards for mobile-critical endpoints
- [ ] Define rollback guidance for mobile-breaking backend contract changes

### Flutter Tasks
- [ ] Create internal alpha distribution process
- [ ] Create pilot rollout checklist and tester instructions
- [ ] Prepare app icons, splash assets, store metadata, screenshots, and privacy disclosures
- [ ] Create release checklist for Android first, then iOS after core flow stability
- [ ] Create support playbook for auth, sync, media upload, and offline failure reports

### QA / Verification
- [ ] Low-connectivity field test on Android physical device
- [ ] Sync-heavy scenario test with offline/online transitions
- [ ] Android release build smoke test
- [ ] iOS smoke test after Android core flows are stable

### Docs / Release Notes
- [ ] Add release checklist doc
- [ ] Add support/runbook for top mobile failure classes
- [ ] Add production smoke checklist for app release day

---

## Phase 13 - Post-Launch Roadmap
**Goal:** Capture the work that comes after a successful MVP/V1 launch without polluting near-term delivery phases.

**Exit Criteria**
- [ ] Backlog is organized by business value and dependency
- [ ] Deferred V1 and parity items are visible and prioritized
- [ ] Product has a clear view of what is intentionally not in the initial launch

### Backend Tasks
- [ ] Evaluate stricter GPS enforcement if product later requires it
- [ ] Evaluate stronger backend enforcement of regular-client daily extra-call limits
- [ ] Evaluate richer media and cache contracts for tablet/product presentation use cases

### Flutter Tasks
- [ ] Plan broader approval tooling beyond lightweight review
- [ ] Plan wider ERP write parity by role
- [ ] Plan tablet refinements and product presentation improvements
- [ ] Plan richer offline read cache if business value justifies it
- [ ] Plan parity backlog for additional CRM and ERP workflows

### QA / Verification
- [ ] Review pilot and launch feedback for repeated mobile pain points
- [ ] Re-rank roadmap by support volume, field-user friction, and business impact

### Docs / Release Notes
- [ ] Keep a living backlog section tied to PRD changes and real production feedback

---

## Global Test Checklist

### Auth
- [ ] Login with valid credentials
- [ ] Refresh expired access token during active session
- [ ] Logout clears secure storage and returns to login
- [ ] Deactivated account is blocked with correct message
- [ ] Offline app reopen with cached session behaves safely

### Permissions
- [ ] Contractor/BDM navigation is correct
- [ ] Admin navigation is correct
- [ ] Finance navigation is correct
- [ ] President navigation is correct
- [ ] CEO navigation is correct
- [ ] ERP modules are gated correctly for `NONE`, `VIEW`, and `FULL`

### Offline CRM
- [ ] Create offline VIP visit draft
- [ ] Edit offline VIP visit draft
- [ ] Delete offline VIP visit draft
- [ ] Reconnect and sync VIP visit draft
- [ ] Retry after timeout without duplicate record creation
- [ ] Handle stale schedule rejection with failed draft preserved

### Media
- [ ] Attach 1-5 photos to CRM draft
- [ ] Handle interrupted upload and retry safely
- [ ] Refresh signed photo URLs after sync

### Sync Ordering
- [ ] Regular client sync completes before dependent extra-call visit sync
- [ ] Failed parent create blocks child sync cleanly

### ERP
- [ ] Read screens work for `VIEW`
- [ ] Write actions are blocked without `FULL`
- [ ] Excluded heavy modules stay out of mobile scope

### Release
- [ ] Low-connectivity field test on Android
- [ ] Android physical-device smoke pass
- [ ] iOS smoke validation after Android stability

---

## Notes
- This document assumes a greenfield Flutter implementation even if backend work happens in parallel in another repo.
- Phases 0-7 should be treated as the MVP critical path and should not be diluted by late-stage parity requests.
- Mobile should not duplicate server-side business logic for visit rules, schedule eligibility, quota enforcement, or ERP workflow transitions.
- Any backend contract changes that affect auth, error codes, or create payloads must be reflected here before mobile implementation continues.

# Product Requirements Document (PRD)
## VIP Mobile App for Flutter

*System-first alignment note: this PRD is derived from the live production system first, then cross-checked against `docs/PRD-CRM.md` and `docs/PRD-ERP.md`. Where older PRD language conflicts with current implementation, this document follows the live system and records the mismatch under `Assumptions` or `Open Questions`.*

---

## 1. Executive Summary

The VIP Mobile App is a Flutter-based mobile client for the existing VIP CRM + ERP platform. It extends the current production web system to native mobile form while preserving the current backend APIs, database-first data ownership, server-side validation, and role-based access model already implemented in production.

The mobile app is not a replacement for the web application. The web app remains the primary full-featured system for bulk administration, dense back-office workflows, and desktop-first operations. The mobile app is intended to deliver fast, reliable field execution and mobile-friendly access to the parts of the system that users need away from a desk.

The main value of the mobile app is:

- Faster field execution for BDMs and other mobile users.
- Better reliability in low-connectivity environments through limited CRM offline support.
- Cleaner mobile access to key CRM and ERP workflows that already exist in the live system.
- Role-aware access for BDM, Admin, Finance, President, and CEO users without creating a separate business rules stack.

---

## 2. Product Scope (V1)

V1 is defined as the first practical mobile product boundary, not full desktop parity. The long-term product direction is broad role-based parity with the current web application, but V1 prioritizes mobile-suitable workflows and limited CRM offline support. The MVP in Section 13 is the minimum launch subset inside this V1 boundary.

| Feature | Offline | Online Only | Source (CRM/ERP PRD) | Notes |
|---|---|---|---|---|
| Authentication and session bootstrap | No | Yes | CRM + system verification | Reuses existing auth backend; web is cookie-first today, mobile must remain compatible with current production auth behavior. |
| Role-aware app shell and permissions | Partial | Yes | CRM + ERP + system verification | Mobile navigation must reflect live roles and ERP module access, including `erp_access.enabled` and module-level `NONE/VIEW/FULL`. |
| CRM dashboard and daily field overview | Partial | Yes | CRM + system verification | Show cached last-synced data offline; live counts and compliance require API access. |
| VIP Client list and detail view | Partial | No | CRM + system verification | Cache assigned VIP clients, basic profile fields, and recent schedule context for offline lookup. |
| VIP Client profile editing by assigned BDM | No | Yes | CRM + system verification | Current live API supports editing own assigned VIP clients; keep this online-only in V1. |
| Schedule and CPT-style cycle view | Partial | No | CRM + system verification | Last synced schedule is viewable offline; schedule generation, imports, and admin editing remain online and web-first. |
| VIP visit logging | Yes | No | CRM + system verification | Core offline CRM feature. Queue visit drafts with photos, engagement types, notes, and optional GPS for later sync. |
| VIP visit history and visit detail | Partial | No | CRM + system verification | Cache recent history; full detail and signed photo refresh require network. |
| Regular client creation | Yes | No | CRM + system verification | Offline draft creation allowed so extra-call activity can still be captured in the field. |
| Regular client visits (extra calls) | Yes | No | CRM + system verification | Offline draft creation and queued sync supported; capped in UI today, not fully server-enforced in live code. |
| CRM messages / inbox | No | Yes | CRM + system verification | Inbox is live API-backed; optional cached last-read messages may be shown, but message actions remain online. |
| Product catalog and target-product context | Partial | No | CRM + system verification | Cache metadata for field reference and tablet presentation; server remains source of truth for updates. |
| ERP dashboard summary | No | Yes | ERP + system verification | Mobile-friendly KPI access for users with ERP module access. |
| ERP My Stock / inventory visibility | No | Yes | ERP + system verification | Includes `my-stock`, alerts, and product-level lookup; online-only. |
| ERP hospitals / customers / AR / income views | No | Yes | ERP + system verification | Read-heavy ERP access is included where routes and pages already exist and are mobile-suitable. |
| ERP collections workflows | No | Yes | ERP + system verification | Online-only. Uses current draft/validate/submit server lifecycle. |
| ERP expense workflows (SMER, Car Logbook, ORE/ACCESS, PRF/CALF) | No | Yes | ERP + system verification | Included for mobile because these are field-facing flows, but not offline in V1. |
| ERP sales entry and list | No | Yes | ERP + system verification | Included as an online-only mobile flow only where role/module access allows it. |
| Admin CRM monitoring tools (GPS review, photo audit, employee visit monitoring) | No | Yes | CRM + system verification | Mobile support is limited to lightweight review and lookup; desktop remains primary. |
| ERP approvals and management review actions | No | Yes | ERP + system verification | Limited mobile support for urgent approvals and status review where current routes allow it. |
| Excel CPT import/export authoring and batch review | No | No | CRM PRD + system verification | Explicitly excluded from mobile V1. Web-first workflow. |
| Heavy back-office ERP modules: accounting, purchasing, banking, payroll, people admin, control center | No | No | ERP + system verification | Explicitly excluded from mobile V1 even if routes exist in the system. These remain web-first. |
| Offline ERP transactions | No | No | ERP + system verification | Explicitly excluded from V1. Offline support is limited to CRM field operations only. |

---

## 3. User Personas & Core Use Cases

### Primary Users

#### 1. BDM / Contractor
- Primary mobile field user.
- Needs fast access to assigned VIP clients, today's schedule, products, visit history, extra calls, messages, and selected ERP field workflows.
- Most important mobile outcome is reliable visit capture in the field, even without stable connectivity.

#### 2. Admin
- Uses mobile for quick monitoring, lookup, approvals, and urgent intervention.
- Needs visibility into CRM activity, selected ERP dashboards, inbox, and operational review pages.
- Still relies on the web app for bulk editing, Excel import/export, and dense administrative workflows.

#### 3. Finance
- Needs role-gated ERP visibility on mobile for urgent review, report lookup, and approvals.
- Mobile usage should be fast, safe, and read-first; desktop remains primary for heavy accounting work.

#### 4. President
- Needs broad cross-entity visibility and approval capability from mobile.
- Mobile should support high-priority review and action flows, but not attempt to replace full desktop operations.

#### 5. CEO
- Needs simplified, read-only mobile access to dashboards, summaries, and performance visibility.

### Core Use Cases

- A BDM reviews today's assigned visits and opens a VIP client profile before visiting.
- A BDM logs a VIP visit with photos, engagement types, notes, and optional GPS.
- A BDM adds a new regular client and records an extra-call visit in the field.
- A BDM checks product information and target-product status while with a doctor.
- A BDM checks stock, AR, or ERP dashboard context before or after a visit.
- An Admin or Finance user reviews dashboards, messages, and time-sensitive approvals from mobile.
- A President or CEO opens cross-entity summaries and status pages while away from a workstation.

### Detailed Scenario: Log a Visit While Offline and Sync Later

1. A BDM opens the app in an area with no reliable internet.
2. The app shows offline mode and loads the last synced VIP client list and current cycle schedule snapshot.
3. The BDM opens a cached VIP client profile, records a visit, adds 1-5 photos, selects engagement types, enters notes and doctor feedback, and allows GPS capture if available.
4. The visit is saved locally as a draft, then moved to the mobile outbox as a pending sync item.
5. The BDM can still edit or delete the unsynced draft while it remains in `draft` or `failed` state.
6. When connectivity returns, the app automatically attempts sync.
7. The server re-runs live validation for assignment access, weekly/monthly limits, schedule eligibility, and payload validity.
8. If the sync succeeds, the visit becomes `synced`, the local draft is linked to the server record, and the schedule snapshot is refreshed.
9. If the sync fails because the visit is no longer valid or the request collides with an existing record, the item becomes `failed` with a clear reason and a manual retry option.

---

## 4. Functional Requirements

### Online Functionality

- The app must authenticate against the existing production backend and resolve the current user's role, active status, and ERP module access.
- The app must render navigation and screen access based on live role behavior:
  - CRM roles: BDM/contractor, admin, finance, president, CEO.
  - ERP permissions: `erp_access.enabled` plus module-level permissions and role overrides.
- The app must preserve current live role behavior for ERP access:
  - President has full ERP access.
  - CEO is view-only.
  - Admin access depends on current ERP access setup and may be read-limited without an ERP template.
  - Contractor/BDM access depends on assigned CRM ownership and ERP module permissions.
- The app must provide online access to the following CRM capabilities already present in the live system:
  - Dashboard and field overview.
  - Assigned VIP client list and detail.
  - Schedule / cycle / CPT-style views.
  - VIP visit creation and limited post-create visit editing.
  - Regular client creation, list, and visit capture.
  - Visit history and detail.
  - Product and target-product reference views.
  - Message inbox.
- The app must provide online access to mobile-suitable ERP capabilities already present in the live system:
  - ERP dashboard summaries and KPI views.
  - Inventory visibility such as My Stock and alerts.
  - Hospital, customer, AR, income, and related read views.
  - Collections workflows.
  - Expenses workflows including SMER, Car Logbook, ORE/ACCESS, and PRF/CALF.
  - Sales entry/list where current module access allows it.
  - Approval and review flows appropriate to role and current route availability.
- The app must not bypass server-side validation. The backend remains authoritative for:
  - Access control.
  - Schedule matching.
  - Weekly and monthly visit rules.
  - ERP draft/validate/submit transitions.
  - Tenant and entity scoping.
- The app must respect current live edit limits for synced CRM visits. Under the current API, only a limited set of visit fields may be updated after creation.

### Offline Functionality

- Offline capability in V1 is limited to CRM field operations only.
- The app must allow offline creation of VIP visit drafts using locally cached VIP client and schedule data.
- The app must allow offline creation of regular client drafts so that extra-call activity can still be recorded in the field.
- The app must allow offline creation of regular client visit drafts.
- The app must store photos locally until sync completes.
- The app must store visit timestamps and photo metadata locally.
- The app should attempt GPS capture when available, but must not block local draft creation if GPS is unavailable.
- The app must allow editing or deleting unsynced CRM drafts before they are synced.
- The app must clearly label locally saved data as pending server validation.

### Sync-Related Behavior

- The app must maintain a client-side outbox for offline-created CRM records.
- The app must sync queued items automatically when connectivity returns and the session is valid.
- The app must allow manual retry of failed items.
- The app must preserve action order when dependencies exist, such as:
  - Create regular client first.
  - Then create the related regular client visit.
- The app must keep sync state separate from server-side business state. Example:
  - Client state: `draft`, `pending`, `synced`, `failed`.
  - Server visit state: `completed`, `cancelled`.
  - Server ERP state: `DRAFT`, `VALID`, `ERROR`, `POSTED`.
- The app must surface server validation failures clearly instead of hiding them behind generic network errors.

---

## 5. Offline Capability Definition

### What Users Can Do Offline

- View the last synced list of assigned VIP clients.
- View the last synced current-cycle schedule snapshot.
- Open cached VIP client detail needed for visit preparation.
- Create a VIP visit draft.
- Create a regular client draft.
- Create a regular client visit draft.
- Attach 1-5 photos to a CRM draft.
- Enter or edit visit notes, doctor feedback, purpose, engagement types, visit type, and next-visit date before sync.
- Save drafts without waiting for a network round trip.

### What Data Is Stored Locally

- Current user profile and basic role/access snapshot.
- ERP module access snapshot needed to show or hide screens locally.
- Assigned VIP client records needed for field work.
- User-created regular clients.
- Current schedule / CPT snapshot for the active cycle.
- Minimal product reference data needed for field discussion.
- Recent synced visit metadata for history display.
- Local draft records and outbox state.
- Local media files for unsynced CRM records.

### What Actions Are Queued

- `create_vip_visit`
- `create_regular_client`
- `create_regular_client_visit`

### What Is Blocked Offline

- Login, logout confirmation against server, password reset, and any auth flow that requires live server response.
- Live visit eligibility checks beyond the last synced snapshot.
- Message refresh, mark-read state synchronization, and live inbox accuracy.
- ERP transactions of any kind.
- Admin import/export operations.
- Photo URL refresh for previously synced server media.
- Any action that depends on signed URLs, live approval state, or live ERP calculations.

### Visit Logging Behavior Offline

- A VIP visit draft must be created against a cached VIP client record.
- A regular client visit draft must be created against a cached or newly drafted regular client.
- Each offline CRM visit draft must capture:
  - Local creation time.
  - Visit date and time.
  - Engagement types.
  - Notes and optional feedback fields.
  - Photos with local file references.
  - Optional GPS metadata if the device can obtain it.
- The app must not assume offline drafts are valid server records until sync succeeds.
- If the server later rejects the record, the local draft must remain visible with failure context so the user can fix it.

### Editing Before Sync

- `draft` items are fully editable and deletable.
- `failed` items are editable and retryable.
- `pending` items are read-only until the current sync attempt completes or fails.
- Once an item is `synced`, further editing must follow the live server rules for that entity.

---

## 6. Sync Behavior

### Outbox Model

The mobile app uses a pending queue / outbox model for offline CRM work.

Client-side queue states:

- `draft`: saved locally, not yet submitted.
- `pending`: queued or actively syncing.
- `synced`: accepted by server and linked to a live backend record.
- `failed`: sync attempted but rejected or interrupted.

### Sync Flow

`Offline action -> local draft saved -> queued in outbox -> sync attempt -> server validation -> success or failure result`

### Automatic Sync Triggers

- Connectivity returns after offline usage.
- App launches with pending outbox items.
- App returns to foreground.
- User manually refreshes or opens the outbox.

### Retry Logic

- Transient failures such as no connection, timeout, or temporary server error should retry automatically with capped backoff.
- Business-rule failures such as duplicate weekly visit, no longer visitable, or access denied must not auto-loop; they should move to `failed` immediately.
- Users must be able to retry a failed item manually after reviewing the error.

### Failure Handling

- Failed sync items must retain:
  - Local draft data.
  - Error category.
  - Server message when available.
  - Last attempted timestamp.
- Typical failure reasons the app must handle:
  - Session expired.
  - Assignment/access no longer valid.
  - Weekly or monthly visit limit exceeded.
  - Scheduled visit no longer valid.
  - Upload timeout or interrupted upload.
  - Duplicate request uncertainty after a network break.

### Sync Conflict Behavior

- The server remains the final authority for schedule and visit rules.
- The mobile app must not attempt to resolve CRM business conflicts on-device.
- When local data is stale, the app should:
  - Mark the item failed.
  - Refresh related server data.
  - Present the user with the updated state and retry guidance.

### Idempotency Recommendation

To reduce duplicate-record risk during offline sync and uncertain network failures, the mobile app should use a client-generated request UUID for create actions. The backend should support that request UUID as a minimal idempotency key for:

- VIP visit creation.
- Regular client creation.
- Regular client visit creation.

This is a minimal compatibility improvement, not a backend redesign.

---

## 7. API Integration

The mobile app must reuse the existing production backend and must not fork or reimplement business logic in Flutter.

### Existing API Reuse

The mobile client will integrate with the current production route families, including:

- `/api/auth`
- `/api/doctors`
- `/api/visits`
- `/api/clients`
- `/api/schedules`
- `/api/messages`
- `/api/erp/*`

### Compatibility Rules

- The database remains the source of truth.
- Server-side validation remains authoritative.
- Mobile must consume the same role and permission rules as web.
- Existing multipart upload endpoints remain the mechanism for photo submission.
- Existing signed URL refresh endpoints remain the mechanism for accessing protected visit images after sync.

### Necessary Gaps To Address Minimally

The current system is workable for mobile, but a few small improvements are needed or should be validated:

- **Auth bootstrap for native mobile:** current web auth is cookie-first. Flutter must either:
  - use a reliable secure cookie jar/session approach, or
  - use a minimal mobile session mode that returns tokens while still honoring the current backend authorization rules.
- **Idempotent create requests:** add request UUID handling for queued offline submissions.
- **Consistent conflict/error payloads:** return structured error codes for duplicate visit, schedule conflict, quota conflict, and access change failures.
- **Server timestamps:** return server-side created timestamps and canonical IDs consistently so local draft reconciliation is reliable.

### What This PRD Does Not Propose

- No new backend domain model.
- No duplicate business rules engine in mobile.
- No full backend redesign for Flutter.
- No separate mobile-only database authority.

---

## 8. Data Handling

| Entity | Cached Locally | Editable Offline | Online Only | Source PRD |
|---|---|---|---|---|
| User profile and role/access snapshot | Yes | No | No | CRM + ERP + system verification |
| ERP module access profile | Yes | No | No | ERP + system verification |
| VIP Clients / Doctors | Yes | No | No | CRM + system verification |
| VIP visit drafts | Yes | Yes | No | CRM + system verification |
| Synced VIP visits | Partial | No | No | CRM + system verification |
| Regular clients | Yes | Yes for unsynced drafts only | No | CRM + system verification |
| Regular client visit drafts | Yes | Yes | No | CRM + system verification |
| Schedule entries / CPT snapshot | Yes | No | No | CRM + system verification |
| Product reference and target-product context | Partial | No | No | CRM + system verification |
| Messages / inbox metadata | Partial | No | Yes for current state | CRM + system verification |
| Hospitals / Customers | No | No | Yes | ERP + system verification |
| Inventory / My Stock summaries | No | No | Yes | ERP + system verification |
| AR / Income / ERP dashboard summaries | No | No | Yes | ERP + system verification |
| Contacts | Embedded with parent entity | No | No standalone contact API observed | CRM + ERP + system verification |
| Tasks | No standalone task entity observed | No | Not applicable in current system | System verification |

### Data Handling Notes

- Contact information is currently embedded inside doctor, regular client, or hospital/customer records rather than managed as a standalone contact object.
- The mobile app should not invent a standalone task model in V1 because no dedicated CRM task entity was confirmed in the current system.
- Local cached data must be scoped to the current user's role, ownership, entity access, and ERP module permissions.

---

## 9. Security Requirements

- The mobile app must use the existing backend authentication and authorization model.
- The app must respect the live role model and current ERP module access rules.
- Session artifacts must be stored in secure mobile storage only.
- Cached local business data must be minimized to what the user needs in the field.
- Unsynced draft media must be stored in the app sandbox and deleted after successful sync or explicit draft deletion.
- Sensitive ERP and personal fields not required on mobile must not be cached by default.
- Signed media URLs must never be treated as permanent; they expire and must be refreshed from the server.
- On logout, the app must clear:
  - local session state,
  - sensitive caches,
  - pending draft media that should not persist beyond logout policy.
- The app should support device-level protections where available:
  - biometric gate for reopening the app,
  - OS secure storage,
  - screenshot/privacy controls where feasible.

### Offline Data Risks

- Lost or stolen devices increase the risk of cached customer and activity data exposure.
- Unsynced draft media may contain sensitive field evidence.
- Cached schedule and doctor data may become stale and should always be marked with last-sync context.

---

## 10. User Experience Requirements

### Online Mode

- Show live data and live validation results.
- Clearly indicate when data is current.
- Allow users to perform all role-allowed V1 actions without friction.
- Prefer short, mobile-first flows over desktop-style dense forms.

### Offline Mode

- Show a persistent offline banner.
- Clearly distinguish cached data from live server data.
- Keep CRM draft creation available.
- Disable or hide actions that require live APIs.
- Avoid silent failure; users should know that work is being stored locally.

### Sync In Progress

- Show queue count and per-item status.
- Show upload progress for photo-heavy items when possible.
- Prevent duplicate tapping or repeated submission of the same action.
- Keep pending items visible so the user trusts that work is not lost.

### Sync Success

- Replace local-only markers with server-confirmed state.
- Update visit history and schedule counters.
- Remove queue warnings and show a simple success status.

### Sync Failure

- Show an actionable message, not only "something went wrong".
- Keep the draft intact.
- Offer manual retry.
- Offer edit-and-resubmit when the failure is a business-rule or payload problem.

### User Trust Requirements

- Always show last synced time.
- Always show outbox count when unsynced items exist.
- Never silently discard a draft.
- Never imply that a record is final until the server confirms it.

---

## 11. Technical Guidelines (High-Level)

### Suggested Architecture Approach

- Flutter app with feature-based modules for CRM, ERP, auth, sync, and shared UI.
- Thin-client architecture: mobile handles presentation, local cache, and sync orchestration; server keeps business logic authority.
- Repository pattern separating:
  - remote API access,
  - local cache/draft persistence,
  - sync/outbox orchestration.

### State Management Direction

- Use a predictable, testable state management approach such as Riverpod.
- Keep auth, connectivity, sync queue, and role/module access in shared app-level state.
- Keep feature state isolated by domain: CRM visits, clients, schedule, messages, ERP dashboard, ERP modules.

### Local Storage Approach

- Use a structured local database suitable for offline queueing and relational cache behavior, such as SQLite via Drift.
- Use secure device storage for session artifacts and other secrets.
- Store unsynced media in the app sandbox with metadata references in the local database.

### Sync Mechanism Concept

- Use an outbox processor driven by:
  - connectivity changes,
  - app foreground events,
  - explicit user retry.
- Do not rely on unrestricted background execution for guaranteed sync completion; mobile OS limits make that unreliable.
- Treat sync as resumable and observable by the user.

### Network / API Guidance

- Use the production API surface exactly as implemented unless a minimal mobile compatibility change is required.
- Use multipart upload for visit media.
- Use request UUIDs for sync-safe create actions.

---

## 12. Risks & Limitations

| Risk | Impact | Brief Mitigation |
|---|---|---|
| Duplicate records after unstable connectivity | High | Use client request UUIDs and backend idempotency support for create operations. |
| Sync failure because offline data becomes stale | High | Re-validate on server, keep failed drafts, refresh related data, and let users retry after review. |
| Auth friction from cookie-first backend behavior | High | Validate secure cookie-jar support early; add minimal mobile session bootstrap only if necessary. |
| Mobile OS background execution limits | High | Sync on reconnect, foreground, and manual retry; do not promise always-on background sync. |
| GPS behavior mismatch between docs and production | Medium | Follow live behavior in V1, surface as an explicit assumption, and confirm whether stricter enforcement is required later. |
| Extra-call daily cap appears UI-enforced more than server-enforced | Medium | Keep current behavior visible in the PRD and confirm whether backend enforcement should be added. |
| Signed photo URLs expire | Medium | Refresh on demand using existing refresh endpoints. |
| Older CRM/ERP PRDs are partially outdated | Medium | Use system-first alignment and record mismatches openly. |
| Overloading mobile with desktop-grade back-office workflows | High | Keep heavy accounting, banking, purchasing, and admin tooling web-first in V1. |
| Local cached data exposure on lost devices | High | Use secure storage, app sandboxing, cache minimization, and logout cleanup. |

---

## 13. MVP Definition

The MVP below is the minimum launch subset inside the broader V1 scope described in Section 2.

### Must Be Included In The First Release

- Secure login and session handling compatible with the live backend.
- Role-aware navigation and permission gating.
- CRM bootstrap cache for assigned VIP clients, active schedule snapshot, and recent visits.
- Offline VIP visit draft creation with photo support.
- Offline regular client draft creation and extra-call visit draft creation.
- Visible outbox, sync status, auto-sync on reconnect, and manual retry.
- Online CRM access to:
  - VIP client detail,
  - visit history,
  - product context,
  - message inbox.
- Online ERP access to:
  - ERP dashboard,
  - My Stock,
  - hospital/customer lookup,
  - AR/income snapshot views.

### Can Be Deferred

- Mobile support for all current web ERP write flows.
- Excel CPT import/export workflows.
- Heavy admin configuration pages.
- Accounting, purchasing, banking, payroll, people admin, and control-center workflows.
- Full tablet presentation and product-detail refinements beyond baseline usability.
- Advanced offline read cache for ERP modules.
- Full media caching for previously synced visit photos.

### Long-Term Direction Beyond MVP

- Broader mobile parity with the current web application by role and permission.
- Additional mobile ERP entry flows once core CRM offline reliability is proven.
- Wider management and approval tooling for finance, admin, and executive users.

---

## 14. Assumptions & Open Questions

### Assumptions

- The live production system is the primary source of truth for this PRD.
- Existing CRM and ERP PRDs are partially outdated and are treated as supporting context only.
- VIP client access in the live CRM currently behaves as assignment-based ownership using `assignedTo`, even though older CRM documentation emphasizes region-driven access.
- VIP visit photo capture is currently limited to 5 uploads per visit in the live system.
- GPS is currently optional in the live visit controller; the server accepts visits without valid GPS.
- VIP weekend visits are allowed only when the live schedule logic treats the visit as carried or overdue.
- Contacts are embedded within existing entities; no standalone contact module was confirmed.
- No standalone CRM task module was confirmed in the current system.
- Offline support is limited to CRM field records only; no offline ERP is included in V1.

### Open Questions

- Should Flutter mobile use secure cookie-based sessions only, or should the backend expose a minimal token-returning mobile auth mode for session bootstrap?
- Should GPS become a hard-required server-side rule for mobile visit submissions, or should V1 preserve the current best-effort behavior?
- Should the regular-client daily extra-call limit be moved to explicit backend enforcement instead of remaining primarily UI-enforced?
- Which admin and finance write actions are truly approved for mobile V1 beyond dashboards, read views, and urgent approvals?
- Should mobile include CRM admin monitoring tools such as photo audit and GPS review in V1, or keep those web-first despite route availability?
- Should product media be cached locally for offline tablet presentation, or should only metadata be cached in V1?

---

## 15. Final Recommendation

Build the Flutter app as a system-first mobile client, not as a new platform with its own business rules. Reuse the current production backend, keep the server authoritative, and focus the first release on the workflows that matter most on a phone: CRM field execution, reliable offline visit capture, and the most mobile-suitable ERP views and field-facing transactions.

Prioritize reliability before breadth. The first release should prove that the app can safely authenticate, load role-aware data, capture CRM work offline, and sync without losing records or creating duplicates. After that foundation is stable, expand online ERP coverage by role and permission instead of attempting immediate desktop parity everywhere.

Avoid overengineering. Do not build offline ERP, do not duplicate schedule or quota logic on-device, and do not redesign the backend around mobile unless a small compatibility improvement is truly required. The fastest low-risk path is a thin Flutter client with strong local draft handling, a visible outbox, and minimal API adjustments only where native mobile reliability depends on them.

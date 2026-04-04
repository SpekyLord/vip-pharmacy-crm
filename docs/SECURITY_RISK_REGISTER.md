# Security Risk Register

Last updated: 2026-04-04

## Open Risks

### R-001: `xlsx` upstream vulnerabilities (no fix available)
- Severity: High
- Affected package: `xlsx@0.18.5`
- Scope:
- Backend admin-only CPT import and selected backend export paths.
- Frontend workbook export utilities (client-side report generation features).
- Current mitigations:
- Import route is admin-protected (`/api/imports/*`).
- Import accepts `.xlsx` only (strict extension + MIME checks).
- Upload size and workbook constraints enforced:
  - `IMPORT_MAX_FILE_SIZE_MB`
  - `IMPORT_MAX_WORKBOOK_SHEETS`
  - `IMPORT_MAX_WORKSHEET_ROWS`
- Next action:
- Replace `xlsx` usage in import/export flows with a maintained alternative.
- Owner: Engineering
- Target date: 2026-05-15
- Acceptance rationale:
- Production-like launch requires current business workflow; risk is constrained to authenticated admin workflows with explicit input controls.

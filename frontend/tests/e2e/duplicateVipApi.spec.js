/**
 * Phase A.5.3 + A.5.6 — API contract smoke for the duplicate-VIP path.
 *
 * Lives in the same Playwright harness as the UI spec so one command
 * (`npm run test:e2e`) drives both layers: API contract + rendered modal.
 *
 * Hits the dev backend directly through Playwright's `request` fixture (no
 * browser launched — pure HTTP). Faster diagnostic than the UI spec when
 * a contract regresses: this trips first, the UI spec follows.
 *
 * What it covers (mirrors the curl-based smoke at the end of the
 * Phase A.5.3 + A.5.6 ratification session, but versioned + repeatable):
 *
 *   1. POST /api/doctors with the canonical-key collision target → 409 carries
 *      the full DUPLICATE_VIP_CLIENT envelope (code, existing.{primaryAssignee,
 *      assignedTo, visitCount, fullName, isActive}, can_join_auto,
 *      can_join_approval, suggested_action).
 *   2. POST /api/doctors/:id/join-coverage as admin → 200 + mode:'auto'.
 *   3. Same call again → idempotent (already_assigned: true).
 *   4. Cleanup: revert assignedTo to its pre-test state via PUT.
 *
 * Pre-conditions:
 *   - Backend running on localhost:5000 (`npm run dev` in backend/).
 *   - Dev cluster has the Fel-Abejar seed Doctor with Mae Navarro as
 *     primary assignee. Verified Apr 27 + May 7 2026.
 */

import { test, expect } from '@playwright/test';

const API = 'http://localhost:5000';
const ADMIN_EMAIL = 'yourpartner@viosintegrated.net';
const ADMIN_PASSWORD = 'DevPass123!@#';
const DUP_FIRST = 'Fel';
const DUP_LAST = 'Abejar';

test.describe('Phase A.5.3 + A.5.6 — duplicate VIP API contract', () => {
  let request;
  let targetDoctorId;
  let primaryAssigneeId;

  test.beforeAll(async ({ playwright }) => {
    request = await playwright.request.newContext({ baseURL: API });
    const login = await request.post('/api/auth/login', {
      data: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    expect(login.status(), 'admin login').toBe(200);
  });

  test.afterAll(async () => {
    // Cleanup: revert the target's assignedTo to just the original primary, in
    // case test 2 added the admin as a secondary assignee. Idempotent — if the
    // admin wasn't added (test 2 skipped), this is a no-op write.
    if (targetDoctorId && primaryAssigneeId) {
      await request.put(`/api/doctors/${targetDoctorId}`, {
        data: {
          assignedTo: [primaryAssigneeId],
          primaryAssignee: primaryAssigneeId,
        },
      });
    }
    await request.dispose();
  });

  test('POST /api/doctors duplicate → 409 DUPLICATE_VIP_CLIENT envelope is intact', async () => {
    const res = await request.post('/api/doctors', {
      data: {
        firstName: DUP_FIRST,
        lastName: DUP_LAST,
        specialization: 'IM',
        clinicOfficeAddress: 'Smoke Test Plaza',
        visitFrequency: 4,
      },
    });

    expect(res.status()).toBe(409);
    const body = await res.json();

    expect(body.success).toBe(false);
    expect(body.code).toBe('DUPLICATE_VIP_CLIENT');
    expect(body.suggested_action).toBe('rename_or_join_coverage');
    expect(typeof body.message).toBe('string');
    expect(body.can_join_auto).toBe(true); // admin
    expect(body.can_join_approval).toBe(true); // admin

    expect(body.existing).toBeTruthy();
    expect(body.existing.firstName).toBe(DUP_FIRST);
    expect(body.existing.lastName).toBe(DUP_LAST);
    expect(body.existing.fullName).toBe(`${DUP_FIRST} ${DUP_LAST}`);
    expect(body.existing.isActive).toBe(true);
    expect(Array.isArray(body.existing.assignedTo)).toBe(true);
    expect(body.existing.assignedTo.length).toBeGreaterThanOrEqual(1);
    expect(body.existing.primaryAssignee).toBeTruthy();
    expect(body.existing.primaryAssignee.name).toBeTruthy();
    expect(typeof body.existing.visitCount).toBe('number');

    targetDoctorId = body.existing._id;
    primaryAssigneeId = body.existing.primaryAssignee._id;
  });

  test('POST /api/doctors/:id/join-coverage → 200 mode:auto for admin', async () => {
    test.skip(!targetDoctorId, 'duplicate envelope test must seed targetDoctorId first');

    const res = await request.post(`/api/doctors/${targetDoctorId}/join-coverage`, {
      data: {},
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.mode).toBe('auto');
    expect(body.data).toBeTruthy();
    // Admin should now be an assignee.
    const assignedNames = (body.data.assignedTo || []).map((a) => a.email || a.name);
    expect(assignedNames).toContain(ADMIN_EMAIL);
  });

  test('join-coverage is idempotent — second call returns already_assigned:true', async () => {
    test.skip(!targetDoctorId, 'duplicate envelope test must seed targetDoctorId first');

    const res = await request.post(`/api/doctors/${targetDoctorId}/join-coverage`, {
      data: {},
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.mode).toBe('auto');
    expect(body.already_assigned).toBe(true);
  });
});

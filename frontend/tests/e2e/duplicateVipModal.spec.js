/**
 * Phase A.5.3 + A.5.6 — UI smoke for the Duplicate-VIP-Client modal.
 *
 * Walks the admin path: log in → /admin/doctors → "Add VIP Client" →
 * submit a payload that already exists ("Fel Abejar" — pre-seeded on dev)
 * → assert the DuplicateVipClientModal renders with the contracted shape:
 *
 *   - canonical heading "VIP Client Already Exists"
 *   - existing card carries "Fel Abejar" + Mae Navarro as Primary BDM
 *   - admin sees BOTH "Rename mine" and "Join their coverage" buttons
 *   - approval-mode notes textarea is HIDDEN for admin (canAuto=true short-circuits)
 *   - clicking "Rename mine" closes the modal cleanly
 *
 * The browser is launched non-headless so a human can ratify visually if the
 * test trips on a layout regression. Run: `npx playwright test --headed`.
 */

import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'yourpartner@viosintegrated.net';
const ADMIN_PASSWORD = 'DevPass123!@#';
const FRONTEND = 'http://localhost:5173';
// Pre-seeded canonical-key collision target on the live dev cluster.
// (See API smoke: GET /api/doctors limit=1 returns Fel Abejar as id 0.)
const DUPLICATE_FIRST = 'Fel';
const DUPLICATE_LAST = 'Abejar';

test('admin sees Duplicate-VIP modal with Rename + Join-Auto buttons on canonical-key collision', async ({ page }) => {
  // 1. Log in as admin.
  await page.goto(`${FRONTEND}/login`);
  await page.fill('input[type="email"]', ADMIN_EMAIL);
  await page.fill('input[type="password"]', ADMIN_PASSWORD);
  await page.click('button[type="submit"]');

  // Wait for any post-login redirect to settle (admin lands on /home in this build).
  await page.waitForURL((url) => url.pathname !== '/login', { timeout: 15_000 });

  // 2. Navigate to VIP Client management.
  await page.goto(`${FRONTEND}/admin/doctors`);
  await expect(page.getByRole('button', { name: /Add VIP Client/i }).first()).toBeVisible({ timeout: 15_000 });

  // 3. Open the Add modal.
  await page.getByRole('button', { name: /Add VIP Client/i }).first().click();
  await expect(page.locator('input#firstName')).toBeVisible();

  // 4. Fill in a name that already exists.
  await page.fill('input#lastName', DUPLICATE_LAST);
  await page.fill('input#firstName', DUPLICATE_FIRST);

  // 5. Submit. Backend returns 409 + DUPLICATE_VIP_CLIENT, frontend mounts the modal.
  await page.locator('button.btn-save').click();

  // 6. Assert the duplicate modal is up.
  const modal = page.locator('.dvc-overlay');
  await expect(modal).toBeVisible({ timeout: 10_000 });
  await expect(modal.getByText('VIP Client Already Exists')).toBeVisible();
  // Heading inside the existing-record card (not the message paragraph above).
  await expect(modal.locator('h3.dvc-existing-name')).toHaveText(/Fel Abejar/);
  await expect(modal.getByText('Primary BDM')).toBeVisible();
  await expect(modal.getByText(/Mae Navarro/)).toBeVisible();

  // 7. Admin has JOIN_COVERAGE_AUTO → Rename + Join-Auto rendered, no approval branch.
  await expect(page.getByTestId('dvc-rename')).toBeVisible();
  await expect(page.getByTestId('dvc-join-auto')).toBeVisible();
  await expect(page.getByTestId('dvc-join-approval')).toHaveCount(0);

  // 8. Approval-mode notes textarea is conditional on (!canAuto && canApproval) — admin canAuto=true,
  //    so no notes textarea should be in the DOM.
  await expect(modal.locator('textarea.dvc-notes-field')).toHaveCount(0);

  // 9. Click "Rename mine" — modal must close.
  await page.getByTestId('dvc-rename').click();
  await expect(modal).toHaveCount(0, { timeout: 5_000 });
});

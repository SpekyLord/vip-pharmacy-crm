const { ROLE_SETS, isAdminLike } = require('../../constants/roles');

describe('Role constants and helpers', () => {
  test('ADMIN_LIKE includes expected elevated roles', () => {
    expect(ROLE_SETS.ADMIN_LIKE).toEqual(['admin', 'finance', 'president', 'ceo']);
  });

  test.each(['admin', 'finance', 'president', 'ceo'])(
    'isAdminLike returns true for %s',
    (role) => {
      expect(isAdminLike(role)).toBe(true);
    }
  );

  test.each(['staff', 'contractor', 'bdm', 'medrep', '', undefined, null])(
    'isAdminLike returns false for %s',
    // 'contractor' and 'bdm' retained to confirm legacy strings (pre-Phase S2)
    // still resolve to non-admin-like. The ROLES.CONTRACTOR alias returns 'staff';
    // passing the raw legacy string directly exercises the negative path.
    (role) => {
      expect(isAdminLike(role)).toBe(false);
    }
  );
});

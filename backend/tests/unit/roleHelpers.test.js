const { CRM_ADMIN_LIKE_ROLES, isCrmAdminLike } = require('../../utils/roleHelpers');

describe('CRM role helpers', () => {
  test('includes expected elevated CRM roles', () => {
    expect(CRM_ADMIN_LIKE_ROLES).toEqual(['admin', 'finance', 'president', 'ceo']);
  });

  test.each(['admin', 'finance', 'president', 'ceo'])(
    'isCrmAdminLike returns true for %s',
    (role) => {
      expect(isCrmAdminLike(role)).toBe(true);
    }
  );

  test.each(['employee', 'bdm', 'medrep', '', undefined, null])(
    'isCrmAdminLike returns false for %s',
    (role) => {
      expect(isCrmAdminLike(role)).toBe(false);
    }
  );
});

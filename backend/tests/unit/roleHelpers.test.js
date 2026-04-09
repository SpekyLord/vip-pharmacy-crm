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

  test.each(['contractor', 'bdm', 'medrep', '', undefined, null])(
    'isAdminLike returns false for %s',
    (role) => {
      expect(isAdminLike(role)).toBe(false);
    }
  );
});

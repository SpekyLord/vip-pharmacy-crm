const { adminOnly, adminOrEmployee } = require('../../middleware/roleCheck');

const buildRes = () => {
  const res = {};
  res.statusCode = 200;
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((payload) => {
    res.payload = payload;
    return res;
  });
  return res;
};

describe('roleCheck admin-like behavior', () => {
  test.each(['admin', 'president', 'ceo', 'finance'])(
    'adminOnly allows %s',
    (role) => {
      const req = { user: { role } };
      const res = buildRes();
      const next = jest.fn();

      adminOnly(req, res, next);

      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalledWith(403);
    }
  );

  test('adminOnly denies employee', () => {
    const req = { user: { role: 'employee' } };
    const res = buildRes();
    const next = jest.fn();

    adminOnly(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('adminOrEmployee allows employee', () => {
    const req = { user: { role: 'employee' } };
    const res = buildRes();
    const next = jest.fn();

    adminOrEmployee(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});

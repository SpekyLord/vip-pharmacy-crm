const { adminOnly } = require('../../middleware/roleCheck');

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

describe('role middleware', () => {
  test('adminOnly denies staff role', () => {
    const req = { user: { role: 'staff' } };
    const res = buildRes();
    const next = jest.fn();

    adminOnly(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('adminOnly allows admin role', () => {
    const req = { user: { role: 'admin' } };
    const res = buildRes();
    const next = jest.fn();

    adminOnly(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalledWith(403);
  });
});


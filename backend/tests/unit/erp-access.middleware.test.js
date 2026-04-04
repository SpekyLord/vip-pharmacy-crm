const { erpAccessCheck } = require('../../erp/middleware/erpAccessCheck');

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

describe('erpAccessCheck middleware', () => {
  test('blocks FULL action when user has VIEW access', () => {
    const middleware = erpAccessCheck('sales', 'FULL');
    const req = {
      user: {
        role: 'employee',
        erp_access: {
          enabled: true,
          modules: { sales: 'VIEW' },
        },
      },
    };
    const res = buildRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  test('allows FULL action when user has FULL access', () => {
    const middleware = erpAccessCheck('sales', 'FULL');
    const req = {
      user: {
        role: 'employee',
        erp_access: {
          enabled: true,
          modules: { sales: 'FULL' },
        },
      },
    };
    const res = buildRes();
    const next = jest.fn();

    middleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
  });
});


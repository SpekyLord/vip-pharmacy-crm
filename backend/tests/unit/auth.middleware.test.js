const { protect, verifyRefreshToken } = require('../../middleware/auth');

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

describe('auth middleware', () => {
  test('protect returns 401 when token is missing', async () => {
    const req = { headers: {}, cookies: {} };
    const res = buildRes();
    const next = jest.fn();

    await protect(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.payload.success).toBe(false);
    expect(next).not.toHaveBeenCalled();
  });

  test('verifyRefreshToken returns 401 when refresh token is missing', async () => {
    const req = { body: {}, cookies: {} };
    const res = buildRes();
    const next = jest.fn();

    await verifyRefreshToken(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.payload.success).toBe(false);
    expect(next).not.toHaveBeenCalled();
  });
});


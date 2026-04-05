jest.mock('../../models/Client', () => ({}));
jest.mock('../../models/ClientVisit', () => ({
  aggregate: jest.fn(),
}));
jest.mock('../../config/s3', () => ({
  signVisitPhotos: jest.fn(async (v) => v),
}));
jest.mock('../../utils/controllerHelpers', () => ({
  sanitizeSearchString: jest.fn((v) => v),
}));
jest.mock('../../utils/engagementTypes', () => ({
  normalizeEngagementTypesQuery: jest.fn(() => []),
}));

const ClientVisit = require('../../models/ClientVisit');
const { getClientVisitStats } = require('../../controllers/clientController');
const { getCycleStartDate, getCycleEndDate } = require('../../utils/scheduleCycleUtils');

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

describe('client visit stats cycle filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ClientVisit.aggregate.mockResolvedValue([{
      summary: [{ totalVisits: 2, uniqueClientsCount: 2 }],
      weeklyBreakdown: [{ week: 1, visitCount: 2, clientCount: 2 }],
    }]);
  });

  test('cycle filters override monthYear when cycleNumber is provided', async () => {
    const req = {
      query: { cycleNumber: '4', cycleWeek: '2', monthYear: '03/2026' },
      user: { role: 'admin', _id: 'admin-1' },
    };
    const res = buildRes();
    const next = jest.fn();

    await getClientVisitStats(req, res, next);

    const pipeline = ClientVisit.aggregate.mock.calls[0][0];
    const match = pipeline[0].$match;

    expect(match.monthYear).toBeUndefined();
    expect(match.weekOfMonth).toBe(2);
    expect(match.visitDate.$gte.toISOString()).toBe(getCycleStartDate(4).toISOString());
    expect(match.visitDate.$lte.toISOString()).toBe(getCycleEndDate(4).toISOString());
    expect(next).not.toHaveBeenCalled();
  });

  test('uses monthYear when cycleNumber is missing', async () => {
    const req = {
      query: { monthYear: '03/2026', cycleWeek: '2' },
      user: { role: 'admin', _id: 'admin-1' },
    };
    const res = buildRes();
    const next = jest.fn();

    await getClientVisitStats(req, res, next);

    const pipeline = ClientVisit.aggregate.mock.calls[0][0];
    const match = pipeline[0].$match;

    expect(match.monthYear).toBe('03/2026');
    expect(match.visitDate).toBeUndefined();
    expect(match.weekOfMonth).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  test('employee role remains scoped to own user ID', async () => {
    const req = {
      query: { cycleNumber: '0' },
      user: { role: 'employee', _id: 'employee-1' },
    };
    const res = buildRes();
    const next = jest.fn();

    await getClientVisitStats(req, res, next);

    const pipeline = ClientVisit.aggregate.mock.calls[0][0];
    const match = pipeline[0].$match;

    expect(match.user).toBe('employee-1');
    expect(next).not.toHaveBeenCalled();
  });
});

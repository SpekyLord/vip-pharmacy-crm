jest.mock('../../models/Visit', () => ({
  aggregate: jest.fn(),
}));
jest.mock('../../models/Doctor', () => ({}));
jest.mock('../../models/CrmProduct', () => ({}));
jest.mock('../../models/ClientVisit', () => ({}));
jest.mock('../../utils/validateWeeklyVisit', () => ({
  canVisitDoctor: jest.fn(),
  canVisitDoctorsBatch: jest.fn(),
  getComplianceReport: jest.fn(),
  getMonthYear: jest.fn(),
  getScheduleMatchForVisit: jest.fn(),
}));
jest.mock('../../utils/engagementTypes', () => ({
  normalizeEngagementTypesQuery: jest.fn(() => []),
}));
jest.mock('../../config/s3', () => ({
  signVisitPhotos: jest.fn(async (v) => v),
}));

const Visit = require('../../models/Visit');
const { getVisitStats } = require('../../controllers/visitController');
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

describe('visit stats cycle filters', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Visit.aggregate.mockResolvedValue([{
      summary: [{ totalVisits: 3, uniqueDoctorsCount: 2, avgDuration: 15 }],
      weeklyBreakdown: [{ week: 1, visitCount: 3, doctorCount: 2 }],
    }]);
  });

  test('cycleNumber + cycleWeek takes precedence over monthYear', async () => {
    const req = {
      query: { cycleNumber: '2', cycleWeek: '3', monthYear: '03/2026' },
      user: { role: 'admin', _id: 'admin-1' },
    };
    const res = buildRes();
    const next = jest.fn();

    await getVisitStats(req, res, next);

    const pipeline = Visit.aggregate.mock.calls[0][0];
    const match = pipeline[0].$match;

    expect(match.status).toBe('completed');
    expect(match.monthYear).toBeUndefined();
    expect(match.weekOfMonth).toBe(3);
    expect(match.visitDate.$gte.toISOString()).toBe(getCycleStartDate(2).toISOString());
    expect(match.visitDate.$lte.toISOString()).toBe(getCycleEndDate(2).toISOString());
    expect(res.status).not.toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  test('falls back to monthYear when cycleNumber is not provided', async () => {
    const req = {
      query: { monthYear: '03/2026' },
      user: { role: 'admin', _id: 'admin-1' },
    };
    const res = buildRes();
    const next = jest.fn();

    await getVisitStats(req, res, next);

    const pipeline = Visit.aggregate.mock.calls[0][0];
    const match = pipeline[0].$match;

    expect(match.monthYear).toBe('03/2026');
    expect(match.visitDate).toBeUndefined();
    expect(match.weekOfMonth).toBeUndefined();
    expect(next).not.toHaveBeenCalled();
  });

  test('employee scope remains restricted to own user ID', async () => {
    const req = {
      query: { cycleNumber: '1' },
      user: { role: 'staff', _id: 'employee-1' },
    };
    const res = buildRes();
    const next = jest.fn();

    await getVisitStats(req, res, next);

    const pipeline = Visit.aggregate.mock.calls[0][0];
    const match = pipeline[0].$match;

    expect(match.user).toBe('employee-1');
    expect(next).not.toHaveBeenCalled();
  });
});

jest.mock('../../models/Doctor', () => ({
  find: jest.fn(),
  countDocuments: jest.fn(),
}));

const Doctor = require('../../models/Doctor');
const { getAllDoctors } = require('../../controllers/doctorController');

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

const makeFindChain = (rows) => {
  const chain = {
    populate: jest.fn().mockReturnThis(),
    sort: jest.fn().mockReturnThis(),
    lean: jest.fn().mockResolvedValue(rows),
    skip: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
  };
  return chain;
};

describe('doctorController getAllDoctors access filter', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each(['admin', 'president', 'ceo', 'finance'])(
    'elevated role %s does not get assignment restriction',
    async (role) => {
      const req = {
        user: { _id: 'u1', role },
        query: { limit: '0' },
      };
      const res = buildRes();
      const next = jest.fn();
      const rows = [{ _id: 'd1' }, { _id: 'd2' }];
      Doctor.find.mockReturnValue(makeFindChain(rows));

      await getAllDoctors(req, res, next);

      expect(Doctor.find).toHaveBeenCalledTimes(1);
      const filter = Doctor.find.mock.calls[0][0];
      expect(filter).toMatchObject({ isActive: true });
      expect(filter.assignedTo).toBeUndefined();
      expect(filter._id).toBeUndefined();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.payload?.data).toHaveLength(2);
    }
  );

  test('employee is restricted to own assigned doctors', async () => {
    const req = {
      user: { _id: 'employee-1', role: 'staff' },
      query: { limit: '0' },
    };
    const res = buildRes();
    const next = jest.fn();
    Doctor.find.mockReturnValue(makeFindChain([]));

    await getAllDoctors(req, res, next);

    expect(Doctor.find).toHaveBeenCalledTimes(1);
    const filter = Doctor.find.mock.calls[0][0];
    expect(filter).toMatchObject({
      isActive: true,
      assignedTo: 'employee-1',
    });
    expect(res.status).toHaveBeenCalledWith(200);
  });
});

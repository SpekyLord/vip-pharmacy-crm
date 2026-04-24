jest.mock('../../models/Doctor', () => ({
  findOne: jest.fn(),
}));

const Doctor = require('../../models/Doctor');
const { getDoctorProducts } = require('../../controllers/doctorController');

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

const flushPromises = () => new Promise(setImmediate);

describe('doctorController getDoctorProducts', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 400 for invalid doctor ID', async () => {
    const req = { params: { id: 'not-an-object-id' } };
    const res = buildRes();
    const next = jest.fn();

    await getDoctorProducts(req, res, next);

    expect(Doctor.findOne).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.payload).toMatchObject({
      success: false,
      message: 'Invalid doctor ID',
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 404 when doctor is inactive or missing', async () => {
    const req = { params: { id: '507f1f77bcf86cd799439011' } };
    const res = buildRes();
    const next = jest.fn();
    const query = {
      populate: jest.fn().mockResolvedValue(null),
    };
    Doctor.findOne.mockReturnValue(query);

    await getDoctorProducts(req, res, next);
    await flushPromises();

    expect(Doctor.findOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439011',
      isActive: true,
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 404,
      message: 'Doctor not found',
    });
  });

  test('returns 200 with doctor + products for active doctor', async () => {
    const req = { params: { id: '507f1f77bcf86cd799439012' }, user: { _id: 'u1', role: 'admin' } };
    const res = buildRes();
    const next = jest.fn();
    const doctor = {
      _id: '507f1f77bcf86cd799439012',
      firstName: 'Jane',
      lastName: 'Doe',
      fullName: 'Jane Doe',
      specialization: 'Cardiology',
      assignedProducts: [{ _id: 'p1' }],
    };
    const query = {
      populate: jest.fn().mockResolvedValue(doctor),
    };
    Doctor.findOne.mockReturnValue(query);

    await getDoctorProducts(req, res, next);
    await flushPromises();

    expect(Doctor.findOne).toHaveBeenCalledWith({
      _id: '507f1f77bcf86cd799439012',
      isActive: true,
    });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.payload).toMatchObject({
      success: true,
      data: {
        doctor: {
          _id: '507f1f77bcf86cd799439012',
          firstName: 'Jane',
          lastName: 'Doe',
          fullName: 'Jane Doe',
          specialization: 'Cardiology',
        },
        products: [{ _id: 'p1' }],
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when contractor requests products for unassigned doctor', async () => {
    const req = { params: { id: '507f1f77bcf86cd799439012' }, user: { _id: 'u1', role: 'staff' } };
    const res = buildRes();
    const next = jest.fn();
    const doctor = {
      _id: '507f1f77bcf86cd799439012',
      firstName: 'Jane',
      lastName: 'Doe',
      fullName: 'Jane Doe',
      specialization: 'Cardiology',
      assignedTo: 'other-user-id',
      assignedProducts: [{ _id: 'p1' }],
    };
    const query = { populate: jest.fn().mockResolvedValue(doctor) };
    Doctor.findOne.mockReturnValue(query);

    await getDoctorProducts(req, res, next);
    await flushPromises();

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({
      statusCode: 403,
      message: 'You do not have access to this VIP Client',
    });
  });

  test('returns 200 when contractor requests products for their assigned doctor', async () => {
    const req = { params: { id: '507f1f77bcf86cd799439012' }, user: { _id: 'u1', role: 'staff' } };
    const res = buildRes();
    const next = jest.fn();
    const doctor = {
      _id: '507f1f77bcf86cd799439012',
      firstName: 'Jane',
      lastName: 'Doe',
      fullName: 'Jane Doe',
      specialization: 'Cardiology',
      assignedTo: 'u1',
      assignedProducts: [{ _id: 'p1' }],
    };
    const query = { populate: jest.fn().mockResolvedValue(doctor) };
    Doctor.findOne.mockReturnValue(query);

    await getDoctorProducts(req, res, next);
    await flushPromises();

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.payload.success).toBe(true);
    expect(next).not.toHaveBeenCalled();
  });
});

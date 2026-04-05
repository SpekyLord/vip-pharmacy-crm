jest.mock('../../erp/models/SmerEntry', () => ({
  findOne: jest.fn(),
}));

const SmerEntry = require('../../erp/models/SmerEntry');
const { overridePerdiemDay } = require('../../erp/controllers/expenseController');

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

describe('expenseController overridePerdiemDay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('includes tenantFilter in SMER lookup query', async () => {
    const req = {
      params: { id: 'smer-1' },
      tenantFilter: { entity_id: 'entity-1', bdm_id: 'bdm-1' },
      body: { entry_id: 'entry-1' },
    };
    const res = buildRes();
    const next = jest.fn();
    SmerEntry.findOne.mockResolvedValue(null);

    await overridePerdiemDay(req, res, next);

    expect(SmerEntry.findOne).toHaveBeenCalledTimes(1);
    const query = SmerEntry.findOne.mock.calls[0][0];
    expect(query).toMatchObject({
      _id: 'smer-1',
      entity_id: 'entity-1',
      bdm_id: 'bdm-1',
    });
    expect(query.status).toEqual({ $in: ['DRAFT', 'ERROR'] });

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.payload).toMatchObject({
      success: false,
      message: 'SMER not found or not editable',
    });
    expect(next).not.toHaveBeenCalled();
  });
});

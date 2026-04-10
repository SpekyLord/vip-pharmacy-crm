jest.mock('../../agents/agentExecutor', () => ({
  startManualAgentRun: jest.fn(),
}));

const { startManualAgentRun } = require('../../agents/agentExecutor');
const agentController = require('../../erp/controllers/agentController');

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

describe('agentController runAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 202 and the running record when a manual run starts', async () => {
    const req = { params: { agentKey: 'performance_coach' } };
    const res = buildRes();
    const next = jest.fn();

    startManualAgentRun.mockResolvedValue({
      started: true,
      run: {
        _id: 'run-1',
        status: 'running',
        trigger_source: 'manual',
      },
    });

    await agentController.runAgent(req, res, next);

    expect(startManualAgentRun).toHaveBeenCalledWith('performance_coach');
    expect(res.status).toHaveBeenCalledWith(202);
    expect(res.payload).toMatchObject({
      success: true,
      message: 'Agent "performance_coach" started in background',
      data: {
        _id: 'run-1',
        status: 'running',
      },
    });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 409 when the agent is already running', async () => {
    const req = { params: { agentKey: 'performance_coach' } };
    const res = buildRes();
    const next = jest.fn();

    startManualAgentRun.mockResolvedValue({
      started: false,
      reason: 'already_running',
    });

    await agentController.runAgent(req, res, next);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.payload).toMatchObject({
      success: false,
      message: 'Agent "performance_coach" is already running',
    });
    expect(next).not.toHaveBeenCalled();
  });
});

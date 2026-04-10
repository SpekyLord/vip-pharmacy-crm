const path = require('path');

jest.mock('../../erp/models/AgentRun', () => ({
  create: jest.fn(),
  findByIdAndUpdate: jest.fn(),
}));

jest.mock('../../erp/models/AgentConfig', () => ({
  findOneAndUpdate: jest.fn(),
  findOne: jest.fn(),
}));

jest.mock('../../agents/agentRegistry', () => ({
  getAgentDefinition: jest.fn(),
}));

jest.mock('../../utils/logger', () => ({
  logError: jest.fn(),
  logInfo: jest.fn(),
  logWarn: jest.fn(),
}));

const AgentRun = require('../../erp/models/AgentRun');
const AgentConfig = require('../../erp/models/AgentConfig');
const { getAgentDefinition } = require('../../agents/agentRegistry');
const mockAgentModule = require('../fixtures/mockAgentModule');
const {
  prepareAgentRun,
  executePreparedRun,
} = require('../../agents/agentExecutor');

const FIXTURE_MODULE_PATH = path.resolve(__dirname, '../fixtures/mockAgentModule.js');

const makeLeanQuery = (value) => ({
  lean: jest.fn().mockResolvedValue(value),
});

const makeRunRecord = (overrides = {}) => ({
  _id: 'run-1',
  status: 'running',
  trigger_source: 'manual',
  summary: {},
  ...overrides,
  toObject() {
    return {
      _id: this._id,
      status: this.status,
      trigger_source: this.trigger_source,
      summary: this.summary,
      ...overrides,
    };
  },
});

describe('agentExecutor', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    getAgentDefinition.mockReturnValue({
      key: 'performance_coach',
      label: 'BDM Performance Coach',
      modulePath: FIXTURE_MODULE_PATH,
    });
  });

  test('skips scheduled runs when the agent is disabled', async () => {
    AgentConfig.findOneAndUpdate.mockResolvedValueOnce({});
    AgentConfig.findOne.mockReturnValue(makeLeanQuery({
      agent_key: 'performance_coach',
      enabled: false,
    }));

    const result = await prepareAgentRun('performance_coach', { triggerSource: 'scheduled' });

    expect(result).toMatchObject({
      started: false,
      reason: 'disabled',
    });
    expect(AgentRun.create).not.toHaveBeenCalled();
  });

  test('manual runs still create a running record even when the agent is disabled for schedules', async () => {
    AgentConfig.findOneAndUpdate
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ agent_key: 'performance_coach', enabled: false })
      .mockResolvedValueOnce({});
    AgentConfig.findOne.mockReturnValue(makeLeanQuery({
      agent_key: 'performance_coach',
      enabled: false,
    }));
    AgentRun.create.mockResolvedValue(makeRunRecord());

    const result = await prepareAgentRun('performance_coach', { triggerSource: 'manual' });

    expect(result.started).toBe(true);
    expect(AgentRun.create).toHaveBeenCalledWith(expect.objectContaining({
      agent_key: 'performance_coach',
      status: 'running',
      trigger_source: 'manual',
    }));
    expect(result.run).toMatchObject({
      _id: 'run-1',
      status: 'running',
    });
  });

  test('marks a prepared run as success and stores summary/message IDs', async () => {
    const runSpy = jest.spyOn(mockAgentModule, 'run').mockResolvedValue({
      status: 'success',
      summary: {
        bdms_processed: 4,
        messages_sent: 3,
        alerts_generated: 1,
        key_findings: ['11 BDMs received visit plans'],
      },
      message_ids: ['msg-1', 'msg-2'],
    });

    AgentRun.findByIdAndUpdate.mockReturnValueOnce(makeLeanQuery({
      _id: 'run-1',
      status: 'success',
      summary: {
        bdms_processed: 4,
        messages_sent: 3,
        alerts_generated: 1,
        key_findings: ['11 BDMs received visit plans'],
      },
      message_ids: ['msg-1', 'msg-2'],
    }));
    AgentConfig.findOneAndUpdate.mockResolvedValue({});

    const runContext = {
      agentKey: 'visit_planner',
      definition: {
        key: 'visit_planner',
        label: 'Smart Visit Planner',
        modulePath: FIXTURE_MODULE_PATH,
      },
      triggerSource: 'manual',
      args: {},
      run: { _id: 'run-1' },
    };

    const result = await executePreparedRun(runContext);

    expect(runSpy).toHaveBeenCalledWith(expect.objectContaining({
      triggerSource: 'manual',
      runId: 'run-1',
    }));
    expect(AgentRun.findByIdAndUpdate).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'success',
          summary: expect.objectContaining({
            bdms_processed: 4,
            messages_sent: 3,
            alerts_generated: 1,
          }),
          message_ids: ['msg-1', 'msg-2'],
        }),
      }),
      { new: true }
    );
    expect(result).toMatchObject({
      _id: 'run-1',
      status: 'success',
    });

    runSpy.mockRestore();
  });

  test('marks provider authentication failures as error with a readable message', async () => {
    const runSpy = jest.spyOn(mockAgentModule, 'run').mockRejectedValue({
      response: {
        data: {
          message: 'Invalid authentication credentials',
        },
      },
    });

    AgentRun.findByIdAndUpdate.mockReturnValueOnce(makeLeanQuery({
      _id: 'run-1',
      status: 'error',
      error_msg: 'Invalid authentication credentials',
      summary: {},
      message_ids: [],
    }));
    AgentConfig.findOneAndUpdate.mockResolvedValue({});

    const runContext = {
      agentKey: 'performance_coach',
      definition: {
        key: 'performance_coach',
        label: 'BDM Performance Coach',
        modulePath: FIXTURE_MODULE_PATH,
      },
      triggerSource: 'manual',
      args: {},
      run: { _id: 'run-1' },
    };

    const result = await executePreparedRun(runContext);

    expect(AgentRun.findByIdAndUpdate).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({
        $set: expect.objectContaining({
          status: 'error',
          error_msg: 'Invalid authentication credentials',
        }),
      }),
      { new: true }
    );
    expect(result).toMatchObject({
      _id: 'run-1',
      status: 'error',
      error_msg: 'Invalid authentication credentials',
    });

    runSpy.mockRestore();
  });
});

jest.mock('../../agents/claudeClient', () => ({
  askClaude: jest.fn(),
}));

jest.mock('../../agents/notificationService', () => ({
  notify: jest.fn(),
  countSuccessfulChannels: jest.fn(),
  getInAppMessageIds: jest.fn(),
}));

jest.mock('../../models/User', () => ({
  find: jest.fn(),
}));

jest.mock('../../models/Visit', () => ({
  countDocuments: jest.fn(),
}));

jest.mock('../../erp/models/SalesLine', () => ({
  aggregate: jest.fn(),
}));

jest.mock('../../erp/models/ExpenseEntry', () => ({
  aggregate: jest.fn(),
}));

jest.mock('../../erp/models/Collection', () => ({
  aggregate: jest.fn(),
}));

const { askClaude } = require('../../agents/claudeClient');
const {
  notify,
  countSuccessfulChannels,
  getInAppMessageIds,
} = require('../../agents/notificationService');
const User = require('../../models/User');
const Visit = require('../../models/Visit');
const SalesLine = require('../../erp/models/SalesLine');
const ExpenseEntry = require('../../erp/models/ExpenseEntry');
const Collection = require('../../erp/models/Collection');
const { run } = require('../../agents/performanceCoachAgent');

const makeQuery = (value) => ({
  select: jest.fn().mockReturnValue({
    lean: jest.fn().mockResolvedValue(value),
  }),
});

describe('performanceCoachAgent', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    countSuccessfulChannels.mockImplementation(
      (results, channel) => results.filter((result) => result.channel === channel && result.success).length
    );
    getInAppMessageIds.mockImplementation(
      (results) => results.filter((result) => result.channel === 'in_app' && result.success).map((result) => result.messageId)
    );
    notify.mockImplementation(async ({ recipient_id }) => ([
      { channel: 'in_app', success: true, messageId: `msg-${recipient_id}` },
    ]));
  });

  test('uses current ERP sales and collection fields and returns partial when one BDM fails', async () => {
    User.find.mockReturnValue(makeQuery([
      { _id: 'bdm-1', name: 'Alice' },
      { _id: 'bdm-2', name: 'Bob' },
    ]));

    Visit.countDocuments
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(22)
      .mockResolvedValueOnce(4)
      .mockResolvedValueOnce(12);

    SalesLine.aggregate
      .mockResolvedValueOnce([{ total: 125000, count: 3 }])
      .mockResolvedValueOnce([{ total: 45000, count: 2 }]);
    ExpenseEntry.aggregate
      .mockResolvedValueOnce([{ total: 12000 }])
      .mockResolvedValueOnce([{ total: 7000 }]);
    Collection.aggregate
      .mockResolvedValueOnce([{ total: 40000, count: 2 }])
      .mockResolvedValueOnce([{ total: 15000, count: 1 }]);

    askClaude
      .mockResolvedValueOnce({ text: 'Keep pushing this week.' })
      .mockRejectedValueOnce(new Error('Bad BDM data'));

    const result = await run();

    expect(SalesLine.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        $match: expect.objectContaining({
          bdm_id: 'bdm-1',
          status: 'POSTED',
          csi_date: expect.any(Object),
        }),
      }),
      expect.objectContaining({
        $group: expect.objectContaining({
          total: { $sum: '$invoice_total' },
        }),
      }),
    ]));

    expect(Collection.aggregate).toHaveBeenCalledWith(expect.arrayContaining([
      expect.objectContaining({
        $match: expect.objectContaining({
          bdm_id: 'bdm-1',
          status: 'POSTED',
          cr_date: expect.any(Object),
        }),
      }),
      expect.objectContaining({
        $group: expect.objectContaining({
          total: { $sum: '$cr_amount' },
        }),
      }),
    ]));

    expect(result.status).toBe('partial');
    expect(result.summary.bdms_processed).toBe(1);
    expect(result.summary.messages_sent).toBe(2);
    expect(result.summary.key_findings).toEqual(expect.arrayContaining([
      'Alice: PHP 125,000 sales, 8 visits',
      '1 BDM coaching run(s) failed and were skipped.',
    ]));
    expect(notify).toHaveBeenCalledTimes(2);
  });

  test('throws when every BDM coaching request fails', async () => {
    User.find.mockReturnValue(makeQuery([
      { _id: 'bdm-1', name: 'Alice' },
    ]));

    Visit.countDocuments
      .mockResolvedValueOnce(8)
      .mockResolvedValueOnce(22);
    SalesLine.aggregate.mockResolvedValueOnce([{ total: 125000, count: 3 }]);
    ExpenseEntry.aggregate.mockResolvedValueOnce([{ total: 12000 }]);
    Collection.aggregate.mockResolvedValueOnce([{ total: 40000, count: 2 }]);
    askClaude.mockRejectedValueOnce(new Error('Invalid authentication credentials'));

    await expect(run()).rejects.toThrow('Invalid authentication credentials');
    expect(notify).not.toHaveBeenCalled();
  });
});

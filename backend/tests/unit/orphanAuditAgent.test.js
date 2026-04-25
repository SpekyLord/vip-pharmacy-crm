/**
 * Unit tests for orphanAuditAgent (Day-4.5 item 3 / Week-1 Stabilization).
 *
 * Mocks every model touched by `findOrphans()` so the suite runs without a
 * Mongo connection. Covers:
 *   - clean entity → returns nothing
 *   - one orphan in one module → returns the entity block, owners sorted
 *   - per-module VALID_OWNER_ROLES override from Lookup
 *   - run() short-circuit when grandTotal === 0 (no notify, alerts_generated=0)
 *   - run() fires notify(PRESIDENT) + notify(ALL_ADMINS) when orphans present
 *   - notification body truncation respects MAX_BODY_LINES
 *
 * Variable names prefixed with `mock` so jest.mock() factory hoisting allows them.
 */
'use strict';

jest.mock('mongoose', () => ({
  connection: { readyState: 1 },
}));

jest.mock('../../agents/notificationService', () => ({
  notify: jest.fn(),
  countSuccessfulChannels: jest.fn(),
  getInAppMessageIds: jest.fn(),
}));

jest.mock('../../models/User', () => ({ find: jest.fn() }));
jest.mock('../../erp/models/Entity', () => ({ find: jest.fn() }));
jest.mock('../../erp/models/Lookup', () => ({ findOne: jest.fn() }));
jest.mock('../../erp/models/SalesLine', () => ({ find: jest.fn() }));
jest.mock('../../erp/models/Collection', () => ({ find: jest.fn() }));
jest.mock('../../erp/models/ExpenseEntry', () => ({ find: jest.fn() }));
jest.mock('../../erp/models/CarLogbookCycle', () => ({ find: jest.fn() }));
jest.mock('../../erp/models/CarLogbookEntry', () => ({ find: jest.fn() }));
jest.mock('../../erp/models/PrfCalf', () => ({ find: jest.fn() }));
jest.mock('../../erp/models/Undertaking', () => ({ find: jest.fn() }));
jest.mock('../../erp/models/SmerEntry', () => ({ find: jest.fn() }));

const {
  notify,
  countSuccessfulChannels,
  getInAppMessageIds,
} = require('../../agents/notificationService');

const User = require('../../models/User');
const Entity = require('../../erp/models/Entity');
const Lookup = require('../../erp/models/Lookup');
const SalesLine = require('../../erp/models/SalesLine');
const Collection = require('../../erp/models/Collection');
const ExpenseEntry = require('../../erp/models/ExpenseEntry');
const CarLogbookCycle = require('../../erp/models/CarLogbookCycle');
const CarLogbookEntry = require('../../erp/models/CarLogbookEntry');
const PrfCalf = require('../../erp/models/PrfCalf');
const Undertaking = require('../../erp/models/Undertaking');
const SmerEntry = require('../../erp/models/SmerEntry');

const {
  run,
  findOrphans,
  buildNotificationBody,
} = require('../../agents/orphanAuditAgent');

const leanOf = (value) => ({ select: jest.fn().mockReturnValue({ lean: jest.fn().mockResolvedValue(value) }) });
const leanFindOne = (value) => ({ lean: jest.fn().mockResolvedValue(value) });
const leanFind = (value) => ({ lean: jest.fn().mockResolvedValue(value) });

const ENTITY_VIP = { _id: 'entity-vip', short_name: 'VIP', name: 'VIP Pharmacy' };

const ALL_MODULE_FINDS = [SalesLine, Collection, ExpenseEntry, CarLogbookCycle, CarLogbookEntry, PrfCalf, Undertaking, SmerEntry];

const cleanModuleMocks = () => {
  for (const Model of ALL_MODULE_FINDS) {
    Model.find.mockReturnValue(leanFind([]));
  }
};

describe('orphanAuditAgent.findOrphans', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Lookup.findOne.mockReturnValue(leanFindOne(null));
    Entity.find.mockReturnValue(leanOf([ENTITY_VIP]));
    User.find.mockReturnValue(leanOf([]));
    cleanModuleMocks();
  });

  test('returns empty result when no non-owner users exist in the entity', async () => {
    User.find.mockReturnValue(leanOf([]));

    const scan = await findOrphans();

    expect(scan.grandTotal).toBe(0);
    expect(scan.entities).toEqual([]);
    expect(SalesLine.find).not.toHaveBeenCalled();
  });

  test('returns empty result when non-owner users exist but no orphans found', async () => {
    User.find.mockReturnValue(leanOf([
      { _id: 'admin-1', name: 'Admin Andy', role: 'admin', email: 'andy@vip' },
    ]));
    cleanModuleMocks();

    const scan = await findOrphans();

    expect(scan.grandTotal).toBe(0);
    expect(scan.entities).toEqual([]);
    expect(SalesLine.find).toHaveBeenCalledWith({ entity_id: 'entity-vip', bdm_id: { $in: ['admin-1'] } });
    expect(SmerEntry.find).toHaveBeenCalledWith({ entity_id: 'entity-vip', bdm_id: { $in: ['admin-1'] } });
  });

  test('groups orphans by owner, sorts by count desc, attaches refs', async () => {
    User.find.mockReturnValue(leanOf([
      { _id: 'admin-1', name: 'Admin Andy', role: 'admin', email: 'andy@vip' },
      { _id: 'fin-1',   name: 'Finance Faye', role: 'finance', email: 'faye@vip' },
    ]));
    SalesLine.find.mockReturnValue(leanFind([
      { _id: 's1', bdm_id: 'admin-1', doc_ref: 'CSI-001', csi_date: '2026-04-01', line_total: 1000 },
      { _id: 's2', bdm_id: 'admin-1', doc_ref: 'CSI-002', csi_date: '2026-04-02', line_total: 2000 },
      { _id: 's3', bdm_id: 'admin-1', doc_ref: 'CSI-003', csi_date: '2026-04-03', line_total: 3000 },
      { _id: 's4', bdm_id: 'fin-1',   doc_ref: 'CSI-004', csi_date: '2026-04-04', line_total: 4000 },
    ]));

    const scan = await findOrphans();

    expect(scan.grandTotal).toBe(4);
    expect(scan.entities).toHaveLength(1);
    const ent = scan.entities[0];
    expect(ent.entityName).toBe('VIP');
    expect(ent.totalOrphans).toBe(4);
    expect(ent.modules).toHaveLength(1);
    expect(ent.modules[0].key).toBe('sales');
    expect(ent.modules[0].owners.map((o) => o.ownerId)).toEqual(['admin-1', 'fin-1']);
    expect(ent.modules[0].owners[0]).toMatchObject({
      ownerName: 'Admin Andy',
      ownerRole: 'admin',
      count: 3,
      refs: ['CSI-001', 'CSI-002', 'CSI-003'],
    });
  });

  test('respects per-module VALID_OWNER_ROLES override from Lookup', async () => {
    Lookup.findOne.mockImplementation((q) => leanFindOne(
      q.code === 'SALES' ? { metadata: { roles: ['staff', 'finance'] } } : null
    ));

    User.find.mockImplementation((q) => {
      const nin = q?.role?.$nin || [];
      const all = [
        { _id: 'admin-1', name: 'Admin Andy', role: 'admin', email: 'andy@vip' },
        { _id: 'fin-1',   name: 'Finance Faye', role: 'finance', email: 'faye@vip' },
      ];
      return leanOf(all.filter((u) => !nin.includes(u.role)));
    });

    SalesLine.find.mockReturnValue(leanFind([
      { _id: 's1', bdm_id: 'admin-1', doc_ref: 'CSI-001', csi_date: '2026-04-01', line_total: 1000 },
    ]));

    const scan = await findOrphans();

    expect(scan.grandTotal).toBe(1);
    expect(scan.entities[0].modules[0].validRoles).toEqual(['staff', 'finance']);
    expect(scan.entities[0].modules[0].owners[0].ownerId).toBe('admin-1');
    expect(SalesLine.find).toHaveBeenCalledWith({ entity_id: 'entity-vip', bdm_id: { $in: ['admin-1'] } });
  });
});

describe('orphanAuditAgent.run', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    Lookup.findOne.mockReturnValue(leanFindOne(null));
    Entity.find.mockReturnValue(leanOf([ENTITY_VIP]));
    User.find.mockReturnValue(leanOf([]));
    cleanModuleMocks();

    countSuccessfulChannels.mockImplementation(
      (results, channel) => (Array.isArray(results) ? results : []).filter((r) => r.channel === channel && r.success).length
    );
    getInAppMessageIds.mockImplementation(
      (results) => (Array.isArray(results) ? results : []).filter((r) => r.channel === 'in_app' && r.success).map((r) => r.messageId)
    );
    notify.mockImplementation(async ({ recipient_id }) => ([
      { channel: 'in_app', success: true, messageId: `msg-${recipient_id}` },
    ]));
  });

  test('clean sweep: no notify(), alerts_generated=0, status=success', async () => {
    const result = await run();

    expect(notify).not.toHaveBeenCalled();
    expect(result.status).toBe('success');
    expect(result.summary.alerts_generated).toBe(0);
    expect(result.summary.messages_sent).toBe(0);
    expect(result.message_ids).toEqual([]);
    expect(result.summary.key_findings[0]).toMatch(/No orphaned/i);
  });

  test('orphans present: fires notify(PRESIDENT) + notify(ALL_ADMINS) with collected message_ids', async () => {
    User.find.mockReturnValue(leanOf([
      { _id: 'admin-1', name: 'Admin Andy', role: 'admin', email: 'andy@vip' },
    ]));
    SalesLine.find.mockReturnValue(leanFind([
      { _id: 's1', bdm_id: 'admin-1', doc_ref: 'CSI-001', csi_date: '2026-04-01', line_total: 1000 },
      { _id: 's2', bdm_id: 'admin-1', doc_ref: 'CSI-002', csi_date: '2026-04-02', line_total: 2000 },
    ]));

    const result = await run();

    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      recipient_id: 'PRESIDENT',
      agent: 'orphan_audit',
      category: 'compliance_alert',
      channels: ['in_app', 'email'],
    }));
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({
      recipient_id: 'ALL_ADMINS',
      agent: 'orphan_audit',
      channels: ['in_app'],
    }));
    expect(result.status).toBe('success');
    expect(result.summary.alerts_generated).toBe(2);
    expect(result.summary.messages_sent).toBe(2);
    expect(result.message_ids).toEqual(['msg-PRESIDENT', 'msg-ALL_ADMINS']);
    expect(result.summary.key_findings[0]).toMatch(/VIP: 2 orphan/);
  });

  test('priority escalates from "important" to "high" when grandTotal > 50', async () => {
    User.find.mockReturnValue(leanOf([
      { _id: 'admin-1', name: 'Admin Andy', role: 'admin', email: 'andy@vip' },
    ]));
    const fiftyOne = Array.from({ length: 51 }, (_, i) => ({
      _id: `s${i}`, bdm_id: 'admin-1', doc_ref: `CSI-${i}`, csi_date: '2026-04-01', line_total: 100,
    }));
    SalesLine.find.mockReturnValue(leanFind(fiftyOne));

    await run();

    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ priority: 'high' }));
  });

  test('returns status=error when mongoose is not connected', async () => {
    const mongoose = require('mongoose');
    mongoose.connection.readyState = 0;
    try {
      const result = await run();
      expect(result.status).toBe('error');
      expect(result.error_msg).toMatch(/not connected/i);
      expect(notify).not.toHaveBeenCalled();
    } finally {
      mongoose.connection.readyState = 1;
    }
  });
});

describe('orphanAuditAgent.buildNotificationBody', () => {
  test('renders entity headers, module rows, owner blocks, ref previews', () => {
    const scan = {
      grandTotal: 4,
      entities: [{
        entityId: 'eid', entityName: 'VIP', totalOrphans: 4,
        modules: [{
          key: 'sales',
          validRoles: ['staff'],
          totalOrphans: 4,
          owners: [
            { ownerId: 'a', ownerName: 'Admin Andy', ownerRole: 'admin', ownerEmail: 'andy@vip', count: 3, refs: ['CSI-1', 'CSI-2', 'CSI-3'] },
            { ownerId: 'b', ownerName: 'Finance Faye', ownerRole: 'finance', ownerEmail: '', count: 1, refs: ['CSI-4'] },
          ],
        }],
      }],
    };

    const body = buildNotificationBody(scan);

    expect(body).toContain('Total orphaned rows across all entities: 4');
    expect(body).toContain('═══ VIP (4 orphan row(s)) ═══');
    expect(body).toContain('[sales] 4 row(s); valid owner roles: staff');
    expect(body).toContain('Admin Andy (admin) <andy@vip> — 3 row(s)');
    expect(body).toContain('refs: CSI-1, CSI-2, CSI-3');
    expect(body).toContain('Finance Faye (finance) — 1 row(s)');
    expect(body).toContain('Repair path:');
  });

  test('truncates output when entities/modules exceed MAX_BODY_LINES', () => {
    const owners = Array.from({ length: 100 }, (_, i) => ({
      ownerId: `o${i}`, ownerName: `Owner ${i}`, ownerRole: 'admin', ownerEmail: '',
      count: 1, refs: [`R-${i}`],
    }));
    const scan = {
      grandTotal: 100,
      entities: Array.from({ length: 10 }, (_, i) => ({
        entityId: `e${i}`, entityName: `Entity ${i}`, totalOrphans: 10,
        modules: [{ key: 'sales', validRoles: ['staff'], totalOrphans: 10, owners: owners.slice(i * 10, i * 10 + 10) }],
      })),
    };

    const body = buildNotificationBody(scan);
    expect(body).toContain('output truncated');
  });
});

/**
 * bdmGuard — Rule #21 silent-self-fill fingerprint tests.
 *
 * The 9 endpoints CLAUDE.md Rule #21 documents (sales, expenses, collections,
 * grns, prf-calf, car-logbook, smer, payroll, journal-entries) are NOT
 * tested by HTTP — that requires DB seed + auth bootstrap and isn't suitable
 * for unit CI. Instead, we test the bug-class fingerprint that bdmGuard uses
 * to FLAG those endpoints at runtime. Any false-negative below would let a
 * Rule-#21 leak slip past the runtime guard.
 *
 * Throw-mode coverage: the throw branch is exercised by the boot-time test
 * (server.js attaches the plugin under BDM_GUARD_MODE=throw and the smoke
 * test confirms the server boots). Pure-logic coverage of the throw payload
 * isn't needed since the throw is a thin wrapper around the same payload
 * tested under "violation fingerprint" below.
 */

const mongoose = require('mongoose');
const {
  extractBdmIdValue,
  isSelfFill,
  resolveMode,
  VALID_MODES,
} = require('../../middleware/bdmGuard');

describe('bdmGuard — extractBdmIdValue', () => {
  test('returns the bdm_id value from a flat filter', () => {
    expect(extractBdmIdValue({ bdm_id: 'user1', status: 'POSTED' })).toBe('user1');
  });

  test('returns the bdm_id value from a nested $and', () => {
    expect(
      extractBdmIdValue({
        $and: [{ status: 'POSTED' }, { bdm_id: 'user1' }],
      })
    ).toBe('user1');
  });

  test('returns the bdm_id value from a nested $or', () => {
    expect(
      extractBdmIdValue({
        $or: [{ bdm_id: 'user1' }, { bdm_id: 'user2' }],
      })
    ).toBe('user1');
  });

  test('returns undefined when no bdm_id present', () => {
    expect(extractBdmIdValue({ status: 'POSTED' })).toBeUndefined();
  });

  test('returns undefined for empty / null input', () => {
    expect(extractBdmIdValue({})).toBeUndefined();
    expect(extractBdmIdValue(null)).toBeUndefined();
  });

  test('returns undefined when bdm_id is null (no real filter value)', () => {
    expect(extractBdmIdValue({ bdm_id: null })).toBeUndefined();
  });
});

describe('bdmGuard — isSelfFill', () => {
  const userId = '64a0b0c0d0e0f0a1b2c3d4e5';

  test('detects exact string equality (the Rule-#21 fingerprint)', () => {
    expect(isSelfFill(userId, userId)).toBe(true);
  });

  test('detects ObjectId equality via .toString()', () => {
    const oid = new mongoose.Types.ObjectId(userId);
    expect(isSelfFill(oid, userId)).toBe(true);
  });

  test('detects $eq operator wrapping the user id', () => {
    expect(isSelfFill({ $eq: userId }, userId)).toBe(true);
  });

  test('returns false when bdm_id refers to a different user', () => {
    expect(isSelfFill('different-user-id', userId)).toBe(false);
  });

  test('returns false when value is null / undefined', () => {
    expect(isSelfFill(null, userId)).toBe(false);
    expect(isSelfFill(undefined, userId)).toBe(false);
  });

  test('returns false when userId is null (avoid the trivially-true case)', () => {
    expect(isSelfFill(userId, null)).toBe(false);
  });

  test('returns false for $in arrays (multi-user filter is not self-fill)', () => {
    // The current detector doesn't drill into $in — that's intentional. A
    // privileged user querying { bdm_id: { $in: [...] } } is doing a
    // legitimate multi-user roll-up, not a silent self-fill.
    expect(isSelfFill({ $in: [userId, 'other'] }, userId)).toBe(false);
  });
});

describe('bdmGuard — resolveMode', () => {
  const ORIGINAL = process.env.BDM_GUARD_MODE;
  afterEach(() => {
    process.env.BDM_GUARD_MODE = ORIGINAL;
  });

  test('default mode is "log" when env var is unset', () => {
    delete process.env.BDM_GUARD_MODE;
    expect(resolveMode()).toBe('log');
  });

  test('accepts log / throw / off and lowercases input', () => {
    expect(VALID_MODES).toEqual(['log', 'throw', 'off']);
    for (const mode of VALID_MODES) {
      process.env.BDM_GUARD_MODE = mode.toUpperCase();
      expect(resolveMode()).toBe(mode);
    }
  });

  test('falls back to "log" on bogus input', () => {
    process.env.BDM_GUARD_MODE = 'panic';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(resolveMode()).toBe('log');
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('bdmGuard — Rule #21 fingerprint, end-to-end logic', () => {
  // Simulates the controller code-path Rule #21 documents:
  //   const bdmId = (privileged && req.query.bdm_id) ? req.query.bdm_id : req.bdmId;
  //   const filter = { entity_id, bdm_id: bdmId };
  // bdmGuard fires when:
  //   - user is privileged
  //   - bdm_id is in filter
  //   - bdm_id equals user's _id (the fallback path was taken)
  //   - request URL had no ?bdm_id= param (the "explicit choice" branch was NOT taken)

  const presidentId = '111111111111111111111111';
  const buildPrivilegedSelfFillFilter = () => ({
    entity_id: 'entity1',
    bdm_id: presidentId, // ← the bug: filter says president's id even though president is not a BDM
  });

  test('fingerprint matches: privileged + own _id + no explicit param', () => {
    const filter = buildPrivilegedSelfFillFilter();
    expect(extractBdmIdValue(filter)).toBe(presidentId);
    expect(isSelfFill(presidentId, presidentId)).toBe(true);
  });

  test('fingerprint clears when user explicitly passed ?bdm_id= for someone else', () => {
    const otherBdm = '222222222222222222222222';
    const filter = { entity_id: 'entity1', bdm_id: otherBdm };
    expect(extractBdmIdValue(filter)).toBe(otherBdm);
    expect(isSelfFill(otherBdm, presidentId)).toBe(false);
  });

  test('fingerprint clears when controller correctly returns null for privileged users', () => {
    // Per Rule #21 the correct pattern is:
    //   const bdmId = privileged ? (req.query.bdm_id || null) : req.bdmId;
    //   if (bdmId) match.bdm_id = bdmId;
    // → no bdm_id key in the filter at all.
    const filter = { entity_id: 'entity1' };
    expect(extractBdmIdValue(filter)).toBeUndefined();
  });
});

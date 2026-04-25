/**
 * entityGuard fingerprint + mode resolver tests.
 *
 * Pure unit — does NOT touch Mongoose plugin registration (that lives
 * inside server.js boot). The bug-class detection logic IS the regression
 * surface: anything that returns false-negative below is a leak in prod.
 */

const {
  filterHasEntityId,
  pipelineHasEntityMatch,
  resolveMode,
  VALID_MODES,
} = require('../../middleware/entityGuard');

describe('entityGuard — filterHasEntityId', () => {
  test('returns true for direct entity_id key', () => {
    expect(filterHasEntityId({ entity_id: 'abc' })).toBe(true);
  });

  test('returns true for entity_id: null (still a filter, just nullable)', () => {
    expect(filterHasEntityId({ entity_id: null })).toBe(true);
  });

  test('returns true when entity_id is nested under $and', () => {
    expect(
      filterHasEntityId({ $and: [{ status: 'POSTED' }, { entity_id: 'abc' }] })
    ).toBe(true);
  });

  test('returns true when entity_id is nested under $or', () => {
    expect(
      filterHasEntityId({ $or: [{ entity_id: 'abc' }, { entity_id: 'def' }] })
    ).toBe(true);
  });

  test('returns false for filter without entity_id', () => {
    expect(filterHasEntityId({ status: 'POSTED', user: 'abc' })).toBe(false);
  });

  test('returns false for empty filter (the .find() leak case)', () => {
    expect(filterHasEntityId({})).toBe(false);
  });

  test('returns false for null / undefined input', () => {
    expect(filterHasEntityId(null)).toBe(false);
    expect(filterHasEntityId(undefined)).toBe(false);
  });

  test('does not infinite-loop on circular structures (depth guard)', () => {
    const a = { $and: [] };
    a.$and.push(a);
    // Should return false rather than throw — depth limit terminates recursion.
    expect(() => filterHasEntityId(a)).not.toThrow();
    expect(filterHasEntityId(a)).toBe(false);
  });
});

describe('entityGuard — pipelineHasEntityMatch', () => {
  test('returns true when $match stage filters by entity_id', () => {
    expect(
      pipelineHasEntityMatch([
        { $match: { entity_id: 'abc' } },
        { $group: { _id: '$status' } },
      ])
    ).toBe(true);
  });

  test('returns false when no $match stage filters by entity_id', () => {
    expect(
      pipelineHasEntityMatch([
        { $match: { status: 'POSTED' } },
        { $group: { _id: '$status' } },
      ])
    ).toBe(false);
  });

  test('returns false for non-array input', () => {
    expect(pipelineHasEntityMatch(null)).toBe(false);
    expect(pipelineHasEntityMatch({})).toBe(false);
  });
});

describe('entityGuard — resolveMode', () => {
  const ORIGINAL = process.env.ENTITY_GUARD_MODE;
  afterEach(() => {
    process.env.ENTITY_GUARD_MODE = ORIGINAL;
  });

  test('default mode is "log" when env var is unset', () => {
    delete process.env.ENTITY_GUARD_MODE;
    expect(resolveMode()).toBe('log');
  });

  test('accepts "log" / "throw" / "off"', () => {
    expect(VALID_MODES).toEqual(['log', 'throw', 'off']);
    for (const mode of VALID_MODES) {
      process.env.ENTITY_GUARD_MODE = mode;
      expect(resolveMode()).toBe(mode);
    }
  });

  test('lowercases mixed-case input', () => {
    process.env.ENTITY_GUARD_MODE = 'THROW';
    expect(resolveMode()).toBe('throw');
  });

  test('falls back to "log" on invalid input (warns but does not crash)', () => {
    process.env.ENTITY_GUARD_MODE = 'banana';
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(resolveMode()).toBe('log');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

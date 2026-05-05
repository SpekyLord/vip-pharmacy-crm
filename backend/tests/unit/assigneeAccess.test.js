/**
 * Phase A.5.4 — Unit tests for the shape-agnostic Doctor assignee helper.
 * Asserts behavior across populated array, unpopulated array, legacy scalar,
 * and missing/null assignedTo so callers can rely on the helper everywhere.
 */

const {
  normalizeUserId,
  getAssigneeIds,
  isAssignedTo,
  getPrimaryAssigneeId,
  getPrimaryAssigneeObject,
} = require('../../utils/assigneeAccess');

describe('assigneeAccess helper (Phase A.5.4)', () => {
  describe('normalizeUserId', () => {
    test('returns null for null/undefined', () => {
      expect(normalizeUserId(null)).toBeNull();
      expect(normalizeUserId(undefined)).toBeNull();
    });

    test('returns string as-is', () => {
      expect(normalizeUserId('abc123')).toBe('abc123');
    });

    test('extracts _id from populated object', () => {
      expect(normalizeUserId({ _id: 'u1', name: 'Mae' })).toBe('u1');
    });

    test('falls back to .toString() for ObjectId-like values', () => {
      const fake = { toString: () => 'objId-abc' };
      expect(normalizeUserId(fake)).toBe('objId-abc');
    });
  });

  describe('getAssigneeIds', () => {
    test('returns [] when doctor is null/undefined', () => {
      expect(getAssigneeIds(null)).toEqual([]);
      expect(getAssigneeIds(undefined)).toEqual([]);
    });

    test('returns [] when assignedTo is missing', () => {
      expect(getAssigneeIds({})).toEqual([]);
      expect(getAssigneeIds({ assignedTo: null })).toEqual([]);
      expect(getAssigneeIds({ assignedTo: [] })).toEqual([]);
    });

    test('handles unpopulated array', () => {
      expect(getAssigneeIds({ assignedTo: ['u1', 'u2'] })).toEqual(['u1', 'u2']);
    });

    test('handles populated array', () => {
      expect(getAssigneeIds({ assignedTo: [{ _id: 'u1', name: 'A' }, { _id: 'u2', name: 'B' }] }))
        .toEqual(['u1', 'u2']);
    });

    test('handles legacy scalar (defensive — pre-A.5.4 docs)', () => {
      expect(getAssigneeIds({ assignedTo: 'u1' })).toEqual(['u1']);
      expect(getAssigneeIds({ assignedTo: { _id: 'u1' } })).toEqual(['u1']);
    });
  });

  describe('isAssignedTo', () => {
    test('returns false on falsy userId', () => {
      expect(isAssignedTo({ assignedTo: ['u1'] }, null)).toBe(false);
      expect(isAssignedTo({ assignedTo: ['u1'] }, undefined)).toBe(false);
    });

    test('returns true when user is in array', () => {
      expect(isAssignedTo({ assignedTo: ['u1', 'u2'] }, 'u1')).toBe(true);
      expect(isAssignedTo({ assignedTo: ['u1', 'u2'] }, 'u2')).toBe(true);
    });

    test('returns false when user is not in array', () => {
      expect(isAssignedTo({ assignedTo: ['u1', 'u2'] }, 'u99')).toBe(false);
    });

    test('returns true for legacy scalar matching', () => {
      expect(isAssignedTo({ assignedTo: 'u1' }, 'u1')).toBe(true);
      expect(isAssignedTo({ assignedTo: 'u1' }, 'u99')).toBe(false);
    });

    test('handles populated user objects on either side', () => {
      const doctor = { assignedTo: [{ _id: 'u1', name: 'A' }] };
      expect(isAssignedTo(doctor, { toString: () => 'u1' })).toBe(true);
      expect(isAssignedTo(doctor, 'u1')).toBe(true);
    });
  });

  describe('getPrimaryAssigneeId', () => {
    test('returns null when nothing set', () => {
      expect(getPrimaryAssigneeId({})).toBeNull();
      expect(getPrimaryAssigneeId({ assignedTo: [] })).toBeNull();
    });

    test('prefers primaryAssignee when set', () => {
      const doctor = { assignedTo: ['u1', 'u2'], primaryAssignee: 'u2' };
      expect(getPrimaryAssigneeId(doctor)).toBe('u2');
    });

    test('falls back to first assignee when primary is unset', () => {
      const doctor = { assignedTo: ['u1', 'u2'] };
      expect(getPrimaryAssigneeId(doctor)).toBe('u1');
    });

    test('handles populated primary', () => {
      const doctor = {
        assignedTo: [{ _id: 'u1' }, { _id: 'u2' }],
        primaryAssignee: { _id: 'u2' },
      };
      expect(getPrimaryAssigneeId(doctor)).toBe('u2');
    });
  });

  describe('getPrimaryAssigneeObject', () => {
    test('returns null when no assignees', () => {
      expect(getPrimaryAssigneeObject({})).toBeNull();
      expect(getPrimaryAssigneeObject({ assignedTo: [] })).toBeNull();
    });

    test('returns the populated entry whose _id matches primaryAssignee', () => {
      const a = { _id: 'u1', name: 'Mae' };
      const b = { _id: 'u2', name: 'Romela' };
      const doctor = { assignedTo: [a, b], primaryAssignee: 'u2' };
      expect(getPrimaryAssigneeObject(doctor)).toBe(b);
    });

    test('returns first assignee when primary is unknown', () => {
      const a = { _id: 'u1', name: 'Mae' };
      const doctor = { assignedTo: [a] };
      expect(getPrimaryAssigneeObject(doctor)).toBe(a);
    });

    test('returns legacy scalar as-is', () => {
      const doctor = { assignedTo: 'u1' };
      expect(getPrimaryAssigneeObject(doctor)).toBe('u1');
    });
  });
});

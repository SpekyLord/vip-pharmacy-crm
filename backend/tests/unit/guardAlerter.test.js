/**
 * guardAlerter unit tests — dedup window, recipient resolution, alert body.
 *
 * Covers the user-visible surface of a tenant-guard violation: the
 * MessageInbox alert that lands in admin inboxes when prod fires a
 * log-mode violation. notify() itself is not exercised here (it has its
 * own tests + uses real DB + Resend); we test the dedup + recipient
 * resolution + body shaping, which are pure functions.
 */

const {
  shouldEmitAlert,
  buildAlertBody,
  buildAlertTitle,
  resolveRecipient,
  maybeAlert,
  _resetDedupForTests,
  DEDUP_WINDOW_MS,
} = require('../../middleware/guardAlerter');

beforeEach(() => {
  _resetDedupForTests();
});

describe('guardAlerter — shouldEmitAlert (dedup)', () => {
  test('first call for a key emits', () => {
    expect(
      shouldEmitAlert('entity_filter_missing', 'SmerEntry', 'GET /api/erp/sales')
    ).toBe(true);
  });

  test('second call within window suppresses', () => {
    shouldEmitAlert('entity_filter_missing', 'SmerEntry', 'GET /api/erp/sales');
    expect(
      shouldEmitAlert('entity_filter_missing', 'SmerEntry', 'GET /api/erp/sales')
    ).toBe(false);
  });

  test('different model bypasses dedup', () => {
    shouldEmitAlert('entity_filter_missing', 'SmerEntry', 'GET /api/erp/sales');
    expect(
      shouldEmitAlert('entity_filter_missing', 'ExpenseEntry', 'GET /api/erp/sales')
    ).toBe(true);
  });

  test('different request path bypasses dedup', () => {
    shouldEmitAlert('entity_filter_missing', 'SmerEntry', 'GET /api/erp/sales');
    expect(
      shouldEmitAlert('entity_filter_missing', 'SmerEntry', 'GET /api/erp/expenses')
    ).toBe(true);
  });

  test('different kind bypasses dedup', () => {
    shouldEmitAlert('entity_filter_missing', 'SmerEntry', 'GET /api/erp/sales');
    expect(
      shouldEmitAlert('bdm_silent_self_fill', 'SmerEntry', 'GET /api/erp/sales')
    ).toBe(true);
  });

  test('expired window re-emits', () => {
    const realDateNow = Date.now;
    const startedAt = realDateNow();
    Date.now = jest.fn(() => startedAt);
    try {
      expect(
        shouldEmitAlert('entity_filter_missing', 'SmerEntry', 'GET /api/erp/sales')
      ).toBe(true);
      // jump past the dedup window
      Date.now = jest.fn(() => startedAt + DEDUP_WINDOW_MS + 1);
      expect(
        shouldEmitAlert('entity_filter_missing', 'SmerEntry', 'GET /api/erp/sales')
      ).toBe(true);
    } finally {
      Date.now = realDateNow;
    }
  });
});

describe('guardAlerter — resolveRecipient', () => {
  const ORIGINAL = process.env.ENTITY_GUARD_ALERT_RECIPIENT;
  afterEach(() => {
    process.env.ENTITY_GUARD_ALERT_RECIPIENT = ORIGINAL;
  });

  test('default resolves to ALL_ADMINS', () => {
    delete process.env.ENTITY_GUARD_ALERT_RECIPIENT;
    expect(resolveRecipient()).toBe('ALL_ADMINS');
  });

  test('passes through valid enum strings', () => {
    process.env.ENTITY_GUARD_ALERT_RECIPIENT = 'PRESIDENT';
    expect(resolveRecipient()).toBe('PRESIDENT');
  });

  test('passes through 24-char ObjectId hex', () => {
    process.env.ENTITY_GUARD_ALERT_RECIPIENT = 'aabbccddeeff00112233445566';
    // 26 chars → invalid. Use exactly 24.
    process.env.ENTITY_GUARD_ALERT_RECIPIENT = 'aabbccddeeff001122334455';
    expect(resolveRecipient()).toBe('aabbccddeeff001122334455');
  });

  test('falls back to ALL_ADMINS for invalid input', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      process.env.ENTITY_GUARD_ALERT_RECIPIENT = 'invalid-id';
      expect(resolveRecipient()).toBe('ALL_ADMINS');
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe('guardAlerter — buildAlertBody / buildAlertTitle', () => {
  test('entity_filter_missing body explains the leak class', () => {
    const body = buildAlertBody({
      kind: 'entity_filter_missing',
      model: 'SmerEntry',
      requestPath: 'GET /api/erp/sales',
      payload: {
        requestId: 'req_abc',
        userId: 'u1',
        role: 'admin',
        entityId: 'e1',
        filterKeys: ['status', 'createdAt'],
        stack: ['at fooController (./controllers/foo.js:42:1)'],
      },
    });
    expect(body).toContain('entity-scoped model');
    expect(body).toContain('SmerEntry');
    expect(body).toContain('GET /api/erp/sales');
    expect(body).toContain('req_abc');
    expect(body).toContain('Filter keys:  status, createdAt');
    expect(body).toContain('docs/RUNBOOK.md');
  });

  test('bdm_silent_self_fill body cites Rule #21', () => {
    const body = buildAlertBody({
      kind: 'bdm_silent_self_fill',
      model: 'ExpenseEntry',
      requestPath: 'GET /api/erp/expenses',
      payload: {},
    });
    expect(body).toContain('Rule #21');
    expect(body).toContain('silent-self-fill');
  });

  test('title encodes both kind and model', () => {
    expect(buildAlertTitle({ kind: 'entity_filter_missing', model: 'SmerEntry' }))
      .toBe('[GUARD] Missing entity filter on SmerEntry');
    expect(buildAlertTitle({ kind: 'bdm_silent_self_fill', model: 'ExpenseEntry' }))
      .toBe('[GUARD] Rule #21 self-fill on ExpenseEntry');
  });
});

describe('guardAlerter — maybeAlert (production gating)', () => {
  const ORIGINAL_NODE_ENV = process.env.NODE_ENV;
  afterEach(() => {
    process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  });

  test('is a no-op outside production (no setImmediate, no notify load)', () => {
    process.env.NODE_ENV = 'development';
    const setImmediateSpy = jest.spyOn(global, 'setImmediate');
    try {
      maybeAlert({
        kind: 'entity_filter_missing',
        model: 'SmerEntry',
        requestPath: 'GET /test',
        payload: {},
      });
      expect(setImmediateSpy).not.toHaveBeenCalled();
    } finally {
      setImmediateSpy.mockRestore();
    }
  });

  test('schedules a deferred dispatch in production', () => {
    process.env.NODE_ENV = 'production';
    const setImmediateSpy = jest.spyOn(global, 'setImmediate').mockImplementation(() => {
      // swallow the deferred callback so we don't actually try to require()
      // notificationService inside this unit test.
      return null;
    });
    try {
      maybeAlert({
        kind: 'entity_filter_missing',
        model: 'SmerEntry',
        requestPath: 'GET /test-prod-1',
        payload: {},
      });
      expect(setImmediateSpy).toHaveBeenCalledTimes(1);
    } finally {
      setImmediateSpy.mockRestore();
    }
  });

  test('respects dedup in production (second call within window does not schedule)', () => {
    process.env.NODE_ENV = 'production';
    const setImmediateSpy = jest.spyOn(global, 'setImmediate').mockImplementation(() => null);
    try {
      maybeAlert({
        kind: 'entity_filter_missing',
        model: 'SmerEntry',
        requestPath: 'GET /test-prod-2',
        payload: {},
      });
      maybeAlert({
        kind: 'entity_filter_missing',
        model: 'SmerEntry',
        requestPath: 'GET /test-prod-2',
        payload: {},
      });
      expect(setImmediateSpy).toHaveBeenCalledTimes(1);
    } finally {
      setImmediateSpy.mockRestore();
    }
  });
});

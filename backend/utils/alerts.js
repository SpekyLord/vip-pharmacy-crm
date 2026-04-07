/**
 * Operational alert helper.
 *
 * Alerts are always logged. If ALERT_WEBHOOK_URL is configured, alerts are
 * also posted to the webhook for external paging/notification systems.
 */

const { logError, logWarn } = require('./logger');

const sendOperationalAlert = async ({
  severity = 'error',
  source = 'unknown',
  event = 'unspecified',
  message,
  error,
  metadata = {},
}) => {
  const payload = {
    source,
    event,
    severity,
    message,
    error: error ? String(error) : undefined,
    metadata,
    timestamp: new Date().toISOString(),
  };

  if (severity === 'warn') {
    logWarn('operational_alert', payload);
  } else {
    logError('operational_alert', payload);
  }

  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (!webhookUrl) return;

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      logWarn('operational_alert_webhook_failed', {
        status: response.status,
        source,
        event,
      });
    }
  } catch (webhookErr) {
    logWarn('operational_alert_webhook_error', {
      source,
      event,
      error: webhookErr.message,
    });
  }
};

module.exports = {
  sendOperationalAlert,
};


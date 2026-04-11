const VALID_ENGAGEMENT_TYPES = Object.freeze([
  'TXT_PROMATS',
  'MES_VIBER_GIF',
  'PICTURE',
  'SIGNED_CALL',
  'VOICE_CALL',
  'WHATSAPP_CALL',
  'WHATSAPP_MSG',
  'VIBER_CALL',
  'VIBER_MSG',
  'EMAIL_FOLLOWUP',
  'SMS_FOLLOWUP',
]);

const normalizeEngagementTypesQuery = (value) => {
  if (!value) return [];

  const rawValues = Array.isArray(value) ? value : [value];
  const normalized = rawValues
    .flatMap((entry) => String(entry).split(','))
    .map((entry) => entry.trim())
    .filter(Boolean)
    .filter((entry, index, arr) => arr.indexOf(entry) === index)
    .filter((entry) => VALID_ENGAGEMENT_TYPES.includes(entry));

  return normalized;
};

module.exports = {
  VALID_ENGAGEMENT_TYPES,
  normalizeEngagementTypesQuery,
};

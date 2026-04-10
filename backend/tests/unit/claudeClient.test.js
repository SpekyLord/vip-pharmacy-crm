const { normalizeClaudeError } = require('../../agents/claudeClient');

describe('claudeClient normalizeClaudeError', () => {
  test('maps invalid Anthropic API key errors to a readable auth message', () => {
    const normalized = normalizeClaudeError({
      status: 401,
      message: '401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
    });

    expect(normalized).toBeInstanceOf(Error);
    expect(normalized.status).toBe(401);
    expect(normalized.code).toBe('ANTHROPIC_AUTH');
    expect(normalized.message).toBe('Anthropic authentication failed. Update ANTHROPIC_API_KEY in the backend environment.');
  });

  test('passes unrelated errors through unchanged', () => {
    const original = new Error('temporary upstream error');
    const normalized = normalizeClaudeError(original);

    expect(normalized).toBe(original);
    expect(normalized.message).toBe('temporary upstream error');
  });
});

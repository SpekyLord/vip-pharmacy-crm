/**
 * Shared Claude API Client — wraps @anthropic-ai/sdk with retry, rate limit, cost tracking
 *
 * Usage:
 *   const { askClaude, estimateCost } = require('./claudeClient');
 *   const result = await askClaude({ system, prompt, maxTokens });
 */
const Anthropic = require('@anthropic-ai/sdk');

let client = null;

function normalizeClaudeError(err) {
  const rawMessage = [
    err?.message,
    err?.error?.message,
    err?.response?.data?.message,
  ]
    .filter(Boolean)
    .join(' ');

  if (
    err?.status === 401 ||
    /invalid x-api-key/i.test(rawMessage) ||
    /invalid authentication credentials/i.test(rawMessage) ||
    /authentication_error/i.test(rawMessage)
  ) {
    const authError = new Error('Anthropic authentication failed. Update ANTHROPIC_API_KEY in the backend environment.');
    authError.status = 401;
    authError.code = 'ANTHROPIC_AUTH';
    return authError;
  }

  return err;
}

function getClient() {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set in environment');
    client = new Anthropic({ apiKey });
  }
  return client;
}

// Cost tracking (per session — resets on server restart)
const costLog = [];

/**
 * Send a prompt to Claude and get a text response.
 *
 * @param {Object} opts
 * @param {string} opts.system - System prompt
 * @param {string} opts.prompt - User prompt
 * @param {number} [opts.maxTokens=1024] - Max response tokens
 * @param {string} [opts.model='claude-haiku-4-5-20251001'] - Model ID (haiku for cost efficiency)
 * @param {number} [opts.retries=2] - Retry count on transient failures
 * @param {string} [opts.agent] - Agent name for cost tracking
 * @returns {{ text: string, usage: { input_tokens, output_tokens }, cost: number }}
 */
async function askClaude({ system, prompt, maxTokens = 1024, model = 'claude-haiku-4-5-20251001', retries = 2, agent = 'unknown' }) {
  const claude = getClient();
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await claude.messages.create({
        model,
        max_tokens: maxTokens,
        system: system || undefined,
        messages: [{ role: 'user', content: prompt }]
      });

      const text = response.content
        .filter(c => c.type === 'text')
        .map(c => c.text)
        .join('');

      const usage = response.usage || {};
      const cost = estimateCost(model, usage.input_tokens || 0, usage.output_tokens || 0);

      // Log cost
      costLog.push({
        agent,
        model,
        input_tokens: usage.input_tokens || 0,
        output_tokens: usage.output_tokens || 0,
        cost,
        timestamp: new Date()
      });

      return { text, usage, cost };
    } catch (err) {
      lastError = normalizeClaudeError(err);

      // Rate limit — wait and retry
      if (lastError.status === 429 && attempt < retries) {
        const wait = Math.min(2000 * (attempt + 1), 10000);
        console.warn(`[ClaudeClient] Rate limited, retrying in ${wait}ms (attempt ${attempt + 1}/${retries})`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      // Overloaded — wait longer
      if (lastError.status === 529 && attempt < retries) {
        const wait = 5000 * (attempt + 1);
        console.warn(`[ClaudeClient] API overloaded, retrying in ${wait}ms`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }

      // Non-retryable
      if (lastError.status && lastError.status < 500 && lastError.status !== 429) break;

      // Server error — retry
      if (attempt < retries) {
        await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError || new Error('Claude API call failed');
}

/**
 * Estimate cost in USD based on model pricing.
 * Haiku 4.5: $0.80/MTok in, $4/MTok out
 * Sonnet 4.6: $3/MTok in, $15/MTok out
 */
function estimateCost(model, inputTokens, outputTokens) {
  const pricing = {
    'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
    'claude-sonnet-4-6-20250514': { input: 3.00, output: 15.00 },
  };
  // Default to haiku pricing
  const p = pricing[model] || pricing['claude-haiku-4-5-20251001'];
  return parseFloat(((inputTokens * p.input + outputTokens * p.output) / 1_000_000).toFixed(6));
}

/**
 * Get cost summary for budget monitoring.
 */
function getCostSummary() {
  const byAgent = {};
  let totalCost = 0;
  for (const entry of costLog) {
    if (!byAgent[entry.agent]) byAgent[entry.agent] = { calls: 0, cost: 0, tokens: 0 };
    byAgent[entry.agent].calls++;
    byAgent[entry.agent].cost += entry.cost;
    byAgent[entry.agent].tokens += entry.input_tokens + entry.output_tokens;
    totalCost += entry.cost;
  }
  return { totalCost: parseFloat(totalCost.toFixed(6)), byAgent, totalCalls: costLog.length };
}

module.exports = { askClaude, estimateCost, getCostSummary, normalizeClaudeError };

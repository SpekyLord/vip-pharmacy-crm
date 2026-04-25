/**
 * explainAggregation.js — MongoDB aggregation EXPLAIN harness
 *
 * Three entry points:
 *   1. explainOne(model, pipeline, opts)        — ad-hoc one-shot explain
 *   2. installAggregateInterceptor({ labels })  — monkey-patch that captures
 *      every Model.aggregate(...) call and runs .explain('executionStats')
 *      instead, returning [] to the caller so downstream code keeps running.
 *      Returns { captured, setLabel, restore }.
 *   3. analyzeCaptured(captured, { largeCollectionThreshold, ratioThreshold })
 *      — walks the plans, flags COLLSCAN + poor selectivity + missing $lookup
 *      indexes, and formats a markdown report.
 *
 * The interceptor avoids recursion by routing its own explain through the
 * native driver (Model.collection.aggregate(...).explain()), which does NOT
 * go through mongoose.Aggregate.prototype.exec.
 */
'use strict';

const mongoose = require('mongoose');

function extractMatchKeys(pipeline) {
  const first = pipeline.find(s => s.$match);
  if (!first) return [];
  return Object.keys(first.$match).filter(k => !k.startsWith('$'));
}

function extractLookups(pipeline) {
  return pipeline
    .filter(s => s.$lookup)
    .map(s => ({
      from: s.$lookup.from,
      localField: s.$lookup.localField || null,
      foreignField: s.$lookup.foreignField || null,
      hasSubPipeline: Array.isArray(s.$lookup.pipeline),
    }));
}

function walkPlan(node, visit) {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const k of Object.keys(node)) {
    const v = node[k];
    if (Array.isArray(v)) v.forEach(item => walkPlan(item, visit));
    else if (v && typeof v === 'object') walkPlan(v, visit);
  }
}

function summarizeExplain(explain) {
  const summary = {
    stages: [],
    collScans: [],
    totalDocsExamined: 0,
    totalKeysExamined: 0,
    nReturned: 0,
    executionTimeMillis: 0,
    indexesUsedByLookup: [], // [{ from, indexName|null, docsExamined }]
  };

  walkPlan(explain, node => {
    if (node.stage === 'COLLSCAN') {
      summary.collScans.push({
        inputCollection: node.direction || 'forward',
        nReturned: node.nReturned,
      });
    }
    if (typeof node.totalDocsExamined === 'number' && summary.totalDocsExamined === 0) {
      summary.totalDocsExamined = node.totalDocsExamined;
    }
    if (typeof node.totalKeysExamined === 'number' && summary.totalKeysExamined === 0) {
      summary.totalKeysExamined = node.totalKeysExamined;
    }
    if (typeof node.nReturned === 'number' && summary.nReturned === 0) {
      summary.nReturned = node.nReturned;
    }
    if (typeof node.executionTimeMillis === 'number' && summary.executionTimeMillis === 0) {
      summary.executionTimeMillis = node.executionTimeMillis;
    }
  });

  if (Array.isArray(explain.stages)) {
    for (const st of explain.stages) {
      if (st.$lookup) {
        const es = st.$lookup.executionStats || {};
        summary.indexesUsedByLookup.push({
          from: st.$lookup.from,
          indexName: es.indexesUsed && es.indexesUsed[0] ? es.indexesUsed[0] : null,
          totalDocsExamined: es.totalDocsExamined || 0,
          totalKeysExamined: es.totalKeysExamined || 0,
          nReturned: es.nReturned || 0,
        });
      }
      summary.stages.push(Object.keys(st)[0]);
    }
  }

  return summary;
}

async function runExplain(model, pipeline) {
  const coll = model.collection;
  const cursor = coll.aggregate(pipeline, { allowDiskUse: true });
  return cursor.explain('executionStats');
}

async function explainOne(model, pipeline, opts = {}) {
  const explain = await runExplain(model, pipeline);
  return {
    label: opts.label || `${model.modelName}.aggregate`,
    model: model.modelName,
    collection: model.collection.collectionName,
    pipeline,
    matchKeys: extractMatchKeys(pipeline),
    lookups: extractLookups(pipeline),
    summary: summarizeExplain(explain),
    raw: opts.includeRaw ? explain : undefined,
  };
}

function installAggregateInterceptor(opts = {}) {
  const captured = [];
  let currentLabel = null;
  const verbose = !!opts.verbose;

  const Aggregate = mongoose.Aggregate;
  const origExec = Aggregate.prototype.exec;

  Aggregate.prototype.exec = async function patchedExec() {
    const model = this._model;
    const pipeline = this.pipeline();

    if (!model || !pipeline || pipeline.length === 0) {
      return origExec.apply(this, arguments);
    }

    try {
      const explain = await runExplain(model, pipeline);
      captured.push({
        label: currentLabel || `${model.modelName}.aggregate`,
        model: model.modelName,
        collection: model.collection.collectionName,
        pipeline,
        matchKeys: extractMatchKeys(pipeline),
        lookups: extractLookups(pipeline),
        summary: summarizeExplain(explain),
      });
      if (verbose) {
        // eslint-disable-next-line no-console
        console.log(`  [explained] ${currentLabel || '?'} :: ${model.modelName}`);
      }
    } catch (err) {
      captured.push({
        label: currentLabel || `${model.modelName}.aggregate`,
        model: model.modelName,
        collection: model.collection?.collectionName,
        pipeline,
        error: err.message,
      });
    }

    return [];
  };

  return {
    captured,
    setLabel: label => { currentLabel = label; },
    restore: () => { Aggregate.prototype.exec = origExec; },
  };
}

function indexCoversMatch(indexes, matchKeys) {
  if (matchKeys.length === 0) return { covered: false, bestIndex: null };
  for (const idx of indexes) {
    const prefix = Object.keys(idx.key);
    const covers = matchKeys.every(k => prefix.includes(k));
    if (covers) return { covered: true, bestIndex: idx.name };
  }
  return { covered: false, bestIndex: null };
}

function analyzeCaptured(captured, opts = {}) {
  const ratioThreshold = opts.ratioThreshold ?? 10;
  const docsExaminedThreshold = opts.docsExaminedThreshold ?? 10000;

  const rows = [];
  for (const cap of captured) {
    if (cap.error) {
      rows.push({
        label: cap.label,
        model: cap.model,
        status: 'ERROR',
        flags: [`explain failed: ${cap.error}`],
        metrics: {},
      });
      continue;
    }

    const s = cap.summary;
    const flags = [];
    const suggestions = [];

    if (s.collScans.length > 0) {
      flags.push(`COLLSCAN x${s.collScans.length}`);
    }

    const ratio = s.nReturned > 0 ? (s.totalDocsExamined / s.nReturned) : s.totalDocsExamined;
    if (s.totalDocsExamined >= docsExaminedThreshold && ratio > ratioThreshold) {
      flags.push(`poor selectivity (${s.totalDocsExamined} examined / ${s.nReturned} returned)`);
    }

    if (!cap.matchKeys.includes('entity_id')) {
      flags.push('missing entity_id in initial $match (Rule #19)');
      suggestions.push(`Prefix initial $match with entity_id for ${cap.collection}.`);
    }

    for (const lk of s.indexesUsedByLookup) {
      if (!lk.indexName && lk.totalDocsExamined > 0) {
        flags.push(`$lookup(${lk.from}) COLLSCAN (${lk.totalDocsExamined} examined)`);
        suggestions.push(`Add index on ${lk.from}.${cap.lookups.find(l => l.from === lk.from)?.foreignField || '?'} (or entity_id + foreignField compound).`);
      }
    }

    if (flags.length === 0 && cap.matchKeys.length > 0) {
      const needed = cap.matchKeys.filter(k => k !== '$expr' && !k.startsWith('$'));
      if (needed.length > 0) {
        suggestions.push(`Verify compound index on ${cap.collection}: { ${needed.join(': 1, ')}: 1 }`);
      }
    }

    rows.push({
      label: cap.label,
      model: cap.model,
      collection: cap.collection,
      status: flags.length === 0 ? 'OK' : 'FLAG',
      flags,
      suggestions,
      metrics: {
        nReturned: s.nReturned,
        docsExamined: s.totalDocsExamined,
        keysExamined: s.totalKeysExamined,
        timeMs: s.executionTimeMillis,
        stages: s.stages.join(' > '),
      },
      lookups: cap.lookups,
      matchKeys: cap.matchKeys,
    });
  }
  return rows;
}

function formatReport(rows) {
  const lines = [];
  lines.push('# Reporting Aggregation EXPLAIN Report');
  lines.push('');
  lines.push(`Total pipelines captured: ${rows.length}`);
  const flagged = rows.filter(r => r.status === 'FLAG').length;
  const errored = rows.filter(r => r.status === 'ERROR').length;
  lines.push(`FLAG: ${flagged}  ERROR: ${errored}  OK: ${rows.length - flagged - errored}`);
  lines.push('');
  lines.push('| # | Label | Model | docsExamined | nReturned | time(ms) | Flags |');
  lines.push('|---|-------|-------|--------------|-----------|----------|-------|');
  rows.forEach((r, i) => {
    const m = r.metrics || {};
    const flags = r.flags.length ? r.flags.join('; ') : '—';
    lines.push(`| ${i + 1} | ${r.label} | ${r.model || '—'} | ${m.docsExamined ?? '—'} | ${m.nReturned ?? '—'} | ${m.timeMs ?? '—'} | ${flags} |`);
  });
  lines.push('');

  const withSuggestions = rows.filter(r => r.suggestions && r.suggestions.length);
  if (withSuggestions.length) {
    lines.push('## Index Suggestions');
    lines.push('');
    for (const r of withSuggestions) {
      lines.push(`- **${r.label}** (${r.collection})`);
      for (const s of r.suggestions) lines.push(`  - ${s}`);
    }
    lines.push('');
  }

  const flaggedRows = rows.filter(r => r.status === 'FLAG');
  if (flaggedRows.length) {
    lines.push('## Flagged Pipelines (detail)');
    lines.push('');
    for (const r of flaggedRows) {
      lines.push(`### ${r.label}`);
      lines.push(`- Collection: ${r.collection}`);
      lines.push(`- Match keys: ${r.matchKeys.join(', ') || '(none)'}`);
      lines.push(`- $lookup targets: ${r.lookups.map(l => `${l.from}.${l.foreignField || '(pipeline)'}`).join(', ') || '(none)'}`);
      lines.push(`- Stages: ${r.metrics.stages}`);
      lines.push(`- Flags: ${r.flags.join('; ')}`);
      lines.push('');
    }
  }
  return lines.join('\n');
}

module.exports = {
  explainOne,
  installAggregateInterceptor,
  analyzeCaptured,
  formatReport,
  indexCoversMatch,
  summarizeExplain,
};

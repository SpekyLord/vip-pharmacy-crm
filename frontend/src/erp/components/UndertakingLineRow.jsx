/**
 * UndertakingLineRow — Phase 32R (read-only)
 *
 * Renders one mirrored line from a captured GRN. All capture happens on
 * GrnEntry; the Undertaking page just displays what was captured so BDM and
 * approver can double-check. No inputs, no onChange — React.memo keeps the
 * table cheap even for 30+ lines.
 *
 * Display rules:
 *   - Product label: "brand_name dosage_strength — unit_code" (global rule #4)
 *   - Expected qty (from GRN auto-creation)
 *   - Received qty (plain number; background color if variance_flag set)
 *   - Batch/lot # (plain text; ✓ marker if scan_confirmed)
 *   - Expiry (date + days-to-expiry color band: red<30, amber<90, green)
 *   - Variance badge from line.variance_flag (computed server-side at UT create)
 */
import { memo, useMemo } from 'react';

function varianceLabel(flag) {
  switch (flag) {
    case 'QTY_UNDER': return { text: 'Qty Under', bg: '#fef3c7', fg: '#92400e' };
    case 'QTY_OVER': return { text: 'Qty Over', bg: '#fef3c7', fg: '#92400e' };
    case 'NEAR_EXPIRY': return { text: 'Near Expiry', bg: '#fee2e2', fg: '#991b1b' };
    case 'DUPLICATE_BATCH': return { text: 'Dup Batch', bg: '#fee2e2', fg: '#991b1b' };
    default: return null;
  }
}

function daysToExpiryColor(days) {
  if (days == null) return '#94a3b8';
  if (days < 30) return '#dc2626';
  if (days < 90) return '#ca8a04';
  return '#16a34a';
}

function formatExpiry(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

const UndertakingLineRow = memo(function UndertakingLineRow({ line, index }) {
  const product = line.product_id && typeof line.product_id === 'object' ? line.product_id : null;

  const productLabel = useMemo(() => {
    if (!product) return line.item_key || '—';
    const brand = product.brand_name || '';
    const dosage = product.dosage_strength || '';
    const unit = product.unit_code || 'PC';
    return `${brand} ${dosage}`.trim() + ` — ${unit}`;
  }, [product, line.item_key]);

  const daysToExpiry = useMemo(() => {
    if (!line.expiry_date) return null;
    const d = new Date(line.expiry_date);
    if (isNaN(d.getTime())) return null;
    return Math.round((d - new Date()) / (1000 * 60 * 60 * 24));
  }, [line.expiry_date]);

  const badge = varianceLabel(line.variance_flag);

  return (
    <tr>
      <td style={{ verticalAlign: 'top' }}>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{productLabel}</div>
        <div style={{ fontSize: 11, color: 'var(--erp-muted, #94a3b8)' }}>
          Line {index + 1}
          {product?.generic_name ? ` · ${product.generic_name}` : ''}
          {line.po_line_index != null ? ` · PO line #${line.po_line_index + 1}` : ''}
        </div>
      </td>

      <td>
        <span style={{ fontFamily: 'monospace', fontSize: 13 }}>{line.expected_qty ?? '—'}</span>
      </td>

      <td>
        <span
          style={{
            fontFamily: 'monospace',
            fontSize: 13,
            fontWeight: 600,
            padding: '2px 6px',
            borderRadius: 4,
            background: badge ? badge.bg : undefined,
            color: badge ? badge.fg : undefined,
          }}
        >
          {line.received_qty ?? '—'}
        </span>
      </td>

      <td>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontFamily: 'monospace' }}>{line.batch_lot_no || '—'}</span>
          {line.scan_confirmed && (
            <span title="OCR-confirmed" style={{ color: '#16a34a', fontSize: 14, fontWeight: 700 }}>✓</span>
          )}
        </div>
      </td>

      <td>
        <div style={{ fontSize: 13 }}>{formatExpiry(line.expiry_date)}</div>
        {daysToExpiry != null && (
          <div style={{ fontSize: 11, color: daysToExpiryColor(daysToExpiry), marginTop: 2, fontWeight: 600 }}>
            {daysToExpiry < 0 ? `Expired ${Math.abs(daysToExpiry)}d ago` : `${daysToExpiry}d to expiry`}
          </div>
        )}
      </td>

      <td>
        {badge ? (
          <span
            style={{
              display: 'inline-block',
              padding: '2px 8px',
              borderRadius: 999,
              background: badge.bg,
              color: badge.fg,
              fontSize: 11,
              fontWeight: 700,
            }}
          >
            {badge.text}
          </span>
        ) : (
          <span style={{ color: '#16a34a', fontSize: 14 }} title="OK">✓</span>
        )}
      </td>
    </tr>
  );
});

export default UndertakingLineRow;

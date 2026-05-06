/**
 * PhysicalStatusChip — Shared chip for capture lifecycle paper-attestation status.
 *
 * Renders one of:
 *   • "Paper: PENDING"  (amber)  — paper expected, not yet attested
 *   • "Paper: RECEIVED" (green)  — paper attested
 *   • "Paper: MISSING"  (red)    — paper attested missing
 *   • "Digital only"    (gray)   — physical_required=false (SMER, COLLECTION/PAID_CSI)
 *
 * Two render modes:
 *   <PhysicalStatusChip status="PENDING" required={true} />
 *   <PhysicalStatusChip status={item.physical_status} required={item.physical_required} />
 *
 * Or pass an item directly (convenience):
 *   <PhysicalStatusChip item={item} />
 *
 * Why the extraction:
 * Both CaptureArchive.jsx and ProxyQueue.jsx were carrying near-identical
 * paper-status pill renderers (one as a function `physicalChip()`, one as
 * a component `<PhysicalStatusChip>`). One shared component, one source of
 * truth.
 */

export default function PhysicalStatusChip({ item, status, required, prefix = 'Paper: ' }) {
  const phys = status ?? item?.physical_status;
  const req = required ?? item?.physical_required;

  if (!req) {
    return (
      <span className="text-xs px-2 py-1 rounded-full font-medium bg-gray-100 text-gray-500 border border-gray-200">
        Digital only
      </span>
    );
  }

  const cls =
    phys === 'RECEIVED' ? 'bg-green-50 text-green-700 border-green-200'
    : phys === 'MISSING' ? 'bg-red-50 text-red-700 border-red-200'
    : 'bg-amber-50 text-amber-700 border-amber-200';
  const label = phys || 'PENDING';
  return (
    <span className={`text-xs px-2 py-1 rounded-full font-medium border ${cls}`}>
      {prefix}{label}
    </span>
  );
}

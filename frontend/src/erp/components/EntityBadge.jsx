/**
 * EntityBadge — Renders an entity name with branded colors from Entity model.
 * Scales to N entities without code changes — colors come from the database.
 *
 * Usage: <EntityBadge entity={entityObject} />
 *   or:  <EntityBadge name="VIP" color="#F5C518" textColor="#1A1A1A" />
 */
export default function EntityBadge({ entity, name, color, textColor, size = 'md' }) {
  const displayName = name || entity?.short_name || entity?.entity_name || '—';
  const bgColor = color || entity?.brand_color || '#6B7280';
  const fgColor = textColor || entity?.brand_text_color || '#FFFFFF';

  const sizeStyles = {
    sm: { padding: '2px 8px', fontSize: 10, fontWeight: 600 },
    md: { padding: '3px 10px', fontSize: 11, fontWeight: 600 },
    lg: { padding: '4px 14px', fontSize: 13, fontWeight: 700 }
  };

  return (
    <span
      style={{
        display: 'inline-block',
        borderRadius: 999,
        background: bgColor,
        color: fgColor,
        whiteSpace: 'nowrap',
        letterSpacing: '0.02em',
        ...sizeStyles[size]
      }}
    >
      {displayName}
    </span>
  );
}

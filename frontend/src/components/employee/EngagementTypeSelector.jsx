/**
 * EngagementTypeSelector Component
 *
 * Reusable toggle chip selector for engagement types.
 * Maps to Excel CPT day sheet columns G-K.
 * Phone-friendly with 48px min tap targets.
 */

const ENGAGEMENT_OPTIONS = [
  { value: 'TXT_PROMATS', label: 'TXT/PROMATS' },
  { value: 'MES_VIBER_GIF', label: 'MES/VIBER GIF' },
  { value: 'PICTURE', label: 'PICTURE' },
  { value: 'SIGNED_CALL', label: 'SIGNED CALL' },
  { value: 'VOICE_CALL', label: 'VOICE CALL' },
];

const selectorStyles = `
  .engagement-selector {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .engagement-chip {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 48px;
    padding: 8px 16px;
    border: 2px solid #d1d5db;
    border-radius: 24px;
    background: #f9fafb;
    color: #4b5563;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .engagement-chip:hover {
    border-color: #93c5fd;
    background: #eff6ff;
  }

  .engagement-chip.selected {
    border-color: #2563eb;
    background: #2563eb;
    color: white;
  }

  .engagement-chip.selected:hover {
    background: #1d4ed8;
    border-color: #1d4ed8;
  }
`;

const EngagementTypeSelector = ({ selected = [], onChange }) => {
  const handleToggle = (value) => {
    const newSelected = selected.includes(value)
      ? selected.filter((v) => v !== value)
      : [...selected, value];
    onChange(newSelected);
  };

  return (
    <div className="engagement-selector">
      <style>{selectorStyles}</style>
      {ENGAGEMENT_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          className={`engagement-chip${selected.includes(opt.value) ? ' selected' : ''}`}
          onClick={() => handleToggle(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
};

export default EngagementTypeSelector;

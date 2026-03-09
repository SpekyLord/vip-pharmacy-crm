/**
 * ConfirmDeleteModal
 *
 * Shared type-to-confirm delete modal for admin actions.
 * Requires typing a confirmation word (default: "DELETE") before the action button enables.
 * Used across DoctorManagement, EmployeeManagement, ProductManagement.
 */

import { useState, useEffect, memo } from 'react';

const cdmStyles = `
  .cdm-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .cdm-content {
    background: white;
    border-radius: 12px;
    padding: 24px;
    width: 90%;
    max-width: 440px;
    text-align: center;
  }

  .cdm-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid #e5e7eb;
  }

  .cdm-header h3 {
    margin: 0;
    font-size: 18px;
    color: #1f2937;
  }

  .cdm-close {
    background: none;
    border: none;
    font-size: 24px;
    cursor: pointer;
    color: #6b7280;
    line-height: 1;
  }

  .cdm-close:hover {
    color: #1f2937;
  }

  .cdm-icon {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #fee2e2;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0 auto 16px;
    font-size: 24px;
  }

  .cdm-message {
    color: #374151;
    margin-bottom: 16px;
    line-height: 1.5;
  }

  .cdm-message p {
    margin: 0;
  }

  .cdm-badge {
    background: #fef3c7;
    color: #92400e;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    margin-bottom: 16px;
  }

  .cdm-instruction {
    font-size: 14px;
    color: #6b7280;
    margin: 0 0 8px 0;
  }

  .cdm-input {
    width: 100%;
    padding: 10px 12px;
    border: 2px solid #d1d5db;
    border-radius: 6px;
    font-size: 16px;
    text-align: center;
    letter-spacing: 2px;
    font-weight: 600;
    outline: none;
    transition: border-color 0.2s;
    box-sizing: border-box;
  }

  .cdm-input:focus {
    border-color: #9ca3af;
  }

  .cdm-input.cdm-matched {
    border-color: #dc2626;
    color: #dc2626;
  }

  .cdm-input:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
  }

  .cdm-actions {
    display: flex;
    justify-content: center;
    gap: 12px;
    margin-top: 20px;
  }

  .cdm-actions .btn {
    min-width: 110px;
    padding: 10px 20px;
  }

  .cdm-btn-confirm {
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s, opacity 0.2s;
  }

  .cdm-btn-confirm:hover:not(:disabled) {
    background: #b91c1c;
  }

  .cdm-btn-confirm:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .cdm-btn-cancel {
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #d1d5db;
    border-radius: 6px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s;
  }

  .cdm-btn-cancel:hover:not(:disabled) {
    background: #e5e7eb;
  }

  .cdm-btn-cancel:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  @media (max-width: 480px) {
    .cdm-content {
      width: 92%;
      padding: 20px 16px;
    }

    .cdm-actions {
      flex-direction: column-reverse;
    }

    .cdm-actions .btn,
    .cdm-btn-confirm,
    .cdm-btn-cancel {
      min-height: 44px;
      width: 100%;
    }
  }
`;

const ConfirmDeleteModal = memo(function ConfirmDeleteModal({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Deactivation',
  message,
  confirmWord = 'DELETE',
  confirmButtonText = 'Deactivate',
  loading = false,
  itemCount = null,
}) {
  const [typedValue, setTypedValue] = useState('');

  // Reset typed value when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      setTypedValue('');
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isMatched = typedValue.trim().toUpperCase() === confirmWord.toUpperCase();

  return (
    <div className="cdm-overlay" onClick={onClose}>
      <style>{cdmStyles}</style>
      <div className="cdm-content" onClick={(e) => e.stopPropagation()}>
        <div className="cdm-header">
          <h3>{title}</h3>
          <button className="cdm-close" onClick={onClose} disabled={loading}>
            &times;
          </button>
        </div>

        <div className="cdm-icon">&#9888;</div>

        <div className="cdm-message">{message}</div>

        {itemCount != null && itemCount > 0 && (
          <div className="cdm-badge">
            {itemCount} item{itemCount !== 1 ? 's' : ''} will be affected
          </div>
        )}

        <p className="cdm-instruction">
          Type <strong>{confirmWord}</strong> to confirm:
        </p>

        <input
          className={`cdm-input${isMatched ? ' cdm-matched' : ''}`}
          value={typedValue}
          onChange={(e) => setTypedValue(e.target.value)}
          placeholder={confirmWord}
          disabled={loading}
          autoFocus
        />

        <div className="cdm-actions">
          <button
            className="cdm-btn-cancel"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </button>
          <button
            className="cdm-btn-confirm"
            onClick={onConfirm}
            disabled={!isMatched || loading}
          >
            {loading ? 'Processing...' : confirmButtonText}
          </button>
        </div>
      </div>
    </div>
  );
});

export default ConfirmDeleteModal;

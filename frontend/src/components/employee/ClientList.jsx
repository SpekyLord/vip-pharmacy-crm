/**
 * ClientList Component
 *
 * Displays regular (non-VIP) clients with:
 * - Daily limit progress bar (X/30 calls today)
 * - Search filter on name/specialization/address
 * - Add Client button
 * - Client cards with Log Visit and Edit buttons
 * - Log Visit disabled when daily limit reached
 */

import { useState, useMemo, memo } from 'react';
import LoadingSpinner from '../common/LoadingSpinner';

const clientListStyles = `
  .client-list {
    padding: 0;
  }

  .client-list-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    flex-wrap: wrap;
    gap: 12px;
  }

  .daily-limit-bar {
    display: flex;
    align-items: center;
    gap: 12px;
    background: #f8fafc;
    padding: 8px 16px;
    border-radius: 8px;
    border: 1px solid #e2e8f0;
  }

  .daily-limit-text {
    font-size: 14px;
    font-weight: 600;
    color: #334155;
    white-space: nowrap;
  }

  .daily-limit-track {
    width: 120px;
    height: 8px;
    background: #e5e7eb;
    border-radius: 4px;
    overflow: hidden;
  }

  .daily-limit-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
    background: #8b5cf6;
  }

  .daily-limit-fill.at-limit {
    background: #dc2626;
  }

  .add-client-btn {
    padding: 10px 20px;
    background: #8b5cf6;
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .add-client-btn:hover {
    background: #7c3aed;
  }

  .client-search-input {
    flex: 1;
    min-width: 250px;
    padding: 12px 16px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    transition: border-color 0.2s, box-shadow 0.2s;
  }

  .client-search-input:focus {
    outline: none;
    border-color: #8b5cf6;
    box-shadow: 0 0 0 3px rgba(139, 92, 246, 0.1);
  }

  .client-list-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
    gap: 20px;
  }

  .client-card {
    background: white;
    border-radius: 12px;
    padding: 20px;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
    transition: transform 0.2s, box-shadow 0.2s;
    border: 1px solid #e5e7eb;
  }

  .client-card:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .client-card-header h3 {
    margin: 0 0 8px 0;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  .client-specialization {
    margin: 0 0 4px 0;
    color: #4b5563;
    font-size: 14px;
  }

  .client-address {
    margin: 0 0 4px 0;
    color: #6b7280;
    font-size: 13px;
  }

  .client-phone {
    margin: 0 0 16px 0;
    color: #6b7280;
    font-size: 13px;
  }

  .client-card-actions {
    display: flex;
    gap: 10px;
    margin-top: 16px;
  }

  .client-log-btn {
    flex: 1;
    padding: 12px 20px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    background: #8b5cf6;
    color: white;
  }

  .client-log-btn:hover:not(:disabled) {
    background: #7c3aed;
  }

  .client-log-btn:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .client-edit-btn {
    padding: 12px 16px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    background: #fff;
    color: #374151;
  }

  .client-edit-btn:hover {
    background: #f3f4f6;
    border-color: #9ca3af;
  }

  .client-delete-btn {
    padding: 12px 16px;
    border: 1px solid #fca5a5;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    background: #fff;
    color: #dc2626;
  }

  .client-delete-btn:hover {
    background: #fef2f2;
    border-color: #dc2626;
  }

  .client-no-results {
    text-align: center;
    padding: 40px 20px;
    color: #6b7280;
    font-size: 15px;
  }

  @media (max-width: 640px) {
    .client-list-header {
      flex-direction: column;
      align-items: stretch;
    }

    .client-search-input {
      width: 100%;
    }

    .client-list-grid {
      grid-template-columns: 1fr;
    }
  }
`;

const ClientList = memo(function ClientList({
  clients = [],
  loading = false,
  onLogVisit,
  onAddClient,
  onEditClient,
  onDeleteClient,
  dailyVisitCount = 0,
  dailyLimit = 30,
}) {
  const [searchTerm, setSearchTerm] = useState('');

  const atLimit = dailyVisitCount >= dailyLimit;

  const filteredClients = useMemo(() => {
    if (!searchTerm.trim()) return clients;
    const searchLower = searchTerm.toLowerCase();
    return clients.filter((client) => {
      const fullName = `${client.firstName || ''} ${client.lastName || ''}`.toLowerCase();
      return (
        fullName.includes(searchLower) ||
        client.specialization?.toLowerCase().includes(searchLower) ||
        client.clinicOfficeAddress?.toLowerCase().includes(searchLower)
      );
    });
  }, [clients, searchTerm]);

  if (loading) {
    return <LoadingSpinner text="Loading regular clients..." />;
  }

  return (
    <div className="client-list">
      <style>{clientListStyles}</style>

      <div className="client-list-header">
        <div className="daily-limit-bar">
          <span className="daily-limit-text">
            {dailyVisitCount}/{dailyLimit} calls today
          </span>
          <div className="daily-limit-track">
            <div
              className={`daily-limit-fill ${atLimit ? 'at-limit' : ''}`}
              style={{ width: `${Math.min((dailyVisitCount / dailyLimit) * 100, 100)}%` }}
            />
          </div>
        </div>
        <button className="add-client-btn" onClick={onAddClient}>
          + Add Client
        </button>
      </div>

      <div style={{ marginBottom: '20px' }}>
        <input
          type="text"
          placeholder="Search by name, specialization, or address..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="client-search-input"
        />
      </div>

      <div className="client-list-grid">
        {filteredClients.map((client) => (
          <div key={client._id} className="client-card">
            <div className="client-card-header">
              <h3>{client.fullName || `${client.firstName} ${client.lastName}`}</h3>
            </div>

            {client.specialization && (
              <p className="client-specialization">{client.specialization}</p>
            )}
            {client.clinicOfficeAddress && (
              <p className="client-address">{client.clinicOfficeAddress}</p>
            )}
            {client.phone && (
              <p className="client-phone">{client.phone}</p>
            )}

            <div className="client-card-actions">
              <button
                className="client-log-btn"
                onClick={() => onLogVisit?.(client)}
                disabled={atLimit}
                title={atLimit ? 'Daily extra call limit reached' : 'Log an extra call visit'}
              >
                {atLimit ? 'Limit Reached' : 'Log Visit'}
              </button>
              <button
                className="client-edit-btn"
                onClick={() => onEditClient?.(client)}
                title="Edit client details"
              >
                Edit
              </button>
              <button
                className="client-delete-btn"
                onClick={() => {
                  if (window.confirm(`Delete ${client.firstName} ${client.lastName}?`)) {
                    onDeleteClient?.(client);
                  }
                }}
                title="Delete client"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {filteredClients.length === 0 && (
        <p className="client-no-results">
          {clients.length === 0
            ? 'No regular clients yet. Click "Add Client" to add one.'
            : 'No clients match your search criteria'}
        </p>
      )}
    </div>
  );
});

export default ClientList;

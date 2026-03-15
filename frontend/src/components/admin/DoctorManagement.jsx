/**
 * DoctorManagement Component
 *
 * Admin component for managing doctors:
 * - CRUD operations for doctors
 * - Search and filter
 * - Pagination
 * - Add/Edit modal
 */

import { useState, useEffect, useRef } from 'react';
import { Plus, Edit2, Trash2, ArrowUpCircle, AlertTriangle, X, ChevronDown } from 'lucide-react';
import doctorService from '../../services/doctorService';
import userService from '../../services/userService';
import specializationService from '../../services/specializationService';
import ConfirmDeleteModal from '../common/ConfirmDeleteModal';

// Enum options for programs and support types (matching backend Doctor.js)
const PROGRAMS = ['CME GRANT', 'REBATES / MONEY', 'REST AND RECREATION', 'MED SOCIETY PARTICIPATION'];
const SUPPORT_TYPES = ['STARTER DOSES', 'PROMATS', 'FULL DOSE', 'PATIENT DISCOUNT', 'AIR FRESHENER'];
const ENGAGEMENT_LEVELS = [
  { value: 1, label: '1 - Visited 4 times' },
  { value: 2, label: '2 - Knows BDM/products' },
  { value: 3, label: '3 - Tried products' },
  { value: 4, label: '4 - In group chat' },
  { value: 5, label: '5 - Active partner' },
];

const doctorManagementStyles = `
  .doctor-management {
    background: white;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Filters Bar — split into two sections */
  .dm-filters-bar {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 14px 20px;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
  }

  .dm-search-actions-row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: nowrap;
  }

  .dm-search-input-wrapper {
    position: relative;
    flex: 3;
    min-width: 150px;
  }

  .dm-buttons-group {
    display: flex;
    gap: 8px;
    align-items: center;
    flex: 1;
    min-width: 0;
  }

  .dm-dropdowns-row {
    display: flex;
    gap: 10px;
    align-items: center;
    flex-wrap: wrap;
  }

  .dm-search-input-icon {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #9ca3af;
    pointer-events: none;
  }

  .dm-search-input {
    width: 100%;
    padding: 10px 12px 10px 38px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    background: #f9fafb;
    color: #374151;
  }

  .dm-search-input::placeholder {
    color: #9ca3af;
  }

  .dm-search-input:focus {
    outline: none;
    border-color: #f59e0b;
    background: white;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
  }

  /* Content wrapper — fills remaining height between filters bar and pagination */
  .dm-content-wrapper {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .dm-filter-select {
    padding: 10px 10px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 13px;
    background: #f9fafb;
    min-width: 120px;
    cursor: pointer;
  }

  .dm-filter-select:focus {
    outline: none;
    border-color: #f59e0b;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
  }

  /* Custom Dropdown */
  .dm-custom-select-wrapper {
    position: relative;
    flex: 1;
    min-width: 100px;
  }

  .dm-custom-select-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 13px;
    background: #f9fafb;
    cursor: pointer;
    color: #374151;
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
    text-align: left;
  }

  .dm-custom-select-trigger:hover {
    border-color: #d1d5db;
    background: #f3f4f6;
  }

  .dm-custom-select-trigger.dm-cs-open {
    border-color: #f59e0b;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
    background: white;
  }

  .dm-cs-chevron {
    transition: transform 0.2s;
    flex-shrink: 0;
    color: #9ca3af;
  }

  .dm-cs-chevron.dm-cs-chevron-open {
    transform: rotate(180deg);
    color: #f59e0b;
  }

  .dm-custom-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 100%;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    box-shadow: 0 12px 28px rgba(0,0,0,0.12), 0 4px 10px rgba(0,0,0,0.06);
    z-index: 200;
    overflow: hidden;
    animation: dm-dropdown-in 0.13s ease;
  }

  @keyframes dm-dropdown-in {
    from { opacity: 0; transform: translateY(-6px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .dm-custom-option {
    padding: 10px 14px;
    font-size: 13px;
    cursor: pointer;
    color: #374151;
    transition: background 0.1s, color 0.1s;
    white-space: nowrap;
  }

  .dm-custom-option:hover {
    background: #fffbeb;
    color: #d97706;
  }

  .dm-custom-option.dm-co-active {
    background: #fef3c7;
    color: #d97706;
    font-weight: 600;
  }

  .dm-custom-option.dm-co-active:hover {
    background: #fde68a;
  }

  .dm-add-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    flex: 1;
    min-width: 0;
    justify-content: center;
    white-space: nowrap;
  }

  .dm-add-btn:hover {
    background: linear-gradient(135deg, #f59e0b, #d97706);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
  }

  .dm-mass-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 12px;
    background: #fee2e2;
    color: #dc2626;
    border: none;
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    flex: 1;
    min-width: 0;
    justify-content: center;
    white-space: nowrap;
  }

  .dm-mass-btn:hover {
    background: #fecaca;
  }

  /* Table Container */
  .dm-table-container {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
  }

  /* Clean Table */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    table-layout: fixed;
  }

  /* Column sizing for better distribution */
  .data-table th:nth-child(1),
  .data-table td:nth-child(1) {
    width: 1%;
    min-width: 44px;
    white-space: nowrap;
    padding-left: 10px;
    padding-right: 10px;
  }
  .data-table th:nth-child(7),
  .data-table td:nth-child(7) { width: 90px; }
  .data-table th:nth-child(8),
  .data-table td:nth-child(8) { width: 96px; }
  .data-table th:nth-child(9),
  .data-table td:nth-child(9) { width: 120px; }

  .data-table th:nth-child(9) {
    text-align: center;
  }

  .data-table th {
    padding: 12px 16px;
    text-align: left;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #6b7280;
    background: #f9fafb;
    border-bottom: 1px solid #e5e7eb;
    white-space: nowrap;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .data-table td {
    padding: 13px 16px;
    border-bottom: 1px solid #f3f4f6;
    color: #374151;
    word-break: break-word;
  }

  .data-table th:nth-child(1),
  .data-table td:nth-child(1) {
    padding-left: 8px;
    padding-right: 8px;
  }

  .data-table th:nth-child(2),
  .data-table td:nth-child(2) {
    padding-left: 20px;
  }

  .doctor-name {
    font-weight: 600;
    color: #1f2937;
  }

  .data-table tr:hover {
    background: #fefce8;
  }

  .data-table tr:last-child td {
    border-bottom: none;
  }

  .client-type-badge {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
  }

  .client-type-badge.vip {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .client-type-badge.regular {
    background: #fef3c7;
    color: #92400e;
  }

  .visit-freq-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }

  .visit-freq-badge.freq-2 {
    background: #dbeafe;
    color: #1d4ed8;
  }

  .visit-freq-badge.freq-4 {
    background: #dcfce7;
    color: #16a34a;
  }

  .eng-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;
  }

  .eng-badge.eng-low {
    background: #fef2f2;
    color: #dc2626;
  }

  .eng-badge.eng-mid {
    background: #fefce8;
    color: #a16207;
  }

  .eng-badge.eng-high {
    background: #f0fdf4;
    color: #16a34a;
  }

  /* Action Buttons */
  .actions-cell {
    display: flex;
    justify-content: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 6px;
    border: none;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .action-btn.edit {
    background: #fef3c7;
    color: #d97706;
  }

  .action-btn.edit:hover {
    background: #fde68a;
  }

  .action-btn.delete {
    background: #fee2e2;
    color: #dc2626;
  }

  .action-btn.delete:hover {
    background: #fecaca;
  }

  .action-btn.upgrade {
    background: #ede9fe;
    color: #7c3aed;
  }

  .action-btn.upgrade:hover {
    background: #ddd6fe;
  }

  /* Pagination */
  .pagination {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    border-top: 1px solid #e5e7eb;
    background: #f9fafb;
  }

  .pagination-info {
    color: #6b7280;
    font-size: 13px;
  }

  .pagination-buttons {
    display: flex;
    gap: 8px;
  }

  .pagination-btn {
    padding: 8px 14px;
    border: 1px solid #e5e7eb;
    background: white;
    border-radius: 6px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 500;
    color: #374151;
    transition: all 0.2s;
  }

  .pagination-btn:hover:not(:disabled) {
    background: #f3f4f6;
    border-color: #d1d5db;
  }

  .pagination-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .pagination-page-indicator {
    padding: 8px 12px;
    font-size: 13px;
    font-weight: 500;
    color: #374151;
  }

  /* Modal */
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    padding: 20px;
  }

  .modal-content {
    background: white;
    border-radius: 16px;
    width: 100%;
    max-width: 620px;
    max-height: 90vh;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
    display: flex;
    flex-direction: column;
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
    flex-shrink: 0;
  }

  .modal-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  .modal-close {
    width: 36px;
    height: 36px;
    border-radius: 8px;
    border: none;
    background: #f3f4f6;
    color: #6b7280;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
  }

  .modal-close:hover {
    background: #e5e7eb;
    color: #374151;
  }

  .modal-body {
    padding: 24px;
    overflow-y: auto;
    flex: 1;
  }

  /* Form */
  .form-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
    margin-bottom: 16px;
  }

  .form-group {
    margin-bottom: 16px;
  }

  .form-group.full-width {
    grid-column: 1 / -1;
  }

  .form-group label {
    display: block;
    margin-bottom: 6px;
    font-weight: 500;
    color: #374151;
    font-size: 14px;
  }

  .form-group input,
  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    box-sizing: border-box;
    background: #f9fafb;
  }

  .form-group input:focus,
  .form-group select:focus,
  .form-group textarea:focus {
    outline: none;
    border-color: #f59e0b;
    background: white;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
  }

  .form-group textarea {
    resize: vertical;
    min-height: 80px;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid #e5e7eb;
    background: #f9fafb;
    flex-shrink: 0;
  }

  .btn {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
  }

  .btn-cancel {
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #e5e7eb;
  }

  .btn-cancel:hover {
    background: #e5e7eb;
  }

  .btn-save {
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    color: white;
  }

  .btn-save:hover {
    background: linear-gradient(135deg, #f59e0b, #d97706);
  }

  .btn-save:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Checkboxes */
  .checkbox-group {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 4px;
  }

  .checkbox-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    color: #374151;
    cursor: pointer;
  }

  .checkbox-item input[type="checkbox"] {
    width: auto;
    padding: 0;
    cursor: pointer;
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: #6b7280;
  }

  .empty-state p {
    margin: 0;
    font-size: 15px;
  }

  /* Loading overlay */
  .table-loading {
    opacity: 0.5;
    pointer-events: none;
  }

  /* Mass delete modal */
  .dm-mass-delete-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 2000;
    padding: 20px;
  }

  .dm-mass-delete-box {
    background: white;
    border-radius: 16px;
    padding: 28px;
    width: 100%;
    max-width: 440px;
    box-shadow: 0 25px 50px -12px rgba(0,0,0,0.25);
  }

  .dm-mass-delete-box h3 {
    margin: 0 0 8px;
    font-size: 18px;
    font-weight: 600;
    color: #1f2937;
  }

  .dm-mass-delete-box p {
    margin: 0 0 16px;
    font-size: 14px;
    color: #6b7280;
  }

  .dm-mass-delete-box select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    background: #f9fafb;
    margin-bottom: 16px;
  }

  .dm-mass-delete-box select:focus {
    outline: none;
    border-color: #f59e0b;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
  }

  .dm-mass-delete-actions {
    display: flex;
    gap: 10px;
    justify-content: flex-end;
  }

  /* Mobile Card View */
  .mobile-card-list { display: none; }

  .mobile-card {
    background: white;
    border-bottom: 1px solid #f3f4f6;
    padding: 16px 20px;
  }

  .mobile-card:last-child { border-bottom: none; }

  .mobile-card-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 10px;
  }

  .mobile-card-name {
    font-size: 15px;
    font-weight: 600;
    color: #1f2937;
  }

  .mobile-card-meta {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 12px;
  }

  .mobile-card-row {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    color: #6b7280;
  }

  .mobile-card-row span:last-child {
    color: #374151;
    font-weight: 500;
  }

  .mobile-card-actions {
    display: flex;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid #f3f4f6;
  }

  .mobile-card-actions .action-btn {
    flex: 1;
    justify-content: center;
    padding: 10px 8px;
  }

  /* Responsive */
  @media (max-width: 1200px) {
  }

  @media (max-width: 1024px) {
  }

  @media (max-width: 900px) {
    .doctor-management { overflow: visible; }
    .dm-content-wrapper { flex: none; overflow: visible; }
    .dm-filters-bar { padding: 12px 16px; gap: 12px; }
    .dm-search-actions-row { gap: 8px; flex-wrap: wrap; }
    .dm-buttons-group { gap: 6px; }
    .dm-dropdowns-row { gap: 8px; flex-wrap: wrap; }
    .dm-search-input-wrapper { flex: 3; min-width: 120px; }
    .dm-filter-select { flex: 1; min-width: 0; }
    .dm-custom-select-wrapper { flex: 1; min-width: 0; }
    .dm-custom-select-trigger { width: 100%; }
    .dm-table-container { display: none; }
    .mobile-card-list { display: block; }
    .pagination {
      flex-direction: column;
      gap: 10px;
      align-items: stretch;
      padding: 12px 16px;
    }
    .pagination-info {
      text-align: center;
      font-size: 12px;
    }
    .pagination-buttons {
      width: 100%;
      justify-content: space-between;
      align-items: center;
    }
    .pagination-page-indicator {
      flex: 1;
      text-align: center;
      padding: 8px 6px;
      font-size: 12px;
    }
    .pagination-btn {
      padding: 8px 10px;
      min-width: 90px;
    }
  }

  @media (max-width: 768px) {
    .dm-add-btn { font-size: 11px; }
    .dm-mass-btn { font-size: 11px; }
    .dm-search-input { font-size: 13px; padding: 9px 10px 9px 34px; }
    .action-btn { font-size: 11px; padding: 6px 10px; }
    .data-table th { font-size: 10px; }
  }

  @media (max-width: 640px) {
    .dm-search-actions-row { gap: 6px; flex-wrap: wrap; }
    .dm-buttons-group { gap: 5px; width: 100%; }
    .dm-add-btn { font-size: 10px; }
    .dm-mass-btn { font-size: 10px; }
    .dm-search-input-wrapper { width: 100%; flex: none; }
    .dm-dropdowns-row { gap: 6px; }
    .dm-filter-select { flex: 1; min-width: 0; }
    .dm-custom-select-wrapper { flex: 1; min-width: 0; }
    .modal-content { max-width: 100%; max-height: 100%; border-radius: 0; }
    .modal-body { max-height: calc(100vh - 140px); }
    .form-row { grid-template-columns: 1fr; gap: 0; }
    .form-group input,
    .form-group select,
    .form-group textarea { min-height: 44px; font-size: 16px; }
    .form-actions { flex-direction: column-reverse; }
    .form-actions .btn { width: 100%; min-height: 48px; }
  }

  @media (max-width: 480px) {
    .dm-search-input { font-size: 12px; }
    .dm-add-btn { font-size: 9px; }
    .dm-mass-btn { font-size: 9px; }
    .dm-custom-select-trigger { padding: 8px 10px; font-size: 12px; }
    .dm-filter-select { padding: 8px; font-size: 12px; }
    .mobile-card-name { font-size: 14px; }
    .action-btn { font-size: 10px; padding: 5px 8px; }
    .pagination { gap: 8px; }
  }

  /* ===== DARK MODE ===== */
  body.dark-mode .doctor-management {
    background: #0f172a;
    border-color: #1e293b;
  }

  body.dark-mode .dm-filters-bar {
    border-color: #1e293b;
  }

  body.dark-mode .dm-search-input {
    background: #1e293b;
    border-color: #334155;
    color: #e2e8f0;
  }

  body.dark-mode .dm-search-input::placeholder {
    color: #64748b;
  }

  body.dark-mode .dm-search-input:focus {
    background: #0f172a;
    border-color: #f59e0b;
  }

  body.dark-mode .dm-search-input-icon {
    color: #64748b;
  }

  body.dark-mode .dm-filter-select {
    background: #1e293b;
    border-color: #334155;
    color: #e2e8f0;
  }

  body.dark-mode .dm-filter-select:focus {
    border-color: #f59e0b;
  }

  body.dark-mode .dm-custom-select-trigger {
    background: #1e293b;
    border-color: #334155;
    color: #e2e8f0;
  }

  body.dark-mode .dm-custom-select-trigger:hover {
    border-color: #475569;
    background: #273548;
  }

  body.dark-mode .dm-custom-select-trigger.dm-cs-open {
    border-color: #f59e0b;
    background: #0f172a;
  }

  body.dark-mode .dm-custom-dropdown {
    background: #1e293b;
    border-color: #334155;
    box-shadow: 0 12px 28px rgba(0,0,0,0.5);
  }

  body.dark-mode .dm-custom-option {
    color: #e2e8f0;
  }

  body.dark-mode .dm-custom-option:hover {
    background: #1e3a5f;
    color: #fbbf24;
  }

  body.dark-mode .dm-custom-option.dm-co-active {
    background: #2d2a1a;
    color: #fbbf24;
  }

  body.dark-mode .dm-custom-option.dm-co-active:hover {
    background: #3d3818;
  }

  body.dark-mode .dm-mass-btn {
    background: #450a0a;
    color: #f87171;
  }

  body.dark-mode .dm-mass-btn:hover {
    background: #7f1d1d;
  }

  body.dark-mode .data-table th {
    background: #1e293b;
    color: #94a3b8;
    border-color: #334155;
  }

  body.dark-mode .data-table td {
    color: #e2e8f0;
    border-color: #1e293b;
    background: #0f172a;
  }

  body.dark-mode .data-table tbody tr {
    background: #0f172a;
  }

  body.dark-mode .data-table td.col-index {
    color: #64748b;
  }

  body.dark-mode .data-table tr:hover td {
    background: #1e293b;
  }

  body.dark-mode .doctor-name {
    color: #f1f5f9;
  }

  body.dark-mode .client-type-badge.vip {
    background: #1e3a5f;
    color: #60a5fa;
  }

  body.dark-mode .client-type-badge.regular {
    background: #451a03;
    color: #fbbf24;
  }

  body.dark-mode .visit-freq-badge.freq-2 {
    background: #1e3a5f;
    color: #60a5fa;
  }

  body.dark-mode .visit-freq-badge.freq-4 {
    background: #052e16;
    color: #4ade80;
  }

  body.dark-mode .eng-badge.eng-low {
    background: #450a0a;
    color: #f87171;
  }

  body.dark-mode .eng-badge.eng-mid {
    background: #451a03;
    color: #fbbf24;
  }

  body.dark-mode .eng-badge.eng-high {
    background: #052e16;
    color: #4ade80;
  }

  body.dark-mode .action-btn.edit {
    background: #451a03;
    color: #fbbf24;
  }

  body.dark-mode .action-btn.edit:hover {
    background: #78350f;
  }

  body.dark-mode .action-btn.delete {
    background: #450a0a;
    color: #f87171;
  }

  body.dark-mode .action-btn.delete:hover {
    background: #7f1d1d;
  }

  body.dark-mode .action-btn.upgrade {
    background: #2e1065;
    color: #a78bfa;
  }

  body.dark-mode .action-btn.upgrade:hover {
    background: #4c1d95;
  }

  body.dark-mode .pagination {
    background: #1e293b;
    border-color: #334155;
  }

  body.dark-mode .pagination-info {
    color: #94a3b8;
  }

  body.dark-mode .pagination-btn {
    background: #0f172a;
    border-color: #334155;
    color: #e2e8f0;
  }

  body.dark-mode .pagination-btn:hover:not(:disabled) {
    background: #334155;
  }

  body.dark-mode .pagination-page-indicator {
    color: #94a3b8;
  }

  body.dark-mode .modal-overlay {
    background: rgba(0, 0, 0, 0.7);
  }

  body.dark-mode .modal-content,
  body.dark-mode .dm-mass-delete-box {
    background: #0f172a;
  }

  body.dark-mode .modal-header {
    border-color: #1e293b;
  }

  body.dark-mode .modal-header h3,
  body.dark-mode .dm-mass-delete-box h3 {
    color: #f1f5f9;
  }

  body.dark-mode .dm-mass-delete-box p {
    color: #94a3b8;
  }

  body.dark-mode .dm-mass-delete-box select {
    background: #1e293b;
    border-color: #334155;
    color: #e2e8f0;
  }

  body.dark-mode .modal-close {
    background: #1e293b;
    color: #94a3b8;
  }

  body.dark-mode .modal-close:hover {
    background: #334155;
    color: #e2e8f0;
  }

  body.dark-mode .form-group label {
    color: #e2e8f0;
  }

  body.dark-mode .form-group input,
  body.dark-mode .form-group select,
  body.dark-mode .form-group textarea {
    background: #1e293b;
    border-color: #334155;
    color: #e2e8f0;
  }

  body.dark-mode .form-group input:focus,
  body.dark-mode .form-group select:focus,
  body.dark-mode .form-group textarea:focus {
    background: #0f172a;
    border-color: #f59e0b;
  }

  body.dark-mode .form-actions {
    background: #1e293b;
    border-color: #334155;
  }

  body.dark-mode .btn-cancel {
    background: #334155;
    border-color: #475569;
    color: #e2e8f0;
  }

  body.dark-mode .btn-cancel:hover {
    background: #475569;
  }

  body.dark-mode .checkbox-item {
    color: #e2e8f0;
  }

  body.dark-mode .empty-state {
    color: #94a3b8;
  }

  body.dark-mode .mobile-card {
    background: #0f172a;
    border-color: #1e293b;
  }

  body.dark-mode .mobile-card-name {
    color: #f1f5f9;
  }

  body.dark-mode .mobile-card-row {
    color: #94a3b8;
  }

  body.dark-mode .mobile-card-row span:last-child {
    color: #e2e8f0;
  }

  body.dark-mode .mobile-card-actions {
    border-color: #1e293b;
  }
`;

function FilterDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find(o => o.value === value);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  return (
    <div className="dm-custom-select-wrapper" ref={ref}>
      <button
        type="button"
        className={`dm-custom-select-trigger${open ? ' dm-cs-open' : ''}`}
        onClick={() => setOpen(v => !v)}
      >
        <span>{selected ? selected.label : options[0]?.label}</span>
        <ChevronDown size={14} className={`dm-cs-chevron${open ? ' dm-cs-chevron-open' : ''}`} />
      </button>
      {open && (
        <div className="dm-custom-dropdown">
          {options.map(opt => (
            <div
              key={opt.value}
              className={`dm-custom-option${opt.value === value ? ' dm-co-active' : ''}`}
              onClick={() => { onChange(opt.value); setOpen(false); }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const DoctorManagement = ({
  doctors = [],
  filters = {},
  pagination = {},
  loading = false,
  searchInput = '',
  onSave,
  onDelete,
  onMassDeleteByUser,
  onUpgradeToVIP,
  onFilterChange,
  onPageChange,
  onSearchChange,
}) => {
  const [showModal, setShowModal] = useState(false);
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState(null);

  // Mass delete state
  const [showMassDelete, setShowMassDelete] = useState(false);
  const [showMassDeleteConfirm, setShowMassDeleteConfirm] = useState(false);
  const [employees, setEmployees] = useState([]);
  const [selectedBdmId, setSelectedBdmId] = useState('');
  const [massDeleteCount, setMassDeleteCount] = useState(null);
  const [massDeleteLoading, setMassDeleteLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    specialization: '',
    hospital: '',
    addressStreet: '',
    phone: '',
    email: '',
    visitFrequency: 4,
    notes: '',
    assignedTo: '',
  });
  const [saving, setSaving] = useState(false);
  const [specializations, setSpecializations] = useState([]);

  // Fetch specializations from master list
  useEffect(() => {
    specializationService.getAll({ active: 'true' })
      .then((res) => setSpecializations((res.data || []).map((s) => s.name)))
      .catch(() => setSpecializations([]));
  }, []);

  // Fetch employees list for mass delete BDM dropdown
  useEffect(() => {
    userService.getEmployees()
      .then((res) => setEmployees(res.data || []))
      .catch(() => setEmployees([]));
  }, []);

  // Fetch count when BDM is selected for mass delete
  useEffect(() => {
    if (!selectedBdmId) {
      setMassDeleteCount(null);
      return;
    }
    doctorService.countByUser(selectedBdmId)
      .then((res) => setMassDeleteCount(res.data?.count ?? 0))
      .catch(() => setMassDeleteCount(null));
  }, [selectedBdmId]);

  // Debounce search is handled at the page level

  const handleFilterChange = (field, value) => {
    onFilterChange?.({ ...filters, [field]: value });
  };

  const handleCreate = () => {
    setSelectedDoctor(null);
    setFormData({
      firstName: '',
      lastName: '',
      specialization: '',
      clinicOfficeAddress: '',
      phone: '',
      email: '',
      visitFrequency: 4,
      notes: '',
      outletIndicator: '',
      programsToImplement: [],
      supportDuringCoverage: [],
      levelOfEngagement: '',
      secretaryName: '',
      secretaryPhone: '',
      birthday: '',
      anniversary: '',
      otherDetails: '',
      assignedTo: '',
    });
    setShowModal(true);
  };

  const handleEdit = (doctor) => {
    setSelectedDoctor(doctor);

    setFormData({
      firstName: doctor.firstName || '',
      lastName: doctor.lastName || '',
      specialization: doctor.specialization || '',
      clinicOfficeAddress: doctor.clinicOfficeAddress || '',
      phone: doctor.phone || '',
      email: doctor.email || '',
      visitFrequency: doctor.visitFrequency || 4,
      notes: doctor.notes || '',
      outletIndicator: doctor.outletIndicator || '',
      programsToImplement: doctor.programsToImplement || [],
      supportDuringCoverage: doctor.supportDuringCoverage || [],
      levelOfEngagement: doctor.levelOfEngagement || '',
      secretaryName: doctor.secretaryName || '',
      secretaryPhone: doctor.secretaryPhone || '',
      birthday: doctor.birthday ? doctor.birthday.split('T')[0] : '',
      anniversary: doctor.anniversary ? doctor.anniversary.split('T')[0] : '',
      otherDetails: doctor.otherDetails || '',
      assignedTo: doctor.assignedTo?._id || doctor.assignedTo || '',
    });

    setShowModal(true);
  };

  const handleDeleteClick = (doctor) => {
    setSelectedDoctor(doctor);
    setShowConfirmDelete(true);
  };

  const handleConfirmDelete = async () => {
    if (selectedDoctor) {
      await onDelete?.(selectedDoctor._id);
      setShowConfirmDelete(false);
      setSelectedDoctor(null);
    }
  };

  const handleOpenMassDelete = () => {
    setSelectedBdmId('');
    setMassDeleteCount(null);
    setShowMassDelete(true);
  };

  const handleMassDeleteProceed = () => {
    setShowMassDelete(false);
    setShowMassDeleteConfirm(true);
  };

  const handleMassDeleteConfirm = async () => {
    if (!selectedBdmId) return;
    setMassDeleteLoading(true);
    try {
      await onMassDeleteByUser?.(selectedBdmId);
      setShowMassDeleteConfirm(false);
      setSelectedBdmId('');
      setMassDeleteCount(null);
    } finally {
      setMassDeleteLoading(false);
    }
  };

  const handleMassDeleteCancel = () => {
    setShowMassDeleteConfirm(false);
    setSelectedBdmId('');
    setMassDeleteCount(null);
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: name === 'visitFrequency' ? parseInt(value) : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    // Build doctor data
    const doctorData = {
      firstName: formData.firstName,
      lastName: formData.lastName,
      visitFrequency: formData.visitFrequency,
    };

    // Only include optional fields if they have values
    if (formData.specialization && formData.specialization.trim()) {
      doctorData.specialization = formData.specialization.trim();
    }
    if (formData.clinicOfficeAddress && formData.clinicOfficeAddress.trim()) {
      doctorData.clinicOfficeAddress = formData.clinicOfficeAddress.trim();
    }
    if (formData.phone && formData.phone.trim()) {
      doctorData.phone = formData.phone.trim();
    }
    if (formData.email && formData.email.trim()) {
      doctorData.email = formData.email.trim();
    }
    if (formData.notes && formData.notes.trim()) {
      doctorData.notes = formData.notes.trim();
    }
    if (formData.outletIndicator && formData.outletIndicator.trim()) {
      doctorData.outletIndicator = formData.outletIndicator.trim();
    }
    if (formData.programsToImplement && formData.programsToImplement.length > 0) {
      doctorData.programsToImplement = formData.programsToImplement;
    }
    if (formData.supportDuringCoverage && formData.supportDuringCoverage.length > 0) {
      doctorData.supportDuringCoverage = formData.supportDuringCoverage;
    }
    if (formData.levelOfEngagement) {
      doctorData.levelOfEngagement = parseInt(formData.levelOfEngagement);
    }
    if (formData.secretaryName && formData.secretaryName.trim()) {
      doctorData.secretaryName = formData.secretaryName.trim();
    }
    if (formData.secretaryPhone && formData.secretaryPhone.trim()) {
      doctorData.secretaryPhone = formData.secretaryPhone.trim();
    }
    if (formData.birthday) {
      doctorData.birthday = formData.birthday;
    }
    if (formData.anniversary) {
      doctorData.anniversary = formData.anniversary;
    }
    if (formData.otherDetails && formData.otherDetails.trim()) {
      doctorData.otherDetails = formData.otherDetails.trim();
    }

    // Assign BDM (or explicitly unassign)
    if (formData.assignedTo) {
      doctorData.assignedTo = formData.assignedTo;
    } else {
      doctorData.assignedTo = null;
    }

    if (selectedDoctor) {
      doctorData._id = selectedDoctor._id;
    }

    const success = await onSave?.(doctorData);
    setSaving(false);

    if (success) {
      setShowModal(false);
      setSelectedDoctor(null);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedDoctor(null);
  };

  return (
    <div className="doctor-management">
      <style>{doctorManagementStyles}</style>

      {/* Filters Bar */}
      <div className="dm-filters-bar">
        {/* Search and Action Buttons */}
        <div className="dm-search-actions-row">
          <div className="dm-search-input-wrapper">
            <svg className="dm-search-input-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8"></circle>
              <path d="m21 21-4.35-4.35"></path>
            </svg>
            <input
              type="text"
              className="dm-search-input"
              placeholder="Search by name or address..."
              value={searchInput}
              onChange={(e) => onSearchChange?.(e.target.value)}
            />
          </div>
          <div className="dm-buttons-group">
            {onMassDeleteByUser && (
              <button onClick={handleOpenMassDelete} className="dm-mass-btn">
                <AlertTriangle size={16} />
                Mass Deactivate
              </button>
            )}
            <button onClick={handleCreate} className="dm-add-btn">
              <Plus size={18} />
              Add VIP Client
            </button>
          </div>
        </div>

        {/* Filter Dropdowns */}
        <div className="dm-dropdowns-row">
          <FilterDropdown
            value={filters.clientType || ''}
            onChange={(val) => handleFilterChange('clientType', val)}
            options={[
              { value: '', label: 'VIP Clients Only' },
              { value: 'all', label: 'All (VIP + Regular)' },
              { value: 'regular', label: 'Regular Clients Only' },
            ]}
          />
          {filters.clientType !== 'regular' && (
            <>
              <FilterDropdown
                value={filters.visitFrequency || ''}
                onChange={(val) => handleFilterChange('visitFrequency', val)}
                options={[
                  { value: '', label: 'All Frequencies' },
                  { value: '2', label: '2x per month' },
                  { value: '4', label: '4x per month' },
                ]}
              />
              <FilterDropdown
                value={filters.supportDuringCoverage || ''}
                onChange={(val) => handleFilterChange('supportDuringCoverage', val)}
                options={[
                  { value: '', label: 'All Support Types' },
                  ...SUPPORT_TYPES.map(t => ({ value: t, label: t })),
                ]}
              />
              <FilterDropdown
                value={filters.programsToImplement || ''}
                onChange={(val) => handleFilterChange('programsToImplement', val)}
                options={[
                { value: '', label: 'All Programs' },
                ...PROGRAMS.map(p => ({ value: p, label: p })),
              ]}
            />
          </>
        )}
        </div>
      </div>

      {/* Table (Desktop) + Card List (Mobile) */}
      <div className={`dm-content-wrapper${loading ? ' table-loading' : ''}`}>
        {doctors.length > 0 ? (
          <>
            <div className="dm-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Specialization</th>
                    <th>Hospital / Address</th>
                    <th>Assigned BDM</th>
                    <th>Visit Freq</th>
                    <th>Engagement</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {doctors.map((doctor, index) => (
                    <tr key={doctor._id}>
                      <td className="col-index">
                        {(pagination.page - 1) * pagination.limit + index + 1}
                      </td>
                      <td>
                        <span className="doctor-name">
                          {doctor.fullName || `${doctor.firstName} ${doctor.lastName}`}
                        </span>
                      </td>
                      <td>
                        <span className={`client-type-badge ${doctor._clientType === 'regular' ? 'regular' : 'vip'}`}>
                          {doctor._clientType === 'regular' ? 'Regular' : 'VIP'}
                        </span>
                      </td>
                      <td>{doctor.specialization || '—'}</td>
                      <td>{doctor.clinicOfficeAddress || doctor.hospital || '—'}</td>
                      <td>{doctor.assignedTo?.name || doctor._ownerName || '—'}</td>
                      <td>
                        <span className={`visit-freq-badge freq-${doctor.visitFrequency || 2}`}>
                          {doctor.visitFrequency || 2}x/mo
                        </span>
                      </td>
                      <td>{doctor.levelOfEngagement || doctor.engagementLevel || '—'}</td>
                      <td>
                        <div className="actions-cell">
                          {doctor._clientType !== 'regular' ? (
                            <>
                              <button
                                onClick={() => handleEdit(doctor)}
                                className="action-btn edit"
                              >
                                <Edit2 size={14} />
                                Edit
                              </button>
                              <button
                                onClick={() => handleDeleteClick(doctor)}
                                className="action-btn delete"
                              >
                                <Trash2 size={14} />
                                Delete
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => onUpgradeToVIP?.(doctor)}
                              className="action-btn upgrade"
                            >
                              <ArrowUpCircle size={14} />
                              Upgrade to VIP
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="mobile-card-list">
              {doctors.map((doctor, index) => (
                <div key={doctor._id} className="mobile-card">
                  <div className="mobile-card-header">
                    <span className="mobile-card-name">
                      #{(pagination.page - 1) * pagination.limit + index + 1}{' '}
                      {doctor.fullName || `${doctor.firstName} ${doctor.lastName}`}
                    </span>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span className={`client-type-badge ${doctor._clientType === 'regular' ? 'regular' : 'vip'}`}>
                        {doctor._clientType === 'regular' ? 'Regular' : 'VIP'}
                      </span>
                      {doctor.visitFrequency && (
                        <span className={`visit-freq-badge freq-${doctor.visitFrequency}`}>
                          {doctor.visitFrequency}x/mo
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="mobile-card-meta">
                    {doctor.specialization && (
                      <div className="mobile-card-row">
                        <span>Specialty</span>
                        <span>{doctor.specialization}</span>
                      </div>
                    )}
                    {doctor.clinicOfficeAddress && (
                      <div className="mobile-card-row">
                        <span>Address</span>
                        <span>{doctor.clinicOfficeAddress}</span>
                      </div>
                    )}
                    {(doctor.assignedTo?.name || doctor._ownerName) && (
                      <div className="mobile-card-row">
                        <span>BDM</span>
                        <span>{doctor.assignedTo?.name || doctor._ownerName}</span>
                      </div>
                    )}
                    {doctor.levelOfEngagement && (
                      <div className="mobile-card-row">
                        <span>Engagement</span>
                        <span className={`eng-badge ${doctor.levelOfEngagement <= 2 ? 'eng-low' : doctor.levelOfEngagement === 3 ? 'eng-mid' : 'eng-high'}`}>
                          {doctor.levelOfEngagement}/5
                        </span>
                      </div>
                    )}
                  </div>
                  <div className="mobile-card-actions">
                    {doctor._clientType !== 'regular' ? (
                      <>
                        <button onClick={() => handleEdit(doctor)} className="action-btn edit">
                          <Edit2 size={16} /> Edit
                        </button>
                        <button onClick={() => handleDeleteClick(doctor)} className="action-btn delete">
                          <Trash2 size={16} /> Delete
                        </button>
                      </>
                    ) : (
                      <button onClick={() => onUpgradeToVIP?.(doctor)} className="action-btn upgrade">
                        <ArrowUpCircle size={16} /> Upgrade to VIP
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>
              {filters.clientType === 'regular' ? 'No Regular Clients found' : 'No VIP Clients found'}
            </p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.total > 0 && (
        <div className="pagination">
          <div className="pagination-info">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} {filters.clientType === 'regular' ? 'Clients' : 'VIP Clients'}
          </div>
          <div className="pagination-buttons">
            <button
              className="pagination-btn"
              onClick={() => onPageChange?.(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              Previous
            </button>
            <span className="pagination-page-indicator">
              Page {pagination.page} of {pagination.pages || 1}
            </span>
            <button
              className="pagination-btn"
              onClick={() => onPageChange?.(pagination.page + 1)}
              disabled={pagination.page >= pagination.pages}
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>{selectedDoctor ? 'Edit VIP Client' : 'Add New VIP Client'}</h3>
              <button className="modal-close" onClick={handleCloseModal}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <form onSubmit={handleSubmit}>
              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="lastName">Last Name *</label>
                  <input
                    type="text"
                    id="lastName"
                    name="lastName"
                    value={formData.lastName}
                    onChange={handleFormChange}
                    required
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="firstName">First Name *</label>
                  <input
                    type="text"
                    id="firstName"
                    name="firstName"
                    value={formData.firstName}
                    onChange={handleFormChange}
                    required
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="specialization">VIP Specialty</label>
                  <select
                    id="specialization"
                    name="specialization"
                    value={formData.specialization}
                    onChange={handleFormChange}
                  >
                    <option value="">— Select —</option>
                    {specializations.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="outletIndicator">Outlet Indicator</label>
                  <input
                    type="text"
                    id="outletIndicator"
                    name="outletIndicator"
                    value={formData.outletIndicator}
                    onChange={handleFormChange}
                  />
                </div>
              </div>

              <div className="form-group full-width">
                <label htmlFor="clinicOfficeAddress">Clinic/Office Address</label>
                <input
                  type="text"
                  id="clinicOfficeAddress"
                  name="clinicOfficeAddress"
                  value={formData.clinicOfficeAddress}
                  onChange={handleFormChange}
                  placeholder="Hospital, clinic, or office address"
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="phone">Phone</label>
                  <input
                    type="tel"
                    id="phone"
                    name="phone"
                    value={formData.phone}
                    onChange={handleFormChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="email">Email</label>
                  <input
                    type="email"
                    id="email"
                    name="email"
                    value={formData.email}
                    onChange={handleFormChange}
                  />
                </div>
              </div>

              <div className="form-group full-width">
                <label htmlFor="notes">Notes</label>
                <textarea
                  id="notes"
                  name="notes"
                  value={formData.notes}
                  onChange={handleFormChange}
                  placeholder="Additional notes about this VIP Client..."
                />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="levelOfEngagement">Level of Engagement</label>
                  <select
                    id="levelOfEngagement"
                    name="levelOfEngagement"
                    value={formData.levelOfEngagement}
                    onChange={handleFormChange}
                  >
                    <option value="">Select Level</option>
                    {ENGAGEMENT_LEVELS.map((level) => (
                      <option key={level.value} value={level.value}>
                        {level.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label htmlFor="visitFrequencyNew">Visit Frequency *</label>
                  <select
                    id="visitFrequencyNew"
                    name="visitFrequency"
                    value={formData.visitFrequency}
                    onChange={handleFormChange}
                    required
                  >
                    <option value={2}>2x per month</option>
                    <option value={4}>4x per month</option>
                  </select>
                </div>
              </div>

              <div className="form-group full-width">
                <label htmlFor="assignedTo">Assigned BDM</label>
                <select
                  id="assignedTo"
                  name="assignedTo"
                  value={formData.assignedTo}
                  onChange={handleFormChange}
                >
                  <option value="">-- No BDM Assigned --</option>
                  {employees.map((emp) => (
                    <option key={emp._id} value={emp._id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div className="form-group full-width">
                <label>Programs to Implement</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                  {PROGRAMS.map((program) => (
                    <label key={program} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        style={{ width: '14px', height: '14px', flexShrink: 0 }}
                        checked={formData.programsToImplement?.includes(program) || false}
                        onChange={(e) => {
                          const updated = e.target.checked
                            ? [...(formData.programsToImplement || []), program]
                            : (formData.programsToImplement || []).filter((p) => p !== program);
                          setFormData((prev) => ({ ...prev, programsToImplement: updated }));
                        }}
                      />
                      {program}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group full-width">
                <label>Support During Coverage</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '4px' }}>
                  {SUPPORT_TYPES.map((support) => (
                    <label key={support} style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        style={{ width: '14px', height: '14px', flexShrink: 0 }}
                        checked={formData.supportDuringCoverage?.includes(support) || false}
                        onChange={(e) => {
                          const updated = e.target.checked
                            ? [...(formData.supportDuringCoverage || []), support]
                            : (formData.supportDuringCoverage || []).filter((s) => s !== support);
                          setFormData((prev) => ({ ...prev, supportDuringCoverage: updated }));
                        }}
                      />
                      {support}
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="secretaryName">Secretary Name</label>
                  <input
                    type="text"
                    id="secretaryName"
                    name="secretaryName"
                    value={formData.secretaryName}
                    onChange={handleFormChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="secretaryPhone">Secretary Phone</label>
                  <input
                    type="tel"
                    id="secretaryPhone"
                    name="secretaryPhone"
                    value={formData.secretaryPhone}
                    onChange={handleFormChange}
                  />
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label htmlFor="birthday">Birthday</label>
                  <input
                    type="date"
                    id="birthday"
                    name="birthday"
                    value={formData.birthday}
                    onChange={handleFormChange}
                  />
                </div>
                <div className="form-group">
                  <label htmlFor="anniversary">Anniversary</label>
                  <input
                    type="date"
                    id="anniversary"
                    name="anniversary"
                    value={formData.anniversary}
                    onChange={handleFormChange}
                  />
                </div>
              </div>

              <div className="form-group full-width">
                <label htmlFor="otherDetails">Other Details</label>
                <textarea
                  id="otherDetails"
                  name="otherDetails"
                  value={formData.otherDetails}
                  onChange={handleFormChange}
                  placeholder="Any additional information..."
                />
              </div>

            </form>
            </div>
            <div className="form-actions">
              <button type="button" onClick={handleCloseModal} className="btn btn-cancel">Cancel</button>
              <button type="submit" onClick={handleSubmit} className="btn btn-save" disabled={saving}>
                {saving ? 'Saving...' : selectedDoctor ? 'Update VIP Client' : 'Add VIP Client'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={showConfirmDelete}
        onClose={() => { setShowConfirmDelete(false); setSelectedDoctor(null); }}
        onConfirm={handleConfirmDelete}
        title="Deactivate VIP Client"
        message={
          <p>
            Are you sure you want to deactivate <strong>{selectedDoctor?.fullName || `${selectedDoctor?.firstName} ${selectedDoctor?.lastName}`}</strong>?
            This action can be undone later.
          </p>
        }
        confirmButtonText="Deactivate"
      />

      {/* Mass Delete - Step 1: BDM Picker */}
      {showMassDelete && (
        <div className="dm-mass-delete-modal" onClick={() => setShowMassDelete(false)}>
          <div className="dm-mass-delete-box" onClick={(e) => e.stopPropagation()}>
            <h3>Mass Deactivate VIP Clients</h3>
            <p>Select a BDM to deactivate all their assigned VIP Clients.</p>
            <select
              value={selectedBdmId}
              onChange={(e) => setSelectedBdmId(e.target.value)}
            >
              <option value="">-- Select a BDM --</option>
              {employees.map((emp) => (
                <option key={emp._id} value={emp._id}>{emp.name}</option>
              ))}
            </select>
            {selectedBdmId && massDeleteCount !== null && massDeleteCount > 0 && (
              <div style={{ background: '#fef3c7', color: '#92400e', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                {massDeleteCount} active VIP Client{massDeleteCount !== 1 ? 's' : ''} assigned to this BDM
              </div>
            )}
            {selectedBdmId && massDeleteCount === 0 && (
              <div style={{ background: '#f3f4f6', color: '#6b7280', padding: '10px 14px', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
                No active VIP Clients assigned to this BDM
              </div>
            )}
            <div className="dm-mass-delete-actions">
              <button onClick={() => setShowMassDelete(false)} className="btn btn-cancel">
                Cancel
              </button>
              <button
                onClick={handleMassDeleteProceed}
                className="btn"
                style={{ background: '#dc2626', color: 'white' }}
                disabled={!selectedBdmId || !massDeleteCount}
              >
                Proceed
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mass Delete - Step 2: Type to Confirm */}
      <ConfirmDeleteModal
        isOpen={showMassDeleteConfirm}
        onClose={handleMassDeleteCancel}
        onConfirm={handleMassDeleteConfirm}
        title="Confirm Mass Deactivation"
        message={
          <p>
            This will deactivate <strong>all active VIP Clients</strong> assigned to{' '}
            <strong>{employees.find((e) => e._id === selectedBdmId)?.name || 'this BDM'}</strong>.
            This action can be undone later by reactivating individual VIP Clients.
          </p>
        }
        confirmButtonText="Deactivate All"
        loading={massDeleteLoading}
        itemCount={massDeleteCount}
      />
    </div>
  );
};

export default DoctorManagement;

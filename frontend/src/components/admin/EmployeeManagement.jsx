/**
 * EmployeeManagement Component
 *
 * Admin component for managing employees:
 * - CRUD operations for employees
 * - Role assignment
 * - Account activation/deactivation
 */

import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import PropTypes from 'prop-types';
import { Search, Plus, Eye, Edit2, Power, X, ChevronDown, KeyRound, Unlock, Trash2 } from 'lucide-react';
import ConfirmDeleteModal from '../common/ConfirmDeleteModal';
import userService from '../../services/userService';
import { ROLES } from '../../constants/roles';

const employeeManagementStyles = `
  .employee-management {
    background: white;
    border-radius: 12px;
    border: 1px solid #e5e7eb;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  /* Filters Bar */
  .filters-bar {
    display: flex;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid #e5e7eb;
    flex-wrap: wrap;
    align-items: center;
  }

  .search-wrapper {
    flex: 1;
    min-width: 200px;
    position: relative;
  }

  .search-wrapper svg {
    position: absolute;
    left: 12px;
    top: 50%;
    transform: translateY(-50%);
    color: #9ca3af;
  }

  .search-wrapper input {
    width: 100%;
    padding: 10px 12px 10px 38px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    background: #f9fafb;
  }

  .search-wrapper input:focus {
    outline: none;
    border-color: #f59e0b;
    background: white;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
  }

  .filter-select {
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    background: #f9fafb;
    min-width: 130px;
    cursor: pointer;
  }

  .filter-select:focus {
    outline: none;
    border-color: #f59e0b;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
  }

  .filter-select option {
    padding: 10px 12px;
    background: #ffffff;
    color: #111827;
  }

  .filter-select option:checked {
    background: #fef3c7;
    color: #92400e;
  }

  /* Custom Dropdown (Employee Management) */
  .em-custom-select-wrapper {
    position: relative;
    min-width: 130px;
  }

  .em-custom-select-trigger {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    background: #f9fafb;
    cursor: pointer;
    color: #374151;
    transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
    text-align: left;
  }

  .em-custom-select-trigger:hover {
    border-color: #d1d5db;
    background: #f3f4f6;
  }

  .em-custom-select-trigger.em-cs-open {
    border-color: #f59e0b;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
    background: white;
  }

  .em-cs-chevron {
    transition: transform 0.2s;
    flex-shrink: 0;
    color: #9ca3af;
  }

  .em-cs-chevron.em-cs-chevron-open {
    transform: rotate(180deg);
    color: #f59e0b;
  }

  .em-custom-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    min-width: 100%;
    background: white;
    border: 1px solid #e5e7eb;
    border-radius: 10px;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.12), 0 4px 10px rgba(0, 0, 0, 0.06);
    z-index: 200;
    overflow: hidden;
    animation: em-dropdown-in 0.13s ease;
  }

  @keyframes em-dropdown-in {
    from { opacity: 0; transform: translateY(-6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .em-custom-option {
    padding: 10px 14px;
    font-size: 13px;
    cursor: pointer;
    color: #374151;
    transition: background 0.1s, color 0.1s;
    white-space: nowrap;
  }

  .em-custom-option:hover {
    background: #fffbeb;
    color: #d97706;
  }

  .em-custom-option.em-co-active {
    background: #fef3c7;
    color: #d97706;
    font-weight: 600;
  }

  .em-custom-option.em-co-active:hover {
    background: #fde68a;
  }

  .add-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    color: white;
    border: none;
    border-radius: 8px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .add-btn:hover {
    background: linear-gradient(135deg, #f59e0b, #d97706);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(245, 158, 11, 0.3);
  }

  /* Table Container */
  .table-container {
    flex: 1;
    overflow: auto;
  }

  .em-body {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* Clean Table */
  .data-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
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

  .data-table th.col-index {
    width: 50px;
    text-align: center;
  }

  .data-table th.col-actions {
    width: 240px;
    text-align: center;
  }

  .data-table td {
    padding: 14px 16px;
    border-bottom: 1px solid #f3f4f6;
    color: #374151;
  }

  .data-table td.col-index {
    text-align: center;
    color: #9ca3af;
    font-weight: 500;
  }

  .data-table tr:hover {
    background: #fefce8;
  }

  .data-table tr:last-child td {
    border-bottom: none;
  }

  /* Cell styling */
  .employee-name {
    font-weight: 600;
    color: #1f2937;
  }

  .employee-email {
    color: #6b7280;
    font-size: 13px;
  }

  /* Badges */
  .role-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }

  .role-badge.role-admin {
    background: #fef3c7;
    color: #d97706;
  }

  .role-badge.role-employee {
    background: #dbeafe;
    color: #2563eb;
  }

  .status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 500;
  }

  .status-badge::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .status-badge.status-active {
    background: #dcfce7;
    color: #16a34a;
  }

  .status-badge.status-active::before {
    background: #16a34a;
  }

  .status-badge.status-inactive {
    background: #fee2e2;
    color: #dc2626;
  }

  .status-badge.status-inactive::before {
    background: #dc2626;
  }

  /* Icon Action Buttons */
  .actions-cell {
    display: flex;
    justify-content: center;
    gap: 8px;
  }

  .action-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 6px;
    border: none;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
    white-space: nowrap;
  }

  .action-btn.view {
    background: #dbeafe;
    color: #2563eb;
  }

  .action-btn.view:hover {
    background: #bfdbfe;
  }

  .action-btn.edit {
    background: #fef3c7;
    color: #d97706;
  }

  .action-btn.edit:hover {
    background: #fde68a;
  }

  .action-btn.toggle-active {
    background: #fee2e2;
    color: #dc2626;
  }

  .action-btn.toggle-active:hover {
    background: #fecaca;
  }

  .action-btn.toggle-inactive {
    background: #dcfce7;
    color: #16a34a;
  }

  .action-btn.toggle-inactive:hover {
    background: #bbf7d0;
  }

  .action-btn.reset-pw {
    background: #e0e7ff;
    color: #4338ca;
  }

  .action-btn.reset-pw:hover {
    background: #c7d2fe;
  }

  .action-btn.unlock {
    background: #d1fae5;
    color: #059669;
  }

  .action-btn.unlock:hover {
    background: #a7f3d0;
  }

  .action-btn.delete-perm {
    background: #fce7f3;
    color: #be185d;
  }

  .action-btn.delete-perm:hover {
    background: #fbcfe8;
  }

  /* Reset Password Modal */
  .reset-pw-modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .reset-pw-modal {
    background: white;
    border-radius: 12px;
    padding: 24px;
    width: 400px;
    max-width: 90vw;
  }

  .reset-pw-modal h3 {
    margin: 0 0 16px;
    font-size: 16px;
    color: #1f2937;
  }

  .reset-pw-modal input {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #d1d5db;
    border-radius: 8px;
    font-size: 14px;
    margin-bottom: 16px;
    box-sizing: border-box;
  }

  .reset-pw-modal .modal-actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .reset-pw-modal .btn {
    padding: 8px 16px;
    border-radius: 8px;
    border: none;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
  }

  .reset-pw-modal .btn-cancel {
    background: #f3f4f6;
    color: #374151;
  }

  .reset-pw-modal .btn-confirm {
    background: #4338ca;
    color: white;
  }

  .reset-pw-modal .btn-confirm:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  body.dark-mode .reset-pw-modal {
    background: #1e293b;
  }

  body.dark-mode .reset-pw-modal h3 {
    color: #f1f5f9;
  }

  body.dark-mode .reset-pw-modal input {
    background: #0f172a;
    border-color: #334155;
    color: #f1f5f9;
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
    max-width: 520px;
    max-height: 90vh;
    overflow: hidden;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }

  .modal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px 24px;
    border-bottom: 1px solid #e5e7eb;
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
    max-height: calc(90vh - 140px);
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
  .form-group select {
    width: 100%;
    padding: 10px 12px;
    border: 1px solid #e5e7eb;
    border-radius: 8px;
    font-size: 14px;
    box-sizing: border-box;
    background: #f9fafb;
  }

  .form-group .em-custom-select-wrapper {
    width: 100%;
  }

  .form-group select option {
    padding: 10px 12px;
    background: #ffffff;
    color: #111827;
  }

  .form-group select option:checked {
    background: #fef3c7;
    color: #92400e;
  }

  .form-group input:focus,
  .form-group select:focus {
    outline: none;
    border-color: #f59e0b;
    background: white;
    box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.1);
  }

  .form-group input:disabled {
    background: #f3f4f6;
    cursor: not-allowed;
  }

  .form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 12px;
    padding: 16px 24px;
    border-top: 1px solid #e5e7eb;
    background: #f9fafb;
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

  .btn-secondary {
    background: #f3f4f6;
    color: #374151;
    border: 1px solid #e5e7eb;
  }

  .btn-secondary:hover {
    background: #e5e7eb;
  }

  .btn-primary {
    background: linear-gradient(135deg, #fbbf24, #f59e0b);
    color: white;
  }

  .btn-primary:hover {
    background: linear-gradient(135deg, #f59e0b, #d97706);
  }

  .btn-primary:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Password hint */
  .password-hint {
    font-size: 12px;
    color: #9ca3af;
    margin-top: 4px;
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

  /* Mobile Card View */
  .mobile-card-list {
    display: none;
  }

  .mobile-card {
    background: white;
    border-bottom: 1px solid #f3f4f6;
    padding: 16px 20px;
  }

  .mobile-card:last-child {
    border-bottom: none;
  }

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

  /* Responsive - Tablet */
  @media (max-width: 1024px) {
    .data-table th:nth-child(4),
    .data-table td:nth-child(4) {
      display: none;
    }
  }

  /* Responsive - Mobile */
  @media (max-width: 640px) {
    .filters-bar {
      padding: 12px 16px;
    }

    .search-wrapper {
      min-width: 100%;
      order: 1;
    }

    .filter-select,
    .em-custom-select-wrapper {
      flex: 1;
      min-width: 0;
    }

    .add-btn {
      order: 0;
      width: 100%;
      justify-content: center;
    }

    .table-container {
      display: none;
    }

    .mobile-card-list {
      display: block;
    }

    .pagination {
      flex-direction: column;
      gap: 12px;
      align-items: center;
    }

    .em-body {
      overflow: visible;
      flex: none;
    }

    .modal-content {
      max-width: 100%;
      max-height: 100%;
      height: 100%;
      border-radius: 0;
    }

    .modal-body {
      max-height: calc(100vh - 140px);
    }

    .form-row {
      grid-template-columns: 1fr;
      gap: 0;
    }

    .form-group input,
    .form-group select,
    .form-group .em-custom-select-trigger {
      min-height: 44px;
      font-size: 16px;
    }

    .form-actions {
      flex-direction: column-reverse;
    }

    .form-actions .btn {
      width: 100%;
      min-height: 48px;
    }
  }

  /* ===== DARK MODE ===== */
  body.dark-mode .employee-management {
    background: #0f172a;
    border-color: #1e293b;
  }

  body.dark-mode .filters-bar {
    border-color: #1e293b;
  }

  body.dark-mode .search-wrapper input {
    background: #1e293b;
    border-color: #334155;
    color: #e2e8f0;
  }

  body.dark-mode .search-wrapper input::placeholder {
    color: #64748b;
  }

  body.dark-mode .search-wrapper input:focus {
    background: #0f172a;
    border-color: #f59e0b;
  }

  body.dark-mode .search-wrapper svg {
    color: #64748b;
  }

  body.dark-mode .filter-select {
    background: #1e293b;
    border-color: #334155;
    color: #e2e8f0;
  }

  body.dark-mode .filter-select:focus {
    border-color: #f59e0b;
  }

  body.dark-mode .filter-select option {
    background: #0f172a;
    color: #e2e8f0;
  }

  body.dark-mode .filter-select option:checked {
    background: #1e293b;
    color: #fbbf24;
  }

  body.dark-mode .em-custom-select-trigger {
    background: #1e293b;
    border-color: #334155;
    color: #e2e8f0;
  }

  body.dark-mode .em-custom-select-trigger:hover {
    border-color: #475569;
    background: #273548;
  }

  body.dark-mode .em-custom-select-trigger.em-cs-open {
    border-color: #f59e0b;
    background: #0f172a;
  }

  body.dark-mode .em-custom-dropdown {
    background: #1e293b;
    border-color: #334155;
    box-shadow: 0 12px 28px rgba(0, 0, 0, 0.5);
  }

  body.dark-mode .em-custom-option {
    color: #e2e8f0;
  }

  body.dark-mode .em-custom-option:hover {
    background: #1e3a5f;
    color: #fbbf24;
  }

  body.dark-mode .em-custom-option.em-co-active {
    background: #2d2a1a;
    color: #fbbf24;
  }

  body.dark-mode .em-custom-option.em-co-active:hover {
    background: #3d3818;
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

  body.dark-mode .employee-name {
    color: #f1f5f9;
  }

  body.dark-mode .employee-email {
    color: #94a3b8;
  }

  body.dark-mode .role-badge.role-admin {
    background: #451a03;
    color: #fbbf24;
  }

  body.dark-mode .role-badge.role-employee {
    background: #1e3a5f;
    color: #60a5fa;
  }

  body.dark-mode .status-badge.status-active {
    background: #052e16;
    color: #4ade80;
  }

  body.dark-mode .status-badge.status-active::before {
    background: #4ade80;
  }

  body.dark-mode .status-badge.status-inactive {
    background: #450a0a;
    color: #f87171;
  }

  body.dark-mode .status-badge.status-inactive::before {
    background: #f87171;
  }

  body.dark-mode .action-btn.view {
    background: #1e3a5f;
    color: #60a5fa;
  }

  body.dark-mode .action-btn.view:hover {
    background: #1e40af;
  }

  body.dark-mode .action-btn.edit {
    background: #451a03;
    color: #fbbf24;
  }

  body.dark-mode .action-btn.edit:hover {
    background: #78350f;
  }

  body.dark-mode .action-btn.toggle-active {
    background: #450a0a;
    color: #f87171;
  }

  body.dark-mode .action-btn.toggle-active:hover {
    background: #7f1d1d;
  }

  body.dark-mode .action-btn.toggle-inactive {
    background: #052e16;
    color: #4ade80;
  }

  body.dark-mode .action-btn.toggle-inactive:hover {
    background: #166534;
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

  body.dark-mode .modal-overlay {
    background: rgba(0, 0, 0, 0.7);
  }

  body.dark-mode .modal-content {
    background: #0f172a;
  }

  body.dark-mode .modal-header {
    border-color: #1e293b;
  }

  body.dark-mode .modal-header h3 {
    color: #f1f5f9;
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
  body.dark-mode .form-group select {
    background: #1e293b;
    border-color: #334155;
    color: #e2e8f0;
  }

  body.dark-mode .form-group input:focus,
  body.dark-mode .form-group select:focus {
    background: #0f172a;
    border-color: #f59e0b;
  }

  body.dark-mode .form-group select option {
    background: #0f172a;
    color: #e2e8f0;
  }

  body.dark-mode .form-group select option:checked {
    background: #1e293b;
    color: #fbbf24;
  }

  body.dark-mode .form-group input:disabled {
    background: #334155;
    color: #64748b;
  }

  body.dark-mode .form-actions {
    background: #1e293b;
    border-color: #334155;
  }

  body.dark-mode .btn-secondary {
    background: #334155;
    border-color: #475569;
    color: #e2e8f0;
  }

  body.dark-mode .btn-secondary:hover {
    background: #475569;
  }

  body.dark-mode .password-hint {
    color: #64748b;
  }

  body.dark-mode .empty-state {
    color: #94a3b8;
  }

  body.dark-mode .mobile-card {
    border-color: #1e293b;
    background: #0f172a;
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

function EmployeeDropdown({ value, onChange, options }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = options.find((option) => option.value === value);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  return (
    <div className="em-custom-select-wrapper" ref={ref}>
      <button
        type="button"
        className={`em-custom-select-trigger${open ? ' em-cs-open' : ''}`}
        onClick={() => setOpen((prev) => !prev)}
      >
        <span>{selected ? selected.label : options[0]?.label}</span>
        <ChevronDown size={14} className={`em-cs-chevron${open ? ' em-cs-chevron-open' : ''}`} />
      </button>
      {open && (
        <div className="em-custom-dropdown">
          {options.map((option) => (
            <div
              key={option.value}
              className={`em-custom-option${option.value === value ? ' em-co-active' : ''}`}
              onClick={() => {
                onChange(option.value);
                setOpen(false);
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

EmployeeDropdown.propTypes = {
  value: PropTypes.string,
  onChange: PropTypes.func.isRequired,
  options: PropTypes.arrayOf(PropTypes.shape({ value: PropTypes.string, label: PropTypes.string })).isRequired,
};

const EmployeeManagement = ({
  employees = [],
  filters = {},
  pagination = {},
  loading = false,
  onSave,
  onDelete,
  onToggleStatus,
  onResetPassword,
  onUnlock,
  onPermanentDelete,
  onFilterChange,
  onPageChange,
}) => {
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();
  const [showConfirmDelete, setShowConfirmDelete] = useState(false);
  const [showResetPwModal, setShowResetPwModal] = useState(false);
  const [resetPwTarget, setResetPwTarget] = useState(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [showConfirmPermDelete, setShowConfirmPermDelete] = useState(false);
  const [permDeleteTarget, setPermDeleteTarget] = useState(null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    phone: '',
    role: ROLES.CONTRACTOR,
    entity_id: '',
    entity_ids: [],
    erp_access_enabled: false,
    erp_access_template_id: '',
  });
  const [saving, setSaving] = useState(false);
  const [localFilters, setLocalFilters] = useState(filters);
  const [entities, setEntities] = useState([]);
  const [accessTemplates, setAccessTemplates] = useState([]);

  // Fetch entities and access templates for dropdowns
  useEffect(() => {
    (async () => {
      try {
        const [entRes, tmplRes] = await Promise.all([
          userService.getEntities(),
          userService.getAccessTemplates(),
        ]);
        setEntities(entRes.data || []);
        setAccessTemplates(tmplRes.data || []);
      } catch (err) {
        console.error('[EmployeeManagement] Failed to load lookups:', err.message);
      }
    })();
  }, []);

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localFilters.search !== filters.search) {
        onFilterChange?.({ ...filters, search: localFilters.search });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localFilters.search, filters, onFilterChange]);

  const handleFilterChange = (field, value) => {
    if (field === 'search') {
      setLocalFilters((prev) => ({ ...prev, search: value }));
    } else {
      onFilterChange?.({ ...filters, [field]: value });
    }
  };

  const handleCreate = () => {
    setSelectedEmployee(null);
    setFormData({
      name: '',
      email: '',
      password: '',
      phone: '',
      role: ROLES.CONTRACTOR,
      entity_id: '',
      entity_ids: [],
      erp_access_enabled: false,
      erp_access_template_id: '',
    });
    setShowModal(true);
  };

  const handleEdit = (employee) => {
    setSelectedEmployee(employee);
    const primaryEid = employee.entity_id?._id || employee.entity_id || '';
    // Initialize entity_ids from the user's data, fallback to [primary] if not set
    const existingIds = (employee.entity_ids && employee.entity_ids.length > 0)
      ? employee.entity_ids.map(id => id?._id || id).filter(Boolean)
      : (primaryEid ? [primaryEid] : []);
    setFormData({
      name: employee.name || '',
      email: employee.email || '',
      password: '', // Don't show existing password
      phone: employee.phone || '',
      role: employee.role || ROLES.CONTRACTOR,
      entity_id: primaryEid,
      entity_ids: existingIds,
      erp_access_enabled: employee.erp_access?.enabled || false,
      erp_access_template_id: employee.erp_access?.template_id || '',
    });
    setShowModal(true);
  };

  const handleConfirmDelete = async () => {
    if (selectedEmployee) {
      await onDelete?.(selectedEmployee._id);
      setShowConfirmDelete(false);
      setSelectedEmployee(null);
    }
  };

  const handleFormChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);

    const employeeData = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone,
      role: formData.role,
    };

    // Entity assignment
    if (formData.entity_id) {
      employeeData.entity_id = formData.entity_id;
    }
    // Multi-entity access
    if (formData.entity_ids && formData.entity_ids.length > 0) {
      employeeData.entity_ids = formData.entity_ids;
    }

    // ERP access — build the erp_access object
    const erpAccess = { enabled: formData.erp_access_enabled };
    if (formData.erp_access_enabled && formData.erp_access_template_id) {
      const tmpl = accessTemplates.find(t => t._id === formData.erp_access_template_id);
      if (tmpl) {
        erpAccess.template_id = tmpl._id;
        erpAccess.modules = { ...tmpl.modules };
        erpAccess.can_approve = tmpl.can_approve || false;
      }
    }
    employeeData.erp_access = erpAccess;

    // Only include password for new employees or if it's been changed
    if (!selectedEmployee && formData.password) {
      employeeData.password = formData.password;
    } else if (selectedEmployee && formData.password) {
      employeeData.password = formData.password;
    }

    if (selectedEmployee) {
      employeeData._id = selectedEmployee._id;
    }

    const success = await onSave?.(employeeData);
    setSaving(false);

    if (success) {
      setShowModal(false);
      setSelectedEmployee(null);
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setSelectedEmployee(null);
  };

  return (
    <div className="employee-management">
      <style>{employeeManagementStyles}</style>

      {/* Filters Bar */}
      <div className="filters-bar">
        <div className="search-wrapper">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={localFilters.search || ''}
            onChange={(e) => handleFilterChange('search', e.target.value)}
          />
        </div>
        <EmployeeDropdown
          value={filters.role || ''}
          onChange={(value) => handleFilterChange('role', value)}
          options={[
            { value: '', label: 'All Roles' },
            { value: 'admin', label: 'Admin' },
            { value: ROLES.CONTRACTOR, label: 'BDM' },
          ]}
        />
        <EmployeeDropdown
          value={filters.isActive === '' ? '' : filters.isActive}
          onChange={(value) => handleFilterChange('isActive', value)}
          options={[
            { value: '', label: 'All Status' },
            { value: 'true', label: 'Active' },
            { value: 'false', label: 'Inactive' },
          ]}
        />
        <button onClick={handleCreate} className="add-btn">
          <Plus size={18} />
          Add BDM
        </button>
      </div>

      {/* Table Container (Desktop) + Card List (Mobile) */}
      <div className={`em-body${loading ? ' table-loading' : ''}`}>
        {employees.length > 0 ? (
          <>
            <div className="table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="col-index">#</th>
                    <th>Name</th>
                    <th>Email</th>
                    <th>Phone</th>
                    <th>Entity</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th className="col-actions">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {employees.map((employee, index) => (
                    <tr key={employee._id}>
                      <td className="col-index">
                        {(pagination.page - 1) * pagination.limit + index + 1}
                      </td>
                      <td>
                        <span className="employee-name">{employee.name}</span>
                      </td>
                      <td>
                        <span className="employee-email">{employee.email}</span>
                      </td>
                      <td>{employee.phone || '-'}</td>
                      <td>{employee.entity_id?.short_name || employee.entity_id?.entity_name || '-'}</td>
                      <td>
                        <span className={`role-badge role-${employee.role}`}>
                          {employee.role === ROLES.CONTRACTOR ? 'BDM' : 'Admin'}
                        </span>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${
                            employee.isActive ? 'status-active' : 'status-inactive'
                          }`}
                        >
                          {employee.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="actions-cell">
                          <button
                            onClick={() => navigate(`/admin/employees/${employee._id}/visits`)}
                            className="action-btn view"
                            title="View Visits"
                          >
                            <Eye size={14} />
                            Visits
                          </button>
                          <button
                            onClick={() => handleEdit(employee)}
                            className="action-btn edit"
                            title="Edit"
                          >
                            <Edit2 size={14} />
                            Edit
                          </button>
                          <button
                            onClick={() => onToggleStatus?.(employee)}
                            className={`action-btn ${employee.isActive ? 'toggle-active' : 'toggle-inactive'}`}
                            title={employee.isActive ? 'Deactivate' : 'Activate'}
                          >
                            <Power size={14} />
                            {employee.isActive ? 'Deactivate' : 'Activate'}
                          </button>
                          <button
                            onClick={() => { setResetPwTarget(employee); setResetPwValue(''); setShowResetPwModal(true); }}
                            className="action-btn reset-pw"
                            title="Reset Password"
                          >
                            <KeyRound size={14} />
                            Reset PW
                          </button>
                          {!employee.isActive && (
                            <button
                              onClick={() => onUnlock?.(employee._id)}
                              className="action-btn unlock"
                              title="Unlock & Reactivate"
                            >
                              <Unlock size={14} />
                              Unlock
                            </button>
                          )}
                          <button
                            onClick={() => { setPermDeleteTarget(employee); setShowConfirmPermDelete(true); }}
                            className="action-btn delete-perm"
                            title="Permanently Delete"
                          >
                            <Trash2 size={14} />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card List */}
            <div className="mobile-card-list">
              {employees.map((employee, index) => (
                <div key={employee._id} className="mobile-card">
                  <div className="mobile-card-header">
                    <span className="mobile-card-name">
                      #{(pagination.page - 1) * pagination.limit + index + 1} {employee.name}
                    </span>
                    <span className={`status-badge ${employee.isActive ? 'status-active' : 'status-inactive'}`}>
                      {employee.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="mobile-card-meta">
                    <div className="mobile-card-row">
                      <span>Email</span>
                      <span>{employee.email}</span>
                    </div>
                    <div className="mobile-card-row">
                      <span>Role</span>
                      <span className={`role-badge role-${employee.role}`}>
                        {employee.role === ROLES.CONTRACTOR ? 'BDM' : 'Admin'}
                      </span>
                    </div>
                    {employee.phone && (
                      <div className="mobile-card-row">
                        <span>Phone</span>
                        <span>{employee.phone}</span>
                      </div>
                    )}
                  </div>
                  <div className="mobile-card-actions">
                    <button
                      onClick={() => navigate(`/admin/employees/${employee._id}/visits`)}
                      className="action-btn view"
                      title="View Visits"
                    >
                      <Eye size={16} />
                      Visits
                    </button>
                    <button
                      onClick={() => handleEdit(employee)}
                      className="action-btn edit"
                      title="Edit"
                    >
                      <Edit2 size={16} />
                      Edit
                    </button>
                    <button
                      onClick={() => onToggleStatus?.(employee)}
                      className={`action-btn ${employee.isActive ? 'toggle-active' : 'toggle-inactive'}`}
                      title={employee.isActive ? 'Deactivate' : 'Activate'}
                    >
                      <Power size={16} />
                      {employee.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      onClick={() => { setResetPwTarget(employee); setResetPwValue(''); setShowResetPwModal(true); }}
                      className="action-btn reset-pw"
                      title="Reset Password"
                    >
                      <KeyRound size={16} />
                      Reset PW
                    </button>
                    {!employee.isActive && (
                      <button
                        onClick={() => onUnlock?.(employee._id)}
                        className="action-btn unlock"
                        title="Unlock & Reactivate"
                      >
                        <Unlock size={16} />
                        Unlock
                      </button>
                    )}
                    <button
                      onClick={() => { setPermDeleteTarget(employee); setShowConfirmPermDelete(true); }}
                      className="action-btn delete-perm"
                      title="Permanently Delete"
                    >
                      <Trash2 size={16} />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="empty-state">
            <p>No BDMs found</p>
          </div>
        )}
      </div>

      {/* Pagination */}
      {pagination.total > 0 && (
        <div className="pagination">
          <div className="pagination-info">
            Showing {(pagination.page - 1) * pagination.limit + 1} to{' '}
            {Math.min(pagination.page * pagination.limit, pagination.total)} of{' '}
            {pagination.total} BDMs
          </div>
          <div className="pagination-buttons">
            <button
              className="pagination-btn"
              onClick={() => onPageChange?.(pagination.page - 1)}
              disabled={pagination.page <= 1}
            >
              Previous
            </button>
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
              <h3>{selectedEmployee ? 'Edit BDM' : 'Add New BDM'}</h3>
              <button className="modal-close" onClick={handleCloseModal}>
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <form onSubmit={handleSubmit}>
                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="name">Full Name *</label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={formData.name}
                      onChange={handleFormChange}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="email">Email *</label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleFormChange}
                      required
                      disabled={!!selectedEmployee}
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label htmlFor="password">
                      {selectedEmployee ? 'New Password' : 'Password *'}
                    </label>
                    <input
                      type="password"
                      id="password"
                      name="password"
                      value={formData.password}
                      onChange={handleFormChange}
                      required={!selectedEmployee}
                      placeholder={selectedEmployee ? 'Leave blank to keep current' : ''}
                      minLength={8}
                    />
                    <p className="password-hint">Minimum 8 characters</p>
                  </div>
                  <div className="form-group">
                    <label htmlFor="phone">Phone</label>
                    <input
                      type="tel"
                      id="phone"
                      name="phone"
                      value={formData.phone}
                      onChange={handleFormChange}
                      placeholder="+63..."
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label htmlFor="role">Role *</label>
                  <EmployeeDropdown
                    value={formData.role}
                    onChange={(value) => setFormData((prev) => ({ ...prev, role: value }))}
                    options={[
                      { value: ROLES.CONTRACTOR, label: 'BDM (Field Rep)' },
                      { value: 'admin', label: 'Admin' },
                    ]}
                  />
                </div>

                <div className="form-group">
                  <label style={{ marginBottom: 6, display: 'block' }}>Entity Access</label>
                  <div style={{ border: '1px solid var(--erp-border, #d1d5db)', borderRadius: 8, padding: '8px 12px', background: 'var(--erp-panel, #fff)' }}>
                    {entities.length === 0 && <span style={{ color: '#94a3b8', fontSize: 12 }}>No entities available</span>}
                    {entities.map(ent => {
                      const eid = ent._id;
                      const isChecked = formData.entity_ids.includes(eid);
                      const isPrimary = formData.entity_id === eid;
                      return (
                        <div key={eid} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: '1px solid #f1f5f9' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', flex: 1, margin: 0 }}>
                            <span
                              style={{
                                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                width: 18, height: 18, borderRadius: 4, flexShrink: 0,
                                border: isChecked ? 'none' : '2px solid #cbd5e1',
                                background: isChecked ? 'var(--erp-accent, #1e5eff)' : '#fff',
                                color: '#fff', fontSize: 12, transition: 'all 0.15s ease',
                              }}
                            >
                              {isChecked && '✓'}
                            </span>
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                setFormData(prev => {
                                  const ids = isChecked
                                    ? prev.entity_ids.filter(id => id !== eid)
                                    : [...prev.entity_ids, eid];
                                  // If unchecking the primary, set first remaining as primary
                                  let primary = prev.entity_id;
                                  if (isChecked && primary === eid) {
                                    primary = ids[0] || '';
                                  }
                                  // If checking first entity, make it primary
                                  if (!isChecked && !primary) {
                                    primary = eid;
                                  }
                                  return { ...prev, entity_ids: ids, entity_id: primary };
                                });
                              }}
                              style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                            />
                            <span style={{ fontSize: 13 }}>{ent.short_name || ent.entity_name}</span>
                          </label>
                          {isChecked && (
                            <button
                              type="button"
                              onClick={() => setFormData(prev => ({ ...prev, entity_id: eid }))}
                              style={{
                                fontSize: 10, padding: '2px 8px', borderRadius: 999,
                                border: isPrimary ? '1px solid var(--erp-accent, #1e5eff)' : '1px solid #d1d5db',
                                background: isPrimary ? 'var(--erp-accent, #1e5eff)' : 'transparent',
                                color: isPrimary ? '#fff' : '#64748b',
                                cursor: 'pointer', fontWeight: 600, whiteSpace: 'nowrap',
                              }}
                            >
                              {isPrimary ? 'Primary' : 'Set Primary'}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  {formData.entity_ids.length > 1 && (
                    <p style={{ fontSize: 11, color: '#64748b', margin: '4px 0 0' }}>
                      This user can switch between {formData.entity_ids.length} entities. Primary entity is the default on login.
                    </p>
                  )}
                </div>

                <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0' }}>
                  <label htmlFor="erp_access_enabled" style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', margin: 0 }}>
                    <span
                      style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                        width: 20, height: 20, borderRadius: 4,
                        border: formData.erp_access_enabled ? 'none' : '2px solid #cbd5e1',
                        background: formData.erp_access_enabled ? 'var(--erp-accent, #1e5eff)' : '#fff',
                        color: '#fff', fontSize: 13, flexShrink: 0,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {formData.erp_access_enabled && '✓'}
                    </span>
                    <input
                      type="checkbox"
                      id="erp_access_enabled"
                      checked={formData.erp_access_enabled}
                      onChange={(e) => setFormData((prev) => ({ ...prev, erp_access_enabled: e.target.checked }))}
                      style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
                    />
                    ERP Access Enabled
                  </label>
                </div>

                {formData.erp_access_enabled && (
                  <div className="form-group">
                    <label htmlFor="erp_access_template_id">ERP Access Template</label>
                    <select
                      id="erp_access_template_id"
                      value={formData.erp_access_template_id}
                      onChange={(e) => setFormData((prev) => ({ ...prev, erp_access_template_id: e.target.value }))}
                    >
                      <option value="">Select template...</option>
                      {accessTemplates.map(t => (
                        <option key={t._id} value={t._id}>{t.template_name}</option>
                      ))}
                    </select>
                  </div>
                )}
              </form>
            </div>

            <div className="form-actions">
              <button
                type="button"
                onClick={handleCloseModal}
                className="btn btn-secondary"
              >
                Cancel
              </button>
              <button
                type="submit"
                onClick={handleSubmit}
                className="btn btn-primary"
                disabled={saving}
              >
                {saving ? 'Saving...' : selectedEmployee ? 'Update BDM' : 'Add BDM'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmDeleteModal
        isOpen={showConfirmDelete}
        onClose={() => { setShowConfirmDelete(false); setSelectedEmployee(null); }}
        onConfirm={handleConfirmDelete}
        title="Deactivate BDM Account"
        message={
          <p>
            Are you sure you want to deactivate <strong>{selectedEmployee?.name}</strong>?
            They will no longer be able to log in.
          </p>
        }
        confirmButtonText="Deactivate"
      />

      {/* Reset Password Modal */}
      {showResetPwModal && resetPwTarget && (
        <div className="reset-pw-modal-overlay" onClick={() => setShowResetPwModal(false)}>
          <div className="reset-pw-modal" onClick={e => e.stopPropagation()}>
            <h3>Reset Password for {resetPwTarget.name}</h3>
            <input
              type="password"
              placeholder="Enter new password (min 8 chars)"
              value={resetPwValue}
              onChange={e => setResetPwValue(e.target.value)}
              autoFocus
            />
            <div className="modal-actions">
              <button className="btn btn-cancel" onClick={() => setShowResetPwModal(false)}>Cancel</button>
              <button
                className="btn btn-confirm"
                disabled={resetPwValue.length < 8}
                onClick={async () => {
                  await onResetPassword?.(resetPwTarget._id, resetPwValue);
                  setShowResetPwModal(false);
                  setResetPwTarget(null);
                  setResetPwValue('');
                }}
              >
                Reset Password
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Delete Confirmation */}
      <ConfirmDeleteModal
        isOpen={showConfirmPermDelete}
        onClose={() => { setShowConfirmPermDelete(false); setPermDeleteTarget(null); }}
        onConfirm={async () => {
          await onPermanentDelete?.(permDeleteTarget?._id);
          setShowConfirmPermDelete(false);
          setPermDeleteTarget(null);
        }}
        title="Permanently Delete User"
        message={
          <p>
            Are you sure you want to <strong>permanently delete</strong> {permDeleteTarget?.name} ({permDeleteTarget?.email})?
            This cannot be undone. Their PeopleMaster record will be unlinked.
          </p>
        }
        confirmButtonText="Delete Permanently"
      />
    </div>
  );
};

EmployeeManagement.propTypes = {
  employees: PropTypes.array,
  filters: PropTypes.object,
  pagination: PropTypes.object,
  loading: PropTypes.bool,
  onSave: PropTypes.func,
  onDelete: PropTypes.func,
  onToggleStatus: PropTypes.func,
  onResetPassword: PropTypes.func,
  onUnlock: PropTypes.func,
  onPermanentDelete: PropTypes.func,
  onFilterChange: PropTypes.func,
  onPageChange: PropTypes.func,
};

export default EmployeeManagement;

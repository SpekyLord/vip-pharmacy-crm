/**
 * Product Assignment Model
 *
 * This model represents product assignments to doctors
 * Tracks which products are promoted to which doctors
 *
 * Fields:
 * - product: Product reference
 * - doctor: Doctor reference
 * - assignedBy: User who made the assignment
 * - assignedDate: Date of assignment
 * - targetQuantity: Target sales quantity
 * - actualQuantity: Actual sales quantity
 * - status: Assignment status (active, completed, cancelled)
 * - notes: Additional notes
 * - createdAt, updatedAt: Timestamps
 */

const mongoose = require('mongoose');

// TODO: Implement ProductAssignment schema
// - Define fields with validation
// - Add references to Product, Doctor, User
// - Implement status tracking
// - Add compound indexes for queries

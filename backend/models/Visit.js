/**
 * Visit Model
 *
 * This model represents visits made by medical reps to doctors
 *
 * Fields:
 * - doctor: Doctor reference
 * - user: Medical rep reference
 * - visitDate: Date and time of visit
 * - visitType: Type of visit (regular, follow-up, emergency)
 * - purpose: Purpose of the visit
 * - productsDiscussed: Array of product references
 * - feedback: Doctor's feedback
 * - nextVisitDate: Scheduled next visit
 * - location: GPS coordinates
 * - duration: Visit duration in minutes
 * - status: Visit status (planned, completed, cancelled)
 * - approvedBy: Manager who approved (if applicable)
 * - notes: Additional notes
 * - createdAt, updatedAt: Timestamps
 */

const mongoose = require('mongoose');

// TODO: Implement Visit schema
// - Define fields with validation
// - Add references to Doctor, User, Product
// - Implement pre-save hooks for validation
// - Add indexes for date-based queries

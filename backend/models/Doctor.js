/**
 * Doctor Model
 *
 * This model represents doctors/healthcare providers visited by medical reps
 *
 * Fields:
 * - name: Doctor's full name
 * - specialization: Medical specialization
 * - hospital: Hospital/clinic name
 * - address: Full address
 * - region: Region reference
 * - phone: Contact number
 * - email: Email address
 * - category: Doctor category (A, B, C, D) based on potential
 * - assignedTo: Medical rep reference
 * - visitFrequency: Required visits per month
 * - notes: Additional notes
 * - isActive: Active status
 * - createdAt, updatedAt: Timestamps
 */

const mongoose = require('mongoose');

// TODO: Implement Doctor schema
// - Define fields with validation
// - Add region and user references
// - Implement virtuals for visit stats
// - Add indexes for search performance

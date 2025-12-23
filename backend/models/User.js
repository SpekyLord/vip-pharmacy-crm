/**
 * User Model
 *
 * This model represents system users (medical reps, managers, admins)
 *
 * Fields:
 * - name: User's full name
 * - email: Unique email address
 * - password: Hashed password
 * - role: User role (admin, manager, medical_rep)
 * - region: Assigned region reference
 * - phone: Contact number
 * - avatar: Profile image URL
 * - isActive: Account status
 * - createdAt, updatedAt: Timestamps
 *
 * Methods:
 * - matchPassword: Compare entered password with hashed
 * - generateToken: Create JWT token
 */

const mongoose = require('mongoose');

// TODO: Implement User schema
// - Define fields with validation
// - Add password hashing pre-save hook
// - Implement instance methods
// - Add indexes for performance

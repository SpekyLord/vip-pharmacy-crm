/**
 * ImportBatch Model
 *
 * Stages parsed CPT Excel data before admin approval.
 * Each batch represents one uploaded CPT workbook for a specific BDM.
 *
 * Flow: Upload → Parse → Stage (pending) → Approve/Reject
 * On approval: creates/updates Doctor records + Schedule entries.
 */

const mongoose = require('mongoose');

const importBatchSchema = new mongoose.Schema(
  {
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Uploaded by user is required'],
    },
    assignedToBDM: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Assigned BDM is required'],
    },
    regionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Region',
      required: [true, 'Region is required'],
    },
    fileName: {
      type: String,
      required: [true, 'File name is required'],
    },
    fileSize: {
      type: Number,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'rejected'],
      default: 'pending',
    },
    rejectionReason: {
      type: String,
    },
    cycleNumber: {
      type: Number,
      required: [true, 'Cycle number is required'],
    },

    // Stats
    doctorCount: { type: Number, default: 0 },
    newCount: { type: Number, default: 0 },
    updateCount: { type: Number, default: 0 },
    invalidCount: { type: Number, default: 0 },

    // Parsed CPT master sheet data
    parsedDoctors: [
      {
        rowNumber: Number,
        lastName: String,
        firstName: String,
        specialization: String,
        dayFlags: [Boolean], // 20 booleans (Day1-Day20)
        visitFrequency: Number, // 2 or 4
        validationStatus: String, // 'OK' | 'INVALID' | 'CHECK'
        clinicAddress: String,
        outletIndicator: String,
        programs: String,
        support: String,
        targetProducts: [String], // up to 3 product name strings
        engagementLevel: Number, // 1-5
        secretaryName: String,
        secretaryPhone: String,
        birthday: String,
        anniversary: String,
        otherDetails: String,
        // Duplicate detection
        isExisting: { type: Boolean, default: false },
        existingDoctorId: {
          type: mongoose.Schema.Types.ObjectId,
        },
        changes: [String], // human-readable diff list
      },
    ],

    // Parsed day sheet engagement data
    daySheetData: [
      {
        dayIndex: Number,
        label: String,
        entries: [
          {
            lastName: String,
            firstName: String,
            engagements: {
              txt: Boolean,
              mes: Boolean,
              picture: Boolean,
              signed: Boolean,
              voice: Boolean,
            },
            dateCovered: String,
          },
        ],
      },
    ],

    approvedAt: Date,
  },
  {
    timestamps: true,
  }
);

// Indexes
importBatchSchema.index({ status: 1 });
importBatchSchema.index({ assignedToBDM: 1 });
importBatchSchema.index({ createdAt: -1 });

module.exports = mongoose.model('ImportBatch', importBatchSchema);

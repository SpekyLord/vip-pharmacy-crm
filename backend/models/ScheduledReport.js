const mongoose = require('mongoose');

const scheduledReportSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Scheduled report name is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['compliance', 'visits', 'performance', 'regional', 'products'],
      required: [true, 'Report type is required'],
    },
    frequency: {
      type: String,
      enum: ['daily', 'weekly', 'monthly'],
      required: [true, 'Frequency is required'],
    },
    format: {
      type: String,
      enum: ['excel', 'csv'],
      default: 'excel',
    },
    filters: {
      regionId: String,
      employeeId: String,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['active', 'paused'],
      default: 'active',
    },
    lastRunAt: Date,
    lastRunStatus: {
      type: String,
      enum: ['success', 'failed'],
    },
    nextRunAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

scheduledReportSchema.index({ status: 1, nextRunAt: 1 });
scheduledReportSchema.index({ createdBy: 1 });

module.exports = mongoose.model('ScheduledReport', scheduledReportSchema);

const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Report name is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['compliance', 'visits', 'performance', 'regional', 'products'],
      required: [true, 'Report type is required'],
    },
    generatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    format: {
      type: String,
      enum: ['excel', 'csv'],
      default: 'excel',
    },
    status: {
      type: String,
      enum: ['generating', 'ready', 'failed'],
      default: 'generating',
    },
    s3Key: String,
    fileUrl: String,
    fileSize: String,
    filters: {
      startDate: Date,
      endDate: Date,
      regionId: String,
      employeeId: String,
    },
    error: String,
    generationTimeMs: Number,
    scheduledReportId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ScheduledReport',
    },
  },
  { timestamps: true }
);

// Auto-delete reports after 30 days
reportSchema.index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 });
reportSchema.index({ generatedBy: 1, createdAt: -1 });
reportSchema.index({ type: 1 });
reportSchema.index({ status: 1 });

module.exports = mongoose.model('Report', reportSchema);

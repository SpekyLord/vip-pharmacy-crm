const mongoose = require('mongoose');

const specializationSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Specialization name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Case-insensitive unique index
specializationSchema.index(
  { name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);

module.exports = mongoose.model('Specialization', specializationSchema);

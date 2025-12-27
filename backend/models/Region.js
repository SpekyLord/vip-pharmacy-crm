/**
 * Region Model
 *
 * This model represents geographical regions/territories
 * Used for assigning field employees to specific areas
 *
 * Key features:
 * - Hierarchical structure (e.g., Country > Province > City > Area)
 * - Employee assignment for territory management
 * - Used to filter doctors for field employees
 */

const mongoose = require('mongoose');

const regionSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Region name is required'],
      trim: true,
      maxlength: [100, 'Region name cannot exceed 100 characters'],
    },
    code: {
      type: String,
      required: [true, 'Region code is required'],
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: [20, 'Region code cannot exceed 20 characters'],
    },
    // Parent region for hierarchy (self-reference)
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Region',
      default: null,
    },
    // Hierarchy level
    level: {
      type: String,
      enum: {
        values: ['country', 'region', 'province', 'city', 'district', 'area'],
        message: 'Invalid region level',
      },
      required: [true, 'Region level is required'],
    },
    // Description of the region
    description: {
      type: String,
      maxlength: [500, 'Description cannot exceed 500 characters'],
    },
    // Optional boundaries for mapping
    boundaries: {
      type: {
        type: String,
        enum: ['Polygon'],
      },
      coordinates: {
        type: [[[Number]]], // GeoJSON Polygon
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes for performance
regionSchema.index({ code: 1 });
regionSchema.index({ parent: 1 });
regionSchema.index({ level: 1 });
regionSchema.index({ isActive: 1 });
regionSchema.index({ name: 'text' });

// Virtual: Get child regions
regionSchema.virtual('children', {
  ref: 'Region',
  localField: '_id',
  foreignField: 'parent',
});

// Virtual: Get doctors in this region
regionSchema.virtual('doctors', {
  ref: 'Doctor',
  localField: '_id',
  foreignField: 'region',
  match: { isActive: true },
});

// Virtual: Get employees assigned to this region
regionSchema.virtual('assignedEmployees', {
  ref: 'User',
  localField: '_id',
  foreignField: 'assignedRegions',
  match: { isActive: true, role: 'employee' },
});

// Static: Get region hierarchy (tree structure)
regionSchema.statics.getHierarchy = async function () {
  const regions = await this.find({ isActive: true }).lean();

  // Build tree structure
  const regionMap = {};
  const roots = [];

  regions.forEach((region) => {
    regionMap[region._id.toString()] = { ...region, children: [] };
  });

  regions.forEach((region) => {
    if (region.parent) {
      const parentId = region.parent.toString();
      if (regionMap[parentId]) {
        regionMap[parentId].children.push(regionMap[region._id.toString()]);
      }
    } else {
      roots.push(regionMap[region._id.toString()]);
    }
  });

  return roots;
};

// Static: Get all descendant region IDs (for querying)
regionSchema.statics.getDescendantIds = async function (regionId) {
  // Ensure we have a valid ObjectId - handle string, ObjectId, or populated document
  let startId;
  try {
    if (typeof regionId === 'string') {
      startId = new mongoose.Types.ObjectId(regionId);
    } else if (regionId._id) {
      // Populated document - extract _id
      startId = regionId._id instanceof mongoose.Types.ObjectId
        ? regionId._id
        : new mongoose.Types.ObjectId(regionId._id.toString());
    } else if (regionId instanceof mongoose.Types.ObjectId) {
      startId = regionId;
    } else {
      // Try to convert whatever it is to ObjectId
      startId = new mongoose.Types.ObjectId(regionId.toString());
    }
  } catch {
    // If invalid ObjectId, return empty array
    return [];
  }

  // Extra safety: ensure startId is definitely an ObjectId
  if (!(startId instanceof mongoose.Types.ObjectId)) {
    try {
      startId = new mongoose.Types.ObjectId(startId.toString());
    } catch {
      return [];
    }
  }

  const descendants = [startId];
  const queue = [startId];

  while (queue.length > 0) {
    const currentId = queue.shift();
    const children = await this.find({ parent: currentId, isActive: true }, '_id');

    children.forEach((child) => {
      descendants.push(child._id);
      queue.push(child._id);
    });
  }

  return descendants;
};

// Static: Get ancestor chain (for breadcrumb)
regionSchema.statics.getAncestorChain = async function (regionId) {
  const ancestors = [];
  let currentRegion = await this.findById(regionId);

  while (currentRegion) {
    ancestors.unshift(currentRegion);
    if (currentRegion.parent) {
      currentRegion = await this.findById(currentRegion.parent);
    } else {
      break;
    }
  }

  return ancestors;
};

// Static: Find regions by level
regionSchema.statics.findByLevel = function (level) {
  return this.find({ level, isActive: true }).sort({ name: 1 });
};

// Static: Get region with full path name
regionSchema.statics.getWithFullPath = async function (regionId) {
  const ancestors = await this.getAncestorChain(regionId);
  const region = ancestors[ancestors.length - 1];

  if (region) {
    region.fullPath = ancestors.map((r) => r.name).join(' > ');
  }

  return region;
};

// Instance: Get full path name
regionSchema.methods.getFullPath = async function () {
  const Region = this.constructor;
  const ancestors = await Region.getAncestorChain(this._id);
  return ancestors.map((r) => r.name).join(' > ');
};

// Pre-save validation to prevent circular references
regionSchema.pre('save', async function (next) {
  if (this.parent) {
    // Check for circular reference
    const Region = this.constructor;
    let current = await Region.findById(this.parent);

    while (current) {
      if (current._id.toString() === this._id.toString()) {
        return next(new Error('Circular reference detected in region hierarchy'));
      }
      if (current.parent) {
        current = await Region.findById(current.parent);
      } else {
        break;
      }
    }
  }
  next();
});

const Region = mongoose.model('Region', regionSchema);

module.exports = Region;

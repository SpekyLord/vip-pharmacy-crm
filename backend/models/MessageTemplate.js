/**
 * MessageTemplate Model
 *
 * Admin-created reusable message templates for outreach to VIP Clients.
 * Supports variable interpolation: {{firstName}}, {{lastName}}, {{productName}}, etc.
 * Templates are channel-aware — one template can target multiple channels.
 *
 * Access Control:
 *   accessLevel: 'all'        → Any BDM can see and use this template
 *   accessLevel: 'restricted' → Only users in allowedUsers[] + admin-like can see/use
 *
 * Use Cases:
 *   - President/Admin sends official business offers, rebates, partner deals
 *   - Sensitive templates restricted to trusted BDMs only
 *   - General templates (greetings, follow-ups) available to all
 *   - BDMs can also copy templates to clipboard for pasting into group chats
 *
 * Workflow:
 *   Admin creates template → sets access level → status: active
 *   BDMs see templates they have access to → send via API or copy to clipboard
 */

const mongoose = require('mongoose');

const messageTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Template name is required'],
      trim: true,
      maxlength: [100, 'Template name cannot exceed 100 characters'],
    },
    description: {
      type: String,
      trim: true,
      maxlength: [300, 'Description cannot exceed 300 characters'],
    },
    category: {
      type: String,
      trim: true,
      default: 'general',
    },

    // Which channels this template can be used on (empty = all)
    channels: {
      type: [String],
      default: [],
    },

    // Template body with variable placeholders
    bodyTemplate: {
      type: String,
      required: [true, 'Template body is required'],
      maxlength: [5000, 'Template body cannot exceed 5000 characters'],
    },

    // Supported variables (for UI hint display)
    variables: {
      type: [String],
      default: [],
    },

    // ── Access Control ──
    // 'all' = every BDM sees this; 'restricted' = only allowedUsers + admin-like
    accessLevel: {
      type: String,
      enum: {
        values: ['all', 'restricted'],
        message: 'Access level must be all or restricted',
      },
      default: 'all',
    },

    // When accessLevel='restricted', only these users can see/use this template
    // Admin-like roles (admin, president, finance, ceo) always have access
    allowedUsers: {
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
      default: [],
    },

    // Status
    status: {
      type: String,
      enum: {
        values: ['active', 'inactive'],
        message: 'Status must be active or inactive',
      },
      default: 'active',
    },

    // Entity scoping (multi-entity support)
    // null = global (visible across all entities — admin/president only)
    entity_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Entity',
      default: null,
    },

    // Who created it
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// ── Indexes ──
messageTemplateSchema.index({ status: 1, category: 1 });
messageTemplateSchema.index({ name: 1 }, { unique: true });
messageTemplateSchema.index({ accessLevel: 1, status: 1 });
messageTemplateSchema.index({ entity_id: 1, status: 1 });

// ── Statics ──
messageTemplateSchema.statics.getActive = function (category) {
  const query = { status: 'active' };
  if (category) query.category = category;
  return this.find(query).sort({ category: 1, name: 1 }).lean();
};

/**
 * Interpolate template variables into the body.
 * Replaces {{varName}} with values from the context object.
 */
messageTemplateSchema.statics.interpolate = function (bodyTemplate, context = {}) {
  return bodyTemplate.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return context[varName] !== undefined ? String(context[varName]) : match;
  });
};

const MessageTemplate = mongoose.model('MessageTemplate', messageTemplateSchema);

module.exports = MessageTemplate;

/**
 * Phase E1 (May 2026) — Rebate-rule referential consistency helper.
 *
 * Both NonMdPartnerRebateRule.create and MdProductRebate.create stamp
 * `entity_id` from req scope (privileged callers may override via body).
 * Without this check, an admin in entity A could pick a partner whose only
 * BDM coverage is in entity B and silently create a ghost rule that never
 * fires (the rebate engine matches on rule.entity_id ↔ Collection.entity_id).
 *
 * The check enforces the invariant that a rule's entity must be reachable
 * from the partner's BDM coverage:
 *
 *   Doctor.entity_ids ∋ rule.entity_id   (must be true at create time)
 *
 * Empty `entity_ids` means the partner currently has no BDM coverage in any
 * entity — admin must assign coverage before the rule can be created. We
 * surface a 400 with a clear message naming the missing entity (NOT a 500
 * or a silent save).
 *
 * SaaS-readiness (Rule #0d): once the bundle ships, this check is a hard
 * tenant-isolation gate — a doctor that is logically owned by tenant T1
 * cannot have rebate rules saved against tenant T2.
 *
 * Usage:
 *   const { assertPartnerInEntity } = require('../utils/rebatePartnerEntityScope');
 *   await assertPartnerInEntity(partnerId, entityId);
 *   // throws ValidationError with code: 'PARTNER_ENTITY_MISMATCH' on failure
 */
'use strict';

const mongoose = require('mongoose');
const Doctor = require('../../models/Doctor');
const { ValidationError } = require('../../middleware/errorHandler');

async function assertPartnerInEntity(partnerId, entityId) {
  if (!partnerId) {
    throw new ValidationError('partner_id is required');
  }
  if (!entityId) {
    throw new ValidationError('entity_id is required');
  }
  if (!mongoose.Types.ObjectId.isValid(partnerId)) {
    throw new ValidationError('partner_id must be a valid ObjectId');
  }
  if (!mongoose.Types.ObjectId.isValid(entityId)) {
    throw new ValidationError('entity_id must be a valid ObjectId');
  }

  const partner = await Doctor.findById(partnerId)
    .select('firstName lastName entity_ids assignedTo isActive mergedInto')
    .lean();

  if (!partner) {
    const err = new ValidationError('partner not found');
    err.code = 'PARTNER_NOT_FOUND';
    throw err;
  }
  if (partner.mergedInto) {
    const err = new ValidationError(`partner has been merged into another VIP Client (${partner.mergedInto}). Pick the surviving record.`);
    err.code = 'PARTNER_MERGED';
    throw err;
  }

  const entityIdStr = String(entityId);
  const partnerEntityStrs = (partner.entity_ids || []).map((e) => String(e));

  if (partnerEntityStrs.length === 0) {
    const err = new ValidationError(
      `Partner ${partner.firstName || ''} ${partner.lastName || ''}`.trim() +
      ' has no BDM coverage in any entity. Assign a BDM with the right entity scope before creating a rebate rule.',
    );
    err.code = 'PARTNER_NO_ENTITY_COVERAGE';
    throw err;
  }

  if (!partnerEntityStrs.includes(entityIdStr)) {
    const err = new ValidationError(
      `Partner ${partner.firstName || ''} ${partner.lastName || ''}`.trim() +
      ` is not covered in the target entity. Their BDMs cover entities [${partnerEntityStrs.join(', ')}]; rule entity_id=${entityIdStr}.`,
    );
    err.code = 'PARTNER_ENTITY_MISMATCH';
    err.details = {
      partner_entity_ids: partnerEntityStrs,
      requested_entity_id: entityIdStr,
    };
    throw err;
  }
}

module.exports = { assertPartnerInEntity };

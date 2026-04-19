const express = require('express');
const router = express.Router();
const { erpAccessCheck, erpSubAccessCheck } = require('../middleware/erpAccessCheck');
const c = require('../controllers/kpiTemplateController');

/**
 * KPI Template Routes — Phase SG-3R
 * Mount: /api/erp/kpi-templates
 *
 * Access: sales_goals module (VIEW to list/read; FULL + plan_manage to write).
 * Writes are scoped to req.entityId so subscribers never leak templates across
 * entities. President may query another entity via ?entity_id=.
 */

router.get('/', c.listTemplates);
router.get('/:id', c.getTemplate);

router.post('/', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.createTemplate);
router.put('/:id', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.updateTemplate);
router.delete('/:id', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.deleteTemplate);
router.delete('/set/:name', erpAccessCheck('sales_goals', 'FULL'), erpSubAccessCheck('sales_goals', 'plan_manage'), c.deleteTemplateSet);

module.exports = router;

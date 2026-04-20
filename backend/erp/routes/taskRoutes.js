/**
 * Task Routes — Phase G8 (P2-9)
 * Mount: /api/erp/tasks
 *
 * Access: any ERP-authenticated user can CRUD their own tasks. Privileged
 * roles (president/ceo/admin/finance) see all tasks in the entity via scope=all.
 * No erpAccessCheck('module') — Tasks are a cross-cutting productivity feature
 * independent of finance modules. Entity scoping is enforced by the controller
 * from req.entityId (Rule #21).
 */
const express = require('express');
const router = express.Router();
const c = require('../controllers/taskController');

router.get('/', c.listTasks);
router.get('/overdue', c.listOverdue);
// Phase G10 — lookup + Gantt + bulk routes. Registered BEFORE the
// `/:id` PATCH/DELETE so the static path segments resolve first (Express
// matches top-down; an ObjectId route registered before these would
// shadow them).
router.get('/drivers', c.listDrivers);
router.get('/kpi-codes', c.listKpiCodes);
router.get('/by-driver', c.listByDriver);
router.post('/bulk-update', c.bulkUpdate);
router.post('/bulk-delete', c.bulkDelete);
router.post('/', c.createTask);
router.patch('/:id', c.updateTask);
router.delete('/:id', c.deleteTask);

module.exports = router;

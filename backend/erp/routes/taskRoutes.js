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
router.post('/', c.createTask);
router.patch('/:id', c.updateTask);
router.delete('/:id', c.deleteTask);

module.exports = router;

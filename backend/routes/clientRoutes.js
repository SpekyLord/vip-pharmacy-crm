/**
 * Client Routes (Regular / Non-VIP Clients)
 *
 * Endpoints:
 * GET    /api/clients                → getAllClients
 * GET    /api/clients/visit-count/today → getTodayClientVisitCount
 * GET    /api/clients/visits/my      → getMyClientVisits
 * GET    /api/clients/:id            → getClientById
 * POST   /api/clients                → createClient
 * PUT    /api/clients/:id            → updateClient
 * DELETE /api/clients/:id            → deleteClient
 * GET    /api/clients/:id/visits     → getClientVisits
 * POST   /api/clients/visits         → createClientVisit (with photos)
 */

const express = require('express');
const router = express.Router();

const {
  getAllClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  createClientVisit,
  getClientVisits,
  getMyClientVisits,
  getClientVisitsByUser,
  getTodayClientVisitCount,
  getClientVisitStats,
  getScheduledToday,
} = require('../controllers/clientController');

const { protect } = require('../middleware/auth');
const { adminOnly } = require('../middleware/roleCheck');
const {
  createClientValidation,
  updateClientValidation,
  createClientVisitValidation,
} = require('../middleware/validation');
const { uploadMultiple, processVisitPhotos, parseFormDataJson } = require('../middleware/upload');

// All routes require authentication
router.use(protect);

// Static routes BEFORE parameterized /:id routes
router.get('/visit-count/today', getTodayClientVisitCount);
router.get('/scheduled/today', getScheduledToday);
router.get('/visits/stats', getClientVisitStats);
router.get('/visits/my', getMyClientVisits);
router.get('/visits/by-user/:userId', adminOnly, getClientVisitsByUser);

// Client CRUD
router.get('/', getAllClients);
router.post('/', createClientValidation, createClient);
router.get('/:id', getClientById);
router.put('/:id', updateClientValidation, updateClient);
router.delete('/:id', deleteClient);

// Client visits
router.get('/:id/visits', getClientVisits);
router.post(
  '/visits',
  uploadMultiple('photos', 5),
  processVisitPhotos,
  parseFormDataJson(['location']),
  createClientVisitValidation,
  createClientVisit
);

module.exports = router;

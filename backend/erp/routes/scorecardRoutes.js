const express = require('express');
const router = express.Router();
const { roleCheck } = require('../../middleware/roleCheck');
const {
  compute,
  list,
  rankings,
  groupSummary,
  getByPerson,
} = require('../controllers/scorecardController');

router.post('/compute', roleCheck('admin', 'president'), compute);
router.get('/rankings', rankings);
router.get('/group-summary', groupSummary);
router.get('/:personId', getByPerson);
router.get('/', list);

module.exports = router;

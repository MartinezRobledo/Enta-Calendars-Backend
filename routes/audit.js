const { Router } = require('express');
const { validarJWT } = require('../middlewares/validar-jwt');
const { requireRole } = require('../middlewares/require-role');
const { getAuditLog, recordCalendarExport } = require('../controllers/audit');

const router = Router();
router.use(validarJWT);
router.post('/export', recordCalendarExport);
router.get('/', requireRole('gerente', 'lider'), getAuditLog);
module.exports = router;

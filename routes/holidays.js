const { Router } = require('express');
const { validarJWT } = require('../middlewares/validar-jwt');
const { requireRole } = require('../middlewares/require-role');
const { listCountries, createCountry, getCountryYear, saveCountryYear, obtenerFeriados, obtenerUltimoAño } = require('../controllers/holidays');

const router = Router();
router.use(validarJWT);

// Consumidores existentes: último año configurado y feriados de Argentina por año.
router.get('/last', obtenerUltimoAño);
router.get('/:id(\\d+)', obtenerFeriados);

// Administración manual: gerente solamente.
router.get('/countries', requireRole('gerente'), listCountries);
router.post('/countries', requireRole('gerente'), createCountry);
router.get('/country/:countryCode/:year(\\d{4})', requireRole('gerente'), getCountryYear);
router.put('/country/:countryCode/:year(\\d{4})', requireRole('gerente'), saveCountryYear);

module.exports = router;

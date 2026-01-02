/*
    Event Routes
    /api/events
*/
const { Router } = require('express');
const { validarJWT } = require('../middlewares/validar-jwt');
const { getTemplates } = require('../controllers/templates');

const router = Router();

// Todas tienes que pasar por la validación del JWT
router.use( validarJWT );

// Obtener templates 
router.get('/', getTemplates );

module.exports = router;
/*
    Event Routes
    /api/calendars
*/
const { Router } = require('express');
const { validarJWT } = require('../middlewares/validar-jwt');
const { validarCampos } = require('../middlewares/validar-campos');
const { check } = require('express-validator');
const { createCalendar, getCalendars, deleteCalendar } = require('../controllers/calendars');

const router = Router();

// Todas tienes que pasar por la validación del JWT
router.use( validarJWT );

// Crear un nuevo calendario
router.post(
    '/',
    [
        check('titleStore','El titulo es obligatorio').not().isEmpty(),
        check('capasStore','Las capas son obligatorias').not().isEmpty(),
        validarCampos
    ],
    createCalendar
);

//Obtener calendarios
router.get(
    '/:user',
    getCalendars
);

//Obtener calendarios
router.delete(
    '/:id',
    deleteCalendar
);

module.exports = router;
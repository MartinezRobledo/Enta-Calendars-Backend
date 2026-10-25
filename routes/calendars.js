/*
    Event Routes
    /api/calendars
*/
const { Router } = require('express');
const { validarJWT } = require('../middlewares/validar-jwt');
const { requireRole } = require('../middlewares/require-role');
const { validarCampos } = require('../middlewares/validar-campos');
const { check } = require('express-validator');
const { createCalendar, getCalendars, getCalendar, deleteCalendar, updateCalendar, restoreCalendar } = require('../controllers/calendars');

const router = Router();

// Todas tienes que pasar por la validación del JWT
router.use( validarJWT );

// Crear un nuevo calendario
router.post(
    '/',
    [
        check('titleStore','El titulo es obligatorio').not().isEmpty(),
        check('añosStore','Los años son obligatorios').not().isEmpty(),
        validarCampos
    ],
    createCalendar
);

// Editar un calendario
router.put(
    '/',
    updateCalendar
);

//Obtener calendarios
router.get('/:user/:id', getCalendar);
router.get(
    '/:user',
    getCalendars
);

//Borrar calendario
router.delete(
    '/:id',
    deleteCalendar
);

router.post('/restore/:id', requireRole('gerente', 'lider'), restoreCalendar);

module.exports = router;
